export type EntitySearchResult = {
  uen: string;
  entityName: string;
  streetName: string;
  primarySsicCode: string;
  entityStatusDescription: string;
};

export type EnrichmentPreflightRequest = {
  ssicCodes: string[];
};

export type EnrichmentPreflightResponse = {
  ssicCodes: string[];
  candidateCount: number;
  projectedPaidCalls: number;
  estimatedPriceUsd: number;
};

export type EnrichmentAdminQuoteResponse = {
  ssicCodes: string[];
  candidateCount: number;
  estimatedCacheHitCount: number;
  estimatedPaidCalls: number;
  estimatedUserChargeUsd: number;
  estimatedProviderCostUsd: number;
  estimatedGrossMarginUsd: number;
  paymentCode: string | null;
  paymentCodeDetailCalls: number | null;
  paymentCodeExpiresAt: string | null;
};

export type EnrichmentRedeemRequest = {
  code: string;
};

export type EnrichmentRedeemResponse = {
  code: string;
  totalDetailCalls: number;
  remainingDetailCalls: number;
  redeemedAt: string;
};

export type EnrichmentJobCreateRequest = {
  ssicCodes: string[];
};

export type EnrichmentJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "partial_stopped_budget";

export type EnrichmentJobResponse = {
  jobId: string;
  status: EnrichmentJobStatus;
  ssicCodes: string[];
  estimatedCandidateCount: number;
  estimatedCacheHitCount: number;
  estimatedPaidCalls: number;
  reservedPaidCalls: number;
  consumedPaidCalls: number;
  estimatedMaxCostUsd: number;
  stopReason: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type EnrichmentResultRow = {
  uen: string;
  entityName: string;
  streetName: string;
  primarySsicCode: string;
  placeId: string | null;
  foundName: string | null;
  nationalPhoneNumber: string | null;
  internationalPhoneNumber: string | null;
  websiteUri: string | null;
  formattedAddress: string | null;
  enrichmentStatus: string;
  lastUpdatedAt: string;
};

export type EnrichmentResultsResponse = {
  data: EnrichmentResultRow[];
  totalMatching: number;
};
