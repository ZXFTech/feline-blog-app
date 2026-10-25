// @vitest-environment node
import {randomBytes,createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {integrationTestEnv} from '@/test/auth-center';

// Only the database boundary and its catalog verifier are replaced. Release
// parsing, readiness gates, request handling and diagnostic state stay real.
const db=vi.hoisted(()=>({query:vi.fn(),connect:vi.fn(),verify:vi.fn()}));
vi.mock('@/db/postgres/runtime',()=>({postgresPool:{query:db.query,connect:db.connect}}));
vi.mock('./managed-contract.mjs',()=>({verifyManagedContract:db.verify}));
import {opsStatus} from './ops';

const generation='11111111-1111-4111-8111-111111111111';
const secret=randomBytes(32).toString('base64');
const privateMarker='password-otp-cookie-token-private-canary';
const descriptor=Object.getOwnPropertyDescriptor(process.versions,'node')!;
let directory:string,file:string;
let capture:ReturnType<typeof vi.spyOn>;
let client:{query:ReturnType<typeof vi.fn>;release:ReturnType<typeof vi.fn>};
const hash=(value:string,base64=false)=>createHash('sha256').update(base64?Buffer.from(value,'base64'):value).digest('hex');
function summary(){const now=new Date().toISOString();return {adapterVersion:'managed-proxy-v1',generation,observedAt:now,activatedAt:now,lastCompletedAt:now,consecutiveFailures:0,pending:false,eligibleCount:0,oldestEligibleExpiry:null,lastTickRef:'1'};}
function pack(){return {schemaVersion:3,releaseId:generation,source:{repositoryId:'UNIT_FIXTURE',commitSha:'a'.repeat(40),inputDigest:'sha256:'+'b'.repeat(64),clean:true},target:{purpose:'feline-integration',profile:'feline-blog',kind:'vercel',service:'blog',appEnv:'production',origin:'https://blog.zhaosie.com',opsAdapterVersion:'managed-proxy-v1',nodeMajor:22,projectId:'prj_fixture',teamId:'team_fixture',databaseHost:'pooler.invalid',databaseName:'postgres',databaseGeneration:generation,secrets:{session:{version:'session-v1',digest:hash(integrationTestEnv.FELINE_SESSION_SECRET,true)},grant:{version:'grant-v1',digest:hash(integrationTestEnv.FELINE_GRANT_KEYRING)},client:{version:'client-v1',digest:hash(integrationTestEnv.USER_CENTER_CLIENT_SECRET)},ops:{version:'ops-v1',digest:hash(secret,true)}}}};}
function request(path='/internal/ops/status',options:RequestInit={}){return new Request('https://blog.zhaosie.com'+path,{...options,headers:{Authorization:'Bearer '+secret,...options.headers}});}
async function failure(response:Promise<Response>,stage:string,reason:string){
 const r=await response;expect(r.status).toBe(503);expect(await r.text()).toBe('{"code":"OPS_UNAVAILABLE"}');
 expect(capture).toHaveBeenCalledTimes(1);
 const entry=JSON.parse(capture.mock.calls[0][0] as string);
 expect(Object.keys(entry).sort()).toEqual(['code','elapsedMs','event','reason','stage']);
 expect(entry).toMatchObject({event:'feline_ops_diagnostic',code:'OPS_UNAVAILABLE',stage,reason});
 expect(Number.isInteger(entry.elapsedMs)).toBe(true);expect(entry.elapsedMs).toBeGreaterThanOrEqual(0);expect(entry.elapsedMs).toBeLessThanOrEqual(60000);
 const serialized=JSON.stringify(capture.mock.calls);for(const value of [privateMarker,secret,integrationTestEnv.FELINE_SESSION_SECRET,integrationTestEnv.USER_CENTER_CLIENT_SECRET,file,'pooler.invalid'])expect(serialized).not.toContain(value);
 return serialized;
}
beforeEach(()=>{
 vi.clearAllMocks();vi.useRealTimers();capture=vi.spyOn(console,'info').mockImplementation(()=>{});
 Object.defineProperty(process.versions,'node',{...descriptor,value:'22.21.1'});
 for(const [key,value] of Object.entries(integrationTestEnv))vi.stubEnv(key,value);
 for(const [key,value] of Object.entries({APP_ENV:'production',FELINE_PUBLIC_ORIGIN:'https://blog.zhaosie.com',VERCEL:'1',POSTGRES_DATABASE_URL:'postgresql://fixture:fixture@pooler.invalid/postgres',OPS_STATUS_READ_SECRET:secret,VERCEL_PROJECT_ID:'prj_fixture',RELEASE_VERCEL_TEAM_ID:'team_fixture',VERCEL_DEPLOYMENT_ID:'dpl_fixture',VERCEL_GIT_COMMIT_SHA:'',FELINE_SESSION_SECRET_VERSION:'session-v1',FELINE_GRANT_KEYRING_VERSION:'grant-v1',USER_CENTER_CLIENT_SECRET_VERSION:'client-v1',OPS_STATUS_READ_SECRET_VERSION:'ops-v1'}))vi.stubEnv(key,value);
 directory=mkdtempSync(join(tmpdir(),'feline-ops-diagnostic-'));file=join(directory,'input.json');vi.stubEnv('RELEASE_INPUT_PATH',file);writeFileSync(file,JSON.stringify(pack()));
 db.query.mockReset().mockImplementation(async(sql:string)=>sql.includes('AS safe FROM pg_roles')?{rows:[{safe:true}]}:{rowCount:1,rows:[{summary:summary()}]});
 client={query:vi.fn(async(sql:string)=>sql==='SELECT auth_ops.cleanup_status() AS summary'?{rowCount:1,rows:[{summary:summary()}]}:{rowCount:0,rows:[]}),release:vi.fn()};
 db.connect.mockReset().mockResolvedValue(client);db.verify.mockReset().mockResolvedValue({adapterVersion:'managed-proxy-v1'});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();Object.defineProperty(process.versions,'node',descriptor);capture.mockRestore();try{unlinkSync(file);}catch{}rmdirSync(directory);});

describe('finite operations failure diagnostics',()=>{
 it('emits the integration runtime DTO without a local admission policy',async()=>{const r=await opsStatus(request());expect(r.status).toBe(200);expect(Object.keys(await r.json()).sort()).toEqual(['cleanup','integration','ready','release','runtime','schemaVersion','service']);expect(capture).not.toHaveBeenCalled();});
 it('reports a missing release file without exposing its path',async()=>{unlinkSync(file);await failure(opsStatus(request()),'release_input_read','file_missing');expect(db.query).not.toHaveBeenCalled();});
 it('reports invalid JSON without logging its secret-bearing content',async()=>{writeFileSync(file,'{'+privateMarker);await failure(opsStatus(request()),'release_input_parse','check_rejected');});
 it('distinguishes a mixed release purpose before any storage access',async()=>{const input=pack();input.target.purpose='personal-trial';writeFileSync(file,JSON.stringify(input));await failure(opsStatus(request()),'release_target_check','check_rejected');expect(db.query).not.toHaveBeenCalled();});
 it('identifies a database target mismatch without outputting either host',async()=>{const input=pack();input.target.databaseHost='private-host.invalid';writeFileSync(file,JSON.stringify(input));await failure(opsStatus(request()),'release_target_check','database_target_mismatch');expect(JSON.stringify(capture.mock.calls)).not.toContain('private-host.invalid');});
 it('identifies a secret binding rejection without logging the value or digest',async()=>{const input=pack();input.target.secrets.client.digest='f'.repeat(64);writeFileSync(file,JSON.stringify(input));await failure(opsStatus(request()),'release_secret_check','check_rejected');expect(JSON.stringify(capture.mock.calls)).not.toContain('f'.repeat(64));});
 it('distinguishes failed authentication privileges from a database failure',async()=>{db.query.mockResolvedValue({rows:[{safe:false}]});await failure(opsStatus(request()),'auth_safe_sql','privilege_check_failed');expect(db.connect).not.toHaveBeenCalled();});
 it('does not expose a driver error from the initial readiness query',async()=>{db.query.mockRejectedValue(Object.assign(Error(privateMarker),{code:'42501'}));await failure(opsStatus(request()),'auth_safe_sql','database_unavailable');});
 it('distinguishes a managed connection rejection',async()=>{db.connect.mockRejectedValue(Object.assign(Error(privateMarker),{code:'ECONNREFUSED'}));await failure(opsStatus(request()),'managed_acquire','connection_failed');});
 it('keeps a managed contract rejection after the wrapper returns false',async()=>{db.verify.mockRejectedValue(Error(privateMarker));await failure(opsStatus(request()),'managed_contract','contract_rejected');expect(client.query).toHaveBeenCalledWith('ROLLBACK');});
 it('identifies a cleanup binding mismatch in the managed transaction',async()=>{client.query.mockImplementation(async(sql:string)=>sql==='SELECT auth_ops.cleanup_status() AS summary'?{rowCount:1,rows:[{summary:{...summary(),generation:'22222222-2222-4222-8222-222222222222'}}]}:{rowCount:0,rows:[]});await failure(opsStatus(request()),'cleanup_summary','binding_mismatch');});
 it('identifies a malformed final cleanup summary',async()=>{db.query.mockImplementation(async(sql:string)=>sql.includes('AS safe FROM pg_roles')?{rows:[{safe:true}]}:{rowCount:1,rows:[{summary:{...summary(),eligibleCount:-1}}]});await failure(opsStatus(request()),'cleanup_summary','check_rejected');});
 it('keeps the managed timeout classification after a late connection arrives',async()=>{
  vi.useFakeTimers();let deliver!:(value:typeof client)=>void;db.connect.mockReturnValue(new Promise(resolve=>{deliver=resolve;}));const pending=opsStatus(request());await vi.advanceTimersByTimeAsync(1000);
  const before=await failure(pending,'managed_acquire','managed_budget_exhausted');deliver(client);await vi.advanceTimersByTimeAsync(0);expect(client.release).toHaveBeenCalledExactlyOnceWith(true);expect(JSON.stringify(capture.mock.calls)).toBe(before);
 });
 it('seals the single event at the outer budget despite a late database rejection',async()=>{
  vi.useFakeTimers();let reject!:(error:Error)=>void;db.query.mockReturnValue(new Promise((_,fail)=>{reject=fail;}));const pending=opsStatus(request());await vi.advanceTimersByTimeAsync(4500);
  const before=await failure(pending,'auth_safe_sql','ops_budget_exhausted');reject(Error(privateMarker));await vi.advanceTimersByTimeAsync(0);expect(JSON.stringify(capture.mock.calls)).toBe(before);
 });
 it('isolates concurrent request diagnostics',async()=>{
  let first!:(value:unknown)=>void,second!:(value:unknown)=>void;
  db.query.mockImplementationOnce(()=>new Promise(resolve=>{first=resolve;})).mockImplementationOnce(()=>new Promise(resolve=>{second=resolve;})).mockResolvedValue({rowCount:1,rows:[{summary:{...summary(),eligibleCount:-1}}]});
  const a=opsStatus(request()),b=opsStatus(request());first({rows:[{safe:false}]});expect((await a).status).toBe(503);second({rows:[{safe:true}]});expect((await b).status).toBe(503);
  expect(capture).toHaveBeenCalledTimes(2);expect(capture.mock.calls.map((call:unknown[])=>JSON.parse(call[0] as string).stage).sort()).toEqual(['auth_safe_sql','cleanup_summary']);
 });
 it('emits no diagnostic for rejected credentials, paths, origins or methods',async()=>{
  for(const r of [request('/internal/ops/status',{headers:{Authorization:'Bearer '+privateMarker}}),request('/internal/ops/status?x=1'),request('/internal/ops/status',{headers:{Origin:'https://example.invalid'}}),request('/internal/ops/status',{method:'HEAD'})])expect([404,405]).toContain((await opsStatus(r)).status);
  expect(capture).not.toHaveBeenCalled();expect(db.query).not.toHaveBeenCalled();
 });
});
