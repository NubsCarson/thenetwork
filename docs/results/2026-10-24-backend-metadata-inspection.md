# Existing canonical backend metadata inspection

The ordinary Pages inspection passes for all four canonical projects, but it does not inspect the active backend Worker. The current browser login cannot view that Worker. This workflow uses the existing protected production credential to determine its actual read access without exporting or broadening the credential.

Run `Inspect existing canonical backend metadata` from main. It makes at most three Cloudflare GET requests: the exact backend deployments, the exact API hostname domain association, then the active version metadata. A denied read stops the sequence. The output includes only identifiers, deployment percentages, domain/service mapping, and binding names/types. Binding values, script source, runtime config, credentials and raw provider error text are excluded. It never invokes the Worker, deploys, changes settings, reads a database or creates access.

The main-only condition and existing production environment review are retained. The job uses Ubuntu's Python standard library; no dependency install, model, new server or framework. Readable Worker metadata does not by itself prove the Worker-to-database physical identity.

Local validation: four controlled cases cover denied-read short circuit, missing authority, successful response projection excluding secret values and unrelated domains, and domain denial before version access. These are operational-script controls run outside the repository, not a live permission or onboarding claim. No app/service runtime paths, model prompts, matching behavior or schemas change, so application simulations and live model calls do not validate this inspection and were not repeated.

The full live result must be recorded after normal source review/merge and protected workflow execution; do not call this metadata read a receiver release or a GPT/iMessage acceptance pass.
