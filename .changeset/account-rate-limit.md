---
"@eisbachcode/emdash-plugin-analytics": patch
---

Requests to Cloudflare now ask for account-based rate limiting, so the plugin's query budget (300 per five minutes for the account) is no longer shared with every other tool that uses a token of the same Cloudflare user. An exhausted budget is reported as the rate limit it is. Paths with percent-encoded characters are shown decoded, so `/news/%E6%9D%B1%E4%BA%AC/` reads `/news/東京/`.
