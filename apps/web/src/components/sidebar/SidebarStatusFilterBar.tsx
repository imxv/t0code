import { msg, useGT, useMessages } from "gt-react";
import { CircleCheckIcon, CircleDashedIcon, HandIcon, SquarePenIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { SharedTooltipTrigger } from "../ui/shared-tooltip";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import {
  SIDEBAR_STATUS_BUCKETS,
  nextSidebarStatusFilter,
  type SidebarStatusBucket,
  type SidebarStatusCounts,
} from "./sidebarStatusFilter.logic";
import { useSidebarStatusFilterStore } from "./sidebarStatusFilterStore";

const SIDEBAR_STATUS_BUCKET_LABEL = {
  working: msg("Working", { $context: "sidebar status filter: threads with a running turn" }),
  attention: msg("Needs you", {
    $context: "sidebar status filter: threads waiting on the user's approval, answer or fix",
  }),
  done: msg("Done", { $context: "sidebar status filter: finished threads not yet viewed" }),
  draft: msg("Draft", {
    $context: "sidebar status filter: threads with a message typed but not sent",
  }),
} as const;

// Working, Done and Draft reuse their row icons; Needs you spans several row
// states (question, approval, failure), so it takes the raised hand they share.
const BUCKET_ICON = {
  working: { Icon: CircleDashedIcon, className: "text-info-foreground" },
  attention: { Icon: HandIcon, className: "text-warning-foreground" },
  done: { Icon: CircleCheckIcon, className: "text-success-foreground" },
  draft: { Icon: SquarePenIcon, className: "text-warning-foreground" },
} as const;

export function SidebarStatusFilterBar(props: {
  counts: SidebarStatusCounts;
  /** After the filter changes, for the list to drop a selection it may now hide. */
  onChange: () => void;
}) {
  const gt = useGT();
  const m = useMessages();
  const buckets = useSidebarStatusFilterStore((state) => state.buckets);
  const storeBuckets = useSidebarStatusFilterStore((state) => state.setBuckets);
  const setBuckets = (next: readonly SidebarStatusBucket[]) => {
    storeBuckets(next);
    props.onChange();
  };
  return (
    <ToggleGroup
      multiple
      aria-label={gt("Filter threads by status")}
      className="mt-1 w-full *:flex-1"
      value={[...buckets]}
      onValueChange={(next, eventDetails) => {
        const clicked = SIDEBAR_STATUS_BUCKETS.find(
          (bucket) => next.includes(bucket) !== buckets.includes(bucket),
        );
        if (clicked === undefined) return;
        const event = eventDetails.event;
        const additive = "shiftKey" in event && event.shiftKey === true;
        setBuckets(nextSidebarStatusFilter(buckets, clicked, additive));
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || buckets.length === 0) return;
        event.stopPropagation();
        setBuckets([]);
      }}
    >
      {SIDEBAR_STATUS_BUCKETS.map((bucket: SidebarStatusBucket) => {
        const count = props.counts[bucket];
        const label = m(SIDEBAR_STATUS_BUCKET_LABEL[bucket]);
        const { Icon, className } = BUCKET_ICON[bucket];
        return (
          <SharedTooltipTrigger
            key={bucket}
            label={label}
            side="bottom"
            render={<Toggle value={bucket} disabled={count === 0 && !buckets.includes(bucket)} />}
          >
            <Icon aria-hidden className={cn("size-3.5", count > 0 && className)} />
            <span className="sr-only">{label}</span>
            <span className="tabular-nums">{count}</span>
          </SharedTooltipTrigger>
        );
      })}
    </ToggleGroup>
  );
}
