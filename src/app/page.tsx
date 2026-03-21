import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";

import { AuthControls } from "@/components/auth-controls";
import { CompanyEnrichmentFaq } from "@/components/company-enrichment-faq";
import { EnrichmentControls } from "@/components/enrichment-controls";
import { SearchPanelFallback } from "@/components/search-panel-fallback";
import { SearchPanel } from "@/components/search-panel";

export default async function Home() {
  const { userId } = await auth();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center px-4 py-10 sm:px-6 sm:py-24">
      <AuthControls />
      
      <header className="mb-10 w-full text-center sm:mb-12">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
          LeadSG 📞
        </h1>
        <p className="mt-3 text-base text-zinc-600 sm:text-lg">
          Search for live companies in Singapore. 
        </p>
      </header>

      <Suspense fallback={<SearchPanelFallback />}>
        <SearchPanel />
      </Suspense>

      {!userId && (
        <div className="mt-8 w-full max-w-2xl mx-auto text-center">
          <p className="text-base text-zinc-500 mb-4">
            Sign up to unlock advanced features like contact enrichment and bulk data export.
          </p>
          <Link
            href="/sign-up"
            className="inline-block rounded-lg bg-blue-600 hover:bg-blue-700 px-6 py-2.5 text-base font-semibold text-white transition-colors sm:px-8 sm:py-3 sm:text-lg"
          >
            Get Started Free →
          </Link>
        </div>
      )}

      {userId ? <EnrichmentControls /> : null}

      <CompanyEnrichmentFaq />

      <footer className="mt-auto pt-8 w-full text-center text-sm text-zinc-500">
        Built by HiokKuek {new Date().getFullYear()} <span className="inline-block animate-pulse-heart">💛</span>
      </footer>
    </main>
  );
}
