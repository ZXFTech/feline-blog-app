import {validateIntegrationRelease} from "./integration-release";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import type {OpsDiagnostic} from '@/lib/auth/center/ops-diagnostics';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash=(value:string,base64=false)=>createHash("sha256").update(base64?Buffer.from(value,"base64"):value).digest("hex");
export function opsReleaseBinding(diagnostic?:OpsDiagnostic) {
 if(process.env.VERCEL!=="1") {
  if(!/^sha256:[a-f0-9]{64}$/.test(process.env.RELEASE_IMAGE_DIGEST??""))throw Error("OPS_RELEASE_INVALID");
  return {identity:{kind:"oci",imageDigest:process.env.RELEASE_IMAGE_DIGEST},generation:null,adapterVersion:opsAdapterVersion(diagnostic)};
 }
 try {
  diagnostic?.enter('release_input_read');
  const raw=readFileSync(process.env.RELEASE_INPUT_PATH??"","utf8");if(Buffer.byteLength(raw)>16384)throw Error();
  diagnostic?.enter('release_input_parse');
  const input=JSON.parse(raw),t=input.target;
  diagnostic?.enter('release_target_check');
  const db=new URL(process.env.POSTGRES_DATABASE_URL??"");
  validateIntegrationRelease(input);
  if(!uuid.test(input.releaseId) || input.source?.clean!==true || !/^[a-f0-9]{40}$/.test(input.source.commitSha) ||
    !/^sha256:[a-f0-9]{64}$/.test(input.source.inputDigest) || typeof input.source.repositoryId!=="string" || !input.source.repositoryId ||
    !["managed-proxy-v1","isolated-direct-v1"].includes(t?.opsAdapterVersion) ||
    (t.opsAdapterVersion==="isolated-direct-v1" && (t.appEnv!=="development" || !["localhost","127.0.0.1"].includes(db.hostname) || decodeURIComponent(db.pathname.slice(1))!=="runtime_enhancement_blog")) ||
    t?.kind!=="vercel" || t.service!=="blog" || t.origin!==process.env.FELINE_PUBLIC_ORIGIN || t.origin!=="https://blog.zhaosie.com" ||
    !["development","staging","production"].includes(t.appEnv) || t.appEnv!==process.env.APP_ENV || t.nodeMajor!==22 || process.versions.node.split(".")[0]!=="22" ||
    t.projectId!==process.env.VERCEL_PROJECT_ID || t.teamId!==process.env.RELEASE_VERCEL_TEAM_ID ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(t.projectId??"") || !/^[A-Za-z0-9_-]{1,100}$/.test(t.teamId??"") ||
    t.databaseHost!==db.hostname || t.databaseName!==decodeURIComponent(db.pathname.slice(1)) || !uuid.test(t.databaseGeneration??"") ||
    !/^dpl_[A-Za-z0-9]+$/.test(process.env.VERCEL_DEPLOYMENT_ID??"") ||
    (process.env.VERCEL_GIT_COMMIT_SHA && process.env.VERCEL_GIT_COMMIT_SHA!==input.source.commitSha)) {
    if(t && (t.databaseHost!==db.hostname || t.databaseName!==decodeURIComponent(db.pathname.slice(1))))diagnostic?.reject('database_target_mismatch');
    throw Error();
  }
  diagnostic?.enter('release_secret_check');
  for(const [name,value,version,base64]of [
   ["session",process.env.FELINE_SESSION_SECRET,process.env.FELINE_SESSION_SECRET_VERSION,true],
   ["grant",process.env.FELINE_GRANT_KEYRING,process.env.FELINE_GRANT_KEYRING_VERSION,false],
   ["client",process.env.USER_CENTER_CLIENT_SECRET,process.env.USER_CENTER_CLIENT_SECRET_VERSION,false],
   ["ops",process.env.OPS_STATUS_READ_SECRET,process.env.OPS_STATUS_READ_SECRET_VERSION,true],
  ] as const) if(!value || !version || t.secrets?.[name]?.version!==version || t.secrets[name].digest!==hash(value,base64)) throw Error();
  return {identity:{kind:"vercel",releaseId:input.releaseId,deploymentId:process.env.VERCEL_DEPLOYMENT_ID,inputDigest:"sha256:"+hash(JSON.stringify(input))},generation:t.databaseGeneration,adapterVersion:t.opsAdapterVersion};
 }catch(error){diagnostic?.reject((error as NodeJS.ErrnoException)?.code==='ENOENT'?'file_missing':'check_rejected');throw Error("OPS_RELEASE_INVALID");}
}
export function opsAdapterVersion(diagnostic?:OpsDiagnostic): "managed-proxy-v1" | "isolated-direct-v1" {
 if(process.env.VERCEL==="1")return opsReleaseBinding(diagnostic).adapterVersion;
 const db=new URL(process.env.POSTGRES_DATABASE_URL??"");
 return process.env.APP_ENV==="development" && ["localhost","127.0.0.1","host.docker.internal","user-center-enhancement-blog-pg"].includes(db.hostname) && decodeURIComponent(db.pathname.slice(1))==="runtime_enhancement_blog" ? "isolated-direct-v1" : "managed-proxy-v1";
}
