import { NETWORK_LOGIN_PATH, parseNetworkDelegation, parseNetworkTarget, networkTarget, type NetworkDelegation, type NetworkLoginTarget } from "../../../core/src/svc/network-delegation.ts";
import { svcSign, svcVerify } from "../../../core/src/svc/svc-auth.ts";

export interface NetworkPrimaryOwner { userId: string; organizationId: string; stewardUserId: string; e164: string; agentId: string; expiresAt: number }
export interface NetworkBridgeRow { code_hash: string; steward_user_id: string; code_challenge: string; claims: Record<string, unknown>;
  token_issued_at: Date; token_expires_at: Date; expires_at: Date }
export interface NetworkBridgeDependencies {
  secret: string; now(): number;
  /** Existing verified Steward bearer; no API key, phone or caller identity substitutes. */
  verifyBearer(token: string): Promise<{ userId: string; issuedAt: number; expiration: number; stagingSessionBinding?: unknown } | null>;
  /** Primary canonical identity/organization/verified phone lifecycle; must reject holds and ambiguous phone owners. */
  primaryOwner(stewardUserId: string): Promise<NetworkPrimaryOwner | undefined>;
  blockedByLogout(stewardUserId: string, issuedAt: number): Promise<boolean>;
  insert(row: NetworkBridgeRow): Promise<unknown>;
  claim(hash: string, now: Date): Promise<NetworkBridgeRow | undefined>;
}
const hash = async (v: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)))].map(b=>b.toString(16).padStart(2,"0")).join("");
const opaque = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,"0")).join("");

/** Reuses existing SSO rows and signer. Namespace/audience separation keeps ordinary SSO unchanged. */
export function networkDelegationService(d: NetworkBridgeDependencies) {
  if (d.secret.length < 32) throw new Error("Network delegation needs existing service authority");
  const current = async (identity: NetworkDelegation) => {
    if (!parseNetworkDelegation(identity, networkTarget(identity.app,identity.realm), d.now()) || await d.blockedByLogout(identity.stewardUserId, identity.issuedAt)) return false;
    const owner = await d.primaryOwner(identity.stewardUserId);
    return !!owner && owner.userId===identity.userId && owner.organizationId===identity.organizationId && owner.e164===identity.e164
      && owner.stewardUserId===identity.stewardUserId && owner.agentId===identity.agentId && owner.expiresAt>=identity.expiresAt && d.now()<identity.expiresAt;
  };
  const open = async (proof: unknown, target: NetworkLoginTarget): Promise<NetworkDelegation | undefined> => {
    if (typeof proof!=="string" || proof.length>12000 || !proof.startsWith("ensd_")) return;
    let envelope: {body:string;headers:Record<string,string>};
    try { envelope=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Uint8Array.from(atob(proof.slice(5)),c=>c.charCodeAt(0)))); } catch { return; }
    if (!envelope || typeof envelope.body!=="string" || !envelope.headers || Object.keys(envelope.headers).sort().join()!=="x-ntwrk-svc-id,x-ntwrk-svc-sig,x-ntwrk-svc-ts") return;
    const timestamp=Number(envelope.headers["x-ntwrk-svc-ts"]);
    if (!Number.isSafeInteger(timestamp)) return;
    const auth=await svcVerify(d.secret,{method:"POST",path:`${NETWORK_LOGIN_PATH}/delegation`,body:envelope.body,headers:new Headers(envelope.headers),nowS:timestamp});
    if(!auth.ok || auth.id!==await hash(envelope.body)) return;
    let value:unknown;try{value=JSON.parse(envelope.body);}catch{return;}
    const identity=parseNetworkDelegation(value,target,d.now());
    return identity && await current(identity) ? identity : undefined;
  };
  return {
    async mint(token:string,targetValue:unknown,challenge:unknown,state:unknown) {
      const target=parseNetworkTarget(targetValue);
      if(!target || typeof challenge!=="string" || !/^[a-f0-9]{64}$/u.test(challenge) || typeof state!=="string" || !/^[a-f0-9]{64}$/u.test(state)) return;
      const claims=await d.verifyBearer(token);
      if(!claims || claims.stagingSessionBinding || await d.blockedByLogout(claims.userId,claims.issuedAt)) return;
      const owner=await d.primaryOwner(claims.userId),now=d.now();
      if(!owner || owner.stewardUserId!==claims.userId) return;
      const identity:NetworkDelegation={...target,version:1,...owner,issuedAt:claims.issuedAt,expiresAt:Math.min(owner.expiresAt,claims.expiration*1000,claims.issuedAt*1000+3600_000)};
      if(!parseNetworkDelegation(identity,target,now)) return;
      const code=`enso_${opaque()}`;
      await d.insert({code_hash:await hash(code),steward_user_id:claims.userId,code_challenge:challenge,
        claims:{purpose:"network-delegation-code-v1",identity,state},token_issued_at:new Date(claims.issuedAt*1000),token_expires_at:new Date(identity.expiresAt),expires_at:new Date(Math.min(now+60_000,identity.expiresAt))});
      if(!await current(identity)) return;
      const callback=new URL(target.callback);callback.searchParams.set("code",code);callback.searchParams.set("state",state);
      return {url:callback.href,expiresIn:60};
    },
    async exchange(targetValue:unknown,code:unknown,verifier:unknown) {
      const target=parseNetworkTarget(targetValue);
      if(!target || typeof code!=="string" || !/^enso_[a-f0-9]{64}$/u.test(code)) return;
      // Burn the exact row before verifier/target checks; wrong and raced presentations never mint.
      const row=await d.claim(await hash(code),new Date(d.now()));
      if(!row || row.claims.purpose!=="network-delegation-code-v1" || typeof verifier!=="string" || !/^[a-f0-9]{64}$/u.test(verifier)
        || await hash(verifier)!==row.code_challenge || row.expires_at.getTime()<=d.now()) return;
      const identity=parseNetworkDelegation(row.claims.identity,target,d.now());
      if(!identity || row.steward_user_id!==identity.stewardUserId || !await current(identity)) return;
      const body=JSON.stringify(identity);
      const headers=await svcSign(d.secret,{method:"POST",path:`${NETWORK_LOGIN_PATH}/delegation`,id:await hash(body),body,nowS:Math.floor(d.now()/1000)});
      if(!await current(identity)) return;
      return {identity,proof:`ensd_${btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({body,headers}))))}`};
    },
    async validate(target:unknown,proof:unknown) {const scope=parseNetworkTarget(target);return scope?open(proof,scope):undefined;},
  };
}

/** Service requests use fresh existing HMAC; neither a browser cookie nor a general API key grants it. */
export async function networkDelegationServiceRequest(req:Request,secret:string,raw:string,now:number) {
  const url=new URL(req.url);
  if(req.method!=="POST" || url.search || ![`${NETWORK_LOGIN_PATH}/exchange`,`${NETWORK_LOGIN_PATH}/validate`].includes(url.pathname)) return false;
  const result=await svcVerify(secret,{method:"POST",path:url.pathname,body:raw,headers:req.headers,nowS:Math.floor(now/1000)});
  return result.ok && /^[0-9a-f-]{36}$/iu.test(result.id);
}
