#!/usr/bin/env node
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeWS from "@effect/platform-node/NodeWS";
import {
  CommandId,
  ProjectId,
  WsRpcGroup,
  ORCHESTRATION_PROTOCOL_VERSION,
} from "@t3tools/contracts";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/cli";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";
import { Socket } from "effect/socket";

const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

const command = Command.make(
  "import-codex-projects",
  {
    origin: Flag.String("origin"),
    tokenFile: Flag.String("token-file"),
    report: Flag.String("report"),
    apply: Flag.Boolean("apply"),
  },
  Effect.fn("importCodexProjects")(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const token = (yield* fs.readFileString(input.tokenFile)).trim();
    const { ticket } = yield* HttpClient.execute(
      HttpClientRequest.post(`${input.origin}/api/auth/websocket-ticket`).pipe(
        HttpClientRequest.bearerToken(token),
      ),
    ).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Struct({ ticket: Schema.String }))),
      Effect.provide(FetchHttpClient.layer),
    );
    const protocol = yield* Layer.build(
      RpcClient.layerProtocolSocket().pipe(
        Layer.provide(
          Socket.layerWebSocket(
            `${input.origin.replace(/^http/, "ws")}/ws?orchestrationProtocol=${ORCHESTRATION_PROTOCOL_VERSION}&wsTicket=${encodeURIComponent(ticket)}`,
          ),
        ),
        Layer.provide(RpcSerialization.layerJson),
        Layer.provide(NodeWS.layerWebSocketConstructor),
      ),
    );
    const client = yield* RpcClient.make(WsRpcGroup).pipe(Effect.provideContext(protocol));
    const scan = yield* client["agentSessions.scan"]({});
    const candidates = scan.candidates.filter((p) => p.sourceProjectKey !== undefined);
    const results = [];
    for (const candidate of candidates) {
      let projectId = candidate.projectId;
      let importedCount = 0;
      let skippedCount = 0;
      if (input.apply) {
        if (projectId === undefined) {
          projectId = ProjectId.make(`import:codex-project:${candidate.sourceProjectKey}`);
          yield* client["projects.mutate"]({
            type: "project.create",
            commandId: CommandId.make(`codex-project:create:${candidate.sourceProjectKey}`),
            projectId,
            title: candidate.title,
            workspaceRoot: candidate.path,
            createWorkspaceRootIfMissing: true,
            trackedFolders: candidate.trackedFolders ?? [],
            defaultModelSelection: null,
          });
        }
        // Each import has a bounded transcript budget. Continue only while it makes progress.
        do {
          const result = yield* client["agentSessions.import"]({
            projectId,
            expectedWorkspaceRoot: candidate.path,
            sourceProjectKey: candidate.sourceProjectKey,
          });
          importedCount += result.importedCount;
          skippedCount = result.skippedCount;
          if (result.importedCount === 0) break;
        } while (skippedCount > 0);
      }
      results.push({ ...candidate, projectId, importedCount, skippedCount });
      yield* fs.writeFileString(
        input.report,
        yield* encodeJson({
          applied: input.apply,
          scanTruncated: scan.truncated ?? false,
          results,
        }),
      );
      yield* Console.log(
        yield* encodeJson({
          title: candidate.title,
          expected: candidate.threadCount,
          importedCount,
          skippedCount,
        }),
      );
    }
    yield* Console.log(
      yield* encodeJson({
        projects: candidates.length,
        expectedThreads: candidates.reduce((sum, p) => sum + p.threadCount, 0),
        skipped: results.reduce((sum, p) => sum + p.skippedCount, 0),
      }),
    );
  }),
);

if (import.meta.main) {
  Command.run(command, { version: "0.0.0" }).pipe(
    Effect.scoped,
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
