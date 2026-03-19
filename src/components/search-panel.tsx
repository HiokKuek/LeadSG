"use client";

import { useEffect, useMemo, useState } from "react";
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
  };
};

const ssicParser = parseAsString.withDefault("");
const pageParser = parseAsInteger.withDefault(1);

export function SearchPanel() {
  const [ssic, setSsic] = useQueryState("ssic", ssicParser);
  const [page, setPage] = useQueryState("page", pageParser);
  const [rows, setRows] = useState<EntitySearchResult[]>([]);
  const [totalLiveCompanies, setTotalLiveCompanies] = useState(0);
  const [totalMatching, setTotalMatching] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedSsic = useMemo(() => ssic.trim(), [ssic]);
  const isValidSsic = /^\d{5}$/.test(normalizedSsic);

  useEffect(() => {
    const controller = new AbortController();

    const fetchTotals = async () => {
      try {
        const response = await fetch("/api/search", {
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as SearchResponse;
        setTotalLiveCompanies(payload.totals.liveCompanies);
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
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const runSearch = async () => {
      if (!isValidSsic) {
        setRows([]);
        setTotalMatching(0);
        setTotalPages(0);
        return;
      }

      setIsLoading(true);
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
        setRows(payload.data);
        setTotalLiveCompanies(payload.totals.liveCompanies);
        setTotalMatching(payload.pagination.totalMatching);
        setTotalPages(payload.pagination.totalPages);
        setPageSize(payload.pagination.pageSize);

        if (payload.pagination.page !== page) {
          void setPage(payload.pagination.page);
        }
      } catch (fetchError) {
        if ((fetchError as Error).name === "AbortError") {
          return;
        }
        setRows([]);
        setTotalMatching(0);
        setTotalPages(0);
        setError((fetchError as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    void runSearch();

    return () => {
      controller.abort();
    };
  }, [isValidSsic, normalizedSsic, page, setPage]);

  const displayRows = isValidSsic ? rows : [];
  const startRow = totalMatching === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = totalMatching === 0 ? 0 : startRow + displayRows.length - 1;
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

      <div className="w-full rounded-xl border border-zinc-200 bg-white">
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
            {isLoading
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

            {!isLoading && displayRows.length > 0
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

            {!isLoading && displayRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-zinc-500">
                  {displayMessage}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {isValidSsic && totalPages > 0 ? (
        <div className="flex w-full items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void setPage(Math.max(1, page - 1))}
            disabled={isLoading || page <= 1}
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
            disabled={isLoading || page >= totalPages}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}
