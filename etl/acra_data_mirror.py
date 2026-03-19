from __future__ import annotations

import io
import os
import pathlib
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError

import pandas as pd
import psycopg
import requests
from dotenv import load_dotenv
from psycopg import sql

# Load environment variables from .env.local
env_path = pathlib.Path(__file__).parent.parent / '.env.local'
load_dotenv(env_path, override=True)

# A-Z and Others datasets from data.gov.sg ACRA entity registry
DATASET_IDS = [
    "d_af2042c77ffaf0db5d75561ce9ef5688",  # A
    "d_0cc5f52a1f298b916f317800251057f3",  # B
    "d_4e3db8955fdcda6f9944097bef3d2724",  # C
    "d_1cd970d8351b42be4a308d628a6dd9d3",  # D
    "d_e97e8e7fc55b85a38babf66b0fa46b73",  # E
    "d_df7d2d661c0c11a7c367c9ee4bf896c1",  # F
    "d_fa2ed456cf2b8597bb7e064b08fc3c7c",  # G
    "d_300ddc8da4e8f7bdc1bfc62d0d99e2e7",  # H
    "d_31af23fdb79119ed185c256f03cb5773",  # I
    "d_67e99e6eabc4aad9b5d48663b579746a",  # J
    "d_c0650f23e94c42e7a20921f4c5b75c24",  # K
    "d_3a3807c023c61ddfba947dc069eb53f2",  # L
    "d_478f45a9c541cbe679ca55d1cd2b970b",  # M
    "d_a2141adf93ec2a3c2ec2837b78d6d46e",  # N
    "d_181005ca270b45408b4cdfc954980ca2",  # O
    "d_9af9317c646a1c881bb5591c91817cc6",  # P
    "d_5c4ef48b025fdfbc80056401f06e3df9",  # Q
    "d_5573b0db0575db32190a2ad27919a7aa",  # R
    "d_2b8c54b2a490d2fa36b925289e5d9572",  # S
    "d_85518d970b8178975850457f60f1e738",  # T
    "d_72f37e5c5d192951ddc5513c2b134482",  # U
    "d_4526d47d6714d3b052eed4a30b8b1ed6",  # V
    "d_b58303c68e9cf0d2ae93b73ffdbfbfa1",  # W
    "d_acbc938ec77af18f94cecc4a7c9ec720",  # X
    "d_4130f1d9d365d9f1633536e959f62bb7",  # Y
    "d_124a9bd407c7a25f8335b93b86e50fdd",  # Z
    "d_8575e84912df3c28995b8e6e0e05205a",  # Others
]

TARGET_COLUMNS = [
    "uen",
    "entity_name",
    "street_name",
    "primary_ssic_code",
    "entity_status_description",
]

COLUMN_ALIASES = {
    "uen": ["uen", "uen_no", "entity_uen"],
    "entity_name": ["entity_name", "entityname", "business_name", "name"],
    "street_name": ["street_name", "street", "address_street_name"],
    "primary_ssic_code": [
        "primary_ssic_code",
        "primary_ssic",
        "ssic_code",
        "ssic",
    ],
    "entity_status_description": [
        "entity_status_description",
        "entity_status",
        "status",
    ],
}

FILTERS = [
    {
        "columnName": "entity_status_description",
        "type": "LIKE",
        "value": "Live",
    }
]


@dataclass(frozen=True)
class Settings:
    database_url: str
    api_key: str
    poll_retries: int
    poll_wait_secs: int
    rate_limit_delay: float


def load_settings() -> Settings:
    database_url = os.environ["DATABASE_URL"]
    api_key = os.environ["ACRA_API_KEY"]

    poll_retries = int(os.getenv("ACRA_POLL_RETRIES", "10"))
    poll_wait_secs = int(os.getenv("ACRA_POLL_WAIT_SECS", "6"))
    rate_limit_delay = float(os.getenv("ACRA_RATE_LIMIT_DELAY", "13.0"))

    return Settings(
        database_url=database_url,
        api_key=api_key,
        poll_retries=poll_retries,
        poll_wait_secs=poll_wait_secs,
        rate_limit_delay=rate_limit_delay,
    )


def headers_with_key(api_key: str) -> dict:
    """Build HTTP headers with API key."""
    return {
        "User-Agent": "acra-data-mirror/1.0",
        "Content-Type": "application/json",
        "Accept": "*/*",
        "x-api-key": api_key,
    }


def initiate_download(
    dataset_id: str,
    api_key: str,
    base_url: str = "https://api-open.data.gov.sg/v1/public/api/datasets",
) -> bool:
    """Kick off async CSV generation on data.gov.sg."""
    resp = requests.get(
        f"{base_url}/{dataset_id}/initiate-download",
        headers=headers_with_key(api_key),
        json={"columnNames": TARGET_COLUMNS, "filters": FILTERS},
        timeout=30,
    )
    resp.raise_for_status()
    body = resp.json()
    if body.get("code") not in (0, 1):
        raise RuntimeError(f"Unexpected initiate response: {body}")
    return True


def poll_for_url(
    dataset_id: str,
    api_key: str,
    retries: int = 10,
    wait_secs: int = 6,
    base_url: str = "https://api-open.data.gov.sg/v1/public/api/datasets",
) -> str:
    """Poll until the download URL is available (async CSV generation)."""
    for attempt in range(1, retries + 1):
        time.sleep(wait_secs)
        resp = requests.get(
            f"{base_url}/{dataset_id}/poll-download",
            headers=headers_with_key(api_key),
            json={"columnNames": TARGET_COLUMNS, "filters": FILTERS},
            timeout=30,
        )
        resp.raise_for_status()
        body = resp.json()
        url = body.get("data", {}).get("url")
        if url:
            return url
        status = body.get("data", {}).get("status", "unknown")
        print(f"    Attempt {attempt}/{retries}: status={status}, waiting …")

    raise TimeoutError(
        f"Download URL not ready after {retries} attempts for {dataset_id}"
    )


def normalize_columns(frame: pd.DataFrame) -> pd.DataFrame:
    renamed = {
        col: col.strip().lower().replace(" ", "_").replace("-", "_")
        for col in frame.columns
    }
    return frame.rename(columns=renamed)


def resolve_column_name(frame: pd.DataFrame, canonical_name: str) -> str:
    candidates = COLUMN_ALIASES[canonical_name]
    for candidate in candidates:
        if candidate in frame.columns:
            return candidate

    raise KeyError(f"Unable to map source column to '{canonical_name}'.")


def normalize_and_filter_dataset(url: str) -> pd.DataFrame:
    """Download CSV from URL, normalize columns, and filter for valid entities."""
    frame = pd.read_csv(url, dtype=str, keep_default_na=False)
    frame = normalize_columns(frame)

    selection = {
        canonical: resolve_column_name(frame, canonical)
        for canonical in TARGET_COLUMNS
    }

    normalized = frame.loc[:, list(selection.values())].rename(
        columns={v: k for k, v in selection.items()}
    )

    for column in TARGET_COLUMNS:
        normalized[column] = normalized[column].astype(str).str.strip()

    normalized = normalized[normalized["uen"].ne("")]
    normalized = normalized[normalized["primary_ssic_code"].str.fullmatch(r"\d{5}")]

    return normalized


def fetch_dataset_via_api(
    dataset_id: str, settings: Settings
) -> pd.DataFrame:
    """Initiate async download, poll for URL, then download and normalize."""
    print(f"  Initiating download for {dataset_id} …")
    initiate_download(
        dataset_id,
        settings.api_key,
    )
    download_url = poll_for_url(
        dataset_id,
        settings.api_key,
        retries=settings.poll_retries,
        wait_secs=settings.poll_wait_secs,
    )
    print(f"  Download URL ready: {download_url}")
    return normalize_and_filter_dataset(download_url)


def fetch_all_datasets(dataset_ids: list[str], settings: Settings) -> pd.DataFrame:
    """Download and merge all A-Z datasets."""
    frames: list[pd.DataFrame] = []
    total = len(dataset_ids)

    for idx, dataset_id in enumerate(dataset_ids, start=1):
        try:
            print(f"[{idx}/{total}] Fetching {dataset_id} …")
            frame = fetch_dataset_via_api(dataset_id, settings)
            frames.append(frame)
            print(f"  ✓ Loaded {len(frame):,} rows")

        except (HTTPError, URLError, KeyError, pd.errors.ParserError, Exception) as error:
            print(f"  ✗ Failed: {error}")

        # Rate limit between requests
        if idx < total:
            print(f"  ⏳ Waiting {settings.rate_limit_delay}s before next dataset …")
            time.sleep(settings.rate_limit_delay)

    if not frames:
        raise RuntimeError("No datasets were loaded successfully.")

    print(f"\nMerging {len(frames)} datasets …")
    merged = pd.concat(frames, ignore_index=True)
    before_dedup = len(merged)
    merged = merged.drop_duplicates(
        subset=["uen", "primary_ssic_code", "entity_status_description"]
    )
    after_dedup = len(merged)
    print(
        f"Deduplicated: {before_dedup:,} rows → {after_dedup:,} rows "
        f"({before_dedup - after_dedup:,} duplicates removed)"
    )
    return merged.loc[:, TARGET_COLUMNS]


def bootstrap_schema(cursor: psycopg.Cursor) -> None:
    table_template = """
    CREATE TABLE IF NOT EXISTS {table_name} (
      uen TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      street_name TEXT NOT NULL,
      primary_ssic_code VARCHAR(5) NOT NULL,
      entity_status_description TEXT NOT NULL
    )
    """

    for table_name in ("entities_a", "entities_b"):
        cursor.execute(sql.SQL(table_template).format(table_name=sql.Identifier(table_name)))
        cursor.execute(
            sql.SQL(
                """
                ALTER TABLE {}
                ADD COLUMN IF NOT EXISTS entity_status_description TEXT NOT NULL DEFAULT ''
                """
            ).format(sql.Identifier(table_name))
        )

    cursor.execute(
        """
        CREATE OR REPLACE VIEW active_entities AS
        SELECT uen, entity_name, street_name, primary_ssic_code, entity_status_description FROM entities_a
        """
    )


def detect_active_table(cursor: psycopg.Cursor) -> str:
    cursor.execute(
        """
        SELECT CASE
          WHEN pg_get_viewdef('active_entities'::regclass, true) ILIKE '%entities_b%'
          THEN 'entities_b'
          ELSE 'entities_a'
        END
        """
    )
    row = cursor.fetchone()
    if not row:
        return "entities_a"
    return row[0]


def copy_into_table(cursor: psycopg.Cursor, table_name: str, frame: pd.DataFrame) -> None:
    buffer = io.StringIO()
    frame.to_csv(buffer, index=False, header=False)
    buffer.seek(0)

    copy_query = sql.SQL(
        "COPY {} (uen, entity_name, street_name, primary_ssic_code, entity_status_description) FROM STDIN WITH (FORMAT CSV)"
    ).format(sql.Identifier(table_name))

    with cursor.copy(copy_query) as copy:
        copy.write(buffer.getvalue())


def ensure_indexes(cursor: psycopg.Cursor) -> None:
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS entities_a_primary_ssic_code_idx ON entities_a (primary_ssic_code)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS entities_b_primary_ssic_code_idx ON entities_b (primary_ssic_code)"
    )


def swap_active_view(cursor: psycopg.Cursor, new_active_table: str) -> None:
    cursor.execute(
        sql.SQL(
            """
            CREATE OR REPLACE VIEW active_entities AS
            SELECT uen, entity_name, street_name, primary_ssic_code, entity_status_description
            FROM {}
            """
        ).format(sql.Identifier(new_active_table))
    )


def run() -> None:
    settings = load_settings()
    print("\n" + "=" * 60)
    print("  ACRA ETL: Blue-Green Data Mirror")
    print("=" * 60)

    print("\n[1/3] Preparing datasets …")
    print("Entity Status Filter: LIKE 'Live' (matches 'Live' and 'Live Company')")
    print(f"Found {len(DATASET_IDS)} dataset(s) (A-Z + Others)")

    print("\n[2/3] Downloading and normalizing data …")
    frame = fetch_all_datasets(DATASET_IDS, settings)

    print("\n[3/3] Loading into database (blue-green swap) …")
    with psycopg.connect(settings.database_url, autocommit=False) as conn:
        with conn.cursor() as cursor:
            bootstrap_schema(cursor)

            active_table = detect_active_table(cursor)
            inactive_table = (
                "entities_b" if active_table == "entities_a" else "entities_a"
            )
            print(f"Active table: {active_table}")
            print(f"Target table: {inactive_table}")

            print(f"Truncating {inactive_table} …")
            cursor.execute(
                sql.SQL("TRUNCATE TABLE {}").format(sql.Identifier(inactive_table))
            )

            print(f"Bulk-loading {len(frame):,} rows via COPY …")
            copy_into_table(cursor, inactive_table, frame)

            print(f"Creating indexes on {inactive_table} …")
            ensure_indexes(cursor)

            print(f"Swapping active_entities view to {inactive_table} …")
            swap_active_view(cursor, inactive_table)

        conn.commit()
        print(f"\n✓ Committed transaction (tables now at {inactive_table})")

    print("\n" + "=" * 60)
    print(f"  SUCCESS: {len(frame):,} entities now searchable")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    run()
