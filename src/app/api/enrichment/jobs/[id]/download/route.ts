import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import {
  activeEntities,
  companyContactEnrichment,
  enrichmentJobItems,
  enrichmentJobs,
} from "@/lib/schema";

export const runtime = "nodejs";

const EXPORT_BATCH_SIZE = 500;

function csvEscape(value: string | null | undefined): string {
  const normalized = value ?? "";
  if (normalized.includes(",") || normalized.includes("\n") || normalized.includes("\"")) {
    return `"${normalized.replaceAll("\"", "\"\"")}"`;
  }
  return normalized;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  const jobs = await db
    .select({
      id: enrichmentJobs.id,
      userId: enrichmentJobs.userId,
      status: enrichmentJobs.status,
    })
    .from(enrichmentJobs)
    .where(eq(enrichmentJobs.id, id))
    .limit(1);

  const job = jobs[0];
  if (!job) {
    return NextResponse.json({ error: "Enrichment job not found." }, { status: 404 });
  }

  if (!user.isAdmin && job.userId !== user.id) {
    return NextResponse.json({ error: "Enrichment job not found." }, { status: 404 });
  }

  if (!["completed", "partial_stopped_budget"].includes(job.status)) {
    return NextResponse.json(
      { error: "CSV export is available after job completion." },
      { status: 409 },
    );
  }

  const header = [
    "uen",
    "entity_name",
    "street_name",
    "primary_ssic_code",
    "place_id",
    "found_name",
    "national_phone_number",
    "international_phone_number",
    "website_uri",
    "formatted_address",
    "enrichment_status",
    "error_code",
    "error_message",
  ].join(",") + "\n";

  let offset = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(header));

      while (true) {
        const rows = await db
          .select({
            uen: enrichmentJobItems.uen,
            entityName: activeEntities.entityName,
            streetName: activeEntities.streetName,
            primarySsicCode: enrichmentJobItems.primarySsicCode,
            placeId: companyContactEnrichment.placeId,
            foundName: companyContactEnrichment.foundName,
            nationalPhoneNumber: companyContactEnrichment.nationalPhoneNumber,
            internationalPhoneNumber: companyContactEnrichment.internationalPhoneNumber,
            websiteUri: companyContactEnrichment.websiteUri,
            formattedAddress: companyContactEnrichment.formattedAddress,
            enrichmentStatus: enrichmentJobItems.status,
            errorCode: enrichmentJobItems.errorCode,
            errorMessage: enrichmentJobItems.errorMessage,
          })
          .from(enrichmentJobItems)
          .leftJoin(activeEntities, eq(activeEntities.uen, enrichmentJobItems.uen))
          .leftJoin(companyContactEnrichment, eq(companyContactEnrichment.uen, enrichmentJobItems.uen))
          .where(and(eq(enrichmentJobItems.jobId, id)))
          .orderBy(asc(enrichmentJobItems.id))
          .limit(EXPORT_BATCH_SIZE)
          .offset(offset);

        if (rows.length === 0) {
          break;
        }

        const csvChunk = rows.map((row) => [
          csvEscape(row.uen),
          csvEscape(row.entityName),
          csvEscape(row.streetName),
          csvEscape(row.primarySsicCode),
          csvEscape(row.placeId),
          csvEscape(row.foundName),
          csvEscape(row.nationalPhoneNumber),
          csvEscape(row.internationalPhoneNumber),
          csvEscape(row.websiteUri),
          csvEscape(row.formattedAddress),
          csvEscape(row.enrichmentStatus),
          csvEscape(row.errorCode),
          csvEscape(row.errorMessage),
        ].join(",")).join("\n") + "\n";

        controller.enqueue(encoder.encode(csvChunk));
        offset += rows.length;
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="enrichment-job-${id}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
