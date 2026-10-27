// @vitest-environment node
import{randomBytes}from'node:crypto';
import{beforeEach,afterEach,describe,expect,it,vi}from'vitest';
import{authTestEnv}from'@/test/auth-center';
const m=vi.hoisted(()=>({query:vi.fn(),connect:vi.fn(),verify:vi.fn(),adapter:vi.fn(),binding:vi.fn()}));
vi.mock('./store',()=>({query:m.query}));vi.mock('@/db/postgres/runtime',()=>({postgresPool:{connect:m.connect}}));
vi.mock('./managed-contract.mjs',()=>({verifyManagedContract:m.verify}));
vi.mock('./release',()=>({opsAdapterVersion:m.adapter,opsReleaseBinding:m.binding}));
import{ensureAuthReady}from'./readiness';
const generation='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{vi.clearAllMocks();vi.useRealTimers();for(const[k,v]of Object.entries(authTestEnv))vi.stubEnv(k,v);vi.stubEnv('APP_ENV','production');vi.stubEnv('VERCEL','1');vi.stubEnv('OPS_STATUS_READ_SECRET',randomBytes(32).toString('base64'));m.query.mockResolvedValue([{safe:true}]);m.verify.mockReset().mockResolvedValue({adapterVersion:'managed-proxy-v1'});m.adapter.mockReturnValue('managed-proxy-v1');m.binding.mockReturnValue({adapterVersion:'managed-proxy-v1',generation});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
function client(version='managed-proxy-v1',gen=generation){const c={query:vi.fn(async(sql:string)=>sql==='SELECT auth_ops.cleanup_status() AS summary'?{rowCount:1,rows:[{summary:{adapterVersion:version,generation:gen}}]}:{rowCount:0,rows:[]}),release:vi.fn()};m.connect.mockResolvedValue(c);return c;}
describe('HC-06 blog managed readiness',()=>{
 it('verifies the actual managed schema and ACL before a successful transaction',async()=>{const c=client();await ensureAuthReady();expect(m.verify).toHaveBeenCalledWith(c,expect.objectContaining({service:'blog'}));expect(c.query).toHaveBeenCalledWith('COMMIT');expect(c.release).toHaveBeenCalledExactlyOnceWith();});
 it('rejects a tampered function or privilege',async()=>{client();m.verify.mockRejectedValue(Error('MANAGED_DEFINITION_MISMATCH'));await expect(ensureAuthReady()).rejects.toMatchObject({code:'AUTH_STORAGE_NOT_READY',status:503});});
 it('does not cache an earlier permission success',async()=>{client();await ensureAuthReady();m.verify.mockRejectedValue(Error('MANAGED_PRIVILEGE_MISMATCH'));await expect(ensureAuthReady()).rejects.toMatchObject({code:'AUTH_STORAGE_NOT_READY'});});
 it('rejects a database mode different from the controlled release',async()=>{client('isolated-direct-v1');await expect(ensureAuthReady()).rejects.toMatchObject({code:'AUTH_STORAGE_NOT_READY'});});
 it('rejects another database generation',async()=>{client('managed-proxy-v1','22222222-2222-4222-8222-222222222222');await expect(ensureAuthReady()).rejects.toMatchObject({code:'AUTH_STORAGE_NOT_READY'});});
 it('rejects a reused authentication secret as its operations credential',async()=>{client();vi.stubEnv('OPS_STATUS_READ_SECRET',authTestEnv.FELINE_SESSION_SECRET);await expect(ensureAuthReady()).rejects.toMatchObject({code:'AUTH_STORAGE_NOT_READY'});expect(m.connect).not.toHaveBeenCalled();});
 it('destroys a connection delivered after the one second budget',async()=>{vi.useFakeTimers();const c=client();let deliver!:(value:typeof c)=>void;m.connect.mockReturnValue(new Promise(r=>{deliver=r;}));const pending=expect(ensureAuthReady()).rejects.toMatchObject({code:'AUTH_STORAGE_NOT_READY'});await vi.advanceTimersByTimeAsync(1000);await pending;deliver(c);await vi.advanceTimersByTimeAsync(0);expect(c.release).toHaveBeenCalledExactlyOnceWith(true);expect(c.query).not.toHaveBeenCalled();});
});
