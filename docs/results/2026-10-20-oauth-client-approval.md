# OAuth client approval regression

Automated implementation and diagnostics by Codex under Nubs's project preapproval.

## Reproduced problem

At main `4b718bb112d1e9ed7e97c47ae9a44ae0c250f586`, a registered client could use a signed-in browser's authorization GET to obtain a code and grant without a client/scope approval. A valid phone code also issued access directly. PKCE did not establish the person's permission for that client. Existing grants cannot justify silent reuse because legacy automatic issuance produced the same consent audit shape.

The repair requires an explicit bound browser POST for every fresh authorization. It shows the requesting name, callback host and scope meanings, rechecks the current account and eligibility, and consumes the pending approval atomically before issuance. PostgreSQL uses conditional DELETE RETURNING; no schema change is needed. Existing grants, access tokens and refresh tokens remain unchanged. This is an ephemeral OAuth screen, not a public account portal.

## Evidence and limits

Reserved fictional phone numbers and the fake delivery provider exercise the real handler, platform accounts and session code. No model, genuine OTP, live signup, provider delivery, production database or hosted ChatGPT was used. No seed or statistical estimate applies to these deterministic security scenarios.

Before the product repair, seven new cases failed on exact main. A subsequent concurrent-approval case reproduced two successful redirects; the repaired handler permits one success and one rejection. Additional coverage checks expiry after storage consumption, account switching, scope tampering, denial preserving old tokens, HTML escaping and request origin/cookie binding. Cases live in the existing OAuth security suite.

Local diagnostics used Bun **1.3.14**, not the required **1.4.2** qualification runtime:

```sh
bun test packages/mcp/test/oauth.test.ts packages/mcp/test/mcp.test.ts packages/mcp/test/signup-draft.test.ts packages/mcp/test/updates.test.ts
bun test packages/mcp/test/output-schemas.integration.test.ts
node --max-old-space-size=512 node_modules/typescript/bin/tsc --noEmit -p tsconfig.consent-check.json
```

Results: 67 passed / 0 failed (495 assertions), then 2 passed / 0 failed (318 assertions). The affected-source TypeScript 5.9.3 check passed, including the PostgreSQL test source. The local check config is an untracked diagnostic file, not a repository build change. An earlier output-schema load failed for a missing cached Ajv dependency; after linking the retained exact dependency the explicit file passed.

A PostgreSQL integration scenario is added for two independent store connections racing to consume one request and refusing expired/unverified requests. It has **not** been executed here. Normal Bun 1.4.2, actual isolated PostgreSQL qualification, CI and release review remain required. The older qualified `003f89f` runtime evidence does not qualify this main-based source; its Cloud continuation and authority safeguards must be reconciled before any integrated image/release. Real GPT signup/readback and real iMessage-to-website same-account/agent/history acceptance remain open.
