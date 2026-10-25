// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { drainAuthRows } from "./cleanup-runner";
const batch = (rates: number, pending: boolean) => ({ rows: [{ result: { flows: 0, sessions: 0, browsers: 0, rates, pending } }] });
describe("authentication cleanup runner", () => {
  it("drains more than one batch and counts every deletion", async () => {
    const query = vi.fn().mockResolvedValueOnce(batch(100,true)).mockResolvedValueOnce({ rows: [{ result: { flows:3,sessions:2,browsers:1,rates:1,pending:false } }] });
    expect(await drainAuthRows(query)).toEqual({ removed:{ flows:3,sessions:2,browsers:1,rates:101 },batches:2,pending:false,success:true,reason:"complete" });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledWith("SELECT public.cleanup_auth_rows($1) AS result",[100]);
  });
  it("returns retryable failure when the batch budget is exhausted", async () => {
    const query = vi.fn().mockResolvedValue(batch(100,true));
    expect(await drainAuthRows(query,{maxBatches:2})).toMatchObject({ batches:2,pending:true,success:false,reason:"budget",removed:{rates:200} });
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("stops before starting another transaction after the time budget", async () => {
    let time=0;
    const query=vi.fn(async()=>{time=30001;return batch(100,true);});
    expect(await drainAuthRows(query,{now:()=>time})).toMatchObject({ batches:1,pending:true,success:false,reason:"budget" });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("reports skipped locked backlog without spinning or declaring success", async () => {
    const query=vi.fn().mockResolvedValue(batch(0,true));
    expect(await drainAuthRows(query)).toMatchObject({ batches:1,pending:true,success:false,reason:"stalled" });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("accepts an empty database as a completed run", async () => {
    expect(await drainAuthRows(vi.fn().mockResolvedValue(batch(0,false)))).toMatchObject({ success:true,pending:false,reason:"complete" });
  });
  it("fails on an obsolete database result instead of silently claiming completion", async () => {
    await expect(drainAuthRows(vi.fn().mockResolvedValue({rows:[{result:0}]}))).rejects.toThrow("INVALID_CLEANUP_RESULT");
  });
  it("propagates database failure to the CLI failure handler", async () => {
    await expect(drainAuthRows(vi.fn().mockRejectedValue(new Error("database unavailable")))).rejects.toThrow("database unavailable");
  });
});
