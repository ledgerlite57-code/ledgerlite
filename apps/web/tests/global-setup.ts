import { spawnSync } from "child_process";

function run(command: string, args: string[], cwd?: string) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd, shell: true });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

export default async function globalSetup() {
  if (process.env.PW_SKIP_SEED) {
    return;
  }
  run("pnpm", ["--filter", "@ledgerlite/api", "db:seed"], process.cwd());
}
