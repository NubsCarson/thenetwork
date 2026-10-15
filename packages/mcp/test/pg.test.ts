// OAuth on Postgres: a unique database on the dev cluster or an explicitly owned
// loopback fixture, dropped afterwards. The refresh regression uses real HTTP.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";
import { APPS } from "@thenetwork/platform";
import { DEV_PG_PORT, devPgUp } from "../../observatory/db/dev-pg.ts";
import { pgAvailable } from "../../observatory/test/pg.ts";
import { PgOAuthStore } from "../src/pg-store.ts";
import { createMcpHandler } from "../src/handler.ts";
import { platformHooks } from "../src/hooks.ts";
import { sha256hex } from "../src/util.ts";
import { addMember, call, connect, origin, PHONE_A, setup, tokenRequest } from "./harness.ts";

const USER = process.env.USER ?? "postgres";
// An admitted Linux fixture may provide its already-running, isolated loopback PG.
// Never start/reset that cluster or accept a remote/service database here.
const EXPLICIT_PG = process.env.MCP_TEST_PG_URL;
const ADMIN_URL = EXPLICIT_PG ?? `postgres://${USER}@localhost:${DEV_PG_PORT}/postgres`;
const parsedAdmin = new URL(ADMIN_URL);
if (!["postgres:", "postgresql:"].includes(parsedAdmin.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(parsedAdmin.hostname) || parsedAdmin.pathname !== "/postgres") throw new Error("MCP_TEST_PG_URL must name an owned loopback postgres admin database");
if (process.env.REQUIRE_PG === "1" && !EXPLICIT_PG && !pgAvailable) throw new Error("OAuth integration requires PostgreSQL");
const DB = `mcp_test_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const testUrl = new URL(ADMIN_URL);
testUrl.pathname = `/${DB}`;
const admin = async (q: string) => {
  const sql = new SQL({ url: ADMIN_URL, max: 1 });
  try { await sql.unsafe("set lock_timeout = '5s'"); await sql.unsafe(q); } finally { await sql.close(); }
};

describe.skipIf(!EXPLICIT_PG && !pgAvailable)("PgOAuthStore", () => {
  let store: PgOAuthStore;
  beforeAll(async () => {
    if (!EXPLICIT_PG) await devPgUp();
    await admin(`create database ${DB}`);
    store = new PgOAuthStore(testUrl.toString());
    await store.migrate();
    await store.migrate(); // repeatable
  });
  afterAll(async () => {
    await store?.close();
    await admin(`drop database if exists ${DB} with (force)`).catch(() => {});
  });

  test("authenticated pre-Join draft persists for retries, discards once and rejects wrong app/phone and revoked grants", async () => {
    const env = setup({ store });
    const c = await connect(env, "friends.help", PHONE_A);
    const prepared = await call(env, "https://friends.help/mcp", "prepare_signup", { firstName: "Ari", homeCity: "sf" }, { token: c.token.access_token });
    expect(prepared.body!.result.structuredContent.prepared).toBe(true);
    expect(await env.accounts.personFor(PHONE_A)).toBeUndefined();
    const restarted = new PgOAuthStore(testUrl.toString());
    try {
      expect(await restarted.claimSignupDraft(env.accounts.phoneHash("+12125550199"), "friends", null, env.clock.t)).toBeUndefined();
      expect(await restarted.claimSignupDraft(env.accounts.phoneHash(PHONE_A), "ntwrk", null, env.clock.t)).toBeUndefined();
      const pair = await Promise.all([store, restarted].map(s => s.claimSignupDraft(env.accounts.phoneHash(PHONE_A), "friends", null, env.clock.t)));
      expect(pair).toEqual([{ firstName: "Ari", homeCity: "sf" }, { firstName: "Ari", homeCity: "sf" }]);
      await store.discardSignupDrafts(env.accounts.phoneHash(PHONE_A), "friends", env.clock.t);
      const grants = await store.grantsFor(env.accounts.phoneHash(PHONE_A), "friends", env.clock.t);
      expect(await store.putSignupDraft({ grantId: grants[0].id, app: "friends", phoneKey: grants[0].phoneKey, fields: { firstName: "Replay" }, expiresAt: env.clock.t + 60_000, consumedAt: null }, env.clock.t)).toBe(false);
      const rows = await store.sql`select fields,consumed_at from oauth.signup_drafts where grant_id=${grants[0].id}`;
      expect(rows[0].fields).toEqual({}); expect(rows[0].consumed_at).not.toBeNull();
      const next = await connect(env, "friends.help", PHONE_A);
      await call(env, "https://friends.help/mcp", "prepare_signup", { firstName: "Rae" }, { token: next.token.access_token });
      const all = await store.grantsFor(env.accounts.phoneHash(PHONE_A), "friends", env.clock.t);
      const pending = all.find((g: import("../src/store.ts").Grant) => g.clientId === next.client.client_id)!;
      await store.revokeGrant(pending.id, env.clock.t);
      expect(await restarted.claimSignupDraft(env.accounts.phoneHash(PHONE_A), "friends", null, env.clock.t)).toBeUndefined();
      expect((await store.sql`select fields from oauth.signup_drafts where grant_id=${pending.id}`)[0].fields).toEqual({});
      const fresh = await connect(env, "friends.help", PHONE_A);
      await call(env, "https://friends.help/mcp", "prepare_signup", { firstName: "Tess" }, { token: fresh.token.access_token });
      expect(await restarted.claimSignupDraft(env.accounts.phoneHash(PHONE_A), "friends", null, env.clock.t)).toEqual({ firstName: "Tess" });
    } finally { await restarted.close(); }
  });

  test("full flow, refresh rotation and replay, with hashes only at rest", async () => {
    const env = setup({ store });
    await addMember(env, PHONE_A, [{ app: "peon", state: "active" }]);
    const c = await connect(env, "peon.biz", PHONE_A);
    expect(c.tokenRes.status).toBe(200);
    const url = `${origin("peon.biz")}/mcp`;
    expect((await call(env, url, "check_status", {}, { token: c.token.access_token })).body!.result.structuredContent.status).toBe("active");
    const r1 = await tokenRequest(env, "peon.biz", { grant_type: "refresh_token", refresh_token: c.token.refresh_token, client_id: c.client.client_id });
    expect(r1.res.status).toBe(200);
    expect((await tokenRequest(env, "peon.biz", { grant_type: "refresh_token", refresh_token: c.token.refresh_token, client_id: c.client.client_id })).body.error).toBe("invalid_grant");
    expect((await call(env, url, "check_status", {}, { token: r1.body.access_token })).res.status).toBe(401);
    const dump = JSON.stringify(await store.sql`select * from oauth.tokens`) + JSON.stringify(await store.sql`select * from oauth.codes`) + JSON.stringify(await store.sql`select * from oauth.audit`);
    for (const secret of [c.token.access_token, c.token.refresh_token, r1.body.access_token, c.code]) expect(dump).not.toContain(secret);
    expect(dump).not.toContain("5550142");
    expect((await store.auditRows()).map((a: { kind: string }) => a.kind)).toEqual(expect.arrayContaining(["client_registered", "consent_granted", "token_issued", "token_refreshed", "refresh_replay"]));
  });

  test("a code is taken once under a race; rate windows count and reset", async () => {
    const env = setup({ store });
    const c = await connect(env, "slop.date", PHONE_A);
    const g = (await store.grantsFor(env.accounts.phoneHash(PHONE_A), "slop", env.clock.t))[0]!;
    await store.putCode({ hash: "race", grantId: g.id, clientId: c.client.client_id, redirectUri: "https://client.example/callback", codeChallenge: "x".repeat(43), resource: "https://slop.date/mcp", scopes: ["apps:read"], createdAt: env.clock.t, expiresAt: env.clock.t + 60_000, usedAt: null });
    const taken = await Promise.all([1, 2, 3, 4].map(() => store.takeCode("race", env.clock.t)));
    expect(taken.filter(t => t!.usedAt === null)).toHaveLength(1);
    const t0 = 3_600_000 * 1000;
    expect(await store.hit("b", 60_000, t0)).toBe(1);
    expect(await store.hit("b", 60_000, t0 + 1)).toBe(2);
    expect(await store.hit("b", 60_000, t0 + 60_000)).toBe(1);
    await store.sweep(env.clock.t + 365 * 24 * 3_600_000);
    expect((await store.sql`select count(*)::int as n from oauth.tokens`)[0].n).toBe(0);
  });

  for (const fault of ["access", "refresh", "audit"] as const) {
    test(`atomic refresh over HTTP rolls back a failed ${fault} mint after restart`, async () => {
      const env = setup({ store });
      const personId = await addMember(env, PHONE_A, [{ app: "ntwrk", state: "invited" }]);
      const platform = platformHooks({ store: env.people, otp: env.otp, accounts: env.accounts, sessions: env.sessions, app: id => APPS[id], cookieName: id => `sid_${id}` });
      let handler = env.handler;
      let restarted: PgOAuthStore | undefined;
      const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) { return (await handler.fetch(req)) ?? new Response("not found", { status: 404 }); } });
      env.fetch = async req => {
        const original = new URL(req.url);
        const headers = new Headers(req.headers);
        headers.set("host", original.host);
        return fetch(new URL(original.pathname + original.search, server.url), { method: req.method, headers, redirect: "manual", ...(req.method === "GET" || req.method === "HEAD" ? {} : { body: await req.arrayBuffer() }) });
      };
      try {
        const redirectUri = "https://chatgpt.com/connector_platform/oauth_redirect";
        const resource = "https://ntwrk.party/mcp/openai";
        const c = await connect(env, "ntwrk.party", PHONE_A, { redirectUri, resource, scope: "membership:read profile:write", register: { redirect_uris: [redirectUri] } });
        expect(c.tokenRes.status).toBe(200);
        const oldHash = sha256hex(c.token.refresh_token);
        const old = (await store.getToken(oldHash))!;
        const grant = (await store.getGrant(old.grantId))!;
        expect(grant).toMatchObject({ app: "ntwrk", personId, resource, revokedAt: null });
        env.clock.t += 15 * 60_000 + 1;
        expect((await call(env, resource, "check_status", { app: "ntwrk" }, { token: c.token.access_token })).res.status).toBe(401);

        // Reconstruct both handler and store against the same real database, retaining
        // the existing platform identity/consent. No new login or OTP is performed.
        restarted = new PgOAuthStore(testUrl.toString());
        handler = createMcpHandler({ platform, store: restarted, now: () => env.clock.t, minOtpStartMs: 0, log: line => env.logs.push(line) });
        expect(await restarted.getGrant(grant.id)).toEqual(grant);
        const before = await store.sql`select * from oauth.tokens where grant_id = ${grant.id} order by hash`;
        const beforeAudit = await store.sql`select * from oauth.audit where grant_id = ${grant.id} order by id`;
        await store.sql`create table oauth.test_refresh_fault (grant_id text primary key, step text not null)`;
        await store.sql`insert into oauth.test_refresh_fault values (${grant.id}, ${fault})`;
        await store.sql.unsafe(`create function oauth.test_refresh_fault() returns trigger language plpgsql as $$
          begin
            if exists (select 1 from oauth.test_refresh_fault where grant_id = NEW.grant_id
              and step = case when TG_TABLE_NAME = 'audit' then 'audit' else NEW.kind end) then
              raise exception 'synthetic refresh mint failure';
            end if;
            return NEW;
          end $$;
          create trigger test_refresh_fault before insert on oauth.tokens for each row execute function oauth.test_refresh_fault();
          create trigger test_refresh_fault before insert on oauth.audit for each row execute function oauth.test_refresh_fault();`);
        const refresh = () => tokenRequest(env, "ntwrk.party", { grant_type: "refresh_token", refresh_token: c.token.refresh_token, client_id: c.client.client_id, resource });
        expect((await refresh()).res.status).toBe(500);
        // The real transaction must leave the old token, grant, replacement rows and
        // success audit unchanged even when the second insert or audit failed.
        expect(await store.sql`select * from oauth.tokens where grant_id = ${grant.id} order by hash`).toEqual(before);
        expect(await store.sql`select * from oauth.audit where grant_id = ${grant.id} order by id`).toEqual(beforeAudit);
        expect(await store.getGrant(grant.id)).toEqual(grant);
        expect((await store.getToken(oldHash))!.rotatedAt).toBeNull();
        await store.sql`delete from oauth.test_refresh_fault`;
        const retry = await refresh();
        expect(retry.res.status).toBe(200);
        expect(retry.body).toMatchObject({ token_type: "Bearer", expires_in: 900, scope: "membership:read profile:write" });
        const replacement = (await store.getToken(sha256hex(retry.body.refresh_token)))!;
        expect(replacement).toMatchObject({ grantId: grant.id, clientId: c.client.client_id, app: "ntwrk", resource, scopes: ["membership:read", "profile:write"] });
        expect((await call(env, resource, "check_status", { app: "ntwrk" }, { token: retry.body.access_token })).body!.result.structuredContent.status).toBe("invited");
        expect((await refresh()).body.error).toBe("invalid_grant");
        expect((await call(env, resource, "check_status", { app: "ntwrk" }, { token: retry.body.access_token })).res.status).toBe(401);
        expect((await tokenRequest(env, "ntwrk.party", { grant_type: "refresh_token", refresh_token: retry.body.refresh_token, client_id: c.client.client_id, resource })).body.error).toBe("invalid_grant");
        expect(env.provider.sent).toHaveLength(1);
        for (const secret of [c.token.access_token, c.token.refresh_token, retry.body.access_token, retry.body.refresh_token, c.code]) expect(env.logs.join("\n")).not.toContain(secret);
      } finally {
        try {
          await store.sql.unsafe(`drop trigger if exists test_refresh_fault on oauth.tokens;
            drop trigger if exists test_refresh_fault on oauth.audit;
            drop function if exists oauth.test_refresh_fault();
            drop table if exists oauth.test_refresh_fault;`);
        } finally {
          server.stop(true);
          await restarted?.close();
        }
      }
    });
  }
});
