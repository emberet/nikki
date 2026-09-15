import { spawn } from "node:child_process";
const children = [];
let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(
    () => {
      for (const child of children) child.kill("SIGKILL");
    },
    Number(process.env.SHUTDOWN_GRACE_MS || 900000),
  );
  timer.unref();
  process.exitCode = code;
}
function start(args) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });
  children.push(child);
  child.on("error", () => shutdown(1));
  child.on("exit", (code) => {
    if (!closing) shutdown(code || 1);
  });
}
start(["node_modules/next/dist/bin/next", "start"]);
start([
  "--env-file-if-exists=.env",
  "--import",
  "tsx",
  "scripts/preservation-worker.ts",
]);
process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());
