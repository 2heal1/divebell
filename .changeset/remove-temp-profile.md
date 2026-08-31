---
"@divebell/cli": patch
---

Remove the temporary Profile login flow, including `open --temp-profile` and
`profile export`. Keep local Profile reuse and portable browser state as the
supported authentication workflows.
