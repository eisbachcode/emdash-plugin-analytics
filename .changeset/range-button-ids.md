---
"@eisbachcode/emdash-plugin-analytics": patch
---

Fixes the 7, 30 and 90 day buttons on the Analytics page sharing one identifier, which the admin uses to tell the buttons of a row apart. React reported the duplicate key in the browser console during development.
