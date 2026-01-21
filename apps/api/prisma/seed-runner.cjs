const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const apiRoot = path.resolve(__dirname, "..");

const run = (cmd, args, cwd) => {
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd, shell: true });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const buildResult = spawnSync("pnpm", ["--filter", "@ledgerlite/shared", "build"], {
  stdio: "inherit",
  cwd: repoRoot,
  shell: true,
});
if (buildResult.status !== 0) {
  console.warn("Shared build failed, continuing with existing artifacts.");
}
run("pnpm", ["exec", "ts-node", "prisma/seed.ts"], apiRoot);
