import { nextPreservationBatch } from "../lib/preservation-queue";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../lib/db";
import {
  publishVideo,
  verifyStoredVideo,
  publishingEnabled,
} from "../lib/storage";
import { heldDir } from "../lib/uploads";
import { cleanupTemporaryFiles } from "../lib/retention";
import { closeDueElections } from "../lib/governance";
// Run exactly one worker on the same host and filesystem as the web application.
async function main() {
  await fs.mkdir(heldDir(), { recursive: true });
  const lockPath = path.join(heldDir(), ".preservation-worker.lock");
  try {
    await fs.writeFile(lockPath, String(process.pid), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    const previous = Number(await fs.readFile(lockPath, "utf8"));
    if (!Number.isSafeInteger(previous) || previous <= 0)
      throw Error("Worker lock requires operator inspection.");
    try {
      process.kill(previous, 0);
      throw Error("A preservation worker is already running.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
    await fs.unlink(lockPath);
    await fs.writeFile(lockPath, String(process.pid), {
      flag: "wx",
      mode: 0o600,
    });
  }
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });
  const heartbeat = () =>
    db.runtimeState.upsert({
      where: { id: "preservation-worker" },
      create: {
        id: "preservation-worker",
        value: stopping ? "draining" : "ready",
      },
      update: { value: stopping ? "draining" : "ready" },
    });
  await heartbeat();
  const heartbeatTimer = setInterval(() => {
    void heartbeat().catch(() =>
      console.error("Worker heartbeat update failed."),
    );
  }, 10000);
  heartbeatTimer.unref();
  try {
    // A crash during upload has an uncertain remote outcome. Never send it again automatically.
    await db.video.updateMany({
      where: {
        status: "publishing",
        OR: [{ arweaveTx: null }, { recordTx: null }],
      },
      data: {
        status: "publish_failed",
        publicationError:
          "The preservation worker stopped during an upload. Receipt reconciliation is required before retrying.",
      },
    });
    console.log("Nikki preservation worker ready.");
    while (!stopping) {
      await db.authChallenge.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      await db.rateBucket.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      await closeDueElections();
      await cleanupTemporaryFiles();
      if (publishingEnabled()) {
        const jobs = await nextPreservationBatch();
        for (const job of jobs) {
          if (stopping) break;
          try {
            if (job.status === "publish_queued")
              await publishVideo(job.id, job.creatorId);
            else await verifyStoredVideo(job.id, job.creatorId);
          } catch {
            console.error(
              "Preservation deferred for submission " +
                job.id +
                ". Check its saved status.",
            );
          }
        }
      }
      if (process.argv.includes("--once")) break;
      for (let i = 0; i < 30 && !stopping; i++)
        await new Promise((r) => setTimeout(r, 1000));
    }
  } finally {
    clearInterval(heartbeatTimer);
    await db.runtimeState
      .updateMany({
        where: { id: "preservation-worker" },
        data: { value: "stopped" },
      })
      .catch(() => {});
    await db.$disconnect();
    await fs.unlink(lockPath).catch(() => {});
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Worker startup failed.");
  process.exitCode = 1;
});
