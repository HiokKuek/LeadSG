import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import { activeEntities, companyContactEnrichment } from "@/lib/schema";
import type { EnrichmentResultsResponse } from "@/lib/types";

const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(200).default(50);

export const runtime = "nodejs";

function parseSsicCodes(raw: string | null): string[] {
  if (!raw) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => /^\d{5}$/.test(value)),
    ),
  );
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const ssicCodes = parseSsicCodes(request.nextUrl.searchParams.get("ssic"));
  if (ssicCodes.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one SSIC code via ?ssic=62011,62012" },
      { status: 400 },
    );
  }

  const parsedPage = pageSchema.safeParse(request.nextUrl.searchParams.get("page") ?? "1");
  const parsedPageSize = pageSizeSchema.safeParse(
    request.nextUrl.searchParams.get("pageSize") ?? "50",
  );

  if (!parsedPage.success || !parsedPageSize.success) {
    return NextResponse.json({ error: "Invalid pagination parameters." }, { status: 400 });
  }

  const page = parsedPage.data;
  const pageSize = parsedPageSize.data;
  const offset = (page - 1) * pageSize;

  const db = getDb();

  const totalRows = await db
    .select({ count: sql<number>`count(distinct ${activeEntities.uen})::int` })
    .from(activeEntities)
    .where(inArray(activeEntities.primarySsicCode, ssicCodes));

  const rows = await db
    .select({
      uen: activeEntities.uen,
      entityName: activeEntities.entityName,
      streetName: activeEntities.streetName,
      primarySsicCode: activeEntities.primarySsicCode,
      placeId: companyContactEnrichment.placeId,
      foundName: companyContactEnrichment.foundName,
      nationalPhoneNumber: companyContactEnrichment.nationalPhoneNumber,
      internationalPhoneNumber: companyContactEnrichment.internationalPhoneNumber,
      websiteUri: companyContactEnrichment.websiteUri,
      formattedAddress: companyContactEnrichment.formattedAddress,
      enrichmentStatus: companyContactEnrichment.status,
      lastUpdatedAt: companyContactEnrichment.lastUpdatedAt,
    })
    .from(activeEntities)
    .leftJoin(
      companyContactEnrichment,
      and(
        eq(companyContactEnrichment.uen, activeEntities.uen),
      ),
    )
    .where(inArray(activeEntities.primarySsicCode, ssicCodes))
    .orderBy(asc(activeEntities.entityName))
    .limit(pageSize)
    .offset(offset);

  const response: EnrichmentResultsResponse = {
    data: rows.map((row) => ({
      uen: row.uen,
      entityName: row.entityName,
      streetName: row.streetName,
      primarySsicCode: row.primarySsicCode,
      placeId: row.placeId,
      foundName: row.foundName,
      nationalPhoneNumber: row.nationalPhoneNumber,
      internationalPhoneNumber: row.internationalPhoneNumber,
      websiteUri: row.websiteUri,
      formattedAddress: row.formattedAddress,
      enrichmentStatus: row.enrichmentStatus ?? "pending",
      lastUpdatedAt: row.lastUpdatedAt ? row.lastUpdatedAt.toISOString() : new Date(0).toISOString(),
    })),
    totalMatching: totalRows[0]?.count ?? 0,
  };

  return NextResponse.json(response);
}
