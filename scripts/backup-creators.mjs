import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
process.umask(0o077);
const directory = path.resolve(".backups/creators");
await fs.mkdir(directory, { recursive: true, mode: 0o700 });
const file = path.join(
  directory,
  new Date().toISOString().replaceAll(":", "-") + ".sql",
);
const command = spawnSync(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "d1",
    "export",
    "nikki-creators",
    "--remote",
    "--output",
    file,
  ],
  { stdio: "pipe", encoding: "utf8" },
);
if (command.status !== 0) {
  await fs.rm(file, { force: true });
  throw Error(
    "Creator database export failed. Check Cloudflare authentication and retry.",
  );
}
await fs.chmod(file, 0o600);
const restored = new DatabaseSync(":memory:");
try {
  restored.exec(await fs.readFile(file, "utf8"));
  if (restored.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw Error("Restore integrity check failed.");
  if (restored.prepare("PRAGMA foreign_key_check").all().length)
    throw Error("Restore has foreign-key violations.");
  const channels = restored
    .prepare("SELECT count(*) AS n FROM creator_profiles")
    .get().n;
  console.log(
    `Private database backup created and restored successfully in an isolated database (${channels} channel records).`,
  );
  console.log(file);
} finally {
  restored.close();
}
