// @effect-diagnostics-next-line nodeBuiltinImport:off -- Stable project directory identities use the same SHA-256 on every host.
import * as NodeCrypto from "node:crypto";
import * as NodeSqlite from "node:sqlite";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { AgentSessionScanError } from "@t3tools/contracts";

const LocalProject = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  rootPaths: Schema.Array(Schema.String),
});
const GlobalState = Schema.Struct({
  "local-projects": Schema.optional(Schema.Record(Schema.String, LocalProject)),
  "thread-project-assignments": Schema.optional(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        projectKind: Schema.String,
        projectId: Schema.String,
      }),
    ),
  ),
  "projectless-thread-ids": Schema.optional(Schema.Array(Schema.String)),
  "app-server-project-id-by-legacy-project-id-by-host": Schema.optional(
    Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.String)),
  ),
});
const ProjectRow = Schema.Struct({ id: Schema.String, name: Schema.String });
const RootRow = Schema.Struct({ project_id: Schema.String, path: Schema.String });
const ThreadRow = Schema.Struct({
  id: Schema.String,
  project_id: Schema.NullOr(Schema.String),
  rollout_path: Schema.String,
  cwd: Schema.String,
  title: Schema.String,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  archived: Schema.Number,
  updated_at: Schema.Number,
});
export interface CodexProject {
  readonly key: string;
  readonly title: string;
  readonly roots: ReadonlyArray<string>;
  readonly threads: ReadonlyArray<typeof ThreadRow.Type>;
}

// Desktop versions may have projects in SQLite while assignments still live in the JSON store.
export const readCodexProjects = Effect.fn("CodexProjects.read")(
  function* (home: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const statePath = path.join(home, "state_5.sqlite");
    if (!(yield* fs.exists(statePath))) return [];
    const globalPath = path.join(home, ".codex-global-state.json");
    const global = (yield* fs.exists(globalPath))
      ? yield* fs.readFileString(globalPath).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(GlobalState))),
          Effect.mapError(
            (cause) => new AgentSessionScanError({ operation: "read-projects", cause }),
          ),
        )
      : {};
    const rows = yield* Effect.try({
      try: () => {
        const db = new NodeSqlite.DatabaseSync(statePath, { readOnly: true });
        try {
          db.exec("PRAGMA busy_timeout = 1000");
          const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
          if (!tables.some((row) => row.name === "projects")) return null;
          return {
            projects: db.prepare("SELECT id, name FROM projects ORDER BY position").all(),
            roots: db.prepare("SELECT project_id, path FROM project_roots ORDER BY position").all(),
            threads: db.prepare("SELECT * FROM threads WHERE source NOT LIKE '%subagent%'").all(),
          };
        } finally {
          db.close();
        }
      },
      catch: (cause) => new AgentSessionScanError({ operation: "read-projects", cause }),
    }).pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.NullOr(
            Schema.Struct({
              projects: Schema.Array(ProjectRow),
              roots: Schema.Array(RootRow),
              threads: Schema.Array(ThreadRow),
            }),
          ),
        ),
      ),
    );
    if (rows === null) return [];
    const aliases =
      global["app-server-project-id-by-legacy-project-id-by-host"]?.[`local:${home}`] ?? {};
    const projects = new Map(
      rows.projects.map((p) => [
        p.id,
        {
          id: p.id,
          title: p.name,
          roots: rows.roots.filter((r) => r.project_id === p.id).map((r) => r.path),
        },
      ]),
    );
    for (const p of Object.values(global["local-projects"] ?? {})) {
      const id = aliases[p.id] ?? p.id;
      // A migrated database record is authoritative for the name and ordered roots.
      if (!projects.has(id)) projects.set(id, { id, title: p.name, roots: [...p.rootPaths] });
    }
    const assignments = global["thread-project-assignments"] ?? {};
    const projectless = new Set(global["projectless-thread-ids"] ?? []);
    const owner = (thread: typeof ThreadRow.Type) => {
      if (thread.project_id !== null) return thread.project_id;
      if (projectless.has(thread.id)) return undefined;
      const assignment = assignments[thread.id];
      return assignment?.projectKind === "local"
        ? (aliases[assignment.projectId] ?? assignment.projectId)
        : undefined;
    };
    const threads = yield* Effect.forEach(
      rows.threads,
      (thread) =>
        Effect.gen(function* () {
          if (
            !(yield* fs.exists(thread.rollout_path)) &&
            (yield* fs.exists(`${thread.rollout_path}.zst`))
          ) {
            return { ...thread, rollout_path: `${thread.rollout_path}.zst` };
          }
          return thread;
        }),
      { concurrency: 16 },
    );
    return [...projects.values()].map((p): CodexProject => ({
      key: NodeCrypto.createHash("sha256").update(`${home}\0${p.id}`).digest("hex").slice(0, 32),
      title: p.title,
      roots: p.roots,
      threads: threads.filter((thread) => owner(thread) === p.id),
    }));
  },
  Effect.mapError((cause) => new AgentSessionScanError({ operation: "read-projects", cause })),
);
