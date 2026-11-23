import { ProviderDriverKind } from "@t3tools/contracts";
import {
  makePackageManagedProviderMaintenanceResolver,
  type ProviderMaintenanceCapabilitiesResolver,
} from "@t3tools/provider-core/server/maintenanceResolver";
import {
  parseCliVersionResult,
  providerProbeEnvironment,
  spawnAndCollect,
} from "@t3tools/provider-core/server/snapshotProbe";
import { mergePathEntries, resolveSpawnCommand, setWindowsPath } from "@t3tools/shared/shell";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

const OMP_NATIVE_UPDATE_LOCK = "acpRegistry-native";
const OMP_VERSION = String.raw`v?(\d+\.\d+\.\d+(?:-[\w.-]+)?)`;

function parseVersionLine(output: string, prefix: string): string | null {
  return new RegExp(`${prefix}${OMP_VERSION}(?=\\s|$)`, "m").exec(output)?.[1] ?? null;
}

function parseOmpUpdateVersion(output: string): string | null {
  return (
    parseVersionLine(output, "^New version available: ") ??
    (/Already up to date/.test(output) ? parseVersionLine(output, "^Current version: ") : null)
  );
}

const probeOmp = Effect.fn("OmpMaintenance.probe")(function* (
  binaryPath: string,
  args: ReadonlyArray<string>,
  environment: NodeJS.ProcessEnv,
) {
  const env = { ...providerProbeEnvironment(environment), NO_COLOR: "1", FORCE_COLOR: "0" };
  const spawn = yield* resolveSpawnCommand(binaryPath, args, { env, extendEnv: true });
  return yield* spawnAndCollect(
    binaryPath,
    ChildProcess.make(spawn.command, spawn.args, { env, shell: spawn.shell }),
    { maxStdoutBytes: 64 * 1024 },
  );
});

export const checkOmpInstalledVersion = (binaryPath: string, env: NodeJS.ProcessEnv) =>
  probeOmp(binaryPath, ["--version"], env).pipe(
    Effect.map((result) =>
      parseCliVersionResult(result, (output) => parseVersionLine(output, "^omp/")),
    ),
    Effect.timeoutOption("5 seconds"),
    Effect.map(Option.getOrNull),
    Effect.orElseSucceed(() => null),
  );

const packageDefinition = {
  provider: ProviderDriverKind.make("acpRegistry"),
  npmPackageName: "@oh-my-pi/pi-coding-agent",
  mise: { tool: "github:can1357/oh-my-pi" },
};
const packageManaged = makePackageManagedProviderMaintenanceResolver({
  ...packageDefinition,
  nativeUpdate: null,
});
const isStandalonePath = (path: string) =>
  /\/\.local\/bin\/omp(?:\.exe)?$/i.test(path.replaceAll("\\", "/"));
const standalone = makePackageManagedProviderMaintenanceResolver({
  ...packageDefinition,
  nativeUpdate: {
    args: ["update"],
    requiresCommandPath: true,
    isCommandPath: isStandalonePath,
  },
});

export const ompMaintenance: ProviderMaintenanceCapabilitiesResolver = {
  resolve: Effect.fn("OmpMaintenance.resolve")(function* (context) {
    const resolver =
      context !== null && isStandalonePath(context.realCommandPath) ? standalone : packageManaged;
    const capabilities = yield* resolver.resolve(context);
    if (context === null || capabilities.update?.lockKey !== OMP_NATIVE_UPDATE_LOCK) {
      return capabilities;
    }
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const path = yield* Path.Path;
    // OMP finds the launcher it updates by searching PATH, even when invoked by absolute path.
    const env = { ...context.env };
    const launcherPath = mergePathEntries(
      path.dirname(context.resolvedCommandPath),
      env.PATH ?? env.Path ?? env.path,
      context.platform,
    );
    if (context.platform === "win32") setWindowsPath(env, launcherPath ?? null);
    else env.PATH = launcherPath;
    return {
      ...capabilities,
      update: { ...capabilities.update, env, lockKey: `omp-native:${context.realCommandPath}` },
      latestVersion: null,
      lookupLatestVersion: probeOmp(
        capabilities.update.executable,
        ["update", "--check"],
        env,
      ).pipe(
        Effect.map((result) => parseCliVersionResult(result, parseOmpUpdateVersion)),
        Effect.timeoutOption("12 seconds"),
        Effect.map(Option.getOrNull),
        Effect.orElseSucceed(() => null),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      ),
    };
  }),
};
