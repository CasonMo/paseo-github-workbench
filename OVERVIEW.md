# GitHub Workbench

Browse and handle GitHub PRs and issues inside Paseo: a cross-repo board with one-click agent dispatch, optional automated review and write-back.

## Features

- **Board (main view)**: lists open PRs and issues across your repositories **and ones you authored in other people's repos** (`gh search` by owner and author, deduplicated), filtered by type, repo, and keyword. "Dispatch agent" first opens an in-card panel: the prompt is prefilled from the repo template (editable) and the agent/model, thinking effort, and permission mode are prefilled from the repo settings (changeable); dispatch happens only after you confirm. The detail panel's dispatch and "Fix broken checks" use the same panel.
- **Sidebar pending badge**: the sidebar entry shows a count of items needing attention — open PRs/issues with no dispatch yet, plus runs awaiting merge confirmation or failed and awaiting retry. Polls every 30 seconds; hidden when zero.
- **Detail panel**: description, comment activity, PR checks, and review decision; inline dispatch, commenting, merge / auto-merge (waits for checks), and Fix broken checks.
- **Zero-config dispatch**: matches a local Paseo project by remote, or clones with `gh repo clone` into the plugin-managed directory; PRs use a worktree checkout, issues a branch-off worktree. The default model is the first enabled entry in Paseo's provider catalog.
- **Customizable dispatch**: each repo's PR review and issue handling can separately configure the dispatched agent and model (provider/model), thinking effort, and permission mode; empty means the Paseo default. An advanced JSON object is merged into the agent config and can set `options`, `systemPrompt`, `toolPolicy`, and `mcpServers`. Manual dispatch and failed-run retries use the same settings.
- **Result write-back**: PR reviews produce a structured verdict; approved PRs are merged (manual confirmation by default, full-auto opt-in), otherwise a templated comment is posted to the PR. Issue results are posted back as a templated comment. Merges are pinned to the exact commit the agent reviewed: the REST merge call carries the reviewed head SHA, and if the PR head moved, the merge is blocked and a fresh review is dispatched automatically.
- **Follow-up comments reuse the original agent**: when a PR or issue that already has a dispatched agent receives new comments, the plugin appends them to the original agent's session using a follow-up template (keeping the worktree and context) instead of creating a new agent. If the original agent is archived or unavailable, it falls back to a fresh dispatch. The plugin's own write-back comments never trigger follow-ups; comments arriving while the agent is running are batched into the next poll. The follow-up prompt is editable per repo.
- **Run history**: status filters, verdict viewing, approve-merge / skip / retry, and jump-to-agent.
- **Automation (optional)**: per-repo polling dispatches new PRs and new issues (filterable by label and author allowlist); prompts and comment templates are editable. The first poll only establishes a baseline and never dispatches backlog items.
- **Touch keyboard avoidance**: on iPad/iPhone (native app and touch web) the panel lifts by the real keyboard height so comment inputs, search, and dropdowns stay visible; desktop is unaffected.

## Setup

- Requires the GitHub CLI installed and authenticated on the daemon machine (`gh auth login`).
- The board and manual dispatch need no configuration. For automation, add a repo watch on the Automation tab; expanding a repo card lets you choose the dispatched agent, model, thinking effort, permission mode, and advanced JSON for PR review and issue handling (the provider catalog is read locally from the Paseo daemon snapshot).

## Data and permissions

- GitHub access goes through the local `gh` CLI: reads PRs/issues, posts comments, merges PRs (manual confirmation by default), and clones public or accessible repos.
- PR/issue titles, bodies, and comments are rendered into agent prompts and therefore sent to whichever agent provider (model) you configured in Paseo; agent output is written back to GitHub as comments or merges.
- Settings and run history are stored on the daemon machine at `~/.local/state/paseo-github-workbench/state.json`; auto-cloned repos live under `repos/` in the same directory.
- No data is sent to any third-party service other than GitHub and your configured agent providers.

## Known limitations

- Event discovery is polling (minute-level latency), not real-time webhooks.
- PR bodies and issue content enter agent prompts as untrusted input; the review agent is not granted merge authority — merges are executed by plugin code.