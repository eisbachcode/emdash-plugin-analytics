---
"@eisbachcode/emdash-plugin-analytics": patch
---

Tested on EmDash 0.42.0 and the 1.0 release candidate (1.0.1-rc.0); neither needed a change. From EmDash 0.42.0 the four MCP tools also work when the plugin is registered in `plugins: []`; on 0.39 to 0.41 only sandboxed and registry installs have them. The README now shows how to install and register the plugin.
