# @eisbachcode/emdash-plugin-analytics

## 0.2.4

### Patch Changes

- b63f396: The plugin now has a repository of its own: https://github.com/eisbachcode/emdash-plugin-analytics. The old address, `eisbachcode/emdash-plugins`, redirects there. The package's repository, homepage and issue links point to the new address; the plugin itself is unchanged.

## 0.2.3

### Patch Changes

- b040a97: The README now says that a plugin registered in `plugins: []` follows the admin language on the dashboard and its pages from EmDash 1.0.1; before 1.0.1 it stays English there. The plugin code is unchanged.

## 0.2.2

### Patch Changes

- 4090797: Tested on EmDash 1.0.1, the first stable release; no change was needed.

## 0.2.1

### Patch Changes

- 0c05c21: Gives the plugin the display name **Analytics**, which registry search results and the Plugins list of a registry install show instead of the slug `analytics`. A plugin registered in `plugins: []` still appears as `analytics` in the Plugins list, because EmDash names it after the plugin ID.
  
  Also tested on EmDash 0.40.1 and 0.41.0; neither needed a change.
- 63a81e0: Tested on EmDash 0.42.0 and the 1.0 release candidate (1.0.1-rc.0); neither needed a change. From EmDash 0.42.0 the four MCP tools also work when the plugin is registered in `plugins: []`; on 0.39 to 0.41 only sandboxed and registry installs have them. The README now shows how to install and register the plugin.
- 0accf03: Shortens the plugin description to fit the EmDash registry, which refuses a package description longer than 140 characters. It now reads: "Cloudflare Web Analytics on the EmDash dashboard and next to your content: traffic, top pages, referrers, countries and views per entry."

## 0.2.0

### Minor Changes

- 4ff7bd9: Adds four read-only MCP tools, so an AI agent connected to EmDash's MCP server can ask for the numbers: `analytics__top_entries`, `analytics__unviewed_entries`, `analytics__entry_views` and `analytics__site_totals`. They read what the plugin has stored, never call Cloudflare, and every answer says which UTC days it covers, where stored history starts and when the last sync ran.
  
  The tools stay off until an administrator turns on **Agent access** for the plugin under Plugins. A caller needs `plugins:read` (editor and above) and a token with the `mcp:tools:analytics` or `mcp:tools` scope.
  
  On EmDash 0.39 and 0.40 only sandboxed and registry installs get the tools. A plugin registered in `plugins: []` lists none; that is an EmDash limitation, and nothing else about the plugin changes there.
