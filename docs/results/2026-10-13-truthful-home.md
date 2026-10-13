# Explicit home and conversation ownership

Date: 2026-10-13. Attribution: Automated. Base: `61d5663`.
Implementation: `948dc6bc809a29c93b04d444a47949e3335076ca`.
Reproduced issue: [#72](https://github.com/eliza-research/thenetwork/issues/72).

A normal invited web join with the existing `neighborhood: "Bay Area"` field
returned HTTP 200 but stored `home_city: "nyc"` and NYC home presence. The service
used the runtime city as the person's home. Changing that column alone would
exclude the person from the runtime snapshot and break profile intake.

The join parser now accepts an optional explicit `homeCity` and exact NYC/SF
region labels, including Bay Area. A whole neighborhood field naming that region
also states home. Conflicting city values are invalid. ZIP codes and other
neighborhood names do not infer a city. Unstated home keeps the legacy default.
The four join forms expose an optional home-city choice.

The member and home presence keep the stated city. The registered app/home
runtime owns the conversation; an unserved home uses the app's existing default
runtime. Snapshot, address-book, MCP, native-message and member-action ownership
agree. Native join turns retain the explicit home in the existing pending-text
store through additive migration 0035. Consented app enrollment carries only the
common home city.

The engine's existing NYC-home filter remains unchanged. Conversation ownership
creates no trip or matching eligibility. The physical NYC predicate requires a
member record and either NYC home or a bounded NYC visit covering the complete
requested window; a conflicting trip elsewhere refuses it. Agent context uses
the same predicate. No network activation or historical data backfill was added.

## Closed source evidence

Bun 1.4.2; owned local Postgres port 54349; isolated synthetic test databases.
No live provider, model, personal account or real OTP was used.

- Same-command HTTP/Postgres reproduction, using existing exposed fields:
  `bun test --conditions eliza-source tests/e2e/platform.e2e.test.ts -t 'explicit home survives'`.
  Base: 0 pass, 1 fail, 3 assertions; expected SF, received NYC. Fixed: 1 pass,
  37 assertions. The case verifies profile learning, real record/age, fresh
  service reload, physical-presence boundaries, invalid input and an NYC control.
- Both new boundary cases: 2 pass, 65 assertions. The second verifies served-home
  ownership without duplicate processing, a native multi-turn join, consented
  child-app home propagation, signed agent context and the lowest-age guard.
- Existing platform E2E plus service-apps, service-platform, shared-agent and
  shared-actions integration files: 81 pass, 0 fail, 1,291 assertions.
- `bun node_modules/typescript/bin/tsc --noEmit`: exit 0.
- Official `bun run --conditions eliza-source scripts/sim.ts --only network`:
  61/61 blocking gates pass; 0 tracked targets missed; 101.2 seconds. The normal
  runner clears model keys. The whole simulation suite was not rerun locally.

Private receipts are retained under ignored `test-results/truthful-home-20261013/`.
Independent automated source review approved exact implementation `948dc6b`
without a blocking finding; the reviewer did not rerun tests.

## Remaining qualification

Browser before/after capture and video are pending. The prepared before preview
uses base join HTML with candidate shared JavaScript and backend, so it proves
rendering only. The original backend overwrite is established by the separate
HTTP/Postgres RED receipt. The after preview uses the candidate UI and backend.
Hosted full CI, real-client acceptance and deployment remain separate work.

Two alternatives were rejected: rejecting out-of-market joins would prevent the
authorized personal-profile flow; removing every city filter would duplicate
processing when several runtimes serve one app.
