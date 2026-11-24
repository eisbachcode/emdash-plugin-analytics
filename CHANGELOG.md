# @eisbachcode/emdash-plugin-analytics

## 0.4.0

### Minor Changes

- 5164e58: Adds links, devices and a chart:
  
  - Every row about a page now links to the page on the site, and a row that belongs to an entry links to that entry's editor: in the widget's page table, in Top entries on the Analytics page and on the per-entry page. The page link needs the site URL; the setup check says when it is missing.
  - The Analytics page lists devices (desktop, mobile, tablet) beside referrers and countries, for the same days.
  - The dashboard widget charts page views and visits over the stored days of the last 30.
  - The setup check and the empty states link to the plugin's settings when the fix is a value there.
- 5164e58: Shows how each entry's last seven days compare with the seven before. The per-entry page has a **Change, 7 days** column ("+25%", "-10%", "from 0"), and the Analytics page names the top entry that grew the most ("Getting attention"). Both weeks come from the plugin's own store, so the comparison is exact; Cloudflare answers for the earlier week only from a sample.
  
  No setting and no stored data changes by hand. The earlier week is summed by the daily pass that already sums the 30-day views, so after the update the column fills with that pass's next run, on the following UTC day at the latest, provided the store holds two weeks of history. Until then, and for an entry published during the earlier week, the cell stays empty, and the page says from which day it fills. The MCP tools are unchanged and need no new approval.
- cb8627e: On EmDash 1.5.0 and later, each scheduled sync now updates the site's totals and a batch of per-entry numbers in the same run. Until now a run did one or the other, so each kind of number was refreshed every second run, and the index walk and the daily 30-day sum of a large site took twice as many runs.
  
  EmDash 1.5.0 raised the number of calls a sandboxed plugin may make per run from ten to thirty. The plugin uses at most twenty of them, because on Cloudflare every plugin task due in the same minute shares one limit of 32 Worker invocations.
  
  Nothing changes on EmDash 1.0.1 to 1.4.0, or on a site that set the sandbox limit back to ten: the plugin notices that the second half of a run did not finish, and does one half per run for the rest of the day.
- 5164e58: The dashboard widget no longer needs the scheduled sync to show numbers. When the plugin's store has nothing current, the widget reads the last seven days from the provider itself: before the first sync, on a site that runs no scheduled tasks (a Worker without a Cron Trigger), and when the last sync is more than an hour old. It says "Read live" with the time, keeps each answer for five minutes, and Refresh asks again at once. With demo data the numbers therefore show as soon as the data source is switched, without waiting for a sync.
  
  Stored history, the comparison with the week before, the per-entry page, the editor panel and the MCP tools still come from the sync, so a site without scheduled tasks gets the widget and the Analytics page only. A widget on a site whose sync runs on time behaves as before and makes no provider request.
  
  Before the first sync, the widget now also names what is missing instead of saying that the first sync is pending: the API token or account ID, or the site tag, with a link to the plugin's settings.

### Patch Changes

- 5164e58: Requests to Cloudflare now ask for account-based rate limiting, so the plugin's query budget (300 per five minutes for the account) is no longer shared with every other tool that uses a token of the same Cloudflare user. An exhausted budget is reported as the rate limit it is. Paths with percent-encoded characters are shown decoded, so `/news/%E6%9D%B1%E4%BA%AC/` reads `/news/東京/`.
- 608bf1f: Built and tested with EmDash 1.6.0. EmDash 1.0.1 stays the oldest supported version, and the suite passes on every release from 1.0.1 to 1.6.0.
  
  On EmDash 1.5.0 and later, a site that installs the plugin from npm now sees it in the admin's Plugins list as "Analytics" with its description, instead of its identifier.
- bc69beb: Fixes the 7, 30 and 90 day buttons on the Analytics page sharing one identifier, which the admin uses to tell the buttons of a row apart. React reported the duplicate key in the browser console during development.

## 0.3.2

### Patch Changes

- 302e213: The plugin now has its own icon in the EmDash registry, in search results and on its page, instead of the letter placeholder. Also tested on EmDash 1.1.0, 1.2.0 and 1.3.0; none needed a change.

## 0.3.1

### Patch Changes

- a285058: The README now says to plan on Workers Paid on Cloudflare for an in-process install too: the pages work on Workers Free, but the scheduled sync will most likely exceed Free's 10 ms CPU limit per Cron Trigger. No code changes from 0.3.0.

## 0.3.0

### Minor Changes

- 3b07523: Requires EmDash 1.0.1 or later. Both the peer dependency and the manifest's `env:emdash` requirement are now `>=1.0.1`, so EmDash refuses to install this version from the registry on an older site.
  
  On EmDash 0.39 to 0.42, stay on 0.2.x, which keeps working there. To move to this version, update EmDash to 1.0.1 first, then the plugin. With pnpm, installing it on an older site only warns about the peer dependency; with npm 7 or later, the install fails with `ERESOLVE`. An existing `^0.2.x` range never resolves to 0.3.0, so no install moves on its own.
  
  The plugin's behaviour and stored data are the same as in 0.2.4.

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
