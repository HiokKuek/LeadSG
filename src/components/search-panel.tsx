"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EntitySearchResult } from "@/lib/types";

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
    lastUpdatedAt: string | null;
  };
};

const ssicParser = parseAsString.withDefault("");
const pageParser = parseAsInteger.withDefault(1);
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_VERSION = "v2";
const SEARCH_CACHE_PREFIX = `leadsg:${CACHE_VERSION}:search:`;
const SUMMARY_CACHE_KEY = `leadsg:${CACHE_VERSION}:summary`;

type CachedSearchPayload = {
  payload: SearchResponse;
  cachedAt: number;
};

type CachedSummaryPayload = {
  liveCompanies: number;
  lastUpdatedAt: string | null;
  cachedAt: number;
};

const isFresh = (cachedAt: number) => Date.now() - cachedAt < CACHE_TTL_MS;

function getSearchCacheKey(ssic: string, page: number) {
  return `${SEARCH_CACHE_PREFIX}${ssic}:${page}`;
}

function readSessionStorage<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeSessionStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

export function SearchPanel() {
  const [ssic, setSsic] = useQueryState("ssic", ssicParser);
  const [page, setPage] = useQueryState("page", pageParser);
  const [rows, setRows] = useState<EntitySearchResult[]>([]);
  const [totalLiveCompanies, setTotalLiveCompanies] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [totalMatching, setTotalMatching] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeSsicRef = useRef("");
  const rowCountRef = useRef(0);

  const normalizedSsic = useMemo(() => ssic.trim(), [ssic]);
  const isValidSsic = /^\d{5}$/.test(normalizedSsic);

  const applyPayload = useCallback((payload: SearchResponse) => {
    setRows(payload.data);
    rowCountRef.current = payload.data.length;
    setTotalLiveCompanies(payload.totals.liveCompanies);
    setLastUpdatedAt(payload.totals.lastUpdatedAt);
    setTotalMatching(payload.pagination.totalMatching);
    setTotalPages(payload.pagination.totalPages);
    setPageSize(payload.pagination.pageSize);
  }, []);

  const upsertSummaryCache = useCallback((
    liveCompanies: number,
    lastUpdatedAtValue: string | null,
  ) => {
    writeSessionStorage<CachedSummaryPayload>(SUMMARY_CACHE_KEY, {
      liveCompanies,
      lastUpdatedAt: lastUpdatedAtValue,
      cachedAt: Date.now(),
    });
  }, []);

  const prefetchPage = useCallback(async (
    ssicValue: string,
    pageToPrefetch: number,
    maxPage: number,
  ) => {
    if (pageToPrefetch < 1 || pageToPrefetch > maxPage) {
      return;
    }

    const cacheKey = getSearchCacheKey(ssicValue, pageToPrefetch);
    const cached = readSessionStorage<CachedSearchPayload>(cacheKey);
    if (cached && isFresh(cached.cachedAt)) {
      return;
    }

    try {
      const response = await fetch(
        `/api/search?ssic=${encodeURIComponent(ssicValue)}&page=${pageToPrefetch}`,
      );
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as SearchResponse;
      writeSessionStorage<CachedSearchPayload>(cacheKey, {
        payload,
        cachedAt: Date.now(),
      });
      upsertSummaryCache(payload.totals.liveCompanies, payload.totals.lastUpdatedAt);
    } catch {
      return;
    }
  }, [upsertSummaryCache]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchTotals = async () => {
      const cachedSummary = readSessionStorage<CachedSummaryPayload>(
        SUMMARY_CACHE_KEY,
      );
      if (cachedSummary && isFresh(cachedSummary.cachedAt)) {
        setTotalLiveCompanies(cachedSummary.liveCompanies);
        setLastUpdatedAt(cachedSummary.lastUpdatedAt);
        return;
      }

      try {
        const response = await fetch("/api/search", {
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as SearchResponse;
        setTotalLiveCompanies(payload.totals.liveCompanies);
        setLastUpdatedAt(payload.totals.lastUpdatedAt);
        upsertSummaryCache(payload.totals.liveCompanies, payload.totals.lastUpdatedAt);
      } catch (fetchError) {
        if ((fetchError as Error).name === "AbortError") {
          return;
        }
      }
    };

    void fetchTotals();

    return () => {
      controller.abort();
    };
  }, [upsertSummaryCache]);

  useEffect(() => {
    const controller = new AbortController();

    const runSearch = async () => {
      if (!isValidSsic) {
        setRows([]);
        rowCountRef.current = 0;
        setTotalMatching(0);
        setTotalPages(0);
        activeSsicRef.current = "";
        setIsLoadingInitial(false);
        setIsLoadingPage(false);
        return;
      }

      const searchCacheKey = getSearchCacheKey(normalizedSsic, page);
      const cached = readSessionStorage<CachedSearchPayload>(searchCacheKey);
      if (cached && isFresh(cached.cachedAt)) {
        applyPayload(cached.payload);
        activeSsicRef.current = normalizedSsic;
        setError(null);
        if (cached.payload.pagination.page !== page) {
          void setPage(cached.payload.pagination.page);
        }
        void prefetchPage(
          normalizedSsic,
          cached.payload.pagination.page + 1,
          cached.payload.pagination.totalPages,
        );
        return;
      }

      const isPageTransition =
        activeSsicRef.current === normalizedSsic && rowCountRef.current > 0;
      setIsLoadingInitial(!isPageTransition);
      setIsLoadingPage(isPageTransition);
      setError(null);

      try {
        const response = await fetch(
          `/api/search?ssic=${encodeURIComponent(normalizedSsic)}&page=${page}`,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Unable to fetch records.");
        }

        const payload = (await response.json()) as SearchResponse;
        applyPayload(payload);
        activeSsicRef.current = normalizedSsic;
        writeSessionStorage<CachedSearchPayload>(searchCacheKey, {
          payload,
          cachedAt: Date.now(),
        });
        upsertSummaryCache(payload.totals.liveCompanies, payload.totals.lastUpdatedAt);

        if (payload.pagination.page !== page) {
          void setPage(payload.pagination.page);
        }
        void prefetchPage(
          normalizedSsic,
          payload.pagination.page + 1,
          payload.pagination.totalPages,
        );
      } catch (fetchError) {
        if ((fetchError as Error).name === "AbortError") {
          return;
        }
        setRows([]);
        rowCountRef.current = 0;
        setTotalMatching(0);
        setTotalPages(0);
        activeSsicRef.current = "";
        setError((fetchError as Error).message);
      } finally {
        setIsLoadingInitial(false);
        setIsLoadingPage(false);
      }
    };

    void runSearch();

    return () => {
      controller.abort();
    };
  }, [applyPayload, isValidSsic, normalizedSsic, page, prefetchPage, setPage, upsertSummaryCache]);

  const displayRows = isValidSsic ? rows : [];
  const startRow = totalMatching === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = totalMatching === 0 ? 0 : startRow + displayRows.length - 1;
  const formattedLastUpdated = lastUpdatedAt
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(lastUpdatedAt))
    : "Not available yet";
  const displayMessage =
    normalizedSsic.length === 0
      ? "Search results will appear here."
      : isValidSsic
        ? error ?? "No companies found for this SSIC code."
        : "Enter a valid 5-digit SSIC code.";

  return (
    <section className="flex w-full flex-col items-center gap-8">
      <div className="w-full max-w-xl space-y-2">
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={5}
          value={ssic}
          onChange={(event) => {
            void setPage(1);
            void setSsic(event.target.value);
          }}
          placeholder="Search by SSIC (e.g. 62011)"
          aria-label="Search by SSIC code"
          className="h-12 rounded-lg"
        />
        <p className="text-sm text-zinc-500">Enter a 5-digit SSIC code.</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-600">
          <p className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden />
            Number of Live companies: {totalLiveCompanies.toLocaleString()}
          </p>
          <p>Last database update: {formattedLastUpdated}</p>
          {isValidSsic ? (
            <p>Search matches: {totalMatching.toLocaleString()}</p>
          ) : null}
          {isValidSsic && totalMatching > 0 ? (
            <p>
              Showing {startRow.toLocaleString()}-{endRow.toLocaleString()}
            </p>
          ) : null}
        </div>
      </div>

      <div className="relative w-full rounded-xl border border-zinc-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">UEN</TableHead>
              <TableHead>Entity Name</TableHead>
              <TableHead>Street Name</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingInitial
              ? Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={`skeleton-${index}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-56" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-44" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                  </TableRow>
                ))
              : null}

            {!isLoadingInitial && displayRows.length > 0
              ? displayRows.map((row) => (
                  <TableRow key={`${row.uen}-${row.entityName}`}>
                    <TableCell className="font-mono text-xs text-zinc-700">
                      {row.uen}
                    </TableCell>
                    <TableCell>{row.entityName}</TableCell>
                    <TableCell>{row.streetName}</TableCell>
                    <TableCell>{row.entityStatusDescription}</TableCell>
                  </TableRow>
                ))
              : null}

            {!isLoadingInitial && displayRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-zinc-500">
                  {displayMessage}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {isLoadingPage ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/55">
            <div className="flex items-center gap-3 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 shadow-sm">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
              Loading page…
            </div>
          </div>
        ) : null}
      </div>

      {isValidSsic && totalPages > 0 ? (
        <div className="flex w-full items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void setPage(Math.max(1, page - 1))}
            disabled={isLoadingInitial || isLoadingPage || page <= 1}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <p className="text-sm text-zinc-600">
            Page {page.toLocaleString()} of {totalPages.toLocaleString()}
          </p>
          <button
            type="button"
            onClick={() => void setPage(Math.min(totalPages, page + 1))}
            disabled={isLoadingInitial || isLoadingPage || page >= totalPages}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}
