# Product usage data and diagnostics

T0 Code turns product usage events and relay connection traces off by default. When you opt in, they help keep the app reliable and fast. Prompts, responses, file contents, and credentials are never included (unless you explicitly approve an [agent feedback](#agent-feedback) card with conversation text attached).

## Product usage events

The server sends usage events to `ingest.t3.codes` under a hashed random install ID (plus a hashed T3 Connect account ID when signed in, and random client device IDs). Events contain provider, catalog model name (non-catalog models report as custom), reasoning effort, permission mode, turn/request outcome, duration, release channel, and token counts.

## Turn telemetry on or off

- **Server / CLI**: Set `T3CODE_TELEMETRY_ENABLED=true` before starting to opt in. The server does not read provider login files for analytics unless you do. `DO_NOT_TRACK=1` always wins and turns it off.
- **Desktop app**: Export `T3CODE_TELEMETRY_ENABLED=true` in your shell profile (macOS/Linux) or user environment variables (Windows) and restart.
- **Web and desktop client traces**: Renderer builds also need `VITE_T3CODE_TELEMETRY_ENABLED=true` at build time.
- **Managed policy**: Administrators can set `"telemetry": false` in [managed policy](./managed-policy.md#other-capabilities) for servers and desktop apps.
- **Mobile app**: Builds include telemetry destinations only when built with `T3CODE_TELEMETRY_ENABLED=true`. In those builds, toggle **Send crash reports** and **Send connection traces** separately in **Settings → About → Diagnostics**.

## Relay connection diagnostics

T3 Connect sends connection timings, request paths, environment/thread IDs, and error types (no addresses, logs, or stack frames) to Axiom. Disabled by the server telemetry opt-outs above or by `T3CODE_OTEL_SDK_DISABLED` / `OTEL_SDK_DISABLED`.

## Agent feedback

T0 Code turns agent feedback off and hides its setting. Upstream T3 Code uses it to send agent bug reports to the T3 team, so T0 Code never offers the feedback tool to agents, whatever `settings.json` says. Report T0 Code problems in [this repository's issues](https://github.com/imxv/t0code/issues).

## Agent activity for mobile notifications

**Settings → Sharing & access → Publish agent activity** sends project/thread titles, model names, and turn status to the T3 Connect relay for [mobile notifications and live activities](./mobile-notifications.md). This is independent of telemetry—turn it off directly on the host if you don't want it.

## Export diagnostics to your own OpenTelemetry receiver

Open **Settings → Maintenance → Diagnostics** (per environment) and enter OTLP HTTP endpoints (e.g. `http://localhost:4318/v1/traces`), save, and restart the server. Use **Test** to verify connectivity.

`T3CODE_OTLP_*_URL` and standard `OTEL_EXPORTER_OTLP_*` env vars override saved settings (use `T3CODE_OTLP_HEADERS` / `T3CODE_OTLP_PROTOCOL=http/protobuf` or the standard `OTEL_EXPORTER_OTLP_*` equivalents for auth and protobuf).
