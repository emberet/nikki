import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const url = process.env.DATABASE_URL;
if (!url?.startsWith("file:/"))
  throw Error(
    "Deployment requires an absolute persistent SQLite DATABASE_URL.",
  );
if (!process.env.APP_URL?.startsWith("https://"))
  throw Error("Deployment requires an HTTPS APP_URL.");
if (process.env.RELEASE_MODE !== "founder")
  throw Error("This release package supports the founder launch only.");
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
  throw Error("Set a strong SESSION_SECRET.");
if (!process.env.HELD_DIR || !path.isAbsolute(process.env.HELD_DIR))
  throw Error("Set an absolute persistent HELD_DIR.");
const databasePath = url.slice(5);
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
fs.mkdirSync(process.env.HELD_DIR, { recursive: true });
const fd = fs.openSync(databasePath, "a", 0o600);
fs.closeSync(fd);
const migration = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { stdio: "inherit", env: process.env },
);
if (migration.status !== 0) process.exit(migration.status || 1);
await import("./start-production.mjs");
