import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ProjectId,
  type ProjectTrackedFolder,
} from "@t3tools/contracts";
import { useGT } from "gt-react";
import { useState } from "react";

import { projectEnvironment } from "../state/projects";
import { useEnvironmentScope } from "../state/session";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { reportProjectFailure } from "./reportProjectFailure";

/** Adds one folder to a project's tracked folders; the server merges it into its own list. */
export function useTrackProjectFolder(
  environmentId: EnvironmentId | null,
  projectId: ProjectId | null,
) {
  const gt = useGT();
  const canEdit = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const updateProject = useOrchestrationCommand(projectEnvironment.update, {
    reportFailure: false,
  });
  const [busy, setBusy] = useState(false);
  const track = async (folder: ProjectTrackedFolder) => {
    if (environmentId === null || projectId === null) return false;
    setBusy(true);
    const result = await updateProject({
      environmentId,
      input: { projectId, trackFolders: [{ path: folder.path, name: folder.name }] },
    });
    setBusy(false);
    if (result._tag === "Failure") {
      reportProjectFailure(gt("Failed to add folder"), result);
      return false;
    }
    return true;
  };
  return { canEdit: canEdit && projectId !== null, busy, track };
}
