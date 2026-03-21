import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import {
  enrichmentPreflightRequests,
  enrichmentJobItems,
  enrichmentJobs,
  paymentCodeRedemptions,
  paymentCodes,
} from "@/lib/schema";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  const requestRows = await db
    .select({
      id: enrichmentPreflightRequests.id,
      paymentCodeId: enrichmentPreflightRequests.paymentCodeId,
    })
    .from(enrichmentPreflightRequests)
    .where(eq(enrichmentPreflightRequests.id, id))
    .limit(1);

  const preflightRequest = requestRows[0];
  if (!preflightRequest) {
    return NextResponse.json({ error: "Preflight request not found." }, { status: 404 });
  }

  try {
    await db.transaction(async (tx) => {
      const linkedJobs = await tx
        .select({ id: enrichmentJobs.id })
        .from(enrichmentJobs)
        .where(eq(enrichmentJobs.preflightRequestId, id));

      const jobIds = linkedJobs.map((row) => row.id);
      if (jobIds.length > 0) {
        await tx
          .delete(enrichmentJobItems)
          .where(inArray(enrichmentJobItems.jobId, jobIds));

        await tx
          .delete(enrichmentJobs)
          .where(inArray(enrichmentJobs.id, jobIds));
      }

      const linkedCodes = await tx
        .select({ id: paymentCodes.id })
        .from(paymentCodes)
        .where(eq(paymentCodes.preflightRequestId, id));

      const paymentCodeIds = new Set<number>(linkedCodes.map((row) => row.id));
      if (preflightRequest.paymentCodeId) {
        paymentCodeIds.add(preflightRequest.paymentCodeId);
      }

      const paymentCodeIdList = Array.from(paymentCodeIds);
      if (paymentCodeIdList.length > 0) {
        await tx
          .delete(paymentCodeRedemptions)
          .where(inArray(paymentCodeRedemptions.paymentCodeId, paymentCodeIdList));

        await tx
          .delete(paymentCodes)
          .where(inArray(paymentCodes.id, paymentCodeIdList));
      }

      const deleted = await tx
        .delete(enrichmentPreflightRequests)
        .where(eq(enrichmentPreflightRequests.id, id))
        .returning({ id: enrichmentPreflightRequests.id });

      if (deleted.length === 0) {
        throw new Error("REQUEST_DELETE_CONFLICT");
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_DELETE_CONFLICT") {
      return NextResponse.json(
        { error: "Request no longer exists and cannot be deleted." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Unable to delete pending request." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    requestId: id,
    deleted: true,
  });
}
