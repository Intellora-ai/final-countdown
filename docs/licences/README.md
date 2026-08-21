# Dependency licence records

One record per dependency introduced for the learning-canvas frontend. A record exists
**before** the dependency is installed; `npm install` is not run for a package whose record is
absent. Each record answers the same nine points, so a reader can tell what was verified from
what was assumed.

The nine points:

1. Package or asset name
2. Exact version or asset revision
3. Publisher or copyright holder
4. Licence identifier
5. URL of the official licence source
6. Verified licence-file URL (the text was retrieved, not recalled)
7. SHA-256 of the retrieved licence text
8. Direct or transitive
9. Date, command, and process that verified it

A record does not authorise adding the package to `package.json`. It authorises the changeset
that needs it. KaTeX and PixiJS are recorded here at CS-0 and installed later, at CS-9 and CS-10.

| Package | Version | Licence | Installed at |
|---|---|---|---|
| [vitest](vitest.md) | 3.2.7 | MIT | CS-0 |
| [katex](katex.md) | 0.18.4 | MIT | CS-9 |
| [pixi.js](pixi-js.md) | 8.20.0 | MIT | CS-10 |
| [Caveat](caveat-font.md) | google/fonts `main` | OFL-1.1 | CS-7 |

Three.js is not recorded here. It is only reached at CS-12, and only if a concept declares a
3D purpose; its record is written in that changeset, in this same order.

Verified 2026-08-21.
