const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const PLACES_DETAILS_BASE_URL = "https://places.googleapis.com/v1/places";

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;

export type PlaceSearchResult = {
  placeId: string | null;
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
};

export type PlaceDetailsResult = {
  foundName: string | null;
  nationalPhoneNumber: string | null;
  internationalPhoneNumber: string | null;
  formattedAddress: string | null;
  websiteUri: string | null;
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
};

function getApiKey(): string {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_PLACES_API_KEY is required.");
  }

  return apiKey;
}

function isRetryableStatus(statusCode: number): boolean {
  return [429, 500, 502, 503, 504].includes(statusCode);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry<T>(
  url: string,
  init: RequestInit,
): Promise<{
  data: T | null;
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
}> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, init);

      if (response.ok) {
        const data = await response.json() as T;
        return {
          data,
          attempts: attempt,
          errorCode: null,
          errorMessage: null,
        };
      }

      const errorCode = `HTTP_${response.status}`;
      const bodyPreview = (await response.text()).slice(0, 300);
      const errorMessage = `${errorCode}: ${bodyPreview}`;

      if (!isRetryableStatus(response.status) || attempt === MAX_RETRIES) {
        return {
          data: null,
          attempts: attempt,
          errorCode,
          errorMessage,
        };
      }

      const backoff = BASE_BACKOFF_MS * (2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
      await sleep(backoff);
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        return {
          data: null,
          attempts: attempt,
          errorCode: "REQUEST_ERROR",
          errorMessage: (error as Error).message,
        };
      }

      const backoff = BASE_BACKOFF_MS * (2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
      await sleep(backoff);
    }
  }

  return {
    data: null,
    attempts: MAX_RETRIES,
    errorCode: "UNKNOWN_ERROR",
    errorMessage: "Unknown Google Places failure.",
  };
}

export async function searchPlaceId(
  entityName: string,
  streetName: string,
): Promise<PlaceSearchResult> {
  const apiKey = getApiKey();

  const searchHeaders = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": "places.id",
  };

  const textQuery = `${entityName} ${streetName} Singapore`.trim();

  const result = await requestWithRetry<{ places?: Array<{ id?: string }> }>(
    PLACES_SEARCH_URL,
    {
      method: "POST",
      headers: searchHeaders,
      body: JSON.stringify({ textQuery, maxResultCount: 1 }),
    },
  );

  if (!result.data) {
    return {
      placeId: null,
      attempts: result.attempts,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    };
  }

  const placeId = result.data.places?.[0]?.id ?? null;

  if (!placeId) {
    return {
      placeId: null,
      attempts: result.attempts,
      errorCode: "NO_PLACE_ID",
      errorMessage: "No place ID returned from text search.",
    };
  }

  return {
    placeId,
    attempts: result.attempts,
    errorCode: null,
    errorMessage: null,
  };
}

export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetailsResult> {
  const apiKey = getApiKey();

  const detailsHeaders = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": "displayName,nationalPhoneNumber,internationalPhoneNumber,formattedAddress,websiteUri",
  };

  const result = await requestWithRetry<{
    displayName?: { text?: string };
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    formattedAddress?: string;
    websiteUri?: string;
  }>(
    `${PLACES_DETAILS_BASE_URL}/${encodeURIComponent(placeId)}`,
    {
      method: "GET",
      headers: detailsHeaders,
    },
  );

  if (!result.data) {
    return {
      foundName: null,
      nationalPhoneNumber: null,
      internationalPhoneNumber: null,
      formattedAddress: null,
      websiteUri: null,
      attempts: result.attempts,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    };
  }

  return {
    foundName: result.data.displayName?.text ?? null,
    nationalPhoneNumber: result.data.nationalPhoneNumber ?? null,
    internationalPhoneNumber: result.data.internationalPhoneNumber ?? null,
    formattedAddress: result.data.formattedAddress ?? null,
    websiteUri: result.data.websiteUri ?? null,
    attempts: result.attempts,
    errorCode: null,
    errorMessage: null,
  };
}
