import { canJoin } from "../../packages/core/src/policy.ts";
// Agent-approved name and age travel in a fragment, never a request URL or referrer.
// The person reviews them; phone, code and consent can never be prefilled by an agent.
export function prefillJoin(root: HTMLElement): void {
  const fields = new URLSearchParams(location.hash.slice(1));
  const key = `join-draft:${location.pathname}`;
  let draft: { firstName?: string; age?: string; expires?: number } = {};
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
    sessionStorage.removeItem(key);
    if (saved?.expires > Date.now()) draft = saved;
  } catch { /* Storage is optional. */ }
  if (fields.has("firstName") || fields.has("age")) {
    draft = { firstName: fields.get("firstName") ?? "", age: fields.get("age") ?? "" };
    history.replaceState(null, "", location.pathname + location.search);
  }
  const name = root.querySelector<HTMLInputElement>('input[name="firstName"]');
  const age = root.querySelector<HTMLInputElement>('input[name="age"]');
  if (name && draft.firstName) name.value = draft.firstName.slice(0, 80);
  if (age && /^\d{1,3}$/.test(draft.age ?? "") && Number(draft.age) <= 120) age.value = draft.age!;
  // Retain only this tab's draft across the external phone sign-in redirect.
  root.addEventListener("submit", () => {
    clearJoinDraft();
    if (!name?.value || !age?.value || !canJoin(Number(age.value))) return;
    try { sessionStorage.setItem(key, JSON.stringify({ firstName: name.value, age: age.value, expires: Date.now() + 15 * 60_000 })); } catch { /* Optional. */ }
  });
}
export function clearJoinDraft(): void {
  try { sessionStorage.removeItem(`join-draft:${location.pathname}`); } catch { /* Optional. */ }
}
