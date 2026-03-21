import { config as loadEnv } from "dotenv";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { fetchPlaceDetails, searchPlaceId } from "@/lib/google-places";
import {
  activeEntities,
  companyContactEnrichment,
  enrichmentInternalQuota,
  enrichmentJobItems,
  enrichmentJobs,
  paymentCodes,
} from "@/lib/schema";

loadEnv({ path: ".env.local" });
loadEnv();

const POLL_INTERVAL_MS = Number.parseInt(process.env.WORKER_POLL_INTERVAL_MS ?? "5000", 10);
const RUN_ONCE = process.env.WORKER_RUN_ONCE === "true";
const CACHE_TTL_DAYS = Number.parseInt(process.env.ENRICHMENT_CACHE_TTL_DAYS ?? "7", 10);
const PROGRESS_LOG_EVERY_ROWS = Number.parseInt(process.env.WORKER_PROGRESS_LOG_EVERY_ROWS ?? "100", 10);

type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, event: string, payload: Record<string, unknown> = {}): void {
  const output = {
    level,
    event,
    ts: new Date().toISOString(),
    ...payload,
  };

  if (level === "error") {
    console.error(JSON.stringify(output));
    return;
  }

  if (level === "warn") {
    console.warn(JSON.stringify(output));
    return;
  }

  console.log(JSON.stringify(output));
}

type ClaimedJob = {
  id: string;
  userId: string;
  paymentCodeId: number | null;
  initiatedByAdmin: boolean;
  ssicList: string[];
  reservedPaidCalls: number;
};

type CandidateRow = {
  uen: string;
  entityName: string;
  streetName: string;
  primarySsicCode: string;
};

function getExpiryDate(): Date {
  return new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function releaseUnusedReservation(
  job: ClaimedJob,
  consumedPaidCalls: number,
): Promise<void> {
  const unused = Math.max(job.reservedPaidCalls - consumedPaidCalls, 0);
  if (unused === 0) {
    log("info", "worker.reservation.release.skipped", {
      jobId: job.id,
      consumedPaidCalls,
      reservedPaidCalls: job.reservedPaidCalls,
    });
    return;
  }

  const db = getDb();

  if (job.paymentCodeId) {
    await db
      .update(paymentCodes)
      .set({
        remainingDetailCalls: sql`${paymentCodes.remainingDetailCalls} + ${unused}`,
        updatedAt: new Date(),
      })
      .where(eq(paymentCodes.id, job.paymentCodeId));
  }

  if (job.initiatedByAdmin) {
    await db
      .update(enrichmentInternalQuota)
      .set({
        remainingDetailCalls: sql`${enrichmentInternalQuota.remainingDetailCalls} + ${unused}`,
        updatedAt: new Date(),
      })
      .where(eq(enrichmentInternalQuota.id, 1));
  }

  log("info", "worker.reservation.released", {
    jobId: job.id,
    paymentCodeId: job.paymentCodeId,
    initiatedByAdmin: job.initiatedByAdmin,
    consumedPaidCalls,
    reservedPaidCalls: job.reservedPaidCalls,
    releasedUnusedCalls: unused,
  });
}

async function claimNextJob(): Promise<ClaimedJob | null> {
  const db = getDb();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const queued = await db
      .select({
        id: enrichmentJobs.id,
        userId: enrichmentJobs.userId,
        paymentCodeId: enrichmentJobs.paymentCodeId,
        initiatedByAdmin: enrichmentJobs.initiatedByAdmin,
        ssicList: enrichmentJobs.ssicList,
        reservedPaidCalls: enrichmentJobs.reservedPaidCalls,
      })
      .from(enrichmentJobs)
      .where(eq(enrichmentJobs.status, "queued"))
      .orderBy(asc(enrichmentJobs.createdAt))
      .limit(1);

    const next = queued[0];
    if (!next) {
      return null;
    }

    log("info", "worker.claim.attempt", {
      attempt: attempt + 1,
      jobId: next.id,
      userId: next.userId,
      reservedPaidCalls: next.reservedPaidCalls,
      ssicCount: next.ssicList.length,
    });

    const claimed = await db
      .update(enrichmentJobs)
      .set({
        status: "running",
        startedAt: new Date(),
        errorMessage: null,
        stopReason: null,
      })
      .where(and(eq(enrichmentJobs.id, next.id), eq(enrichmentJobs.status, "queued")))
      .returning({ id: enrichmentJobs.id });

    if (claimed.length > 0) {
      log("info", "worker.claim.success", {
        attempt: attempt + 1,
        jobId: next.id,
      });
      return next;
    }

    log("warn", "worker.claim.race_lost", {
      attempt: attempt + 1,
      jobId: next.id,
    });
  }

  return null;
}

async function getCandidates(ssicList: string[]): Promise<CandidateRow[]> {
  const db = getDb();

  return db
    .select({
      uen: activeEntities.uen,
      entityName: activeEntities.entityName,
      streetName: activeEntities.streetName,
      primarySsicCode: activeEntities.primarySsicCode,
    })
    .from(activeEntities)
    .where(inArray(activeEntities.primarySsicCode, ssicList))
    .orderBy(asc(activeEntities.entityName));
}

async function processJob(job: ClaimedJob): Promise<void> {
  const db = getDb();
  const now = new Date();
  const candidates = await getCandidates(job.ssicList);

  log("info", "worker.job.started", {
    jobId: job.id,
    userId: job.userId,
    paymentCodeId: job.paymentCodeId,
    initiatedByAdmin: job.initiatedByAdmin,
    ssicList: job.ssicList,
    candidateCount: candidates.length,
    reservedPaidCalls: job.reservedPaidCalls,
  });

  if (candidates.length === 0) {
    await db
      .update(enrichmentJobs)
      .set({
        status: "completed",
        processedRows: 0,
        cacheHitCount: 0,
        phonesFoundCount: 0,
        websitesFoundCount: 0,
        consumedPaidCalls: 0,
        finishedAt: new Date(),
      })
      .where(eq(enrichmentJobs.id, job.id));

    log("info", "worker.job.completed.no_candidates", {
      jobId: job.id,
      status: "completed",
      candidateCount: 0,
    });
    return;
  }

  await db.delete(enrichmentJobItems).where(eq(enrichmentJobItems.jobId, job.id));

  await db
    .insert(enrichmentJobItems)
    .values(candidates.map((row) => ({
      jobId: job.id,
      uen: row.uen,
      primarySsicCode: row.primarySsicCode,
      status: "pending",
    })));

  let consumedPaidCalls = 0;
  let processedRows = 0;
  let cacheHitCount = 0;
  let phonesFoundCount = 0;
  let websitesFoundCount = 0;
  let partialStopped = false;

  for (const row of candidates) {
    const freshCacheRows = await db
      .select({
        uen: companyContactEnrichment.uen,
        nationalPhoneNumber: companyContactEnrichment.nationalPhoneNumber,
        internationalPhoneNumber: companyContactEnrichment.internationalPhoneNumber,
        websiteUri: companyContactEnrichment.websiteUri,
      })
      .from(companyContactEnrichment)
      .where(and(
        eq(companyContactEnrichment.uen, row.uen),
        eq(companyContactEnrichment.status, "ok"),
        gt(companyContactEnrichment.expiresAt, now),
      ))
      .limit(1);

    const cached = freshCacheRows[0];

    if (cached) {
      await db
        .update(enrichmentJobItems)
        .set({
          cacheHit: true,
          status: "ok",
          searchStatus: "ok",
          detailsStatus: "ok",
          updatedAt: new Date(),
        })
        .where(and(eq(enrichmentJobItems.jobId, job.id), eq(enrichmentJobItems.uen, row.uen)));

      processedRows += 1;
      cacheHitCount += 1;
      if (cached.nationalPhoneNumber || cached.internationalPhoneNumber) {
        phonesFoundCount += 1;
      }
      if (cached.websiteUri) {
        websitesFoundCount += 1;
      }

      if (processedRows % PROGRESS_LOG_EVERY_ROWS === 0 || processedRows === candidates.length) {
        log("info", "worker.job.progress", {
          jobId: job.id,
          processedRows,
          totalRows: candidates.length,
          cacheHitCount,
          consumedPaidCalls,
          phonesFoundCount,
          websitesFoundCount,
        });
      }
      continue;
    }

    const search = await searchPlaceId(row.entityName, row.streetName);

    if (!search.placeId) {
      await db
        .insert(companyContactEnrichment)
        .values({
          uen: row.uen,
          status: "failed",
          errorStage: "search_text",
          errorCode: search.errorCode,
          errorMessage: search.errorMessage,
          attemptsSearch: search.attempts,
          attemptsDetails: 0,
          lastUpdatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: companyContactEnrichment.uen,
          set: {
            status: "failed",
            errorStage: "search_text",
            errorCode: search.errorCode,
            errorMessage: search.errorMessage,
            attemptsSearch: search.attempts,
            attemptsDetails: 0,
            lastUpdatedAt: new Date(),
          },
        });

      await db
        .update(enrichmentJobItems)
        .set({
          cacheHit: false,
          status: "failed",
          searchStatus: "failed",
          detailsStatus: "failed",
          attemptsSearch: search.attempts,
          attemptsDetails: 0,
          errorCode: search.errorCode,
          errorMessage: search.errorMessage,
          updatedAt: new Date(),
        })
        .where(and(eq(enrichmentJobItems.jobId, job.id), eq(enrichmentJobItems.uen, row.uen)));

      processedRows += 1;

      log("warn", "worker.job.row.search_failed", {
        jobId: job.id,
        uen: row.uen,
        entityName: row.entityName,
        attemptsSearch: search.attempts,
        errorCode: search.errorCode,
        errorMessage: search.errorMessage,
        processedRows,
        totalRows: candidates.length,
      });

      if (processedRows % PROGRESS_LOG_EVERY_ROWS === 0 || processedRows === candidates.length) {
        log("info", "worker.job.progress", {
          jobId: job.id,
          processedRows,
          totalRows: candidates.length,
          cacheHitCount,
          consumedPaidCalls,
          phonesFoundCount,
          websitesFoundCount,
        });
      }
      continue;
    }

    if (job.reservedPaidCalls > 0 && consumedPaidCalls >= job.reservedPaidCalls) {
      await db
        .update(enrichmentJobItems)
        .set({
          status: "skipped",
          searchStatus: "ok",
          detailsStatus: "failed",
          attemptsSearch: search.attempts,
          attemptsDetails: 0,
          errorCode: "BUDGET_EXHAUSTED",
          errorMessage: "Reserved paid calls exhausted.",
          updatedAt: new Date(),
        })
        .where(and(eq(enrichmentJobItems.jobId, job.id), eq(enrichmentJobItems.uen, row.uen)));

      processedRows += 1;
      partialStopped = true;

      log("warn", "worker.job.partial_stopped_budget", {
        jobId: job.id,
        uen: row.uen,
        consumedPaidCalls,
        reservedPaidCalls: job.reservedPaidCalls,
        processedRows,
        totalRows: candidates.length,
      });
      break;
    }

    const details = await fetchPlaceDetails(search.placeId);
    consumedPaidCalls += 1;

    const hasPhone = Boolean(details.nationalPhoneNumber || details.internationalPhoneNumber);
    const hasWebsite = Boolean(details.websiteUri);
    const isSuccess = !details.errorCode;

    await db
      .insert(companyContactEnrichment)
      .values({
        uen: row.uen,
        placeId: search.placeId,
        foundName: details.foundName,
        nationalPhoneNumber: details.nationalPhoneNumber,
        internationalPhoneNumber: details.internationalPhoneNumber,
        websiteUri: details.websiteUri,
        formattedAddress: details.formattedAddress,
        status: isSuccess ? "ok" : "failed",
        errorStage: isSuccess ? null : "place_details",
        errorCode: details.errorCode,
        errorMessage: details.errorMessage,
        attemptsSearch: search.attempts,
        attemptsDetails: details.attempts,
        lastSuccessAt: isSuccess ? new Date() : null,
        expiresAt: isSuccess ? getExpiryDate() : null,
        lastUpdatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: companyContactEnrichment.uen,
        set: {
          placeId: search.placeId,
          foundName: details.foundName,
          nationalPhoneNumber: details.nationalPhoneNumber,
          internationalPhoneNumber: details.internationalPhoneNumber,
          websiteUri: details.websiteUri,
          formattedAddress: details.formattedAddress,
          status: isSuccess ? "ok" : "failed",
          errorStage: isSuccess ? null : "place_details",
          errorCode: details.errorCode,
          errorMessage: details.errorMessage,
          attemptsSearch: search.attempts,
          attemptsDetails: details.attempts,
          lastSuccessAt: isSuccess ? new Date() : null,
          expiresAt: isSuccess ? getExpiryDate() : null,
          lastUpdatedAt: new Date(),
        },
      });

    await db
      .update(enrichmentJobItems)
      .set({
        cacheHit: false,
        status: isSuccess ? "ok" : "failed",
        searchStatus: "ok",
        detailsStatus: isSuccess ? "ok" : "failed",
        attemptsSearch: search.attempts,
        attemptsDetails: details.attempts,
        costUnits: 1,
        errorCode: details.errorCode,
        errorMessage: details.errorMessage,
        updatedAt: new Date(),
      })
      .where(and(eq(enrichmentJobItems.jobId, job.id), eq(enrichmentJobItems.uen, row.uen)));

    processedRows += 1;

    if (hasPhone) {
      phonesFoundCount += 1;
    }

    if (hasWebsite) {
      websitesFoundCount += 1;
    }

    if (!isSuccess) {
      log("warn", "worker.job.row.details_failed", {
        jobId: job.id,
        uen: row.uen,
        placeId: search.placeId,
        attemptsSearch: search.attempts,
        attemptsDetails: details.attempts,
        errorCode: details.errorCode,
        errorMessage: details.errorMessage,
        processedRows,
        totalRows: candidates.length,
      });
    }

    if (processedRows % PROGRESS_LOG_EVERY_ROWS === 0 || processedRows === candidates.length) {
      log("info", "worker.job.progress", {
        jobId: job.id,
        processedRows,
        totalRows: candidates.length,
        cacheHitCount,
        consumedPaidCalls,
        phonesFoundCount,
        websitesFoundCount,
      });
    }
  }

  const finalStatus = partialStopped ? "partial_stopped_budget" : "completed";

  await db
    .update(enrichmentJobs)
    .set({
      status: finalStatus,
      consumedPaidCalls,
      processedRows,
      cacheHitCount,
      phonesFoundCount,
      websitesFoundCount,
      stopReason: partialStopped ? "BUDGET_EXHAUSTED" : null,
      finishedAt: new Date(),
    })
    .where(eq(enrichmentJobs.id, job.id));

  log("info", "worker.job.completed", {
    jobId: job.id,
    status: finalStatus,
    processedRows,
    totalRows: candidates.length,
    cacheHitCount,
    consumedPaidCalls,
    phonesFoundCount,
    websitesFoundCount,
    stopReason: partialStopped ? "BUDGET_EXHAUSTED" : null,
  });

  await releaseUnusedReservation(job, consumedPaidCalls);
}

async function processClaimedJob(job: ClaimedJob): Promise<void> {
  const db = getDb();

  try {
    await processJob(job);
  } catch (error) {
    const message = (error as Error).message;

    await db
      .update(enrichmentJobs)
      .set({
        status: "failed",
        errorMessage: message,
        stopReason: "PROCESSING_ERROR",
        finishedAt: new Date(),
      })
      .where(eq(enrichmentJobs.id, job.id));

    await releaseUnusedReservation(job, 0);

    log("error", "worker.job.failed", {
      jobId: job.id,
      userId: job.userId,
      paymentCodeId: job.paymentCodeId,
      initiatedByAdmin: job.initiatedByAdmin,
      errorMessage: message,
    });
  }
}

export async function runWorkerLoop(): Promise<void> {
  log("info", "worker.loop.started", {
    pollIntervalMs: POLL_INTERVAL_MS,
    runOnce: RUN_ONCE,
    cacheTtlDays: CACHE_TTL_DAYS,
    progressLogEveryRows: PROGRESS_LOG_EVERY_ROWS,
  });

  while (true) {
    const job = await claimNextJob();

    if (!job) {
      if (RUN_ONCE) {
        log("info", "worker.loop.completed_run_once_no_job");
        return;
      }

      log("info", "worker.loop.idle", {
        sleepMs: POLL_INTERVAL_MS,
      });

      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    log("info", "worker.loop.processing_job", {
      jobId: job.id,
      userId: job.userId,
      paymentCodeId: job.paymentCodeId,
      initiatedByAdmin: job.initiatedByAdmin,
      reservedPaidCalls: job.reservedPaidCalls,
      ssicList: job.ssicList,
    });

    await processClaimedJob(job);

    if (RUN_ONCE) {
      log("info", "worker.loop.completed_run_once_after_job", {
        jobId: job.id,
      });
      return;
    }
  }
}

void runWorkerLoop();
