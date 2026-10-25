// @vitest-environment node
import {randomBytes} from "node:crypto";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {authTestEnv} from "@/test/auth-center";
const mocks=vi.hoisted(()=>({query:vi.fn(),ensure:vi.fn()}));
vi.mock("@/db/postgres/runtime",()=>({postgresPool:{query:mocks.query}}));
vi.mock("./readiness",()=>({ensureAuthReady:mocks.ensure}));
vi.mock("@/db/userAction",()=>({checkUser:vi.fn()}));
import {opsStatus} from "./ops";
import {trustedIp} from "./flows";
const secret=randomBytes(32).toString("base64"),headers={Authorization:"Bearer "+secret};
beforeEach(()=>{
 vi.clearAllMocks();for(const[k,v]of Object.entries(authTestEnv))vi.stubEnv(k,v);
 vi.stubEnv("APP_ENV","development");vi.stubEnv("POSTGRES_DATABASE_URL","postgresql://fixture:fixture@localhost:54355/runtime_enhancement_blog");vi.stubEnv("OPS_STATUS_READ_SECRET",secret);vi.stubEnv("VERCEL","");vi.stubEnv("RELEASE_IMAGE_DIGEST","sha256:"+"a".repeat(64));
 const now=new Date().toISOString();mocks.ensure.mockResolvedValue(undefined);mocks.query.mockResolvedValue({rowCount:1,rows:[{summary:{adapterVersion:"isolated-direct-v1",generation:"11111111-1111-4111-8111-111111111111",observedAt:now,activatedAt:now,lastCompletedAt:now,consecutiveFailures:0,pending:false,oldestEligibleExpiry:null,eligibleCount:0,lastTickRef:"1"}}]});
});
afterEach(()=>vi.unstubAllEnvs());
describe("AC-C4 AC-V2 operations authorization",()=>{
 it("returns 404 before a database access for missing or tampered credentials",async()=>{
  for(const authorization of ["","Bearer invalid"]){expect((await opsStatus(new Request("https://blog.zhaosie.com/internal/ops/status",{method:"OPTIONS",headers:{authorization}}))).status).toBe(404);}
  expect(mocks.query).not.toHaveBeenCalled();expect(mocks.ensure).not.toHaveBeenCalled();
 });
 it("allows only the exact authenticated GET and removes driver details",async()=>{
  expect((await opsStatus(new Request("https://blog.zhaosie.com/internal/ops/status",{headers}))).status).toBe(200);
  expect((await opsStatus(new Request("https://blog.zhaosie.com/internal/ops/status",{method:"HEAD",headers}))).status).toBe(405);
  expect((await opsStatus(new Request("https://blog.zhaosie.com/internal/ops/status?x=1",{headers}))).status).toBe(404);
  mocks.query.mockRejectedValue(Error("email-password-cookie-canary"));const r=await opsStatus(new Request("https://blog.zhaosie.com/internal/ops/status",{headers}));expect(r.status).toBe(503);expect(await r.text()).toBe('{"code":"OPS_UNAVAILABLE"}');
 });
 it("does not accept the session secret as the operations credential",async()=>{
  vi.stubEnv("OPS_STATUS_READ_SECRET",authTestEnv.FELINE_SESSION_SECRET);
  expect((await opsStatus(new Request("https://blog.zhaosie.com/internal/ops/status",{headers:{Authorization:"Bearer "+authTestEnv.FELINE_SESSION_SECRET}}))).status).toBe(404);
  expect(mocks.query).not.toHaveBeenCalled();
 });
 it("does not reuse the old account JWT credential for monitoring",async()=>{
  vi.stubEnv("JWT_SECRET",secret);
  expect((await opsStatus(new Request("https://blog.zhaosie.com/internal/ops/status",{headers}))).status).toBe(404);
  expect(mocks.query).not.toHaveBeenCalled();
 });
 it("fails closed when Vercel lacks a controlled release input",async()=>{
  vi.stubEnv("VERCEL","1");vi.stubEnv("RELEASE_INPUT_PATH","");expect((await opsStatus(new Request("https://blog.zhaosie.com/internal/ops/status",{headers}))).status).toBe(503);expect(mocks.query).not.toHaveBeenCalled();
 });
});
describe("AC-V3 trusted Vercel IP",()=>{
 it("trusts only a valid overwritten real IP and shares malformed and absent addresses",()=>{
  vi.stubEnv("VERCEL","1");expect(trustedIp(new Headers({"x-real-ip":"192.0.2.5","x-forwarded-for":"203.0.113.5"}))).toBe("192.0.2.5");
  expect(trustedIp(new Headers({"x-real-ip":"garbage","x-forwarded-for":"203.0.113.5"}))).toBe("no-trusted-ip");
  expect(trustedIp(new Headers({"x-forwarded-for":"203.0.113.5"}))).toBe("no-trusted-ip");
 });
});
