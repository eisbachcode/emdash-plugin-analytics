---
"@eisbachcode/emdash-plugin-analytics": patch
---

Gives the plugin the display name **Analytics**, which registry search results and the Plugins list of a registry install show instead of the slug `analytics`. A plugin registered in `plugins: []` still appears as `analytics` in the Plugins list, because EmDash names it after the plugin ID.

Also tested on EmDash 0.40.1 and 0.41.0; neither needed a change.
