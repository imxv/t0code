import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  AuthSettingsWriteScope,
  ProviderDriverKind,
  type ContextWindowBreakdown,
  type EnvironmentId,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { msg, useGT, useLocale, useMessages } from "gt-react";
import { ChevronRightIcon } from "lucide-react";

import {
  useEnvironmentSettings,
  usePersistEnvironmentProviderInstanceMutation,
} from "../../hooks/useSettings";
import { m as resolveNow } from "../../i18n/messages";
import { cn } from "../../lib/utils";
import { useEnvironmentScope } from "../../state/session";
import { Badge } from "../ui/badge";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { formatContextWindowCompactionMessage } from "./compaction.logic";
import { ThreadDetailsSection } from "./ThreadDetailsSection";

const MCP_TOOLS = msg("MCP tools");
const MEMORY_FILES = msg("Memory files");
const AVAILABLE_SPACE = msg("Available space");

const CATEGORY_DETAILS: Readonly<Record<string, { label: string; color: string }>> = {
  messages: { label: msg("Messages", { $context: "context usage category" }), color: "bg-sky-500" },
  mcp_tools: { label: MCP_TOOLS, color: "bg-orange-500" },
  system_tools: { label: msg("System tools"), color: "bg-teal-500" },
  system_prompt: { label: msg("System prompt"), color: "bg-violet-500" },
  skills: { label: msg("Skills"), color: "bg-indigo-400" },
  memory_files: { label: MEMORY_FILES, color: "bg-pink-500" },
  mcp_instructions: { label: msg("MCP server instructions"), color: "bg-amber-500" },
  custom_agents: { label: msg("Custom agents"), color: "bg-emerald-500" },
  autocompact_buffer: { label: msg("Auto-compaction buffer"), color: "bg-muted-foreground/45" },
  compact_buffer: { label: msg("Compaction buffer"), color: "bg-muted-foreground/45" },
  free_space: { label: AVAILABLE_SPACE, color: "bg-muted-foreground/15" },
  mcp_tools_deferred: { label: msg("MCP tools (deferred)"), color: "bg-muted-foreground/35" },
  system_tools_deferred: { label: msg("System tools (deferred)"), color: "bg-muted-foreground/35" },
};

type ContextCategory = ContextWindowBreakdown["categories"][number];

const AUTO_COMPACT_DEFAULT = "auto";
const AUTO_COMPACT_CONTROLS = new Map([
  [
    ProviderDriverKind.make("claudeAgent"),
    {
      configKey: "autoCompactWindow",
      // Claude Code's own threshold menu; 400K is the one it recommends.
      thresholds: [1_000_000, 500_000, 400_000, 300_000],
      recommended: 400_000,
      description: msg(
        "Lower values use less of your usage limits. Claude summarizes earlier messages sooner.",
      ),
    },
  ],
  [
    ProviderDriverKind.make("codex"),
    {
      configKey: "autoCompactTokenLimit",
      thresholds: [400_000, 300_000, 200_000, 100_000],
      recommended: null,
      description: msg(
        "Lower values use less of your usage limits. Codex summarizes earlier messages sooner.",
      ),
    },
  ],
]);
type AutoCompactControl = NonNullable<ReturnType<typeof AUTO_COMPACT_CONTROLS.get>>;

function categoryColor(category: ContextCategory) {
  return (
    CATEGORY_DETAILS[category.id ?? ""]?.color ??
    (category.kind === "used"
      ? "bg-primary/70"
      : category.kind === "free"
        ? "bg-muted-foreground/15"
        : "bg-muted-foreground/45")
  );
}

export function ThreadDetailsContext({
  usage,
  environmentId,
  providerInstanceId,
  providers,
}: {
  readonly usage: ContextWindowSnapshot | null;
  readonly environmentId: EnvironmentId;
  readonly providerInstanceId: ProviderInstanceId | null;
  readonly providers: readonly ServerProvider[];
}) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const breakdown = usage?.contextBreakdown;
  const usedTokens = breakdown?.usedTokens ?? usage?.usedTokens ?? 0;
  const capacity = breakdown?.maxTokens ?? usage?.maxTokens;
  const maxTokens = capacity != null && capacity > 0 ? capacity : null;
  const fill = maxTokens === null ? null : Math.min(1, usedTokens / maxTokens);
  const threshold =
    (breakdown ? breakdown.autoCompactThreshold : usage?.autoCompactThreshold) ?? null;
  const tick =
    maxTokens !== null && threshold !== null && threshold > 0 && threshold < maxTokens
      ? threshold / maxTokens
      : null;
  const totals =
    maxTokens === null
      ? gt("{usedTokens} tokens used", { usedTokens: number.format(usedTokens) })
      : gt("{used} of {max} tokens", {
          used: number.format(usedTokens),
          max: number.format(maxTokens),
        });
  const categories = breakdown?.categories.filter(
    ({ kind, tokens }) => kind === "free" || tokens > 0,
  );
  const usedCategories = categories?.filter(({ kind }) => kind === "used") ?? [];
  const categorizedTokens = usedCategories.reduce((sum, { tokens }) => sum + tokens, 0);
  const usedDenominator = Math.max(categorizedTokens, usedTokens);
  const bufferTokens =
    categories?.reduce((sum, row) => sum + (row.kind === "buffer" ? row.tokens : 0), 0) ?? 0;
  const remaining = maxTokens === null ? null : Math.max(0, maxTokens - usedTokens);
  const provider = providers.find((candidate) => candidate.instanceId === providerInstanceId);
  const autoCompact =
    provider === undefined ? undefined : AUTO_COMPACT_CONTROLS.get(provider.driver);

  return (
    <ThreadDetailsSection headingId="thread-details-context-heading" title={gt("Context window")}>
      {usage === null ? (
        <p className="px-2.5 pb-1 text-xs text-muted-foreground">
          {gt("Context usage appears when the provider reports it.")}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5 px-2.5 pb-1 text-xs">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <span className="font-medium tabular-nums">
              {maxTokens === null
                ? totals
                : gt("{percent} used", { percent: percent.format(usedTokens / maxTokens) })}
            </span>
            {maxTokens !== null ? (
              <Tooltip>
                <TooltipTrigger render={<span className="text-muted-foreground tabular-nums" />}>
                  {compact.format(usedTokens)} / {compact.format(maxTokens)}
                </TooltipTrigger>
                <TooltipPopup side="left" sideOffset={16}>
                  {totals}
                </TooltipPopup>
              </Tooltip>
            ) : null}
          </div>
          {maxTokens !== null && fill !== null ? (
            <div
              role="meter"
              aria-label={gt("Context window")}
              aria-valuemin={0}
              aria-valuemax={maxTokens}
              aria-valuenow={Math.min(usedTokens, maxTokens)}
              aria-valuetext={totals}
              className="relative"
            >
              <div className="flex h-1.5 overflow-hidden rounded-full bg-muted-foreground/15">
                {fill > 0 && usedDenominator > 0 ? (
                  <div
                    className={cn(
                      "flex shrink-0 overflow-hidden bg-primary/75",
                      !breakdown && fill >= 0.9 && "bg-error",
                      !breakdown && fill >= 0.8 && fill < 0.9 && "bg-warning",
                    )}
                    style={{ width: `${percentWidth(fill)}%` }}
                  >
                    {usedCategories.map((category) => (
                      <span
                        key={category.id ?? category.label}
                        className={cn("shrink-0", categoryColor(category))}
                        style={{ width: `${percentWidth(category.tokens / usedDenominator)}%` }}
                      />
                    ))}
                  </div>
                ) : null}
                {bufferTokens > 0 ? (
                  <span
                    className="shrink-0 bg-muted-foreground/45"
                    style={{
                      width: `${percentWidth(Math.min(1 - fill, bufferTokens / maxTokens))}%`,
                    }}
                  />
                ) : null}
              </div>
              {tick === null ? null : (
                <span
                  aria-hidden
                  className="absolute -inset-y-0.5 w-px bg-foreground/75"
                  style={{ insetInlineStart: `${percentWidth(tick)}%` }}
                />
              )}
            </div>
          ) : null}
          {providerInstanceId !== null && provider !== undefined && autoCompact !== undefined ? (
            <AutoCompactThresholdControl
              environmentId={environmentId}
              instanceId={providerInstanceId}
              driver={provider.driver}
              control={autoCompact}
              modelWindow={usage.maxTokens ?? null}
            />
          ) : threshold !== null ? (
            <p className="text-2xs text-muted-foreground">
              {formatContextWindowCompactionMessage(threshold, m, locale)}
            </p>
          ) : null}
          {categories !== undefined ? (
            <>
              <p className="text-2xs text-muted-foreground">{gt("Estimated breakdown")}</p>
              <dl className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 gap-y-1.5">
                {categories.map((category) => {
                  const label = CATEGORY_DETAILS[category.id ?? ""]?.label;
                  const displayLabel = label === undefined ? category.label : m(label);
                  return (
                    <div
                      key={`${category.kind}:${category.id ?? category.label}`}
                      className="col-span-3 grid grid-cols-subgrid items-baseline"
                    >
                      <dt className="flex min-w-0 items-baseline gap-1.5">
                        <span
                          aria-hidden
                          className={cn("size-1.5 shrink-0 rounded-sm", categoryColor(category))}
                        />
                        <span className="min-w-0 break-words">{displayLabel}</span>
                      </dt>
                      <dd className="text-end text-muted-foreground tabular-nums">
                        {number.format(category.tokens)}
                      </dd>
                      <dd className="text-end tabular-nums">
                        {maxTokens === null || category.kind === "deferred"
                          ? "–"
                          : percent.format(category.tokens / maxTokens)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </>
          ) : remaining !== null && maxTokens !== null ? (
            <dl className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">{m(AVAILABLE_SPACE)}</dt>
              <dd className="tabular-nums">
                {number.format(remaining)} · {percent.format(remaining / maxTokens)}
              </dd>
            </dl>
          ) : null}
          {breakdown?.mcpTools || breakdown?.memoryFiles ? (
            <div className="flex flex-col gap-1 border-t border-border/65 pt-1.5">
              {breakdown.mcpTools ? (
                <ContextEntries label={m(MCP_TOOLS)} data={breakdown.mcpTools} />
              ) : null}
              {breakdown.memoryFiles ? (
                <ContextEntries label={m(MEMORY_FILES)} data={breakdown.memoryFiles} />
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </ThreadDetailsSection>
  );
}

function AutoCompactThresholdControl({
  environmentId,
  instanceId,
  driver,
  control,
  modelWindow,
}: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly driver: ProviderDriverKind;
  readonly control: AutoCompactControl;
  readonly modelWindow: number | null;
}) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const instance = useEnvironmentSettings(
    environmentId,
    (settings) => settings.providerInstances?.[instanceId],
  );
  const canWrite = useEnvironmentScope(environmentId, AuthSettingsWriteScope);
  const persistInstance = usePersistEnvironmentProviderInstanceMutation(environmentId);
  const config: Readonly<Record<string, unknown>> =
    typeof instance?.config === "object" && instance.config !== null
      ? Object.fromEntries(Object.entries(instance.config))
      : {};
  const saved = config[control.configKey];
  const current = typeof saved === "string" && saved !== "" ? Number(saved) : null;
  const thresholds = [
    ...new Set([
      ...control.thresholds.filter((threshold) => modelWindow === null || threshold <= modelWindow),
      ...(current === null ? [] : [current]),
    ]),
  ].toSorted((a, b) => b - a);
  const label = (threshold: number | null) =>
    threshold === null
      ? gt("Auto", { $context: "auto-compact threshold" })
      : compact.format(threshold);

  const select = async (value: string | null) => {
    if (value === null || value === (current === null ? AUTO_COMPACT_DEFAULT : String(current))) {
      return;
    }
    const rest = Object.fromEntries(
      Object.entries(config).filter(([key]) => key !== control.configKey),
    );
    const nextConfig =
      value === AUTO_COMPACT_DEFAULT ? rest : { ...rest, [control.configKey]: value };
    const { config: _config, ...base } = instance ?? { driver };
    const result = await persistInstance({
      operation: "upsert",
      instanceId,
      instance: Object.keys(nextConfig).length === 0 ? base : { ...base, config: nextConfig },
    });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: gt("Could not update provider instance"),
        description:
          error instanceof Error
            ? (thrownErrorMessage(error, resolveNow) ?? error.message)
            : gt("The settings update failed."),
      });
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span id="thread-details-auto-compact-label">{gt("Auto-compact threshold")}</span>
        <Select
          value={current === null ? AUTO_COMPACT_DEFAULT : String(current)}
          disabled={!canWrite}
          onValueChange={(value) => void select(value)}
        >
          <SelectTrigger
            size="compact"
            variant="ghost"
            aria-labelledby="thread-details-auto-compact-label"
            className="-me-2 w-auto"
          >
            <SelectValue>{label(current)}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            <SelectItem value={AUTO_COMPACT_DEFAULT}>{label(null)}</SelectItem>
            {thresholds.map((threshold) => (
              <SelectItem key={threshold} value={String(threshold)}>
                <span className="flex items-center gap-2">
                  {label(threshold)}
                  {threshold === control.recommended ? (
                    <Badge variant="secondary" size="sm">
                      {gt("Recommended")}
                    </Badge>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
      <p className="text-2xs text-muted-foreground">{m(control.description)}</p>
    </div>
  );
}

function percentWidth(ratio: number) {
  return ratio * 100;
}

function ContextEntries({
  label,
  data,
}: {
  readonly label: string;
  readonly data: NonNullable<ContextWindowBreakdown["mcpTools"]>;
}) {
  const gt = useGT();
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale);
  return (
    <details className="group/context-entries">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-sm py-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          aria-hidden
          className="size-3 text-muted-foreground group-open/context-entries:rotate-90 rtl:rotate-180"
        />
        <span className="min-w-0 flex-1">{label}</span>
        <span className="text-muted-foreground tabular-nums">{number.format(data.count)}</span>
      </summary>
      <div className="ps-4.5 pt-1 pb-1" data-thread-context-entries>
        <ul className="space-y-1.5">
          {data.entries.map((entry) => (
            <li key={entry.label} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 break-all">{entry.label}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {number.format(entry.tokens)}
              </span>
            </li>
          ))}
        </ul>
        {data.count > data.entries.length ? (
          <p className="mt-1.5 text-2xs text-muted-foreground">
            {gt("Showing {shown} of {total}", {
              shown: number.format(data.entries.length),
              total: number.format(data.count),
            })}
          </p>
        ) : null}
      </div>
    </details>
  );
}
