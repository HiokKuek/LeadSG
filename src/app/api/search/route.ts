import { asc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { activeEntities } from "@/lib/schema";
import type { EntitySearchResult } from "@/lib/types";

const ssicSchema = z.string().regex(/^\d{5}$/);
const pageSchema = z.coerce.number().int().min(1);
const PAGE_SIZE = 50;

type SearchResponse = {
  data: EntitySearchResult[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalMatching: number;
  };
  totals: {
    liveCompanies: number;
  };
};

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const db = getDb();
  const query = request.nextUrl.searchParams.get("ssic")?.trim();
  const pageQuery = request.nextUrl.searchParams.get("page") ?? "1";
  const parsedPage = pageSchema.safeParse(pageQuery);

  if (!parsedPage.success) {
    return NextResponse.json(
      { error: "Invalid page. Expected a positive integer." },
      { status: 400 },
    );
  }

  const liveCountRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activeEntities);
  const liveCompanies = liveCountRows[0]?.count ?? 0;

  if (!query) {
    return NextResponse.json<SearchResponse>({
      data: [],
      pagination: {
        page: 1,
        pageSize: PAGE_SIZE,
        totalPages: 0,
        totalMatching: 0,
      },
      totals: {
        liveCompanies,
      },
    });
  }

  const parsed = ssicSchema.safeParse(query);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid SSIC code. Expected exactly 5 digits." },
      { status: 400 },
    );
  }

  const matchingCountRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activeEntities)
    .where(eq(activeEntities.primarySsicCode, parsed.data));

  const totalMatching = matchingCountRows[0]?.count ?? 0;
  const totalPages = totalMatching > 0 ? Math.ceil(totalMatching / PAGE_SIZE) : 0;
  const requestedPage = parsedPage.data;
  const page =
    totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await db
    .select({
      uen: activeEntities.uen,
      entityName: activeEntities.entityName,
      streetName: activeEntities.streetName,
      primarySsicCode: activeEntities.primarySsicCode,
      entityStatusDescription: activeEntities.entityStatusDescription,
    })
    .from(activeEntities)
    .where(eq(activeEntities.primarySsicCode, parsed.data))
    .orderBy(asc(activeEntities.entityName))
    .limit(PAGE_SIZE)
    .offset(offset);

  return NextResponse.json<SearchResponse>({
    data: rows,
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      totalPages,
      totalMatching,
    },
    totals: {
      liveCompanies,
    },
  });
}
