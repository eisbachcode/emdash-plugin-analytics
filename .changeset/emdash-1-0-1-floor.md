---
"@eisbachcode/emdash-plugin-analytics": minor
---

Requires EmDash 1.0.1 or later. Both the peer dependency and the manifest's `env:emdash` requirement are now `>=1.0.1`, so EmDash refuses to install this version from the registry on an older site.

On EmDash 0.39 to 0.42, stay on 0.2.x, which keeps working there. To move to this version, update EmDash to 1.0.1 first, then the plugin. With pnpm, installing it on an older site only warns about the peer dependency; with npm 7 or later, the install fails with `ERESOLVE`. An existing `^0.2.x` range never resolves to 0.3.0, so no install moves on its own.

The plugin's behaviour and stored data are the same as in 0.2.4.
