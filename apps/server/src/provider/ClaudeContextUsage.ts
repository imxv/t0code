import type { SDKControlGetContextUsageResponse } from "@anthropic-ai/claude-agent-sdk";
import {
  CONTEXT_WINDOW_BREAKDOWN_MAX_CATEGORIES,
  CONTEXT_WINDOW_BREAKDOWN_MAX_ENTRIES,
  CONTEXT_WINDOW_BREAKDOWN_MAX_LABEL_LENGTH,
  type ContextWindowBreakdown,
} from "@t3tools/contracts";

function isTokenCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function summarizeEntries<T>(
  entries: readonly T[] | undefined,
  map: (entry: T) => { label: string; tokens: number },
) {
  if (!Array.isArray(entries) || entries.length === 0) return undefined;
  return {
    count: entries.length,
    entries: entries
      .map(map)
      .filter(({ label, tokens }) => label.length > 0 && isTokenCount(tokens))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, CONTEXT_WINDOW_BREAKDOWN_MAX_ENTRIES),
  };
}

export function claudeContextBreakdown(
  report: SDKControlGetContextUsageResponse,
): ContextWindowBreakdown | undefined {
  if (
    !isTokenCount(report?.totalTokens) ||
    !isTokenCount(report.rawMaxTokens) ||
    report.rawMaxTokens === 0 ||
    !Array.isArray(report.categories)
  ) {
    return undefined;
  }
  const categories = report.categories
    .filter(
      ({ name, kind, tokens }) =>
        typeof name === "string" &&
        name.length > 0 &&
        isTokenCount(tokens) &&
        (kind === "used" || kind === "free" || kind === "buffer" || kind === "deferred"),
    )
    .slice(0, CONTEXT_WINDOW_BREAKDOWN_MAX_CATEGORIES)
    .map(({ id, name, kind, tokens }) => ({
      ...(typeof id !== "string"
        ? {}
        : { id: id.slice(0, CONTEXT_WINDOW_BREAKDOWN_MAX_LABEL_LENGTH) }),
      label: name.slice(0, CONTEXT_WINDOW_BREAKDOWN_MAX_LABEL_LENGTH),
      kind,
      tokens,
    }));
  if (categories.length === 0) return undefined;

  const mcpTools = summarizeEntries(report.mcpTools, ({ name, tokens }) => ({
    label: name.slice(0, CONTEXT_WINDOW_BREAKDOWN_MAX_LABEL_LENGTH),
    tokens,
  }));
  const memoryFiles = summarizeEntries(report.memoryFiles, ({ path, tokens }) => ({
    label: path.slice(-CONTEXT_WINDOW_BREAKDOWN_MAX_LABEL_LENGTH),
    tokens,
  }));
  const threshold = report.autoCompactThreshold;
  return {
    usedTokens: report.totalTokens,
    maxTokens: report.rawMaxTokens,
    ...(report.isAutoCompactEnabled &&
    threshold !== undefined &&
    isTokenCount(threshold) &&
    threshold > 0
      ? { autoCompactThreshold: threshold }
      : {}),
    categories,
    ...(mcpTools === undefined ? {} : { mcpTools }),
    ...(memoryFiles === undefined ? {} : { memoryFiles }),
  };
}
