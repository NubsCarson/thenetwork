# Slop multi-market radius correction

Date: 2026-10-13. This is a reproduced bug fix, not a new matching market rollout.

## Problem

A member selects SF and NYC with a travel radius. A later radius correction removes the selected cities. Multi-market persistence also replaces an explicit radius with 25 miles.

## Change

Multi-market preferences retain an optional explicit radius. Parsing, later corrections, private tags, read-back, and LLM schema validation preserve it. Legacy profiles without an explicit radius retain the 25-mile default.

Home location, physical presence, mutual distance limits, and the NYC-only production pilot remain unchanged. The fix does not make SF home accounts eligible for that pilot.

## Reproduction and validation

Runtime: Bun 1.4.2. Base: `61d5663b2f56cbdd2f54cc1c6bbb6d09ddd1f21d`. Implementation: `29431581bce07504172248b47be42df4971b84e2`.

The primary case uses fictional adults through actual HTTP MCP intake and local PostgreSQL. It checks durable onboarding state and private tags, then the runtime pack and actual geographic matching.

```sh
REQUIRE_PG=1 OBSERVATORY_PG_PORT=54349 bun test --conditions eliza-source tests/e2e/platform.e2e.test.ts -t "multi-market radius"
bun run --conditions eliza-source scripts/sim.ts --only onboard
bun node_modules/typescript/bin/tsc --noEmit
```

The test environment uses the existing owned local test cluster. Set `OBSERVATORY_PG_DIR` to that cluster's data directory. Do not reset another cluster.

| Check | Before | After |
| --- | --- | --- |
| Same final HTTP/PostgreSQL regression | Fails: expected multi-market plus 50 miles, received radius-only 50 miles | 1 passed, 0 failed, 39 assertions |
| Official onboarding simulation, pinned seeds 13/14 | Not run for this fix | 19/19 blocking gates passed; hard fields 306/306; corrections 100% |
| Typecheck | Not a regression baseline | Exit 0 |

The matching case checks mutual 50-versus-25-mile limits and rejects a farther peer. A separate fictional SF registry preserves SF home and ZIP while the actual NYC-only runtime excludes the account. No production registry is changed.

One existing tracked simulation target remains off target: persona completion is 79.3%, below 80%. This change does not claim to fix it.

## Evidence limits

No real member, OTP, messaging provider, deployment, or new infrastructure was used. Model keys were cleared by the official offline simulation runner. Provider/model/calls/cost for these runs: none/none/0/0.

Real LLM reader evidence remains pending: the current execution environment has no configured Surplus or OpenAI key. Hosted full simulation, integration, and E2E checks remain separate gates. The LLM schema change has validation coverage, not a claimed live-model result.

This is source-level bug evidence. Real app membership and canonical Cloud account, assistant, and website history acceptance remain separate work.

Attribution: automated Codex/agent implementation and independent source review under Nubs's project preapproval. It does not imply individual human review.
