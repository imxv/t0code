import {
  filterFilesystemBrowseEntries,
  getFilesystemBrowsePath,
} from "@t3tools/client-runtime/state/filesystem";
import {
  appendBrowsePathSegment,
  ensureBrowseDirectoryPath,
  getBrowseParentPath,
} from "@t3tools/client-runtime/state/projects";
import type { EnvironmentId, ProjectTrackedFolder } from "@t3tools/contracts";
import { FolderIcon } from "lucide-react";
import { T, Var } from "gt-react";
import { useId, useState } from "react";

import { filesystemEnvironment } from "../state/filesystem";
import { useEnvironmentQuery } from "../state/query";
import { resolveTrackedFolderInput } from "./settings/trackedFolders.logic";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const BROWSE_SUGGESTION_LIMIT = 100;

/** Picks a folder anywhere on the project's machine for the project to track. */
export function AddTrackedFolderDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string;
  readonly platform: string;
  readonly canBrowse: boolean;
  readonly busy: boolean;
  readonly onAdd: (folder: ProjectTrackedFolder) => void;
  readonly onClose: () => void;
}) {
  const inputId = useId();
  // Repositories next to the project folder are the common case, so the listing starts there.
  const [query, setQuery] = useState(
    () =>
      getBrowseParentPath(props.workspaceRoot) ?? ensureBrowseDirectoryPath(props.workspaceRoot),
  );
  const browsePath = getFilesystemBrowsePath(query, props.platform, props.canBrowse);
  const browseQuery = useEnvironmentQuery(
    browsePath.isBrowsing && browsePath.directoryPath.length > 0
      ? filesystemEnvironment.browse({
          environmentId: props.environmentId,
          input: { partialPath: browsePath.directoryPath, cwd: props.workspaceRoot },
        })
      : null,
  );
  const { visibleEntries, exactEntry } = filterFilesystemBrowseEntries(
    browseQuery.data?.entries ?? [],
    browsePath.filterQuery,
  );
  const folder = resolveTrackedFolderInput({
    query,
    listedDirectoryPath: browseQuery.data?.parentPath ?? null,
    exactEntryPath: exactEntry?.fullPath ?? null,
  });
  const parentPath = browsePath.canBrowseUp ? browsePath.parentPath : null;
  const hiddenCount = Math.max(0, visibleEntries.length - BROWSE_SUGGESTION_LIMIT);
  const rowClassName =
    "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm outline-none hover:bg-muted/50 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogPopup>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (folder && !props.busy) props.onAdd(folder);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <T>Add folder</T>
            </DialogTitle>
            <DialogDescription>
              <T>Track a repository or folder anywhere on this project's machine.</T>
            </DialogDescription>
            <div className="flex flex-col gap-2 pt-1">
              <Label htmlFor={inputId}>
                <T>Folder path</T>
              </Label>
              <Input
                id={inputId}
                font="mono"
                autoComplete="off"
                spellCheck={false}
                placeholder="/path/to/repository"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </div>
          </DialogHeader>
          <DialogPanel>
            <div className="-mx-2 flex min-h-40 flex-col">
              {parentPath !== null ? (
                <button type="button" className={rowClassName} onClick={() => setQuery(parentPath)}>
                  <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                  ..
                </button>
              ) : null}
              {visibleEntries.slice(0, BROWSE_SUGGESTION_LIMIT).map((entry) => (
                <button
                  key={entry.fullPath}
                  type="button"
                  className={rowClassName}
                  onClick={() =>
                    setQuery(appendBrowsePathSegment(browsePath.directoryPath, entry.name))
                  }
                >
                  <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">{entry.name}</span>
                </button>
              ))}
              {browseQuery.error ? (
                <p role="alert" className="px-2 py-1.5 text-sm text-muted-foreground">
                  {browseQuery.error}
                </p>
              ) : browseQuery.isPending && browseQuery.data === null ? (
                <p role="status" className="px-2 py-1.5 text-sm text-muted-foreground">
                  <T>Loading folders…</T>
                </p>
              ) : hiddenCount > 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  <T>
                    <Var>{hiddenCount}</Var> more. Keep typing to narrow the list.
                  </T>
                </p>
              ) : !props.canBrowse ? (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">
                  <T>This connection cannot browse folders. Enter an absolute path.</T>
                </p>
              ) : null}
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose}>
              <T>Cancel</T>
            </Button>
            <Button type="submit" disabled={folder === null || props.busy}>
              <T>Add folder</T>
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
