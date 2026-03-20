"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export function AuthControls() {
  const { data, status } = useSession();

  if (status === "loading") {
    return (
      <div className="mb-6 flex w-full items-center justify-end gap-3 text-sm">
        <span className="text-zinc-500">Checking session...</span>
      </div>
    );
  }

  if (!data?.user) {
    return (
      <div className="mb-6 flex w-full items-center justify-end gap-3 text-sm">
        <span className="text-zinc-500">Not signed in</span>
        <Link
          href="/login"
          className="rounded-md border border-zinc-200 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-6 flex w-full items-center justify-end gap-3 text-sm">
      <span className="text-zinc-600">
        Signed in as {data.user.email} ({data.user.tier})
      </span>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: "/" })}
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50"
      >
        Sign out
      </button>
    </div>
  );
}
