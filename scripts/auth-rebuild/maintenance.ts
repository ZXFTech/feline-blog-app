import { randomUUID } from "node:crypto";
import {
  assertClosure,
  canonicalJson,
  emptyDataset,
  mapTables,
  RebuildError,
  sha256,
  tables,
  type DataRow,
  type Dataset,
} from "./contracts";
import { privateConfigFile } from "./files";
import {
  assertBinding,
  assertFresh,
  evidenceSchema,
  sealPlan,
  serialTables,
  userColumns,
  type MaintenancePlan,
  type SourceCutoff,
} from "./maintenance-plan";
import { assertBackupCutoff, assertSourceCutoff } from "./source-cutoff";
import {
  assertCombinations,
  dataSummary,
  insertOrder,
  readBackupData,
  transformRestore,
  userChanges,
} from "./maintenance-data";
import {
  assertRoot,
  authFingerprint,
  binding,
  databaseNow,
  identityFacts,
  object,
  readUser,
  transaction,
  type InstallState,
  type MaintenanceContext,
} from "./maintenance-store";

type BootstrapPlan = Extract<MaintenancePlan, { command: "bootstrap" }>;
type RestorePlan = Extract<MaintenancePlan, { command: "restore" }>;
type ActivatePlan = Extract<MaintenancePlan, { command: "activate" }>;
const same = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);
function fail(code: string): never {
  throw new RebuildError(code);
}
function body(
  context: MaintenanceContext,
  state: InstallState,
  userId: string,
  operatorLabel: string
) {
  return {
    schemaVersion: 1 as const,
    ...binding(context, state),
    expectedRevision: state.revision,
    authUserId: userId,
    operatorLabel,
  };
}
async function noOtherRoot(context: MaintenanceContext, except?: string) {
  const rows = (
    await context.client.query(`SELECT id FROM ${object(context, "users")} WHERE role='ROOT'`)
  ).rows;
  if (except ? rows.length !== 1 || rows[0].id !== except : rows.length !== 0)
    fail("MAINTENANCE_ROOT_COUNT_REJECTED");
}
async function assertEmpty(context: MaintenanceContext) {
  for (const table of [...insertOrder, "BusinessRestoreRun"])
    if (
      Number(
        (await context.client.query(`SELECT count(*)::int AS count FROM ${object(context, table)}`))
          .rows[0]?.count
      )
    )
      fail("RESTORE_TARGET_NOT_EMPTY");
}
async function readReceipt(context: MaintenanceContext, id: string) {
  const row = (
    await context.client.query(
      `SELECT * FROM ${object(context, "BusinessRestoreRun")} WHERE id=$1`,
      [id]
    )
  ).rows[0];
  if (!row) fail("RESTORE_RECEIPT_MISSING");
  return row;
}
export async function planBootstrap(
  context: MaintenanceContext,
  authUserId: string,
  operatorLabel: string
): Promise<MaintenancePlan | DataRow> {
  return transaction(context, authUserId, async (state, user) => {
    if (state.bootstrapPlanDigest) {
      if (state.rootUserId !== authUserId) fail("BOOTSTRAP_ALREADY_COMPLETED");
      return { code: "ALREADY_COMPLETE", planDigest: state.bootstrapPlanDigest };
    }
    if (state.phase !== "awaiting_root") fail("BOOTSTRAP_PHASE_REJECTED");
    await noOtherRoot(context);
    const facts = await identityFacts(context, user, "USER");
    return sealPlan(
      {
        ...body(context, state, authUserId, operatorLabel),
        command: "bootstrap",
        inputs: { expectedRole: "USER", ...facts },
      },
      await databaseNow(context)
    );
  });
}
export async function applyBootstrap(
  context: MaintenanceContext,
  plan: BootstrapPlan
): Promise<DataRow> {
  return transaction(context, plan.authUserId, async (state, user) => {
    assertBinding(plan, binding(context, state));
    if (state.bootstrapPlanDigest) {
      if (
        state.bootstrapPlanDigest !== plan.planDigest ||
        state.rootUserId !== plan.authUserId ||
        state.rootIssuer !== plan.issuer ||
        state.rootSubjectDigest !== plan.inputs.subjectDigest ||
        state.operatorLabel !== plan.operatorLabel ||
        user.role !== "ROOT"
      )
        fail("BOOTSTRAP_ALREADY_COMPLETED");
      return { code: "ALREADY_COMPLETE", planDigest: plan.planDigest };
    }
    assertFresh(plan, await databaseNow(context), state.revision);
    if (state.phase !== "awaiting_root") fail("BOOTSTRAP_PHASE_REJECTED");
    await noOtherRoot(context);
    const facts = await identityFacts(context, user, "USER");
    if (!same({ expectedRole: "USER", ...facts }, plan.inputs)) fail("BOOTSTRAP_IDENTITY_CHANGED");
    const changed = await context.client.query(
      `UPDATE ${object(context, "users")} SET role='ROOT' WHERE id=$1 AND role='USER' RETURNING id`,
      [plan.authUserId]
    );
    if (changed.rows.length !== 1) fail("BOOTSTRAP_ROLE_UPDATE_FAILED");
    await context.client.query(
      `UPDATE ${object(context, "AuthInstallState")} SET phase='awaiting_restore',revision=revision+1,"rootUserId"=$1,"rootInitializedAt"=clock_timestamp(),"rootIssuer"=$2,"rootSubjectDigest"=$3,"operatorLabel"=$4,"bootstrapPlanDigest"=$5 WHERE id='primary'`,
      [plan.authUserId, plan.issuer, facts.subjectDigest, plan.operatorLabel, plan.planDigest]
    );
    return {
      code: "BOOTSTRAPPED",
      planDigest: plan.planDigest,
      revision: state.revision + 1,
      role: "ROOT",
    };
  });
}
async function restoreInputs(
  context: MaintenanceContext,
  user: DataRow,
  backupId: string,
  manifestSha256: string,
  sourceCutoff: SourceCutoff
) {
  const { manifest, data: source } = await readBackupData(backupId, manifestSha256);
  assertBackupCutoff(manifest, backupId, manifestSha256, sourceCutoff);
  const restored = transformRestore(source, String(user.id));
  if (
    source.users[0].phone !== null &&
    Number(
      (
        await context.client.query(
          `SELECT count(*)::int AS count FROM ${object(context, "users")} WHERE phone=$1 AND id<>$2`,
          [source.users[0].phone, user.id]
        )
      ).rows[0]?.count
    )
  )
    fail("RESTORE_PHONE_CONFLICT");
  return {
    data: restored.data,
    inputs: {
      backupId,
      manifestSha256,
      sourceFingerprint: manifest.sourceFingerprint,
      sourceUserId: manifest.sourceUserId,
      sourceContentDigest: manifest.contentDigest,
      files: mapTables((table) => manifest.tables[table].sha256),
      rowCounts: restored.rowCounts,
      contentDigest: restored.contentDigest,
      userChanges: userChanges(user, source.users[0]),
      counterChanges: restored.counterChanges,
      sequenceMinimums: restored.sequenceMinimums,
      authFingerprint: authFingerprint(user),
      sourceCutoff,
    },
  };
}
export async function planRestore(
  context: MaintenanceContext,
  authUserId: string,
  operatorLabel: string,
  backupId: string,
  manifestSha256: string,
  sourceCutoff: SourceCutoff
): Promise<MaintenancePlan | DataRow> {
  return transaction(context, authUserId, async (state, user) => {
    if (state.restoreRunId) {
      const receipt = await readReceipt(context, state.restoreRunId);
      if (
        receipt.targetGeneration !== state.targetGeneration ||
        receipt.targetUserId !== authUserId ||
        receipt.backupId !== backupId ||
        receipt.manifestSha256 !== manifestSha256
      )
        fail("RESTORE_ALREADY_COMPLETED");
      return { code: "ALREADY_COMPLETE", restoreRunId: receipt.id, planDigest: receipt.planDigest };
    }
    const facts = await identityFacts(context, user, "ROOT");
    assertRoot(state, user, context, facts.subjectDigest);
    if (state.phase !== "awaiting_restore") fail("RESTORE_PHASE_REJECTED");
    await assertSourceCutoff(context, sourceCutoff);
    await noOtherRoot(context, authUserId);
    await assertEmpty(context);
    const { inputs } = await restoreInputs(context, user, backupId, manifestSha256, sourceCutoff);
    return sealPlan(
      { ...body(context, state, authUserId, operatorLabel), command: "restore", inputs },
      await databaseNow(context)
    );
  });
}
async function insertData(context: MaintenanceContext, data: Dataset) {
  for (const table of insertOrder) {
    const columns = tables[table];
    for (let start = 0; start < data[table].length; start += 100) {
      const batch = data[table].slice(start, start + 100),
        values: unknown[] = [];
      const tuples = batch
        .map(
          (row) =>
            `(${columns
              .map((column) => {
                values.push(row[column]);
                return `$${values.length}`;
              })
              .join(",")})`
        )
        .join(",");
      await context.client.query(
        `INSERT INTO ${object(context, table)} (${columns.map((column) => `"${column}"`).join(",")}) VALUES ${tuples}`,
        values
      );
    }
  }
}
async function readTargetData(context: MaintenanceContext, authUserId: string): Promise<Dataset> {
  const data = emptyDataset();
  data.users = (
    await context.client.query(
      `SELECT id,lower(btrim(email::text)) AS email,username,avatar,phone::text,work,"businessCreatedAt" AS "createdAt","businessUpdatedAt" AS "updateAt" FROM ${object(context, "users")} WHERE id=$1`,
      [authUserId]
    )
  ).rows;
  for (const table of insertOrder)
    data[table] = (
      await context.client.query(
        `SELECT ${tables[table].map((column) => `"${column}"`).join(",")} FROM ${object(context, table)}`
      )
    ).rows;
  return JSON.parse(canonicalJson(data)) as Dataset;
}
async function sequences(
  context: MaintenanceContext,
  minima: RestorePlan["inputs"]["sequenceMinimums"],
  apply: boolean
) {
  const result: DataRow[] = [];
  for (const table of serialTables) {
    const sequence = (
      await context.client.query(
        `SELECT c.relname,n.nspname,s.seqincrement::text,s.seqmax::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_sequence s ON s.seqrelid=c.oid WHERE c.oid=pg_get_serial_sequence($1,'id')::regclass`,
        [object(context, table)]
      )
    ).rows[0];
    if (
      !sequence ||
      sequence.nspname !== context.schema ||
      sequence.seqincrement !== "1" ||
      typeof sequence.relname !== "string"
    )
      fail("RESTORE_SEQUENCE_BINDING_REJECTED");
    const name = object(context, sequence.relname);
    const current = (await context.client.query(`SELECT last_value::text,is_called FROM ${name}`))
      .rows[0];
    const last = Number(current?.last_value),
      maximum = minima[table];
    if (!Number.isSafeInteger(last) || last < 1) fail("RESTORE_SEQUENCE_VALUE_REJECTED");
    const chosen = Math.max(last, maximum, 1),
      called = maximum > 0 || current.is_called === true;
    if (!Number.isSafeInteger(Number(sequence.seqmax)) || chosen >= Number(sequence.seqmax))
      fail("RESTORE_SEQUENCE_EXHAUSTED");
    if (apply)
      await context.client.query("SELECT setval($1::regclass,$2::bigint,$3)", [
        name,
        chosen,
        called,
      ]);
    else if (last < maximum || (maximum > 0 && !current.is_called))
      fail("RESTORE_SEQUENCE_NOT_ADVANCED");
    result.push({ table, lastValue: chosen, isCalled: called, restoredMaximum: maximum });
  }
  return result;
}
export async function applyRestore(
  context: MaintenanceContext,
  plan: RestorePlan
): Promise<DataRow> {
  return transaction(context, plan.authUserId, async (state, user) => {
    assertBinding(plan, binding(context, state));
    if (state.restoreRunId) {
      const receipt = await readReceipt(context, state.restoreRunId);
      if (
        receipt.targetGeneration !== plan.targetGeneration ||
        receipt.targetUserId !== plan.authUserId ||
        receipt.sourceUserId !== plan.inputs.sourceUserId ||
        receipt.backupId !== plan.inputs.backupId ||
        receipt.manifestSha256 !== plan.inputs.manifestSha256 ||
        receipt.planDigest !== plan.planDigest ||
        receipt.contentDigest !== plan.inputs.contentDigest ||
        !same(receipt.rowCounts, plan.inputs.rowCounts)
      )
        fail("RESTORE_ALREADY_COMPLETED");
      return { code: "ALREADY_COMPLETE", restoreRunId: receipt.id, planDigest: plan.planDigest };
    }
    assertFresh(plan, await databaseNow(context), state.revision);
    const facts = await identityFacts(context, user, "ROOT");
    assertRoot(state, user, context, facts.subjectDigest);
    if (state.phase !== "awaiting_restore") fail("RESTORE_PHASE_REJECTED");
    await noOtherRoot(context, plan.authUserId);
    await context.client.query(
      `LOCK TABLE ${[...insertOrder]
        .sort()
        .map((table) => object(context, table))
        .join(",")} IN SHARE ROW EXCLUSIVE MODE`
    );
    await assertEmpty(context);
    await assertSourceCutoff(context, plan.inputs.sourceCutoff);
    const restored = await restoreInputs(
      context,
      user,
      plan.inputs.backupId,
      plan.inputs.manifestSha256,
      plan.inputs.sourceCutoff
    );
    if (!same(restored.inputs, plan.inputs)) fail("RESTORE_PLAN_INPUT_CHANGED");
    await insertData(context, restored.data);
    await context.client.query(
      `UPDATE ${object(context, "users")} SET ${userColumns.map((column, i) => `"${column}"=$${i + 2}`).join(",")} WHERE id=$1`,
      [plan.authUserId, ...userColumns.map((column) => plan.inputs.userChanges[column].after)]
    );
    const actual = await readTargetData(context, plan.authUserId);
    assertClosure(actual, plan.authUserId);
    assertCombinations(actual);
    if (
      !same(dataSummary(actual), {
        rowCounts: plan.inputs.rowCounts,
        contentDigest: plan.inputs.contentDigest,
      }) ||
      authFingerprint(await readUser(context, plan.authUserId)) !== plan.inputs.authFingerprint
    )
      fail("RESTORE_CONTENT_MISMATCH");
    const sequenceState = await sequences(context, plan.inputs.sequenceMinimums, true);
    const id = randomUUID();
    await context.client.query(
      `INSERT INTO ${object(context, "BusinessRestoreRun")}(id,"backupId","manifestSha256","planDigest","targetGeneration","sourceUserId","targetUserId","rowCounts","contentDigest","completedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,clock_timestamp())`,
      [
        id,
        plan.inputs.backupId,
        plan.inputs.manifestSha256,
        plan.planDigest,
        plan.targetGeneration,
        plan.inputs.sourceUserId,
        plan.authUserId,
        JSON.stringify(plan.inputs.rowCounts),
        plan.inputs.contentDigest,
      ]
    );
    await context.client.query(
      `UPDATE ${object(context, "AuthInstallState")} SET "restoreRunId"=$1,revision=revision+1 WHERE id='primary'`,
      [id]
    );
    await assertSourceCutoff(context, plan.inputs.sourceCutoff);
    return {
      code: "RESTORED",
      restoreRunId: id,
      planDigest: plan.planDigest,
      contentDigest: plan.inputs.contentDigest,
      rowCounts: plan.inputs.rowCounts,
      sequences: sequenceState,
      revision: state.revision + 1,
    };
  });
}
export async function verifyRestoration(
  context: MaintenanceContext,
  plan: RestorePlan
): Promise<DataRow> {
  return transaction(context, plan.authUserId, async (state, user) => {
    assertBinding(plan, binding(context, state));
    if (!state.restoreRunId) fail("RESTORE_RECEIPT_MISSING");
    const receipt = await readReceipt(context, state.restoreRunId);
    if (
      receipt.planDigest !== plan.planDigest ||
      receipt.contentDigest !== plan.inputs.contentDigest ||
      receipt.targetUserId !== plan.authUserId ||
      receipt.targetGeneration !== plan.targetGeneration ||
      receipt.manifestSha256 !== plan.inputs.manifestSha256 ||
      !same(receipt.rowCounts, plan.inputs.rowCounts)
    )
      fail("RESTORE_RECEIPT_MISMATCH");
    const facts = await identityFacts(context, user, "ROOT");
    assertRoot(state, user, context, facts.subjectDigest);
    await noOtherRoot(context, plan.authUserId);
    const actual = await readTargetData(context, plan.authUserId);
    // Closure is checked with the same complete business projection, not only FK counts.
    const expected = transformRestore(
      (await readBackupData(plan.inputs.backupId, plan.inputs.manifestSha256)).data,
      plan.authUserId
    );
    if (
      !same(dataSummary(actual), dataSummary(expected.data)) ||
      authFingerprint(user) !== plan.inputs.authFingerprint
    )
      fail("RESTORE_CONTENT_MISMATCH");
    return {
      code: "RESTORE_VERIFIED",
      restoreRunId: receipt.id,
      receiptDigest: sha256(canonicalJson(receipt)),
      targetGeneration: state.targetGeneration,
      contentDigest: receipt.contentDigest,
      manifestSha256: receipt.manifestSha256,
      rowCounts: receipt.rowCounts,
      sequences: await sequences(context, plan.inputs.sequenceMinimums, false),
      phase: state.phase,
      revision: state.revision,
    };
  });
}
async function activationInputs(
  context: MaintenanceContext,
  state: InstallState,
  authUserId: string,
  evidenceRef: string
) {
  if (!state.restoreRunId) fail("RESTORE_RECEIPT_MISSING");
  const receipt = await readReceipt(context, state.restoreRunId);
  const actual = await readTargetData(context, authUserId);
  assertClosure(actual, authUserId);
  assertCombinations(actual);
  if (
    !same(dataSummary(actual), {
      rowCounts: receipt.rowCounts,
      contentDigest: receipt.contentDigest,
    })
  )
    fail("ACTIVATION_CONTENT_MISMATCH");
  const minima = Object.fromEntries(
    serialTables.map((table) => [table, Math.max(0, ...actual[table].map((row) => Number(row.id)))])
  ) as RestorePlan["inputs"]["sequenceMinimums"];
  await sequences(context, minima, false);
  const raw = await privateConfigFile(evidenceRef);
  let evidence;
  try {
    evidence = evidenceSchema.parse(JSON.parse(raw.toString("utf8")));
  } catch {
    fail("ACTIVATION_EVIDENCE_REJECTED");
  }
  await assertSourceCutoff(context, evidence.sourceCutoffProof);
  const source = await readBackupData(String(receipt.backupId), String(receipt.manifestSha256));
  assertBackupCutoff(
    source.manifest,
    String(receipt.backupId),
    String(receipt.manifestSha256),
    evidence.sourceCutoffProof
  );
  if (
    evidence.targetGeneration !== state.targetGeneration ||
    evidence.rootUserId !== authUserId ||
    evidence.restoreRunId !== receipt.id ||
    evidence.manifestSha256 !== receipt.manifestSha256 ||
    evidence.contentDigest !== receipt.contentDigest ||
    receipt.targetUserId !== authUserId ||
    receipt.targetGeneration !== state.targetGeneration
  )
    fail("ACTIVATION_EVIDENCE_MISMATCH");
  return {
    restoreRunId: String(receipt.id),
    receiptDigest: sha256(canonicalJson(receipt)),
    evidenceRef,
    evidenceSha256: sha256(raw),
  };
}
export async function planActivation(
  context: MaintenanceContext,
  authUserId: string,
  operatorLabel: string,
  evidenceRef: string
): Promise<MaintenancePlan | DataRow> {
  return transaction(context, authUserId, async (state, user) => {
    if (state.activationPlanDigest) {
      if (state.rootUserId !== authUserId) fail("ACTIVATION_ALREADY_COMPLETED");
      return { code: "ALREADY_COMPLETE", planDigest: state.activationPlanDigest };
    }
    const facts = await identityFacts(context, user, "ROOT");
    assertRoot(state, user, context, facts.subjectDigest);
    if (state.phase !== "awaiting_restore") fail("ACTIVATION_PHASE_REJECTED");
    await noOtherRoot(context, authUserId);
    return sealPlan(
      {
        ...body(context, state, authUserId, operatorLabel),
        command: "activate",
        inputs: await activationInputs(context, state, authUserId, evidenceRef),
      },
      await databaseNow(context)
    );
  });
}
export async function applyActivation(
  context: MaintenanceContext,
  plan: ActivatePlan
): Promise<DataRow> {
  return transaction(context, plan.authUserId, async (state, user) => {
    assertBinding(plan, binding(context, state));
    if (state.activationPlanDigest) {
      if (
        state.activationPlanDigest !== plan.planDigest ||
        state.rootUserId !== plan.authUserId ||
        state.restoreRunId !== plan.inputs.restoreRunId ||
        state.phase !== "ready" ||
        state.activationEvidenceRef !== plan.inputs.evidenceRef ||
        state.activationEvidenceSha256 !== plan.inputs.evidenceSha256
      )
        fail("ACTIVATION_ALREADY_COMPLETED");
      return { code: "ALREADY_COMPLETE", planDigest: plan.planDigest };
    }
    assertFresh(plan, await databaseNow(context), state.revision);
    const facts = await identityFacts(context, user, "ROOT");
    assertRoot(state, user, context, facts.subjectDigest);
    await noOtherRoot(context, plan.authUserId);
    if (
      state.phase !== "awaiting_restore" ||
      !same(
        await activationInputs(context, state, plan.authUserId, plan.inputs.evidenceRef),
        plan.inputs
      )
    )
      fail("ACTIVATION_INPUT_CHANGED");
    await context.client.query(
      `UPDATE ${object(context, "AuthInstallState")} SET phase='ready',revision=revision+1,"activationPlanDigest"=$1,"activationEvidenceRef"=$2,"activationEvidenceSha256"=$3,"activatedAt"=clock_timestamp() WHERE id='primary'`,
      [plan.planDigest, plan.inputs.evidenceRef, plan.inputs.evidenceSha256]
    );
    if (
      !same(
        await activationInputs(context, state, plan.authUserId, plan.inputs.evidenceRef),
        plan.inputs
      )
    )
      fail("ACTIVATION_INPUT_CHANGED");
    return {
      code: "ACTIVATED",
      planDigest: plan.planDigest,
      revision: state.revision + 1,
      phase: "ready",
    };
  });
}
