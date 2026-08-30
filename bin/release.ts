/**
 * feline-blog-app 发布脚本
 *
 * 使用方式: pnpm release
 *
 * 环境变量:
 *   DRY_RUN=true - 仅打印计划，不执行任何变更操作
 *
 * 依赖项:
 *   standard-version - 版本号递增
 *   conventional-changelog - changelog 生成
 *   dotenv-cli - 环境变量切换
 *   vercel CLI - 部署
 *
 * .env.production 需要包含构建所需的环境变量
 */

import { execSync } from "child_process";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const DRY_RUN = process.env.DRY_RUN === "true";
const ROOT = process.cwd();
const NEXT_OUTPUT = join(ROOT, ".next");
const RELEASES_DIR = join(ROOT, "releases");

// 步骤定义: 名称 + 执行函数
type Step = {
  name: string;
  execute: () => void;
  dryExecute?: () => void; // DRY_RUN 时的替代操作
};

type StepResult = {
  name: string;
  duration: number; // ms
  success: boolean;
};

function exec(command: string): string {
  return execSync(command, {
    stdio: "inherit",
    encoding: "utf-8",
  }).trim();
}

function execSilent(command: string): string {
  try {
    return execSync(command, {
      stdio: "pipe",
      encoding: "utf-8",
    }).trim();
  } catch {
    // 命令失败时返回空字符串，调用方自行决定如何处理
    return "";
  }
}

// 进度条: 单行 \r 刷新
let progressTimer: ReturnType<typeof setInterval> | null = null;
let currentStepName = "";
let stepStartTime = 0;

function startProgress(stepName: string) {
  currentStepName = stepName;
  stepStartTime = performance.now();
  process.stdout.write(`\r${" ".repeat(80)}`); // 清空行
  process.stdout.write(`\r  ${stepName}... `);
  progressTimer = setInterval(() => {
    const elapsed = ((performance.now() - stepStartTime) / 1000).toFixed(1);
    process.stdout.write(`\r  ${currentStepName}... ${elapsed}s`);
  }, 200);
}

function stopProgress() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  process.stdout.write(`\r${" ".repeat(80)}`); // 清空行
  process.stdout.write(`\r  ${currentStepName} done\n`);
}

// 读取 package.json version
function readCurrentVersion(): string {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
  return pkg.version;
}

// 生成 changelog 并写入 CHANGELOG.md
function generateChangelog(): void {
  startProgress("Generate changelog");
  try {
    // standard-changelog 自带 conventionalcommits preset，支持 --same-file 原地更新头部
    execSilent(
      `npx standard-changelog --infile CHANGELOG.md --same-file`
    );
    stopProgress();
  } catch {
    // 如果没有历史 commit，standard-changelog 会静默退出，忽略即可
    stopProgress();
    console.log("  No previous commits found, skipping changelog generation");
  }
}

// 标准版本递增 (patch)
function bumpVersion(): void {
  startProgress("Bump version (standard-version)");
  try {
    execSilent(`npx standard-version --release-as patch --skip.bump --skip.commit`);
    const newVersion = readCurrentVersion();
    console.log(`  New version: ${newVersion}`);
    stopProgress();
  } catch (e) {
    stopProgress();
    throw new Error(`Version bump failed: ${e}`);
  }
}

// Prisma generate (production env)
function prismaGenerate(): void {
  startProgress("Prisma generate");
  exec(`dotenv -e .env.production -- npx prisma generate`);
  stopProgress();
}

// dotenv build
function build(): void {
  startProgress("Build (production)");
  exec(`dotenv -e .env.production -- pnpm build`);
  stopProgress();
}

// Vercel deploy
function vercelDeploy(): void {
  startProgress("Vercel deploy");
  exec("vercel --prod");
  stopProgress();
}

// Git commit 和 tag
function gitCommitAndTag(): void {
  const version = readCurrentVersion();
  const tagName = `v${version}`;

  startProgress("Git commit");
  execSilent(`git add CHANGELOG.md package.json`);
  execSilent(`git commit -m "chore(release): ${tagName}"`);
  stopProgress();

  startProgress(`Git tag ${tagName}`);
  try {
    // 检查 tag 是否已存在
    execSilent(`git tag ${tagName}`);
  } catch {
    console.log(`  Tag ${tagName} already exists, skipping`);
  }
  stopProgress();
}

// 创建发布产物：releases/v{version}/ 目录下的 changelog 和 release.json
function createReleaseArtifacts(
  startTime: number,
  stepResults: StepResult[],
  memoryDelta: number,
  outputSize: string
): void {
  const version = readCurrentVersion();
  const tagName = `v${version}`;
  const releaseDir = join(RELEASES_DIR, tagName);
  const endTime = performance.now();

  startProgress("Create release artifacts");

  // 创建 releases/v{version}/ 目录
  mkdirSync(releaseDir, { recursive: true });

  // 复制 changelog（读取 CHANGELOG.md 的头部，即本次发布的变更）
  const changelog = readFileSync(join(ROOT, "CHANGELOG.md"), "utf-8");
  writeFileSync(join(releaseDir, "CHANGELOG.md"), changelog, "utf-8");

  // 写入 release.json
  const releaseRecord = {
    version,
    tagName,
    startTime: new Date(startTime).toISOString(),
    endTime: new Date(endTime).toISOString(),
    totalDurationMs: Math.round(endTime - startTime),
    steps: stepResults.map((s) => ({
      name: s.name,
      durationMs: Math.round(s.duration),
      success: s.success,
    })),
    buildOutput: {
      path: NEXT_OUTPUT,
      size: outputSize,
    },
    memoryDeltaBytes: memoryDelta,
  };
  writeFileSync(
    join(releaseDir, "release.json"),
    JSON.stringify(releaseRecord, null, 2),
    "utf-8"
  );

  // 将产物加入 git
  execSilent(`git add ${releaseDir}`);
  stopProgress();
}

// 产物大小
function getOutputSize(): string {
  try {
    if (process.platform === "win32") {
      const output = execSilent(`Get-ChildItem -Path "${NEXT_OUTPUT}" -Recurse -File | Measure-Object -Property Length -Sum`);
      const match = output.match(/Sum\s*:\s*(\d+)/);
      if (match) {
        const bytes = parseInt(match[1], 10);
        return formatBytes(bytes);
      }
    }
    // Unix-like
    const output = execSilent(`du -sh "${NEXT_OUTPUT}" 2>/dev/null || echo "unknown"`);
    return output.split("\t")[0];
  } catch {
    return "unknown";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

// 统计摘要
function printSummary(
  startTime: number,
  stepResults: StepResult[],
  memoryDelta: number,
  outputSize: string
) {
  const totalDuration = performance.now() - startTime;
  const startTimeStr = new Date(startTime).toISOString();

  console.log("\n" + "=".repeat(60));
  console.log("  Release Summary");
  console.log("=".repeat(60));
  console.log(`  Start time : ${startTimeStr}`);
  console.log(`  Dry run    : ${DRY_RUN ? "yes" : "no"}`);
  console.log("");
  console.log("  Step                          Duration");
  console.log("  " + "-".repeat(40));

  for (const step of stepResults) {
    const status = step.success ? "✓" : "✗";
    const duration = `${(step.duration / 1000).toFixed(2)}s`;
    console.log(`  ${status} ${step.name.padEnd(28)} ${duration.padStart(8)}`);
  }

  console.log("  " + "-".repeat(40));
  console.log(
    `  Total${"".padEnd(25)} ${(totalDuration / 1000).toFixed(2)}s`.padStart(42)
  );
  console.log("");
  console.log(`  Memory delta : ${formatBytes(memoryDelta)}`);
  console.log(`  Output size  : ${outputSize}`);
  console.log("=".repeat(60) + "\n");
}

// 打印 DRY_RUN 计划
function printDryRunPlan(steps: Step[]) {
  console.log("\nDRY RUN - The following steps would be executed:\n");
  steps.forEach((step, i) => {
    console.log(`  ${i + 1}. ${step.name}`);
  });
  console.log("");
}

// 主流程
function runRelease() {
  const startTime = performance.now();
  const memoryBefore = process.memoryUsage().heapUsed;
  const stepResults: StepResult[] = [];

  // DRY_RUN 模式只打印计划
  if (DRY_RUN) {
    printDryRunPlan(RELEASE_STEPS);
    process.exit(0);
  }

  console.log("\n🚀 Release starting...\n");

  for (const step of RELEASE_STEPS) {
    const stepStart = performance.now();
    try {
      step.execute();
      stepResults.push({
        name: step.name,
        duration: performance.now() - stepStart,
        success: true,
      });
    } catch (e) {
      stopProgress();
      stepResults.push({
        name: step.name,
        duration: performance.now() - stepStart,
        success: false,
      });
      console.error(`\n  ✗ ${step.name} failed: ${e}`);
      printSummary(startTime, stepResults, 0, getOutputSize());
      process.exit(1);
    }
  }

  const memoryAfter = process.memoryUsage().heapUsed;
  const memoryDelta = memoryAfter - memoryBefore;
  const outputSize = getOutputSize();

  // 创建发布产物（作为单独步骤记录）
  const artifactStepStart = performance.now();
  try {
    createReleaseArtifacts(startTime, stepResults, memoryDelta, outputSize);
    stepResults.push({
      name: "Create release artifacts",
      duration: performance.now() - artifactStepStart,
      success: true,
    });
  } catch (e) {
    stopProgress();
    stepResults.push({
      name: "Create release artifacts",
      duration: performance.now() - artifactStepStart,
      success: false,
    });
    console.error(`\n  ✗ Create release artifacts failed: ${e}`);
    printSummary(startTime, stepResults, 0, getOutputSize());
    process.exit(1);
  }

  printSummary(startTime, stepResults, memoryDelta, outputSize);
  console.log("✅ Release completed successfully!");
  console.log(
    `   Next: git push and push the tag: git push origin v${readCurrentVersion()}`
  );
}

// 发布步骤列表（不包含 createReleaseArtifacts，因为需要访问 runRelease 的局部变量）
const RELEASE_STEPS: Step[] = [
  {
    name: "Generate changelog",
    execute: generateChangelog,
  },
  {
    name: "Bump version",
    execute: bumpVersion,
  },
  {
    name: "Prisma generate",
    execute: prismaGenerate,
  },
  {
    name: "Build",
    execute: build,
  },
  {
    name: "Deploy",
    execute: vercelDeploy,
  },
  {
    name: "Git commit & tag",
    execute: gitCommitAndTag,
  },
];

// 入口
runRelease();
