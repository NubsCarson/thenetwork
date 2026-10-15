# Plain, factual replies from onboarding skills

## Problem and scope

In a real, already connected Friends conversation, a simple status/next-step question received a
long answer that offered editing interests in account settings and promised future texts. Current
settings edits home and account controls, not interests; that isolated acceptance service had
delivery disabled. Earlier technical tool tables were explicitly requested and are not the failure
being claimed here. The private account screenshots and conversation contents are not published.

The user requested short, ordinary-language replies and truthful next steps. This change adds one
shared instruction block to the canonical Network, Slop and Friends skills. Both site generation
and plugin snapshot generation expand it. Tool instructions, connection addresses, authorization,
app boundaries and consent/safety restrictions are otherwise unchanged. Peon's skill is unchanged.

## Before and after the instruction change

At base `4ecfd9aa76efbde011da01826669661bbcd02e1a`, generated Friends instructions have no shared
reply-style block. The candidate adds these directions:

- Default to one short paragraph of one to three sentences, usually at most 60 words: useful status
  and one next action, without headings, filler or unnecessary tool narration.
- Keep tool output and technical details internal; show only a needed setup address in plain terms.
- Ask only for missing facts. Handle requested interest changes here, with approval before submission.
- Do not mistake active membership or a suggested next step for enabled matching or confirmed delivery.
- Preserve necessary consent, legal, safety, privacy and age restrictions.

These are instructions to the assistant, not a deterministic response formatter. Generated text
and successful build checks do not prove that a model follows them. A candidate attachment rendered
against the existing isolated staging authorities was prepared for the owner to evaluate in the real
conversation. It is not the currently served skill and was not deployed by this change.

The owner evaluated the first candidate in the real conversation. It corrected the settings advice
and future-text promise, but remained too long and described connection/submission mechanics. The
revised candidate tightens the length instruction and adds one plain example, explicitly conditional
on confirmed signup, saved profile and unconfirmed introductions. That example is not a default
success claim.

In the owner's second real ChatGPT comparison, the revised guidance produced one paragraph of
57 words. The answer kept interest changes in the conversation and made no future-text or enabled-
matching claim. It still used four sentences rather than the preferred one to three. This is a
bounded improvement, not strict acceptance of every style criterion or proof across all three apps.
The generated candidate was pasted as context in the existing isolated conversation; the assistant
did not retrieve a newly deployed skill. No personal screenshots or raw profile text are included.

## Validation

From a clean checkout with the repository's existing dependencies:

```sh
bun run plugins/build.ts
bun run plugins/build.ts --check
bun test sites
bun run typecheck
git diff --check
```

Local results: 81 site cases / 1,419 assertions pass; root and sites TypeScript checks pass; generated
plugin snapshots match; whitespace check passes. Local Bun was 1.3.14 and cached TypeScript 5.9.3;
the normal CI uses the repository-pinned Bun 1.4.2. No installation was performed.

The staging entry test now derives its expected prompt version from the built skill, so the landing
prompt and that skill must agree after a legitimate version bump. This checks generated artifacts,
not response quality. Canonical skills receive patch versions; the two plugin manifests receive patch
versions because their imported skill snapshots changed.

No browser, GPT/model, provider, OTP, deployment or runtime action was performed by the implementation
or independent source review. The owner's two real model comparisons are reported separately above.
Later served-skill and three-app response acceptance remain separate gates; this patch does not enable
matching or messages.
