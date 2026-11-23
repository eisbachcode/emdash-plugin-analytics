---
"@eisbachcode/emdash-plugin-analytics": minor
---

The dashboard widget no longer needs the scheduled sync to show numbers. When the plugin's store has nothing current, the widget reads the last seven days from the provider itself: before the first sync, on a site that runs no scheduled tasks (a Worker without a Cron Trigger), and when the last sync is more than an hour old. It says "Read live" with the time, keeps each answer for five minutes, and Refresh asks again at once. With demo data the numbers therefore show as soon as the data source is switched, without waiting for a sync.

Stored history, the comparison with the week before, the per-entry page, the editor panel and the MCP tools still come from the sync, so a site without scheduled tasks gets the widget and the Analytics page only. A widget on a site whose sync runs on time behaves as before and makes no provider request.

Before the first sync, the widget now also names what is missing instead of saying that the first sync is pending: the API token or account ID, or the site tag, with a link to the plugin's settings.
