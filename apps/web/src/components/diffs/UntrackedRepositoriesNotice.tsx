import { useAtomValue } from "@effect/atom-react";
import { untrackedChangeRepositories } from "@t3tools/client-runtime/state/thread-repositories";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";
import { useGT } from "gt-react";

import { useTrackProjectFolder } from "~/hooks/useTrackProjectFolder";
import { repositoryStatusesAtom } from "~/state/vcs";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const NO_STATUSES: ReturnType<typeof repositoryStatusesAtom> = Atom.make([]);

/**
 * Repositories the thread changed files in that its project does not track. Their changes can
 * only be read once the project tracks them, which grants agents and reviews that folder.
 */
export function UntrackedRepositoriesNotice(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  /** Changed folders no known folder holds. */
  readonly folders: ReadonlyArray<string>;
  readonly knownFolders: ReadonlyArray<string>;
  readonly onTracked: () => void;
}) {
  const gt = useGT();
  const { environmentId, folders } = props;
  const statuses = useAtomValue(
    folders.length === 0
      ? NO_STATUSES
      : repositoryStatusesAtom(JSON.stringify({ environmentId, cwds: folders })),
  );
  const repositories = untrackedChangeRepositories({
    repositoryRoots: folders.map((_, index) => {
      const result = statuses[index];
      const status = result === undefined ? null : AsyncResult.getOrElse(result, () => null);
      return status?.isRepo ? (status.workingTree.rootPath ?? null) : null;
    }),
    knownFolders: props.knownFolders,
  });
  const { canEdit, busy, track } = useTrackProjectFolder(environmentId, props.projectId);
  if (repositories.length === 0) return null;
  return (
    <div className="shrink-0 space-y-1 border-b border-border/70 bg-muted/40 px-3 py-1.5 text-2xs text-muted-foreground">
      {repositories.map((repository) => (
        <div key={repository.path} className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger render={<p className="min-w-0 flex-1" />}>
              {gt(
                "This thread changed files in {name}, which this project does not track. Add it to see its changes here.",
                { name: repository.name },
              )}
            </TooltipTrigger>
            <TooltipPopup side="bottom">{repository.path}</TooltipPopup>
          </Tooltip>
          {canEdit ? (
            <Button
              size="xs"
              variant="outline"
              className="shrink-0"
              disabled={busy}
              onClick={() => {
                void track(repository).then((tracked) => {
                  if (tracked) props.onTracked();
                });
              }}
            >
              {gt("Add to project")}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
