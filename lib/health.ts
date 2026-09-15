import fs from "fs/promises";
import { db } from "./db";
import { heldDir } from "./uploads";
import { HttpError } from "./http";
export async function workerReady() {
  const worker = await db.runtimeState.findUnique({
    where: { id: "preservation-worker" },
  });
  return (
    !!worker &&
    worker.value === "ready" &&
    Date.now() - worker.updatedAt.getTime() < 90000
  );
}
export async function requireWorkerReady() {
  if (!(await workerReady()))
    throw new HttpError(
      503,
      "Preservation is temporarily unavailable. Please try again after the service resumes.",
    );
}
export async function health() {
  await db.$queryRaw`SELECT 1`;
  const worker = await workerReady();
  await fs.access(heldDir());
  const disk = await fs.statfs(heldDir(), { bigint: true });
  return {
    database: true,
    worker,
    diskAvailable: disk.bavail * disk.bsize > 256_000_000n,
  };
}
