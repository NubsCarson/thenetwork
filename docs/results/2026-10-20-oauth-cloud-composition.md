# Cloud OAuth safeguards on the current consent boundary

Automated composition by Codex under Nubs's project preapproval. This candidate is based on PR111 follow-up `2931377`; it is separate from the minimal consent repair. The feature delta from qualified source `003f89f` is applied relative to its common ancestor, preserving current-main public agent/text entry flows and all PR111 consent tests.

## Composed behavior

- Server-owned Cloud sign-in resumes only the same pending browser request, then requires explicit client/scope approval. Public callers cannot choose the callback destination.
- Cloud transport failures return retryable 503 responses without consuming pending consent, authorization codes or refresh tokens.
- Each Cloud grant persists sealed app/resource/phone authority and its expiry. Issuance, bearer use and refresh validate the current delegation; revoked or mismatched identity fails closed.
- Code exchange validates without consuming, then takes the code atomically and rechecks code/grant expiry after awaited work.
- Current consent remains single-use across concurrent approvals. Cloud authority validation precedes consumption; request and grant expiry are checked again before grant persistence. The current account check applies to every client, not only Slop.
- The ephemeral permission page retains plain scope meanings, the same-origin form action plus only the registered callback origin and the existing public site shell. It adds a retry message without restoring a public sign-in/settings/dashboard.

Storage changes are additive: nullable sealed Cloud authority metadata, an immutability guard and the corresponding store methods. Existing legacy phone grants keep their behavior. The source does not enable a deployment mode or change any running service.

## Diagnostics and remaining qualification

Pure in-process synthetic HTTP/Cloud-producer tests used fictional 555 identities and no provider/model/live network. Local Bun is 1.3.14 and TypeScript is 5.9.3, so these results are diagnostics, not normal-runtime or hosted acceptance.

The initial affected run executed 51 cases: 47 passed; four failed only because the composed unavailable page omitted the previously required agent/text fallback phrase. After restoring that fallback, the four affected retry cases passed (164 assertions). A new Cloud-authority concurrent-approval case passed (30 assertions), proving one grant/code after two independently validated approvals. The existing nine PR111 security cases passed in the initial run. Final affected TypeScript diagnostics passed, including PostgreSQL authority test source. No local PostgreSQL cluster was started.

Commands:

```sh
bun test packages/mcp/test/oauth.test.ts packages/mcp/test/cloud-oauth-continuation.integration.test.ts
bun test packages/mcp/test/cloud-oauth-continuation.integration.test.ts --test-name-pattern 'before return and consent'
bun test packages/mcp/test/cloud-oauth-continuation.integration.test.ts --test-name-pattern 'concurrent validated'
```

Normal Bun1.4.2, actual PostgreSQL qualification and independent review must bind to this exact successor. PR111's CI proves its own unchanged boundary and store cases; old003f receipts prove their own old source, not this composition. No image build, release, private capture, genuine OTP or real account/history acceptance occurred. The real GPT signup/readback and real Shared iMessage-to-website same-account/agent/history flows remain open.

## Composition review follow-up

Review found two merge omissions: callback CSP permission and binding the consumed phone/person to the validated identity. The current P1 fix/regression for both is carried unchanged; the composition checks identity again after atomic consume and retains only the validated callback origin on normal and unavailable consent pages. The changed-request negative and callback header case passed; affected TypeScript passed again. The exact source remains unqualified for release until normal CI/PG and independent review bind to it.
