# T0 Code

> [!IMPORTANT]
> **T0 Code is an unofficial fork.** It is built from the open-source [T3 Code](https://github.com/pingdotgg/t3code) source code. T3 Tools, Inc. is not affiliated with it, does not endorse it, and does not maintain it.
>
> Report T0 Code problems in [this repository's issues](https://github.com/imxv/t0code/issues). Do not report them to T3 Code's issue tracker or Discord.

T0 Code is a desktop app that runs the coding agents on your computer and gives you one interface for all of them. It works with Claude Code, Codex, Cursor, OpenCode, Oh My Pi, and any ACP agent. It uses the agents you are already signed in to, and it does not sell tokens.

The fork follows upstream closely. It regularly merges the latest upstream changes and adds a small set of its own.

## How it differs from T3 Code

- **Telemetry is off by default.** Usage events and relay traces are sent only if you set `T3CODE_TELEMETRY_ENABLED=true`.
- **No agent feedback or triage.** Both send reports to T3, so T0 Code turns them off. Report problems here instead.
- **Sidebar status filter.** Filter threads by Working, Needs you, Done, and Draft.
- **Side chat results** appear in the parent thread's sidebar row.
- **Projects can span several folders.** The diff panel shows git changes across all of a project's repositories.
- **Context window breakdown** for Claude threads, and an adjustable auto-compact threshold for Claude and Codex threads.
- **Oh My Pi** provider preset, with update checks.
- **Codex import** keeps project groups and the full history.
- **No GitHub star prompts.**
- **Its own app identity.** The bundle ID is `com.imxv.t0code` and data is stored in `~/.t0`, so T0 Code installs next to T3 Code and shares no state with it. It updates from this repository's GitHub releases.

## Install

T0 Code is only built for macOS on Apple silicon. There are no Windows or Linux builds, no CLI package, no hosted web app, and no mobile app.

1. Download the latest `T0-Code-<version>-arm64.dmg` from [Releases](https://github.com/imxv/t0code/releases).
2. Drag T0 Code to Applications.
3. Install at least one agent and sign in. For example, run `claude auth login` for [Claude Code](https://claude.com/product/claude-code) or `codex login` for [Codex CLI](https://developers.openai.com/codex/cli).

Releases are signed with an Apple Development certificate but are not notarized. If macOS blocks the first launch, allow it under **System Settings → Privacy & Security**.

### Remote access

T0 Code keeps upstream's pairing protocol, so the T3 Code mobile app and T3 Connect can connect to it. Those are T3 Tools' products, and T3 Tools does not support their use with T0 Code. If something goes wrong while you use them with T0 Code, report it here.

## Build from source

Install [Vite+](https://viteplus.dev/guide/). Then run these commands from the repository root:

```sh
vp i
vp run dev
```

Open the pairing URL that the dev runner prints. The [development runbook](./docs/operations/00_development.md) has the details.

The `docs/` folder comes from upstream and describes T3 Code. Most of it also applies to T0 Code. Its download links, install commands, and support channels are T3's, not this fork's.

## Contributing

This is a personal fork. Open issues and pull requests in this repository. Upstream's [CONTRIBUTING.md](./CONTRIBUTING.md) is kept for syncing and does not describe how this fork is run.

## License and trademarks

The source code is licensed under the [MIT License](./LICENSE). The upstream copyright notice belongs to T3 Tools, Inc. and must stay in place.

The MIT license covers only the source code. "T3 Code", "T3 Connect", "T3 Tools", the T3 wordmark, the T3 logos, and the T3 application icons belong to T3 Tools, Inc. This fork mentions them only to say where its code comes from and to refer to T3's own products. Upstream's policy is in [TRADEMARK.md](./TRADEMARK.md).
