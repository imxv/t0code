import { useGT } from "gt-react";
import { ListFilterIcon } from "lucide-react";

import { ITEM_ICON_CLASS, type CommandPaletteActionItem } from "./CommandPalette.logic";
import {
  SIDEBAR_STATUS_BUCKETS,
  type SidebarStatusBucket,
} from "./sidebar/sidebarStatusFilter.logic";
import { useSidebarStatusFilterStore } from "./sidebar/sidebarStatusFilterStore";

const SEARCH_TERMS = {
  working: ["filter", "status", "working", "running", "active", "运行中"],
  attention: [
    "filter",
    "status",
    "needs you",
    "attention",
    "approval",
    "input",
    "failed",
    "待处理",
  ],
  done: ["filter", "status", "done", "finished", "unread", "completed", "已完成"],
} as const;

/** Palette actions that set the sidebar status filter, the same as its toggles. */
export function useCommandPaletteSidebarStatusItems(): CommandPaletteActionItem[] {
  const gt = useGT();
  const buckets = useSidebarStatusFilterStore((state) => state.buckets);
  const setBuckets = useSidebarStatusFilterStore((state) => state.setBuckets);
  const titles: Record<SidebarStatusBucket, string> = {
    working: gt("Show working threads in the sidebar"),
    attention: gt("Show threads that need you in the sidebar"),
    done: gt("Show done threads you haven't viewed in the sidebar"),
  };
  const items: CommandPaletteActionItem[] = SIDEBAR_STATUS_BUCKETS.filter(
    (bucket) => !(buckets.length === 1 && buckets[0] === bucket),
  ).map((bucket) => ({
    kind: "action",
    value: `action:sidebar-status-filter:${bucket}`,
    searchTerms: [...SEARCH_TERMS[bucket]],
    title: titles[bucket],
    icon: <ListFilterIcon className={ITEM_ICON_CLASS} />,
    run: async () => {
      setBuckets([bucket]);
    },
  }));
  if (buckets.length > 0) {
    items.push({
      kind: "action",
      value: "action:sidebar-status-filter:clear",
      searchTerms: ["filter", "status", "clear", "all", "reset", "全部"],
      title: gt("Show all threads in the sidebar"),
      icon: <ListFilterIcon className={ITEM_ICON_CLASS} />,
      run: async () => {
        setBuckets([]);
      },
    });
  }
  return items;
}
