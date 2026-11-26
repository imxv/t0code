import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { threadWokeAt } from "@t3tools/client-runtime/state/thread-settled";

import {
  hasUnseenCompletion,
  resolveSidebarRowStatus,
  resolveThreadLastVisitedAt,
} from "../Sidebar.logic";

export const SIDEBAR_STATUS_BUCKETS = ["working", "attention", "done"] as const;
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
): SidebarStatusBucket | null {
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
  return hasUnseenCompletion(thread) ? "done" : null;
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
): SidebarStatusBucket | null {
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
  const counts = { working: 0, attention: 0, done: 0 };
  for (const bucket of buckets) {
    if (bucket !== null) counts[bucket] += 1;
  }
  return counts;
}

/**
 * Counts pinned and inbox threads, which snoozed and settled ones are not. While
 * filtering, Working shelf rows fold into the inbox, and the open thread stays
 * listed until the user leaves it, so answering a request doesn't drop its row.
 */
export function applySidebarStatusFilter<T>(input: {
  readonly buckets: readonly SidebarStatusBucket[];
  readonly pinned: readonly T[];
  readonly active: readonly T[];
  readonly working: readonly T[];
  readonly keyOf: (thread: T) => string;
  readonly bucketOf: (thread: T) => SidebarStatusBucket | null;
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
  const bucketByKey = new Map<string, SidebarStatusBucket | null>();
  for (const thread of [...input.pinned, ...input.active, ...input.working]) {
    bucketByKey.set(input.keyOf(thread), input.bucketOf(thread));
  }
  const counts = countSidebarStatusBuckets(bucketByKey.values());
  if (input.buckets.length === 0) return { counts, filtered: null };
  const matchingKeys = new Set<string>();
  for (const [key, bucket] of bucketByKey) {
    if (bucket !== null && input.buckets.includes(bucket)) matchingKeys.add(key);
  }
  const listed = (thread: T) => {
    const key = input.keyOf(thread);
    return key === input.routeKey || matchingKeys.has(key);
  };
  return {
    counts,
    filtered: {
      pinned: input.pinned.filter(listed),
      active: [...input.active, ...input.working].filter(listed),
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
