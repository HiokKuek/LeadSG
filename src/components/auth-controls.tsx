"use client";

import Link from "next/link";
import {
  SignedIn,
  SignedOut,
  UserButton,
  useUser,
} from "@clerk/nextjs";

export function AuthControls() {
  const { user } = useUser();

  return (
    <>
      <SignedOut>
        <div className="mb-6 flex w-full items-center justify-end gap-3 text-sm">
          <span className="text-zinc-500">Don&apos;t have an account?</span>
          <Link
            href="/sign-up"
            className="rounded-md bg-blue-600 hover:bg-blue-700 px-4 py-2 text-white font-medium transition-colors"
          >
            Sign up free
          </Link>
        </div>
      </SignedOut>
      <SignedIn>
        <div className="mb-6 flex w-full items-center justify-end gap-3 text-sm">
          <span className="text-zinc-600">
            Hello there {user?.firstName || user?.username || "friend"} 👋
          </span>
          <UserButton afterSignOutUrl="/" />
        </div>
      </SignedIn>
    </>
  );
}
