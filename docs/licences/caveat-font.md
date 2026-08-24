# Caveat (font asset, not an npm package)

A font is not a normal dependency: it is not installed, not in `package.json`, and not in the
lockfile. It arrives at runtime over the network from Google Fonts, exactly as the three faces the
Agabi design system already loads. This record therefore names the asset, its revision, and how it
is delivered.

| # | Point | Value |
|---|---|---|
| 1 | Asset | Caveat (font family) |
| 2 | Asset revision | `google/fonts` branch `main`, retrieved 2026-08-21; served by Google Fonts CSS API v2 |
| 3 | Copyright holder | The Caveat Project Authors — https://github.com/googlefonts/caveat |
| 4 | Licence identifier | **OFL-1.1** (SIL Open Font License, Version 1.1, 26 February 2007) |
| 5 | Official licence source | https://fonts.google.com/specimen/Caveat/license |
| 6 | Verified licence-file URL | https://raw.githubusercontent.com/google/fonts/main/ofl/caveat/OFL.txt |
| 7 | SHA-256 of retrieved licence text | `1f9d81d094273d82f3898a1ee8b598a717d050ecbf5ff7bede105b704880157b` (4385 bytes) |
| 8 | Dependency status | runtime asset, loaded by CSS `@import`; **not** an npm dependency, direct or transitive |
| 9 | Verified | 2026-08-21 — `curl` of the OFL text from the `google/fonts` repository, terms read line by line rather than assumed; performed by the CS-0 changeset |

**Commercial production use:** permitted. Retrieved verbatim from the licence text, PERMISSION &
CONDITIONS: *"Permission is hereby granted, free of charge, to any person obtaining a copy of the
Font Software, to use, study, copy, merge, embed, modify, redistribute, and sell modified and
unmodified copies of the Font Software"*.
**Reserved Font Name:** **none declared for Caveat.** The copyright line is
`Copyright 2014 The Caveat Project Authors (https://github.com/googlefonts/caveat)` with no
`with Reserved Font Name` clause. The phrase appears in the file only inside OFL §1's definitions.
This matters: a Reserved Font Name would forbid shipping a modified build under the same name.
Nothing here is modified, and nothing is renamed.
**Attribution required:** the licence and copyright notice must travel with the *Font Software*
when the font files themselves are redistributed. This project links the Google Fonts CSS API and
redistributes no font binary, so no in-product attribution obligation is triggered. If licensed
`@font-face` binaries are ever vendored into the repository, `OFL.txt` must be vendored beside
them and this record updated.
**Paid production licence:** none.
**Feature restrictions:** none. OFL §2 forbids selling the Font Software *by itself*; it is
embedded in an application here, which the same clause expressly allows.
**Watermark:** none.
**Mandatory telemetry:** none from the licence. Note separately that loading from
`fonts.googleapis.com` is a third-party network request — a privacy property, not a licence one.
It is not a new exposure: `frontend/src/styles/tokens/fonts.css` already loads Fraunces, DM Sans
and JetBrains Mono from the same origin.
**Genuinely open source, not source-available:** yes. OFL-1.1 is OSI-approved and FSF-free; full
text retrieved and checksummed above.
**Vendor lock-in:** none. Delivery is one line in an existing `@import`, and consumption is one
CSS custom property, `--font-hand`.

**Why this asset:** the design ruling is *Agabi wins on colour and theme, Gemini wins on
handwriting*. Agabi ships Fraunces (display serif), DM Sans (UI) and JetBrains Mono (labels) —
no handwriting face exists in the token set, so matching the reference requires a new one. Caveat
is the closest match to the reference's fine slanted script.

**Fallback, decided in advance:** if a later check finds the served licence differs from the text
recorded here, the stack falls back to **italic Fraunces**, already licensed and already loaded,
and the reason is recorded in `docs/acceptance/`. The equations are unaffected either way — they
are KaTeX maths italic, not handwriting.

**Asset checksum note:** the checksum above is of the *licence text*. Font binary checksums are
not recorded because no binary is vendored; the CSS API serves a woff2 whose URL and revision
Google may roll forward. Should binaries ever be vendored, their SHA-256 values belong in this
record.
