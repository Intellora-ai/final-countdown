# Registry record schema

One record per **inventory entry**, keyed by the entry's number in
`inventory.txt`. 550 entries, therefore 550 records.

## The duplicate-name decision

Fifteen names appear at more than one inventory number — `Rough.js` is in
categories 6, 8 and 47; `FFmpeg` in 23 and 24; `SymPy` in 13 and 15. The
specification asks for two things that pull apart here: "every inventory item
gets a registry entry" (§1) and "exactly one canonical registry identity" (§2).

Both are satisfied by separating the two ideas:

- `id` — the inventory number. 550 of them, one per line of the spec. This is
  what §32's acceptance test counts.
- `technology_id` — a slug identifying the *technology*. Shared by every entry
  naming the same thing, so `rough-js` appears once as an identity and three
  times as an inventory position. 535 distinct.

A record whose `id` is not the lowest for its `technology_id` sets
`canonical: false` and carries `canonical_id` pointing at the one that is.
Installation and verification are recorded on the canonical record only;
duplicating them would let the same technology be counted as verified twice.

## Fields

| Field | Type | Rule |
|---|---|---|
| `id` | int | Inventory number, 1–550. Unique. |
| `name` | string | Verbatim from `inventory.txt`. Never reworded. |
| `category` | string | Verbatim category heading. |
| `category_number` | int | 1–47. |
| `technology_id` | string | Lowercase slug. Shared across duplicate names. |
| `canonical` | bool | `false` only for a repeat of an earlier `technology_id`. |
| `canonical_id` | int \| null | Set when `canonical` is false. |
| `ecosystem` | enum | See below. |
| `kind` | enum | See below. |
| `package` | string \| null | Exact installable name, or null when there is none. |
| `install_method` | enum | See below. |
| `version` | string \| null | **Only if measured on this machine.** Never guessed. |
| `license` | string \| null | SPDX id where known, else the licence's common name. |
| `license_class` | enum | See below. |
| `official_source` | string | Homepage or repository URL. |
| `runtime_requirements` | string[] | e.g. `["node>=18"]`. Empty when none. |
| `platform_support` | string[] | Subset of `linux`, `macos`, `windows`, `browser`. |
| `readiness` | enum | `P0`–`P5`. See below. |
| `production_status` | enum | `available`, `service`, `platform-api`, `toolchain`, `review-required`. |
| `verification_status` | enum | `unverified`, `present`, `version-measured`, `smoke-tested`. |
| `security_status` | enum | `unscanned`, `scanned-clean`, `review-required`. |
| `container_support` | enum | `native`, `official-image`, `community-image`, `not-applicable`. |
| `deployment_support` | string[] | Subset of `local`, `docker`, `compose`, `kubernetes`, `browser`, `serverless`, `desktop`. |
| `documentation` | string | URL to the technology's own docs. |
| `notes` | string | Constraints, licensing caveats, why it is not installable. Empty string if nothing to say. |

## `ecosystem`

`javascript` · `python` · `rust` · `go` · `jvm` · `c-cpp` · `lean` ·
`ocaml` · `haskell` · `native` · `browser` · `container` · `spec`

`spec` is for entries that name a standard rather than an implementation —
`OpenAPI`, `JSON Schema`, `SMT-LIB tooling`, `Protocol Buffers`.

## `kind`

`library` · `framework` · `runtime` · `cli-tool` · `service` ·
`platform-api` · `standard` · `alternative-group`

`alternative-group` is for the four entries that name a class rather than a
package: ids 102, 119, 265, 415, 427, 449, 512. Calling those "libraries"
would be a small lie that a later reader would have to re-derive.

## `install_method`

`npm` · `pip` · `cargo` · `go` · `maven` · `elan` · `opam` · `brew` ·
`apt` · `binary-release` · `source-build` · `oci-image` · `builtin` · `none`

`builtin` means the platform provides it — `WebGL`, `ResizeObserver`,
`HTML Canvas`. `none` means the entry names a class, not an artifact.

## `license_class`

Per §26. `OPEN_SOURCE` · `SOURCE_AVAILABLE` · `FREE_BUT_RESTRICTED` ·
`COMMERCIAL_RESTRICTIONS` · `SPECIAL_LICENSE` · `LICENSE_REVIEW_REQUIRED`

Record the licence text's own terms. Do not draw legal conclusions beyond it;
anything ambiguous is `LICENSE_REVIEW_REQUIRED` with the reason in `notes`.

## `readiness` — earned, not assigned

| Level | Meaning | Evidence required |
|---|---|---|
| `P0` | Inventoried | A complete registry record. |
| `P1` | Acquired | A pinned, reproducible way to obtain it is recorded. |
| `P2` | Installed | Present on this machine **and measured** — `version` is non-null. |
| `P3` | Verified | A functional smoke test ran and passed. |
| `P4` | Production-packaged | Template + CI + security scan + rollback path exist. |
| `P5` | Deployment-verified | Deployed and health-checked. |

**Do not claim a level you have not evidenced.** A technology with a `version`
string nobody measured is worse than one marked `P0`, because it looks checked
and is not. Most of the 550 will sit at `P0`/`P1`, and that is the honest
result — §29 exists precisely so the distinction is visible.
