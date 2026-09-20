import { describe, expect, it } from "vitest";
import { setCheckpointPhase } from "./checkpoint";
import { createCheckpoint } from "./staging-core";

describe("checkpoint transitions", () => {
  it("records intent, result, and allowlisted failure codes without losing other phases", async () => {
    const checkpoint = createCheckpoint({
      candidateSha: "a".repeat(40),
      runId: "1",
      attempt: "1",
    });
    const running = await setCheckpointPhase(checkpoint, "deploy", "running");
    const failed = await setCheckpointPhase(running, "deploy", "failed", "DEPLOY_TIMEOUT");
    expect(failed.phaseStates.deploy).toBe("failed");
    expect(failed.phaseStates.verify).toBe("pending");
    expect(failed.failureCode).toBe("DEPLOY_TIMEOUT");
  });
});
