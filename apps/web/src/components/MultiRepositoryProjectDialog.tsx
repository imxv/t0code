import {
  filterFilesystemBrowseEntries,
  getFilesystemBrowsePath,
} from "@t3tools/client-runtime/state/filesystem";
import { ensureBrowseDirectoryPath } from "@t3tools/client-runtime/state/projects";
import {
  AuthOrchestrationOperateScope,
  PROJECT_TRACKED_FOLDERS_MAX,
  type EnvironmentId,
  type ProjectTrackedFolder,
} from "@t3tools/contracts";
import { normalizeProjectPathForComparison } from "@t3tools/shared/path";
import { T, useGT } from "gt-react";
import { ChevronRightIcon, XIcon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useNewProject } from "../hooks/useNewProject";
import { filesystemEnvironment, useFilesystemReadAccess } from "../state/filesystem";
import { useEnvironmentQuery } from "../state/query";
import { useEnvironmentScope } from "../state/session";
import { resolveTrackedFolderInput } from "./settings/trackedFolders.logic";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
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

const BROWSE_LIMIT = 100;

export interface MultiRepositoryProjectTarget {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly platform: string;
  readonly initialPath: string;
  readonly initialName: string;
  readonly cwd: string | null;
}

export function MultiRepositoryProjectDialog({
  target,
  onClose,
}: {
  readonly target: MultiRepositoryProjectTarget;
  readonly onClose: () => void;
}) {
  const gt = useGT();
  const nameId = useId();
  const pathId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(target.initialName);
  const [directory, setDirectory] = useState(target.initialPath);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlyMap<string, ProjectTrackedFolder>>(new Map());
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const handleNewThread = useNewThreadHandler();
  const createProject = useNewProject(async (projectRef) => {
    await handleNewThread(projectRef);
  });
  const canCreate = useEnvironmentScope(target.environmentId, AuthOrchestrationOperateScope);
  const access = useFilesystemReadAccess(target.environmentId);
  const requestedPath = getFilesystemBrowsePath(query, target.platform, access.canReadFiles);
  const browse = requestedPath.isBrowsing
    ? requestedPath
    : getFilesystemBrowsePath(
        `${ensureBrowseDirectoryPath(directory)}${query}`,
        target.platform,
        access.canReadFiles,
      );
  const listing = useEnvironmentQuery(
    browse.directoryPath
      ? filesystemEnvironment.browse({
          environmentId: target.environmentId,
          input: { partialPath: browse.directoryPath, ...(target.cwd ? { cwd: target.cwd } : {}) },
        })
      : null,
  );
  const { visibleEntries, exactEntry } = filterFilesystemBrowseEntries(
    listing.data?.entries ?? [],
    browse.filterQuery,
  );
  const typedFolder = resolveTrackedFolderInput({
    query,
    listedDirectoryPath: listing.data?.parentPath ?? null,
    exactEntryPath: exactEntry?.fullPath ?? null,
  });
  const browseError = access.error ?? listing.error;
  const atLimit = selected.size >= PROJECT_TRACKED_FOLDERS_MAX;
  const canAddTypedFolder =
    !busy &&
    !atLimit &&
    typedFolder !== null &&
    !selected.has(normalizeProjectPathForComparison(typedFolder.path));
  const title = name.trim();
  const canSubmit = canCreate && !busy && title.length > 0 && selected.size > 0;

  function browseTo(path: string) {
    setDirectory(path);
    setQuery("");
  }

  function selectFolder(folder: ProjectTrackedFolder, checked: boolean) {
    const key = normalizeProjectPathForComparison(folder.path);
    setSelected((current) => {
      if (checked && (current.has(key) || current.size >= PROJECT_TRACKED_FOLDERS_MAX)) {
        return current;
      }
      const next = new Map(current);
      if (checked) next.set(key, folder);
      else next.delete(key);
      return next;
    });
  }

  async function submit() {
    if (!canSubmit || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    const created = await createProject({
      environmentId: target.environmentId,
      name: title,
      publishTo: null,
      trackedFolders: [...selected.values()],
    });
    submitting.current = false;
    setBusy(false);
    if (created) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogPopup initialFocus={nameInput} showCloseButton={!busy}>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <T>Multi-repository project</T>
            </DialogTitle>
            <DialogDescription>
              {gt("Choose folders on {environment} to work in together.", {
                environment: target.environmentLabel,
              })}
            </DialogDescription>
            <Label htmlFor={nameId}>
              <T>Project name</T>
            </Label>
            <Input
              id={nameId}
              ref={nameInput}
              value={name}
              maxLength={200}
              disabled={busy}
              onChange={(event) => setName(event.currentTarget.value)}
            />
            <Label htmlFor={pathId}>
              <T>Find folders</T>
            </Label>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  id={pathId}
                  font="mono"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={gt("Filter by name or enter a path")}
                  disabled={busy}
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    if (canAddTypedFolder && typedFolder) selectFolder(typedFolder, true);
                  }}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canAddTypedFolder}
                onClick={() => typedFolder && selectFolder(typedFolder, true)}
              >
                <T>Add folder</T>
              </Button>
            </div>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col">
              {browse.isBrowsing ? (
                <p className="truncate py-1 font-mono text-xs text-muted-foreground">
                  {browse.directoryPath}
                </p>
              ) : null}
              {browse.parentPath !== null && browse.canBrowseUp ? (
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => browse.parentPath !== null && browseTo(browse.parentPath)}
                  >
                    <T>Parent folder</T>
                  </Button>
                </div>
              ) : null}
              {visibleEntries.slice(0, BROWSE_LIMIT).map((entry) => {
                const folder = { name: entry.name.slice(0, 128), path: entry.fullPath };
                const checked = selected.has(normalizeProjectPathForComparison(folder.path));
                return (
                  <div key={entry.fullPath} className="flex items-center gap-2 py-1">
                    <Label className="min-w-0 flex-1 cursor-pointer">
                      <Checkbox
                        aria-label={entry.name}
                        checked={checked}
                        disabled={busy || (atLimit && !checked)}
                        onCheckedChange={(value) => selectFolder(folder, value)}
                      />
                      <span className="truncate">{entry.name}</span>
                    </Label>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={busy}
                      aria-label={gt("Browse {name}", { name: entry.name })}
                      onClick={() => browseTo(entry.fullPath)}
                    >
                      <ChevronRightIcon className="size-4" />
                    </Button>
                  </div>
                );
              })}
              {browseError ? (
                <p role="alert" className="py-2 text-sm text-muted-foreground">
                  {browseError}
                </p>
              ) : access.isPending || listing.isPending ? (
                <p role="status" className="py-2 text-sm text-muted-foreground">
                  <T>Loading folders…</T>
                </p>
              ) : visibleEntries.length > BROWSE_LIMIT ? (
                <p className="py-2 text-sm text-muted-foreground">
                  <T>Keep typing to narrow the list.</T>
                </p>
              ) : !access.canReadFiles ? (
                <p className="py-2 text-sm text-muted-foreground">
                  <T>This connection cannot browse folders. Enter an absolute path.</T>
                </p>
              ) : listing.isSuccess && visibleEntries.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  <T>No matching folders</T>
                </p>
              ) : null}
            </div>
          </DialogPanel>
          <div className="max-h-28 overflow-y-auto px-4 py-2">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {gt(
                "{count, plural, one {{count} folder selected} other {{count} folders selected}}",
                {
                  count: selected.size,
                },
              )}
            </p>
            {[...selected].map(([key, folder]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 break-all text-sm">{folder.path}</span>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  disabled={busy}
                  aria-label={gt("Remove {name} from the project", { name: folder.name })}
                  onClick={() => selectFolder(folder, false)}
                >
                  <XIcon className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              <T>Cancel</T>
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {busy ? <T>Creating project…</T> : <T>Create project</T>}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
