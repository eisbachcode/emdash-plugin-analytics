---
"@eisbachcode/emdash-plugin-analytics": minor
---

Shows how each entry's last seven days compare with the seven before. The per-entry page has a **Change, 7 days** column ("+25%", "-10%", "from 0"), and the Analytics page names the top entry that grew the most ("Getting attention"). Both weeks come from the plugin's own store, so the comparison is exact; Cloudflare answers for the earlier week only from a sample.

No setting and no stored data changes by hand. The earlier week is summed by the daily pass that already sums the 30-day views, so after the update the column fills with that pass's next run, on the following UTC day at the latest, provided the store holds two weeks of history. Until then, and for an entry published during the earlier week, the cell stays empty, and the page says from which day it fills. The MCP tools are unchanged and need no new approval.
