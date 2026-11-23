---
"@eisbachcode/emdash-plugin-analytics": minor
---

On EmDash 1.5.0 and later, each scheduled sync now updates the site's totals and a batch of per-entry numbers in the same run. Until now a run did one or the other, so each kind of number was refreshed every second run, and the index walk and the daily 30-day sum of a large site took twice as many runs.

EmDash 1.5.0 raised the number of calls a sandboxed plugin may make per run from ten to thirty. The plugin uses at most twenty of them, because on Cloudflare every plugin task due in the same minute shares one limit of 32 Worker invocations.

Nothing changes on EmDash 1.0.1 to 1.4.0, or on a site that set the sandbox limit back to ten: the plugin notices that the second half of a run did not finish, and does one half per run for the rest of the day.
