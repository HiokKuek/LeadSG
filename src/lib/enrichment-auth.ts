import { auth, currentUser } from "@clerk/nextjs/server";

export type AuthenticatedUser = {
  id: string;
  email: string;
  tier: string;
  role: string;
  isAdmin: boolean;
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const user = await currentUser();
  if (!user) {
    return null;
  }

  const metadata = user.publicMetadata as { tier?: string } | undefined;
  const tier = metadata?.tier ?? "free";
  const role = typeof user.publicMetadata?.role === "string"
    ? user.publicMetadata.role
    : "user";
  const primaryEmail = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  )?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? "";

  return {
    id: userId,
    email: primaryEmail,
    tier,
    role,
    isAdmin: role === "admin",
  };
}
