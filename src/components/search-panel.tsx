"use client";

import { useEffect, useMemo, useState } from "react";
import { parseAsString, useQueryState } from "nuqs";

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
};

const ssicParser = parseAsString.withDefault("");

export function SearchPanel() {
  const [ssic, setSsic] = useQueryState("ssic", ssicParser);
  const [rows, setRows] = useState<EntitySearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedSsic = useMemo(() => ssic.trim(), [ssic]);
  const isValidSsic = /^\d{5}$/.test(normalizedSsic);

  useEffect(() => {
    const controller = new AbortController();

    const runSearch = async () => {
      if (!isValidSsic) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/search?ssic=${encodeURIComponent(normalizedSsic)}`,
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
      } catch (fetchError) {
        if ((fetchError as Error).name === "AbortError") {
          return;
        }
        setRows([]);
        setError((fetchError as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    void runSearch();

    return () => {
      controller.abort();
    };
  }, [isValidSsic, normalizedSsic]);

  const displayRows = isValidSsic ? rows : [];
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
          onChange={(event) => void setSsic(event.target.value)}
          placeholder="Search by SSIC (e.g. 62011)"
          aria-label="Search by SSIC code"
          className="h-12 rounded-lg"
        />
        <p className="text-sm text-zinc-500">Enter a 5-digit SSIC code.</p>
      </div>

      <div className="w-full rounded-xl border border-zinc-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">UEN</TableHead>
              <TableHead>Entity Name</TableHead>
              <TableHead>Street Name</TableHead>
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
                  </TableRow>
                ))
              : null}

            {!isLoading && displayRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-zinc-500">
                  {displayMessage}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
