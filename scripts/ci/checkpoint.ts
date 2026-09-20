import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  FAILURE_CODES,
  PHASES,
  PHASE_STATES,
  createCheckpoint,
  redactSecrets,
  type FailureCode,
  type Phase,
  type PhaseState,
  type StagingCheckpoint,
} from "./staging-core";

async function readCheckpoint(filePath: string): Promise<StagingCheckpoint> {
  return JSON.parse(await readFile(filePath, "utf8")) as StagingCheckpoint;
}

async function writeCheckpoint(filePath: string, checkpoint: StagingCheckpoint): Promise<void> {
  const temporary = `${filePath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(redactSecrets(checkpoint), null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

function isPhase(value: string): value is Phase {
  return (PHASES as readonly string[]).includes(value);
}

function isPhaseState(value: string): value is PhaseState {
  return (PHASE_STATES as readonly string[]).includes(value);
}

function isFailureCode(value: string): value is FailureCode {
  return (FAILURE_CODES as readonly string[]).includes(value);
}

export async function setCheckpointPhase(
  checkpoint: StagingCheckpoint,
  phase: Phase,
  state: PhaseState,
  failureCode?: FailureCode
): Promise<StagingCheckpoint> {
  return {
    ...checkpoint,
    phaseStates: { ...checkpoint.phaseStates, [phase]: state },
    failureCode: failureCode ?? checkpoint.failureCode,
  };
}

async function main(): Promise<void> {
  const [command, fileValue, ...args] = process.argv.slice(2);
  if (!fileValue) throw new Error("Checkpoint path is required.");
  const filePath = path.resolve(fileValue);

  if (command === "init") {
    await writeCheckpoint(
      filePath,
      createCheckpoint({
        candidateSha: required("CANDIDATE_SHA"),
        runId: required("GITHUB_RUN_ID"),
        attempt: required("GITHUB_RUN_ATTEMPT"),
      })
    );
    return;
  }

  const checkpoint = await readCheckpoint(filePath);
  if (command === "phase") {
    const [phaseValue, stateValue, failureValue] = args;
    if (!phaseValue || !isPhase(phaseValue) || !stateValue || !isPhaseState(stateValue)) {
      throw new Error("Checkpoint phase or state is invalid.");
    }
    const failureCode = failureValue
      ? isFailureCode(failureValue)
        ? failureValue
        : undefined
      : undefined;
    if (failureValue && !failureCode) throw new Error("Checkpoint failure code is invalid.");
    await writeCheckpoint(
      filePath,
      await setCheckpointPhase(checkpoint, phaseValue, stateValue, failureCode)
    );
    return;
  }

  if (command === "summary") {
    process.stdout.write(`### Staging execution ${checkpoint.recordKey}\n\n`);
    process.stdout.write(`Candidate: \`${checkpoint.candidateSha}\`\n\n`);
    process.stdout.write("| Phase | State |\n| --- | --- |\n");
    for (const phase of PHASES) {
      process.stdout.write(`| ${phase} | ${checkpoint.phaseStates[phase]} |\n`);
    }
    process.stdout.write(`\nFailure code: ${checkpoint.failureCode ?? "none"}\n`);
    return;
  }
  throw new Error("Use checkpoint init, phase, or summary.");
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => {
    process.stderr.write("Checkpoint operation failed.\n");
    process.exitCode = 1;
  });
}
