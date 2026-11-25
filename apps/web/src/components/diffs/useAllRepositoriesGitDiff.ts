import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import {
  ALL_REPOSITORIES_GIT_MAX,
  gitRepositoryDiffSections,
  repositoryHasGitChanges,
  type GitRepositoryDiffSection,
  type RepositoryGitScope,
  type ThreadGitRepository,
} from "@t3tools/client-runtime/state/thread-repositories";
import type { EnvironmentId, VcsStatusResult } from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";

import { useLiveRefresh } from "~/hooks/useLiveRefresh";
import type { MessageResolver } from "~/i18n/messages";
import { formatEnvironmentQueryError } from "~/state/query";
import { repositoryDiffPreviewsAtom } from "~/state/review";
import { useAtomCommand } from "~/state/use-atom-command";
import { repositoryStatusesAtom, vcsEnvironment } from "~/state/vcs";

const NO_STATUSES: ReturnType<typeof repositoryStatusesAtom> = Atom.make([]);
const NO_PREVIEWS: ReturnType<typeof repositoryDiffPreviewsAtom> = Atom.make([]);

export interface AllRepositoriesGitDiff {
  /** Statuses that have arrived, by repository path. */
  readonly statuses: ReadonlyMap<string, VcsStatusResult>;
  /** The changed repositories' patches; meaningful once `loaded`. */
  readonly sections: ReadonlyArray<GitRepositoryDiffSection>;
  /** Every status and every changed repository's patch has been read at least once. */
  readonly loaded: boolean;
  readonly isPending: boolean;
  readonly failures: ReadonlyArray<{ readonly name: string; readonly message: string }>;
  readonly truncated: boolean;
  /** Some repository's untracked files are still being read. */
  readonly incomplete: boolean;
  /** More repositories than `ALL_REPOSITORIES_GIT_MAX`; only the first ones are read. */
  readonly omittedCount: number;
  readonly refresh: () => void;
}

/**
 * The Git changes of several repositories at once. Statuses pick which repositories changed in
 * `scope`, so only those pay for a patch.
 */
export function useAllRepositoriesGitDiff(
  input: {
    readonly environmentId: EnvironmentId | null;
    readonly repositories: ReadonlyArray<ThreadGitRepository>;
    readonly threadCwd: string | null;
    readonly scope: RepositoryGitScope;
    readonly ignoreWhitespace: boolean;
    readonly revision: string | null | undefined;
    /** Reads the statuses, which the repository picker shows. */
    readonly watchStatuses: boolean;
    /** Reads the changed repositories' patches too. */
    readonly readDiffs: boolean;
    readonly visible: boolean;
  },
  resolve: MessageResolver,
): AllRepositoriesGitDiff {
  const { environmentId } = input;
  const repositories = input.repositories.slice(0, ALL_REPOSITORIES_GIT_MAX);
  const statusesAtom =
    environmentId !== null && (input.watchStatuses || input.readDiffs) && repositories.length > 0
      ? repositoryStatusesAtom(
          JSON.stringify({ environmentId, cwds: repositories.map((repository) => repository.cwd) }),
        )
      : NO_STATUSES;
  const statusResults = useAtomValue(statusesAtom);

  const statuses = new Map<string, VcsStatusResult>();
  const changed: Array<ThreadGitRepository> = [];
  let statusesPending = false;
  repositories.forEach((repository, index) => {
    const result = statusResults[index];
    const status = result === undefined ? null : AsyncResult.getOrElse(result, () => null);
    if (status !== null) statuses.set(repository.repositoryPath, status);
    const hasChanges = repositoryHasGitChanges(status, input.scope);
    if (hasChanges === true) changed.push(repository);
    // A repository whose status cannot be read has nothing to show.
    else if (hasChanges === null && result?._tag !== "Failure") statusesPending = true;
  });

  const previewsAtom =
    environmentId !== null && input.readDiffs && changed.length > 0
      ? repositoryDiffPreviewsAtom(
          JSON.stringify({
            environmentId,
            inputs: changed.map((repository) => ({
              cwd: repository.cwd,
              sourceKind: input.scope,
              ignoreWhitespace: input.ignoreWhitespace,
            })),
            revision: input.revision,
          }),
        )
      : NO_PREVIEWS;
  const previewResults = useAtomValue(previewsAtom);
  const refreshPreviews = useAtomRefresh(previewsAtom);
  const refreshStatus = useAtomCommand(vcsEnvironment.refreshStatus, { reportFailure: false });

  const failures: Array<{ readonly name: string; readonly message: string }> = [];
  let loaded = !statusesPending;
  let isPending = statusesPending;
  let truncated = false;
  let incomplete = false;
  const withDiffs = changed.map((repository, index) => {
    const result = previewResults[index];
    if (result === undefined || result._tag === "Initial") loaded = false;
    if (result?.waiting) isPending = true;
    if (result?._tag === "Failure") {
      failures.push({
        name: repository.name,
        message: formatEnvironmentQueryError(result.cause, resolve),
      });
    }
    const preview = result === undefined ? null : AsyncResult.getOrElse(result, () => null);
    const source = preview?.sources.find((candidate) => candidate.kind === input.scope);
    if (preview?.incomplete) incomplete = true;
    if (source?.truncated) truncated = true;
    return { ...repository, diff: source?.diff ?? "" };
  });

  const refresh = () => {
    refreshPreviews();
    if (environmentId === null) return;
    for (const repository of repositories) {
      void refreshStatus({ environmentId, input: { cwd: repository.cwd } });
    }
  };
  // The panel stays mounted while hidden; showing it again reads what changed meanwhile.
  useLiveRefresh(loaded && !isPending ? refresh : null, {
    enabled: input.visible && input.readDiffs,
    key: `all-repositories-diff:${environmentId ?? ""}:${input.threadCwd ?? ""}`,
    intervalMs: null,
    refreshOnShow: true,
  });

  return {
    statuses,
    sections: gitRepositoryDiffSections({ repositories: withDiffs, threadCwd: input.threadCwd }),
    loaded,
    isPending,
    failures,
    truncated,
    incomplete,
    omittedCount: input.repositories.length - repositories.length,
    refresh,
  };
}
