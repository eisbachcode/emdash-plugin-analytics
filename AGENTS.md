# emdash-plugin-analytics

The EmDash analytics plugin by Eisbachcode: `@eisbachcode/emdash-plugin-analytics` on npm,
`@eisbachcode.de/analytics` in the EmDash registry.

Before editing this plugin, read `skills/creating-plugins/SKILL.md` completely. Codex discovers the same directory through `.agents/skills`; Claude discovers it through `.claude/skills` and reads these instructions through `.claude/CLAUDE.md`.
Keep `emdash-plugin.jsonc` aligned with the runtime implementation, declare every capability and host the plugin uses, and run the generated validation, typecheck, test, and build scripts after changes.

## Toolchain

`emdash` is a peer with a floor and no ceiling (`>=1.0.1`, the same as
`env:emdash` in the manifest). Never write the floor as `>=1.0.0` or
`^1.0.0`: npm carries an accidental, deprecated `emdash@1.0.0` published
in April 2026, five months before the real 1.0. The dev dependency stays
below the next major until the toolchain is moved on purpose. Built with
`@emdash-cms/plugin-cli@0.13.1`, `@emdash-cms/plugin-test@0.2.6` and
`@emdash-cms/blocks@1.0.1`; `scripts/compat-matrix.sh` runs the suite
against later EmDash releases. A plain `pnpm install` is enough.

## Two builds

`pnpm run build` runs both:

1. `emdash-plugin build` — the sandbox runtime and the descriptor module. Its
   entry is hard-coded to `src/plugin.ts`.
2. `tsdown` — the `./astro` export. It is a separate build on purpose and is
   never part of the registry bundle, which stages only `backend.js`,
   `manifest.json`, the README and images.

## Things that will bite

- **Never widen a provider query window.** `date_geq` older than
  `today − 7` makes Cloudflare serve the whole query from a ~10 % sample,
  quantizing every day in it and dropping quiet days entirely. There are
  three layers guarding this (`syncWindow` clamps, the adapter refuses,
  `decideWrite` will not downgrade). Do not remove one because the other two
  exist.
- **Read before write.** Blind upserts cost roughly 5 D1 rows each and blow
  through the free plan's daily budget at a 15-minute cadence.
- **Count your bridge calls.** A sandboxed invocation gets ten subrequests
  and every `ctx` call spends one, `log` and `cron` included. The sync tick
  alternates phases and Refresh only schedules a tick for exactly this
  reason. `tests/budget.test.ts` counts each invocation's worst case; run it
  after any change that adds a `ctx` call.
- **Block Kit keys are snake_case.** Use the constructors in
  `src/ui/blocks.ts`; the renderer silently ignores camelCase.
- `routeCtx.ui` (locale, direction) reaches the widget, the pages and the
  editor panel in both install modes; the panel also gets `ui.entry`. Still
  read `routeCtx.ui?.locale` and fall back to English; never return empty
  blocks when it is missing.
- **MCP schemas never reach the runtime.** `emdash-plugin build` strips
  the `mcp` property of `src/plugin.ts` from the bundle and writes the zod
  schemas into the manifest as JSON Schema. `src/tools/declare.ts` is
  referenced only from there, so zod stays a dev dependency and out of the
  bundle; a schema imported by a route handler would pull it back in. The
  handlers in `src/tools/load.ts` validate by hand, because the routes are
  also reachable over HTTP without the MCP server's validation.
- **An MCP output schema is strict.** Every object becomes
  `additionalProperties: false` and the MCP server rejects an answer that
  does not match, so a loader's result and its declared output have to
  agree key for key. `tests/tools.test.ts` checks each answer against the
  schema the build wrote.
- **Block Kit keeps no state.** Anything a page needs to remember between
  interactions travels in an `action_id`, a button `value` or a table
  cursor (see `src/ui/content.ts`).

## Conventions

- Tabs. English in code, comments and docs.
- ESM: internal imports carry `.js`; `import type` for types.
- Read EmDash APIs from the published release or from `upstream/main`, and
  say which. A fork's `main` drifts behind without anyone noticing.
- Anything that talks HTTP takes an injected `fetch`. Whole sync ticks go
  through the test host's `host.http.respond()`.
- A test must be able to fail on a real regression. Do not assert a config
  literal back at itself or restate the implementation.

## Checks

```sh
pnpm install
pnpm typecheck
pnpm test        # emdash-plugin validate, then vitest
pnpm build
./scripts/compat-matrix.sh 1.0.1   # the suite against other EmDash releases
```

## Releases

Versions come from changesets: add one with `pnpm changeset` for every
change that ships, written for someone upgrading.

Listing images go in `images/` and are declared under
`release.artifacts.screenshots` in the manifest. Never use a `screenshots/`
folder: the registry bundle takes it whole and refuses a bundle over 256 KB
or an image over 128 KB. The registry also refuses a manifest `description`
over 140 graphemes, which `emdash-plugin validate` does not check.

Never name a script `publish`, `version` or `prepare`: npm and pnpm
run scripts with those names on their own during a publish or a version
bump. `emdash-plugin init` generates `"publish": "emdash-plugin publish"`,
which would push to the EmDash registry after every `npm publish`; here it
is `registry:publish`, and `prepublishOnly` builds before any publish.

`.github/workflows/release.yml` does the npm side: with changesets on main
it opens a "Version Packages" pull request, and merging that publishes
through npm trusted publishing. npm trusts that workflow by its file name,
so renaming it, or the repository, breaks publishing until the setting on
npmjs.com changes too. The registry profile names the repository as well
(`profile setup --repository`).
After an npm publish it calls `emdash-release.yml`, generated by
`emdash-plugin release setup` and edited since, which publishes the same
version to the EmDash registry. Its build and publish run in separate jobs; only the publish job
holds `id-token`, and it installs and builds nothing. The npm publish job
runs in the `npm` environment, which the npm trusted publisher requires.
Keep both.

A failed registry release cannot be re-run: the release service keys the
uploaded artifacts by run, and a rerun's fresh attestation conflicts with the
first attempt's. Start `release.yml` by hand on main instead; it skips npm
and publishes the version in `package.json` to the registry. Never start
`emdash-release.yml` by hand: the registry keeps one workflow connection per
package, and approving one for `emdash-release.yml` replaces the one for
`release.yml`.

The repository installs with pnpm 11; `allowBuilds` in `pnpm-workspace.yaml`
lets esbuild and workerd run their install scripts, which the test host needs.
