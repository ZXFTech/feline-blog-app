// 获取版本变更类型
// 使用 release / test / dev 规定发布类型，使用年月作为递增版本号，后跟当月第几次发布

import { spawn } from "child_process";
import { cpSync, mkdirSync, rmSync } from "fs";
import path from "path";

try {
  // release-年-月-次数
  const args = process.argv;
  console.log("args", args);
  const buildType = args[2]?.includes("dev") ? "development" : "release";
  console.log("buildType", buildType);
  const date = new Date();
  const dateStr = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
  // const lastVersion = checkVersion(); todo: 接口:获取当月构建次数
  const lastVersion = 0; // 测试阶段，先默认都为 0

  // 本次构建的版本号
  const buildVersion = `${buildType}-${dateStr}-${lastVersion + 1}`;
  const releaseDir = path.join(process.cwd(), `/dist/${buildVersion}`);
  console.log("创建版本文件夹...", releaseDir);
  rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(releaseDir, { recursive: true });
  const distDir = path.join(process.cwd(), "dist", ".next");

  console.log("开始构建 next 项目...");
  const child = spawn("npm", ["run", "next-build"], {
    shell: process.platform === "win32",
  });
  child.on("error", (err) => {
    console.error("Failed to start subprocess." + err);
  });
  // 监听子进程的 stdout 输出
  child.stdout.on("data", (data) => {
    console.log(` ${data}`);
  });
  // 监听子进程的 stderr 输出
  child.stderr.on("data", (data) => {
    console.error(`stderr: ${data}`);
  });
  child.on("close", (code) => {
    if (code !== 0) {
      console.log("构建进程退出码", code);
    } else {
      console.log(`构建完成, 复制产物到${releaseDir}目录下...`);
      cpSync(distDir, releaseDir, { recursive: true });
    }
  });
} catch (error) {
  console.log("构建失败", error);
}
