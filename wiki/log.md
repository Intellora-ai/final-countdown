# Ingest log

One entry per ingest, appended, never rewritten. This is the audit trail: it
answers "where did this page come from, and when?" long after the conversation
that produced it is gone.

Format:

```
## YYYY-MM-DD HH:MM — <short description>
- raw files read:   raw/<file>
- pages created:    wiki/<type>/<page>.md
- pages updated:    wiki/<type>/<page>.md
- index.md updated: yes
- notes:            anything surprising, contradictory, or unresolved
```

---

_No ingests yet._
