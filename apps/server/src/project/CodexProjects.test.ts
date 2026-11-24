import * as NodeSqlite from "node:sqlite";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { readCodexProjects } from "./CodexProjects.ts";

it.effect(
  "keeps logical projects sharing roots and resolves legacy assignments without duplicating migrated projects",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped();
      const db = new NodeSqlite.DatabaseSync(`${home}/state_5.sqlite`);
      try {
        db.exec(`
        CREATE TABLE projects (id TEXT, name TEXT, position INTEGER);
        CREATE TABLE project_roots (project_id TEXT, path TEXT, position INTEGER);
        CREATE TABLE threads (id TEXT, project_id TEXT, rollout_path TEXT, cwd TEXT, title TEXT, name TEXT, archived INTEGER, updated_at INTEGER, source TEXT);
        INSERT INTO projects VALUES ('a', 'Coins', 0), ('b', 'Coins', 1), ('empty', 'Empty', 2);
        INSERT INTO project_roots VALUES ('a', '/code/web', 0), ('a', '/code/api', 1), ('b', '/code/web', 0);
        INSERT INTO threads VALUES
          ('old', NULL, '/old.jsonl', '/scratch', 'Old', NULL, 0, 1, 'vscode'),
          ('new', 'b', '/new.jsonl', '/code/web', 'New', 'Renamed', 1, 2, 'vscode'),
          ('unassigned', NULL, '/none.jsonl', '/code/web', 'None', NULL, 0, 3, 'vscode');
      `);
      } finally {
        db.close();
      }
      yield* fs.writeFileString(
        `${home}/.codex-global-state.json`,
        JSON.stringify({
          "local-projects": { legacy: { id: "legacy", name: "Old name", rootPaths: ["/old"] } },
          "app-server-project-id-by-legacy-project-id-by-host": {
            [`local:${home}`]: { legacy: "a" },
          },
          "thread-project-assignments": {
            old: { projectKind: "local", projectId: "legacy" },
            new: { projectKind: "local", projectId: "legacy" },
            unassigned: { projectKind: "local", projectId: "legacy" },
          },
          "projectless-thread-ids": ["unassigned"],
        }),
      );
      const projects = yield* readCodexProjects(home);
      expect(projects).toHaveLength(3);
      expect(projects[0]?.roots).toEqual(["/code/web", "/code/api"]);
      expect(projects[0]?.threads.map((t) => t.id)).toEqual(["old"]);
      expect(projects[1]?.threads.map((t) => t.id)).toEqual(["new"]);
      expect(projects[2]?.threads).toEqual([]);
      expect(new Set(projects.map((p) => p.key)).size).toBe(3);
      expect(yield* readCodexProjects(home)).toEqual(projects);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
