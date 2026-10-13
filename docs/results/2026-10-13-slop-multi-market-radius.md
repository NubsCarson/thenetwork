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

No real member, OTP, messaging delivery, deployment, or new infrastructure was used. The official offline simulation cleared model keys. The separate real-model run below used the existing authorized service provider without exporting credentials.

### Hosted qualification

Exact source head `d32c63d60211b86856c3e02a143c72281c84f819` passed hosted run [38349564158](https://github.com/eliza-research/thenetwork/actions/runs/38349564158).

- Integration: 533 passed, 0 failed, 11,196 assertions.
- E2E: 38 passed, 0 failed, 490 assertions; PostgreSQL checks ran.
- Simulation: 329/329 blocking gates passed; 14 tracked targets remain off target.
- Type checks, plugin snapshot, and production site build passed.

### Real LLM extraction

Date: 2026-10-13. Provider: Surplus Intelligence. Requested and returned model: `gpt-6-luna` for every response.

A portable bundle contains the actual base and candidate readers plus the existing core `defaultLLM()` implementation.
Source candidate: `d32c63d60211b86856c3e02a143c72281c84f819`; base: `61d5663b2f56cbdd2f54cc1c6bbb6d09ddd1f21d`.
Bundle SHA-256: `aa2beee5819aaccd5279aa99dbc06c8a6d5d72004fd9a5b1e678d34199bf84f3`.
Local and remote hashes matched before execution. Runtime: Bun 1.4.2.

Execution command, after verifying the existing provider and model:

```sh
RADIUS_PROVIDER_MODEL_VERIFIED=1 LLM_MAX_RETRIES=0 bun --no-env-file ./real-llm-radius.portable.mjs --execute-real
```

Two fixed synthetic inputs ran against each source version. The inputs were declared before any model call:

1. `I'm a man, 32. I date in San Francisco as well as New York City, within fifty miles.`
2. `I'm a woman, 30. My dating markets are San Francisco; New York City. My radius is seventy-five miles.`

| Input | Actual base output | Actual candidate output |
| --- | --- | --- |
| Fifty miles | `{"mode":"radius","miles":50}` | `{"mode":"multi","markets":["nyc","sf"],"miles":50}` |
| Seventy-five miles | `{"mode":"radius","miles":75}` | `{"mode":"multi","markets":["nyc","sf"],"miles":75}` |

All four HTTP responses were 200. Each case used one physical request, no retry, fallback, or token regrowth.
Each request allowed 500 completion tokens and 12 seconds; the entire run allowed 55 seconds.
The provider reported costs of 34, 41, 44, and 44 micro-USD: **163 micro-USD ($0.000163) total**.
This is provider-reported response cost, not an independently reconciled invoice.
The soft SDK cost guard was 5,000 micro-USD; it stops subsequent calls, not an already-issued request.
Actual synthetic model text, prompt hashes, usage, bundle hash, and Bun binary hash were retained privately.
Only the owned temporary bundle and directory were removed after collection.

These two extraction cases prove the reader regression. They do not measure population quality or prove real user acceptance.
Changed multi-step agent-client video qualification remains open. Deferred clients remain deferred.

This is source-level bug evidence. Real app membership and canonical Cloud account, assistant, and website history acceptance remain separate work.

Attribution: automated Codex/agent implementation and independent source review under Nubs's project preapproval. It does not imply individual human review.
