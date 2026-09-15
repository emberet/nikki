import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const source = process.env.DATABASE_URL?.replace(/^file:/, ""),
  target = process.argv[2];
if (!source || !path.isAbsolute(source) || !target || !path.isAbsolute(target))
  throw Error(
    "Use absolute DATABASE_URL and destination: npm run db:backup -- /backup/nikki.db",
  );
if (fs.existsSync(target)) throw Error("Backup destination already exists.");
fs.mkdirSync(path.dirname(target), { recursive: true });
const code =
  "import sqlite3,sys; src=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); dst=sqlite3.connect(sys.argv[2]); src.backup(dst); dst.close(); src.close()";
const result = spawnSync("python3", ["-c", code, source, target], {
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status || 1);
fs.chmodSync(target, 0o600);
console.log(
  "Consistent SQLite backup created. Back up held files and secret configuration separately.",
);
