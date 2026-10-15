// Normal OAuth and phone-session HTTP flow. Only OTP delivery is controlled; no real person/provider.
import {expect, test} from "bun:test";
import {createPublicApi, APPS} from "@thenetwork/platform";
import {call, connect, PHONE_A, PHONE_B, setup} from "./harness.ts";

const claim = (e: ReturnType<typeof setup>, cookie: string, domain = "friends.help", origin = `https://${domain}`) =>
  e.fetch(new Request(`https://${domain}/oauth/signup-draft`, {method:"POST",headers:{cookie,origin,"content-type":"application/json"},body:"{}"}));
const browser = async (e: ReturnType<typeof setup>, phone: string) => {
  const s=await e.sessions.create("friends",phone,null);return `sid_friends=${s.token}`;
};

test("verified-phone OAuth draft is app-bound, single-use, editable before normal Join and never opts in", async () => {
  const e=setup(), c=await connect(e,"friends.help",PHONE_A), token=c.token.access_token;
  const saved=await call(e,"https://friends.help/mcp","prepare_signup",{firstName:"Ari",homeCity:"sf"},{token});
  expect(saved.body!.result.structuredContent).toMatchObject({prepared:true,url:"https://friends.help/join?via=agent"});
  expect(saved.text).not.toContain(PHONE_A);
  expect(await e.accounts.personFor(PHONE_A)).toBeUndefined();
  expect((await call(e,"https://friends.help/mcp","prepare_signup",{firstName:"Overwrite"},{token})).body!.result.isError).toBe(true);
  expect(await (await claim(e,await browser(e,PHONE_B))).json()).toEqual({draft:null});
  const nt=await e.sessions.create("ntwrk",PHONE_A,null);
  expect(await (await claim(e,`sid_ntwrk=${nt.token}`,"ntwrk.party")).json()).toEqual({draft:null});
  const cookie=await browser(e,PHONE_A);
  expect((await claim(e,cookie,"friends.help","https://evil.example")).status).toBe(403);
  const taken=await claim(e,cookie);expect(taken.headers.get("cache-control")).toBe("no-store");
  expect(await taken.json()).toEqual({draft:{firstName:"Ari",homeCity:"sf"}});
  expect(await (await claim(e,cookie)).json()).toEqual({draft:null});
  expect(await e.accounts.personFor(PHONE_A)).toBeUndefined();
  // Human corrects the name/city and supplies age + explicit app consent through the normal API.
  const api=createPublicApi({store:e.people,otp:e.provider,hashKey:"test-hash-key",sessionSecret:"test-session-secret",now:()=>e.clock.t,env:{PLATFORM_ENV:"dev"},minStartMs:0,minVerifyMs:0});
  const response=await api.fetch(new Request("https://friends.help/api/join",{method:"POST",headers:{host:"friends.help",origin:"https://friends.help",cookie,"content-type":"application/json"},body:JSON.stringify({firstName:"Rae",age:29,homeCity:"nyc",consent:{sms:true,wording:APPS.friends.consent.text}})}));
  expect(response!.status).toBe(200);
  const person=await e.accounts.personFor(PHONE_A);expect(person).toBeDefined();
  const member=await e.people.getMembership(person!.id,"friends");expect(member!.firstName).toBe("Rae");expect(member!.profile.homeCity).toBe("nyc");
  expect((await e.people.consentEvents(PHONE_A,"friends")).length).toBe(1);
  // A null-person grant cannot follow a newly created person.
  expect((await call(e,"https://friends.help/mcp","prepare_signup",{firstName:"Oldgrant"},{token})).res.status).toBe(401);
});

test("draft refuses private extra fields, lacks unauthenticated writes, expires and dies on grant revocation",async()=>{
  const limited=setup(), lc=await connect(limited,"friends.help",PHONE_A,{scope:"apps:read membership:read"});
  expect((await call(limited,"https://friends.help/mcp","prepare_signup",{firstName:"Ari"},{token:lc.token.access_token})).res.status).toBe(403);
  const e=setup(), c=await connect(e,"friends.help",PHONE_A), token=c.token.access_token;
  expect((await call(e,"https://friends.help/mcp","prepare_signup",{firstName:"Ari"})).res.status).toBe(401);
  for(const extra of [{phone:PHONE_A},{code:"314159"},{gender:"male"},{orientation:"straight"},{age:29},{consent:true},{app:"slop"}])
    expect((await call(e,"https://friends.help/mcp","prepare_signup",{firstName:"Ari",...extra},{token})).body!.result.isError).toBe(true);
  expect((await call(e,"https://friends.help/mcp","start_signup",{app:"friends",firstName:"Ari"})).body!.result.isError).toBe(true);
  await call(e,"https://friends.help/mcp","prepare_signup",{firstName:"Ari"},{token});e.clock.t+=10*60_000;
  expect(await(await claim(e,await browser(e,PHONE_A))).json()).toEqual({draft:null});
  const other=setup(), oc=await connect(other,"friends.help",PHONE_A);
  await call(other,"https://friends.help/mcp","prepare_signup",{firstName:"Ari"},{token:oc.token.access_token});
  const grants=await other.store.grantsFor(other.accounts.phoneHash(PHONE_A),"friends",other.clock.t);
  await other.store.revokeGrant(grants[0].id,other.clock.t);
  expect(await(await claim(other,await browser(other,PHONE_A))).json()).toEqual({draft:null});
});
