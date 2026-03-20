"use client";

import { useState } from "react";

type PreflightResponse = {
  ssicCodes: string[];
  candidateCount: number;
  projectedPaidCalls: number;
  estimatedPriceUsd: number;
};

type RedeemResponse = {
  code: string;
  totalDetailCalls: number;
  remainingDetailCalls: number;
  redeemedAt: string;
};

type JobResponse = {
  jobId: string;
  status: string;
  estimatedPaidCalls: number;
  reservedPaidCalls: number;
  consumedPaidCalls: number;
};

export function EnrichmentControls() {
  const [ssicInput, setSsicInput] = useState("");
  const [paymentCode, setPaymentCode] = useState("");
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [redeemResult, setRedeemResult] = useState<RedeemResponse | null>(null);
  const [jobResult, setJobResult] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const parseSsicCodes = () =>
    Array.from(
      new Set(
        ssicInput
          .split(",")
          .map((value) => value.trim())
          .filter((value) => /^\d{5}$/.test(value)),
      ),
    );

  const runPreflight = async () => {
    setIsLoading(true);
    setError(null);
    setJobResult(null);

    try {
      const response = await fetch("/api/enrichment/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ssicCodes: parseSsicCodes() }),
      });

      const payload = (await response.json()) as PreflightResponse | { error: string };
      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Preflight failed.");
      }

      setPreflight(payload as PreflightResponse);
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const redeemCode = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/enrichment/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: paymentCode.trim() }),
      });

      const payload = (await response.json()) as RedeemResponse | { error: string };
      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Code redemption failed.");
      }

      setRedeemResult(payload as RedeemResponse);
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const startJob = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/enrichment/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ssicCodes: parseSsicCodes() }),
      });

      const payload = (await response.json()) as JobResponse | { error: string };
      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Failed to start job.");
      }

      setJobResult(payload as JobResponse);
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshJobStatus = async () => {
    if (!jobResult?.jobId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/enrichment/jobs/${jobResult.jobId}`);
      const payload = (await response.json()) as JobResponse | { error: string };

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Failed to load job status.");
      }

      setJobResult(payload as JobResponse);
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="mt-10 w-full rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-medium text-zinc-900">Enrichment (Preview Controls)</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Enter one or more SSIC codes (comma-separated), run preflight pricing, redeem code, and start a job.
      </p>

      <div className="mt-4 grid gap-3">
        <input
          value={ssicInput}
          onChange={(event) => setSsicInput(event.target.value)}
          placeholder="e.g. 62011, 62012"
          className="h-10 rounded-md border border-zinc-200 px-3 text-sm"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runPreflight}
            disabled={isLoading}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 disabled:opacity-50"
          >
            Run preflight
          </button>
          <button
            type="button"
            onClick={startJob}
            disabled={isLoading}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 disabled:opacity-50"
          >
            Start job
          </button>
          {jobResult?.jobId ? (
            <button
              type="button"
              onClick={refreshJobStatus}
              disabled={isLoading}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 disabled:opacity-50"
            >
              Refresh job status
            </button>
          ) : null}
        </div>

        <div className="mt-3 rounded-md border border-zinc-200 p-3">
          <p className="mb-2 text-sm font-medium text-zinc-800">Redeem payment code</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={paymentCode}
              onChange={(event) => setPaymentCode(event.target.value)}
              placeholder="Enter code"
              className="h-10 min-w-48 rounded-md border border-zinc-200 px-3 text-sm"
            />
            <button
              type="button"
              onClick={redeemCode}
              disabled={isLoading || paymentCode.trim().length === 0}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 disabled:opacity-50"
            >
              Redeem
            </button>
          </div>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {preflight ? (
          <div className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-700">
            <p>Candidate companies: {preflight.candidateCount.toLocaleString()}</p>
            <p>Projected paid calls: {preflight.projectedPaidCalls.toLocaleString()}</p>
            <p>Estimated price: USD {preflight.estimatedPriceUsd.toFixed(2)}</p>
          </div>
        ) : null}

        {redeemResult ? (
          <div className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-700">
            <p>Code redeemed: {redeemResult.code}</p>
            <p>Remaining detail calls: {redeemResult.remainingDetailCalls.toLocaleString()}</p>
          </div>
        ) : null}

        {jobResult ? (
          <div className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-700">
            <p>Job ID: {jobResult.jobId}</p>
            <p>Status: {jobResult.status}</p>
            <p>
              Calls reserved/consumed: {jobResult.reservedPaidCalls.toLocaleString()} / {jobResult.consumedPaidCalls.toLocaleString()}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
