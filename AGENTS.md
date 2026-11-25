# AGENTS.md

Working rules for contributors and coding agents in this repository. They restate the
Paseo plugin requirements we must follow when developing and reviewing this plugin.

## References

- Plugin quickstart: https://paseo.sh/docs/plugins
- Plugin reference: https://paseo.sh/docs/plugins/reference
- Plugin hooks: https://paseo.sh/docs/plugins/hooks
- Publishing guide: https://paseo.sh/docs/plugins/publishing
- Registry review policy: https://github.com/getpaseo/plugins/blob/main/REVIEW.md

## Compliance

- Keep the standard plugin layout: `paseo-plugin.json`, `index.client.tsx`,
  `index.server.ts`, `client/`, `server/`, `shared/`, with a committed lockfile.
- Manifest paths are relative, use forward slashes, and must not contain `..` segments.
  Keep `requirements.paseo` accurate and the listed entry files present.
- Follow the plugin SDK contracts: client code must not reach into daemon-only APIs, and
  daemon code must not depend on the UI. Keep RPC contracts schema-validated in `shared/`.
- Client UI uses React Native primitives only (`View`, `Text`, `Pressable`, `ScrollView`,
  `TextInput`), takes colors from the shared `useUi` palette, and respects `layout.compact`.
  No HTML elements, `className`, CSS strings, or `onClick` in `client/`.
- Dependencies must stay minimal and resolve through the committed lockfile. Any build or
  lifecycle script must have an understandable purpose and no hidden side effects.

## Internationalization

- Every user-facing string goes through the bilingual catalog in `client/i18n.ts`
  (`zh` is the source of truth; `en` must define every `DictKey`). Render with `t()` from
  `useI18n()` inside components, or `translateNow()` in non-reactive helpers.
- New UI text must add both locales with matching `{placeholders}` before release.
- Agent-facing prompt templates (default review/issue prompts) are content, not UI chrome;
  they may stay in one language and remain user-editable.

## Security

- GitHub access goes only through the local `gh` CLI on the daemon host, using the user's
  existing `gh auth login`. The plugin never stores, prints, logs, or quotes GitHub tokens
  or credentials. Test presence only (e.g. `gh auth status`), never echo token material.
- The only network destination is GitHub via `gh` (read PRs/issues, post comments, merge,
  clone). No hidden network calls, no telemetry, no `eval` of dynamic or remote code, and
  no shell built from external data — `gh`/`git` are invoked with `execFile` and argument
  arrays, never a concatenated shell string.
- PR/issue bodies and comments are untrusted input. They flow into agent prompts inside
  clear data boundaries; the review agent is not granted merge authority. Merge and comment
  write-back are executed by plugin code, not left to agent discretion.
- Merge defaults to manual confirmation; full-auto merge is an explicit opt-in.
- Merges are pinned to the reviewed head commit (REST `sha` parameter); a moved PR head
  blocks the merge and triggers a fresh review dispatch. Automatic merge never enables
  GitHub-native auto-merge; pending checks leave the run for manual confirmation, and runs
  without a reviewed SHA are re-reviewed instead of merged.
- Document every network destination and data flow in `OVERVIEW.md`.

## Data sanitization

- Everything committed must be desensitized: no real names, account handles, repository
  names, workspace paths, tokens, or customer data in code, comments, docs, fixtures,
  examples, screenshots, or commit messages.
- Use obvious placeholders such as `owner/name`, `acme-project`, `user@example.com`,
  `12345678`. Smoke/test scripts must use placeholders or public example repos, never a
  real personal account or private repository.
- Runtime state (`~/.local/state/paseo-github-workbench/`) is user data and is never
  committed. Screenshots and media: only author-supplied, desensitized assets may be
  committed; agents must not capture or generate real-workspace images.

## Code safety

- Reads by default; mutations (comment, merge, dispatch, clone) hang off a user gesture or
  an enabled automation watch, and destructive/irreversible ones show a visible confirmation.
- Validate and clamp external input (repo format, intervals, allowlists); keep error
  messages useful without echoing credentials or raw request bodies.
- Keep run history bounded and dedupe by `repo#number` + head SHA; comment write-back is
  idempotent. First poll of a repo only establishes a baseline, never dispatches backlog.
- When behavior or data access changes, update `OVERVIEW.md` in the same change.

## Keeping docs in sync

Feature changes must update the user-facing documents in the same change:

- `OVERVIEW.md`: capabilities, settings, permissions, and data access.
- `paseo-plugin.json`: description, translations, media, icon, and requirements.

A change is not ready while these documents still describe older behavior.

## Publishing and releases

The plugin is published through the registry at https://github.com/getpaseo/plugins,
which pins one exact commit of this repository. New submissions go through the
registry submission form; updates are submitted manually with the desired revision.
Follow the publishing guide and the registry review policy, and run this checklist
before pushing a release:

- `npm run typecheck` passes.
- Grep the change for secrets and real identifiers; confirm none.
- `OVERVIEW.md` and the manifest are updated together (see above).
- Both i18n locales are complete for any new UI text.
- Media is author-supplied and desensitized; never capture or commit real-workspace images.