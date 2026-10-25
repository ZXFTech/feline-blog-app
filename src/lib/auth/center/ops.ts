import { timingSafeEqual } from "node:crypto";
import {integrationSummary} from "./integration-release";
import {opsReleaseBinding} from "./release";
import { postgresPool } from "@/db/postgres/runtime";
import { ensureAuthReady } from "./readiness";
import {createOpsDiagnostic,type OpsDiagnostic} from '@/lib/auth/center/ops-diagnostics';

const headers={"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function authorized(request:Request) {
 const secret=process.env.OPS_STATUS_READ_SECRET;
 if(!secret || !/^[A-Za-z0-9+/]{43}=$/.test(secret) || secret===process.env.FELINE_SESSION_SECRET || secret===process.env.USER_CENTER_CLIENT_SECRET || secret===process.env.JWT_SECRET)return false;
 try {if(Object.values(JSON.parse(process.env.FELINE_GRANT_KEYRING??"{}").keys??{}).includes(secret))return false;}catch{return false;}
 const token=request.headers.get("authorization")??"";
 const expected=Buffer.from("Bearer "+secret),actual=Buffer.from(token);
 return actual.length===expected.length && timingSafeEqual(actual,expected);
}
function summary(value:unknown) {
 const r=value as Record<string,unknown>;
 const time=(key:string,nullable=false)=>{const v=r[key];if(v===null&&nullable)return null;if(typeof v!=="string"||!Number.isFinite(Date.parse(v)))throw Error();return new Date(v).toISOString();};
 if(!r||!["managed-proxy-v1","isolated-direct-v1"].includes(String(r.adapterVersion))||!uuid.test(String(r.generation)) || typeof r.pending!=="boolean" || !Number.isInteger(r.consecutiveFailures) || Number(r.consecutiveFailures)<0 || Number(r.consecutiveFailures)>3 ||
  !Number.isSafeInteger(r.eligibleCount) || Number(r.eligibleCount)<0 || !(r.lastTickRef===null || typeof r.lastTickRef==="string"&&/^\d{1,20}$/.test(r.lastTickRef)))throw Error();
 return {adapterVersion:r.adapterVersion as "managed-proxy-v1"|"isolated-direct-v1",generation:r.generation,observedAt:time("observedAt"),activatedAt:time("activatedAt"),lastCompletedAt:time("lastCompletedAt",true),
  consecutiveFailures:r.consecutiveFailures,pending:r.pending,oldestEligibleExpiry:time("oldestEligibleExpiry",true),eligibleCount:r.eligibleCount,lastTickRef:r.lastTickRef};
}
async function readStatus(diagnostic:OpsDiagnostic) {
 const binding=opsReleaseBinding(diagnostic);diagnostic.enter('release_target_check');
 await ensureAuthReady(diagnostic);
 diagnostic.enter('cleanup_summary');
 const r=await postgresPool.query("SELECT auth_ops.cleanup_status() AS summary");
 if(r.rowCount!==1)throw Error();const cleanup=summary(r.rows[0].summary);
 if(cleanup.adapterVersion!==binding.adapterVersion || binding.generation && cleanup.generation!==binding.generation){diagnostic.reject('binding_mismatch');throw Error();}
 return {schemaVersion:1,service:"blog",release:binding.identity,runtime:{nodeVersion:process.version},ready:true,integration:integrationSummary,cleanup};
}
export async function opsStatus(request:Request) {
 if(!authorized(request))return new Response(null,{status:404,headers});
 const url=new URL(request.url);
 if(url.pathname!=="/internal/ops/status" || url.search || request.headers.has("origin") || request.headers.get("sec-fetch-site")==="cross-site")return new Response(null,{status:404,headers});
 if(request.method!=="GET")return new Response(null,{status:405,headers:{...headers,Allow:"GET"}});
 const diagnostic=createOpsDiagnostic();
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {
  const status=await Promise.race([readStatus(diagnostic),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{diagnostic.reject('ops_budget_exhausted');reject(Error());},4500);})]);
  diagnostic.enter('response_encode');
  const body=JSON.stringify(status);if(Buffer.byteLength(body)>8192)throw Error();
  const response=new Response(body,{headers:{...headers,"Content-Type":"application/json"}});diagnostic.complete();return response;
 }catch{diagnostic.emitFailure();return Response.json({code:"OPS_UNAVAILABLE"},{status:503,headers});}
 finally{if(timer)clearTimeout(timer);}
}
