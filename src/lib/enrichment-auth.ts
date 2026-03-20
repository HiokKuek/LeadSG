import type { NextRequest } from "next/server";

import { getDb } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";

export type AuthenticatedUser = {
  id: number;
  email: string;
  tier: string;
  isActive: boolean;
};

export async function getAuthenticatedUser(
  request: NextRequest,
): Promise<AuthenticatedUser | null> {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return null;
  }

  const userId = Number.parseInt(userIdHeader, 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    return null;
  }

  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      tier: users.tier,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = rows[0];
  if (!user || !user.isActive) {
    return null;
  }

  return user;
}
