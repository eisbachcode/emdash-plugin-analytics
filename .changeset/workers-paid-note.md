---
"@eisbachcode/emdash-plugin-analytics": patch
---

The README now says to plan on Workers Paid on Cloudflare for an in-process install too: the pages work on Workers Free, but the scheduled sync will most likely exceed Free's 10 ms CPU limit per Cron Trigger. No code changes from 0.3.0.
