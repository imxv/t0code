import { create } from "zustand";

import type { SidebarStatusBucket } from "./sidebarStatusFilter.logic";

// In memory only: a filter left on across restarts reads as threads gone missing.
export const useSidebarStatusFilterStore = create<{
  readonly buckets: readonly SidebarStatusBucket[];
  readonly setBuckets: (buckets: readonly SidebarStatusBucket[]) => void;
}>((set) => ({
  buckets: [],
  setBuckets: (buckets) => set({ buckets }),
}));
