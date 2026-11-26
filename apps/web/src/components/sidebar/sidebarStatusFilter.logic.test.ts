import { ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  applySidebarStatusFilter,
  countSidebarStatusBuckets,
  nextSidebarStatusFilter,
  resolveSidebarStatusBucket,
  type SidebarStatusBucket,
} from "./sidebarStatusFilter.logic";

const seen = {
  hasActionableProposedPlan: false,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  interactionMode: "default" as const,
  latestRun: {
    runId: "turn-1" as never,
    status: "completed" as const,
    assistantMessageId: null,
    requestedAt: "2026-03-09T10:00:00.000Z",
    startedAt: "2026-03-09T10:00:00.000Z",
    completedAt: "2026-03-09T10:05:00.000Z",
  },
  lastVisitedAt: "2026-03-09T10:06:00.000Z",
  runtime: null,
};
const runtime = {
  status: "running" as const,
  activeRunId: null,
  providerInstanceId: ProviderInstanceId.make("codex"),
  providerName: "Codex",
  lastError: null,
  updatedAt: "2026-03-09T10:00:00.000Z",
};

describe("resolveSidebarStatusBucket", () => {
  it.each([
    { why: "an idle thread already seen", thread: seen, wokeAt: null, bucket: null },
    { why: "a running turn", thread: { ...seen, runtime }, wokeAt: null, bucket: "working" },
    {
      why: "a turn blocked on a child thread",
      thread: { ...seen, runtime, blockedOnThreadWait: true },
      wokeAt: null,
      bucket: "working",
    },
    {
      why: "an idle session, like its quiet Waiting row",
      thread: {
        ...seen,
        lastVisitedAt: "2026-03-09T10:04:00.000Z",
        runtime: { ...runtime, status: "idle" as const },
      },
      wokeAt: null,
      bucket: null,
    },
    {
      why: "an unseen completion",
      thread: { ...seen, lastVisitedAt: "2026-03-09T10:04:00.000Z" },
      wokeAt: null,
      bucket: "done",
    },
    {
      why: "a question while running",
      thread: { ...seen, runtime, hasPendingUserInput: true },
      wokeAt: null,
      bucket: "attention",
    },
    {
      why: "a usage limit",
      thread: {
        ...seen,
        runtime: { ...runtime, status: "failed" as const, lastErrorClass: "usage_limit" as const },
      },
      wokeAt: null,
      bucket: "attention",
    },
    {
      why: "a snooze that woke after the last visit, over its unseen completion",
      thread: { ...seen, lastVisitedAt: "2026-03-09T10:04:00.000Z" },
      wokeAt: "2026-03-09T11:00:00.000Z",
      bucket: "attention",
    },
    {
      why: "a wake the user already visited",
      thread: { ...seen, lastVisitedAt: "2026-03-09T11:30:00.000Z" },
      wokeAt: "2026-03-09T11:00:00.000Z",
      bucket: null,
    },
  ])("buckets $why", ({ thread, wokeAt, bucket }) => {
    expect(resolveSidebarStatusBucket(thread, wokeAt)).toBe(bucket);
  });

  it("counts each bucket", () => {
    expect(countSidebarStatusBuckets(["working", null, "done", "working"])).toEqual({
      working: 2,
      attention: 0,
      done: 1,
    });
  });
});

describe("applySidebarStatusFilter", () => {
  type Row = { readonly key: string; readonly bucket: SidebarStatusBucket | null };
  const input = {
    pinned: [{ key: "pinned-done", bucket: "done" }] satisfies Row[],
    active: [
      { key: "asks", bucket: "attention" },
      { key: "open", bucket: null },
      { key: "idle", bucket: null },
    ] satisfies Row[],
    working: [{ key: "shelved-run", bucket: "working" }] satisfies Row[],
    keyOf: (thread: Row) => thread.key,
    bucketOf: (thread: Row) => thread.bucket,
    routeKey: "open",
  };

  it("lists nothing new without a filter, but still counts", () => {
    expect(applySidebarStatusFilter({ ...input, buckets: [] })).toEqual({
      counts: { working: 1, attention: 1, done: 1 },
      filtered: null,
    });
  });

  it("keeps matches and the open thread, folding Working shelf rows into the inbox", () => {
    const { filtered } = applySidebarStatusFilter({ ...input, buckets: ["attention", "working"] });
    expect(filtered?.pinned.map((thread) => thread.key)).toEqual([]);
    expect(filtered?.active.map((thread) => thread.key)).toEqual(["asks", "open", "shelved-run"]);
    expect([...(filtered?.matchingKeys ?? [])]).toEqual(["asks", "shelved-run"]);
  });
});

describe("nextSidebarStatusFilter", () => {
  it("shows one bucket per click, clears on a second click, and toggles on Shift", () => {
    expect(nextSidebarStatusFilter([], "attention", false)).toEqual(["attention"]);
    expect(nextSidebarStatusFilter(["attention"], "attention", false)).toEqual([]);
    expect(nextSidebarStatusFilter(["working", "attention"], "attention", false)).toEqual([
      "attention",
    ]);
    expect(nextSidebarStatusFilter(["done"], "working", true)).toEqual(["working", "done"]);
    expect(nextSidebarStatusFilter(["working", "done"], "working", true)).toEqual(["done"]);
  });
});
