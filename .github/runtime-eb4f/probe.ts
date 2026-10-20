/** Read-only requests against the actual image's normal server in its isolated net namespace. */
import { signProxyHeaders } from '/app/packages/platform/src/proxy.ts';
import { NETWORK_FRESH_PERSON_SITES } from '/app/packages/core/src/svc/network-delegation.ts';
const deadline=Number(process.env.QUALIFY_DEADLINE_MS);
const guard=()=>{if(!Number.isFinite(deadline)||Date.now()>=deadline)throw Error('qualification deadline');};
const root='http://127.0.0.1:8790';
async function request(path:string,headers?:HeadersInit){
  guard();return fetch(root+path,{headers,signal:AbortSignal.timeout(Math.max(1,Math.min(2000,deadline-Date.now()))),redirect:'manual'});
}
const checks:{label:string;pass:boolean}[]=[];
const check=(pass:boolean,label:string)=>{checks.push({label,pass});if(!pass)throw Error(label);};
guard();check(Bun.version==='1.4.2','actual image Bun1.4.2');
let ready=false;const healthDeadline=Math.min(deadline,Date.now()+20000);
while(Date.now()<healthDeadline){
  guard();ready=await request('/healthz').then(r=>r.status===200,()=>false);
  if(ready)break;await Bun.sleep(100);
}
check(ready,'actual default entrypoint healthy');
check((await request('/api/me')).status===421,'unsigned edge refused');
check((await request('/review')).status===404,'staff not public');
for(const [app,origin]of Object.entries(NETWORK_FRESH_PERSON_SITES)){
  guard();const path='/api/auth/mode';
  const headers=await signProxyHeaders('synthetic-proxy-'.repeat(4),{host:new URL(origin).host,ip:'198.51.100.20',method:'GET',path});
  const result=await request(path,headers);const body=await result.json();
  guard();check(result.status===200&&body.mode==='cloud',`${app} signed own origin`);
}
guard();console.log(JSON.stringify({state:'ACTUAL_IMAGE_HTTP_PASS',checks,OTP:0,providerCalls:0}));
