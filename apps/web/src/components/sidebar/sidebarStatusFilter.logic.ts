import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { threadWokeAt } from "@t3tools/client-runtime/state/thread-settled";

import {
  composerDraftHasUserContent,
  type ComposerThreadDraftState,
  type DraftSessionState,
} from "../../composerDraftStore";
import {
  hasUnseenSidebarCompletion,
  resolveSidebarRowStatus,
  resolveThreadLastVisitedAt,
} from "../Sidebar.logic";

export const SIDEBAR_STATUS_BUCKETS = ["working", "attention", "done", "draft"] as const;
export type SidebarStatusBucket = (typeof SIDEBAR_STATUS_BUCKETS)[number];
export type SidebarStatusCounts = Readonly<Record<SidebarStatusBucket, number>>;

type SidebarStatusBucketInput = Parameters<typeof resolveSidebarRowStatus>[0] & {
  readonly settledOverride?: string | null | undefined;
};

/**
 * The filter bucket a thread row belongs to, read the way its status label reads:
 * an agent request or failure outranks a Woke or Done label, and a thread that is
 * idle and already seen has no bucket.
 */
export function resolveSidebarStatusBucket(
  thread: SidebarStatusBucketInput,
  wokeAt: string | null,
): Exclude<SidebarStatusBucket, "draft"> | null {
  const status = resolveSidebarRowStatus(thread);
  switch (status) {
    case "approval":
    case "input":
    case "request":
    case "limited":
    case "failed":
      return "attention";
    case "preparing":
    case "working":
      return "working";
    case "waiting":
      // Blocked on a child thread is still this turn; an idle session is not.
      return thread.runtime?.status === "running" ? "working" : null;
    case "ready":
      break;
  }
  if (isUnacknowledgedWake(thread, wokeAt)) return "attention";
  return hasUnseenSidebarCompletion(thread) ? "done" : null;
}

function isUnacknowledgedWake(thread: SidebarStatusBucketInput, wokeAt: string | null): boolean {
  if (wokeAt === null || thread.settledOverride === "settled") return false;
  const wokeAtMs = Date.parse(wokeAt);
  if (Number.isNaN(wokeAtMs)) return false;
  if (!thread.lastVisitedAt) return true;
  const lastVisitedMs = Date.parse(thread.lastVisitedAt);
  return Number.isNaN(lastVisitedMs) || lastVisitedMs < wokeAtMs;
}

/** A sidebar thread shell's bucket, with the visit this client recorded and its snooze wake. */
export function resolveSidebarThreadShellBucket(
  thread: EnvironmentThreadShell,
  localLastVisitedAt: string | undefined,
  now: string,
): Exclude<SidebarStatusBucket, "draft"> | null {
  return resolveSidebarStatusBucket(
    {
      ...thread,
      lastVisitedAt: resolveThreadLastVisitedAt(thread.lastVisitedAt, localLastVisitedAt),
    },
    threadWokeAt(thread, { now }),
  );
}

export function countSidebarStatusBuckets(
  buckets: Iterable<SidebarStatusBucket | null>,
): SidebarStatusCounts {
  const counts = { working: 0, attention: 0, done: 0, draft: 0 };
  for (const bucket of buckets) {
    if (bucket !== null) counts[bucket] += 1;
  }
  return counts;
}

/**
 * Thread keys whose composer holds an unsent draft, the way a thread row reads
 * its own: under the thread's key, or under the draft it was started from.
 */
export function unsentDraftThreadKeys(state: {
  readonly draftsByThreadKey: Readonly<Record<string, ComposerThreadDraftState>>;
  readonly draftThreadsByThreadKey: Readonly<
    Record<string, Pick<DraftSessionState, "environmentId" | "threadId">>
  >;
}): string[] {
  const keys: string[] = [];
  for (const [draftKey, draft] of Object.entries(state.draftsByThreadKey)) {
    if (!composerDraftHasUserContent(draft)) continue;
    const session = state.draftThreadsByThreadKey[draftKey];
    keys.push(
      session ? scopedThreadKey(scopeThreadRef(session.environmentId, session.threadId)) : draftKey,
    );
  }
  return keys.toSorted();
}

/**
 * Statuses count pinned and inbox threads; Draft counts shelved ones too, as
 * auto-settle can shelve an unsent draft. Filtered shelves fold into the inbox,
 * and the open thread stays listed so answering a request keeps its row.
 */
export function applySidebarStatusFilter<T>(input: {
  readonly buckets: readonly SidebarStatusBucket[];
  readonly pinned: readonly T[];
  readonly active: readonly T[];
  readonly working: readonly T[];
  /** Snoozed and settled threads, which only Draft lists. */
  readonly shelved: readonly T[];
  readonly keyOf: (thread: T) => string;
  readonly bucketOf: (thread: T) => Exclude<SidebarStatusBucket, "draft"> | null;
  readonly hasDraft: (thread: T) => boolean;
  readonly routeKey: string | null;
}): {
  readonly counts: SidebarStatusCounts;
  readonly filtered: {
    readonly pinned: T[];
    readonly active: T[];
    /** Keys that match, without the open thread kept only because it is open. */
    readonly matchingKeys: ReadonlySet<string>;
  } | null;
} {
  const bucketsByKey = new Map<string, SidebarStatusBucket[]>();
  for (const thread of [...input.pinned, ...input.active, ...input.working]) {
    const bucket = input.bucketOf(thread);
    const buckets: SidebarStatusBucket[] = bucket === null ? [] : [bucket];
    if (input.hasDraft(thread)) buckets.push("draft");
    bucketsByKey.set(input.keyOf(thread), buckets);
  }
  for (const thread of input.shelved) {
    if (input.hasDraft(thread)) bucketsByKey.set(input.keyOf(thread), ["draft"]);
  }
  const counts = countSidebarStatusBuckets([...bucketsByKey.values()].flat());
  if (input.buckets.length === 0) return { counts, filtered: null };
  const matchingKeys = new Set<string>();
  for (const [key, buckets] of bucketsByKey) {
    if (buckets.some((bucket) => input.buckets.includes(bucket))) matchingKeys.add(key);
  }
  const listed = (thread: T) => {
    const key = input.keyOf(thread);
    return key === input.routeKey || matchingKeys.has(key);
  };
  return {
    counts,
    filtered: {
      pinned: input.pinned.filter(listed),
      active: [...input.active, ...input.working, ...input.shelved].filter(listed),
      matchingKeys,
    },
  };
}

/**
 * A click shows only that bucket and a second click on it shows everything;
 * an additive (Shift) click adds or removes it, like the project scope menu.
 */
export function nextSidebarStatusFilter(
  current: readonly SidebarStatusBucket[],
  bucket: SidebarStatusBucket,
  additive: boolean,
): readonly SidebarStatusBucket[] {
  if (additive) {
    const next = current.includes(bucket)
      ? current.filter((candidate) => candidate !== bucket)
      : [...current, bucket];
    return SIDEBAR_STATUS_BUCKETS.filter((candidate) => next.includes(candidate));
  }
  return current.length === 1 && current[0] === bucket ? [] : [bucket];
}
