#!/usr/bin/env python3
"""
Restore event images from a previously downloaded ZIP to Cloud Storage.

Used when Cloud Storage objects were deleted (e.g. lifecycle misconfiguration)
but a ZIP previously downloaded via the bulk download feature is available.

Strategy:
    The ZIP filenames (NNN_userName_score.jpg) cannot be position-matched to
    Firestore docs because the bulk download uses parallel fetch (5 at a time)
    and within each batch the order is non-deterministic.

    Instead, this script computes the average_hash of each ZIP image and
    performs Hungarian (bipartite) matching against the Firestore docs'
    average_hash field, with user_name and rounded total_score as tie-breakers.
    Then each ZIP file's bytes are uploaded back to its matched storage_path.

Usage:
    # Dry run (preview matching only, no uploads)
    python scripts/restore_event_images.py \\
      --event-id <event_id> \\
      --zip /path/to/backup.zip \\
      --project <gcp_project> \\
      --bucket <gcs_bucket> \\
      --dry-run

    # Execute (uploads to GCS)
    python scripts/restore_event_images.py \\
      --event-id <event_id> \\
      --zip /path/to/backup.zip \\
      --project <gcp_project> \\
      --bucket <gcs_bucket>

Requirements:
    pip install -r scripts/requirements.txt
    gcloud auth application-default login
"""

import argparse
import io
import re
import sys
import zipfile

import imagehash
import numpy as np
import requests
from google.cloud import firestore, storage
from PIL import Image as PILImage
from scipy.optimize import linear_sum_assignment

ZIP_NAME_PATTERN = re.compile(r"images/(\d{3})_(.+)_(\d+)\.jpg")
SANITIZE_PATTERN = re.compile(r'[<>:"/\\|?*]')


def sanitize_user_name(name: str) -> str:
    """Replicate the JS sanitization used in src/frontend/js/app.js (downloadAllImages)."""
    return SANITIZE_PATTERN.sub("_", name)[:30]


def fetch_firestore_images(db: firestore.Client, event_id: str) -> list[dict]:
    """Return non-soft-deleted image docs for the event."""
    docs = list(db.collection("images").where(filter=firestore.FieldFilter("event_id", "==", event_id)).stream())
    result = []
    for d in docs:
        data = d.to_dict()
        if data.get("deleted_at"):
            continue
        if not data.get("storage_path") or not data.get("average_hash"):
            print(f"WARN: skipping doc {d.id} (no storage_path or average_hash)", file=sys.stderr)
            continue
        result.append(
            {
                "doc_id": d.id,
                "hash": imagehash.hex_to_hash(data["average_hash"]),
                "score": data.get("total_score", 0),
                "user_name": data.get("user_name", ""),
                "storage_path": data["storage_path"],
                "storage_url": data.get("storage_url"),
            }
        )
    return result


def load_zip_images(zip_path: str) -> list[dict]:
    """Load each .jpg in the ZIP and compute its average_hash."""
    result = []
    with zipfile.ZipFile(zip_path) as z:
        names = sorted(n for n in z.namelist() if n.lower().endswith(".jpg"))
        for name in names:
            m = ZIP_NAME_PATTERN.match(name)
            if not m:
                print(f"WARN: skipping unrecognized filename {name!r}", file=sys.stderr)
                continue
            with z.open(name) as f:
                img_bytes = f.read()
            img = PILImage.open(io.BytesIO(img_bytes))
            zh = imagehash.average_hash(img, hash_size=8)
            result.append(
                {
                    "name": name,
                    "idx": int(m.group(1)),
                    "user_zip": m.group(2),
                    "score_zip": int(m.group(3)),
                    "hash": zh,
                    "bytes": img_bytes,
                }
            )
    return result


def match(zip_items: list[dict], fs_items: list[dict]) -> list[tuple[int, int]]:
    """Hungarian matching with cost = hamming*100 + name_diff*10 + min(|score|, 50)."""
    n, m = len(zip_items), len(fs_items)
    cost = np.zeros((n, m))
    for i, z in enumerate(zip_items):
        for j, f in enumerate(fs_items):
            h = z["hash"] - f["hash"]
            u = 0 if sanitize_user_name(f["user_name"]) == z["user_zip"] else 1
            s = abs(z["score_zip"] - round(f["score"]))
            cost[i, j] = h * 100 + u * 10 + min(s, 50)
    row_ind, col_ind = linear_sum_assignment(cost)
    return list(zip(row_ind.tolist(), col_ind.tolist()))


def assert_matches_clean(pairs: list[tuple[int, int]], zip_items: list[dict], fs_items: list[dict]) -> None:
    """Abort if any pair has hamming>0, name mismatch, or score diff>=2."""
    bad = []
    for i, j in pairs:
        z, f = zip_items[i], fs_items[j]
        h = z["hash"] - f["hash"]
        u = sanitize_user_name(f["user_name"]) != z["user_zip"]
        s = abs(z["score_zip"] - round(f["score"]))
        if h != 0 or u or s >= 2:
            bad.append((z["name"], f["doc_id"], h, u, s))
    if bad:
        print("ASSERTION FAILED: matching has imperfect pairs:", file=sys.stderr)
        for row in bad:
            print(
                f"  zip={row[0]} doc={row[1]} hamming={row[2]} name_diff={row[3]} score_diff={row[4]}", file=sys.stderr
            )
        sys.exit(1)


def print_match_table(pairs: list[tuple[int, int]], zip_items: list[dict], fs_items: list[dict]) -> None:
    print(f"{'ZIP filename':<55} {'-> storage_path':<90} ham name score")
    print("-" * 170)
    for i, j in pairs:
        z, f = zip_items[i], fs_items[j]
        h = z["hash"] - f["hash"]
        u = 0 if sanitize_user_name(f["user_name"]) == z["user_zip"] else 1
        s = abs(z["score_zip"] - round(f["score"]))
        print(f"{z['name']:<55} {f['storage_path']:<90} {h:>3} {u:>4} {s:>5}")


def upload_all(
    pairs: list[tuple[int, int]], zip_items: list[dict], fs_items: list[dict], bucket: storage.Bucket
) -> None:
    """Upload each ZIP file's bytes to the matched storage_path. Fail-fast."""
    total = len(pairs)
    for n, (i, j) in enumerate(pairs, 1):
        z, f = zip_items[i], fs_items[j]
        blob = bucket.blob(f["storage_path"])
        try:
            blob.upload_from_string(z["bytes"], content_type="image/jpeg")
            print(f"[{n}/{total}] uploaded {f['storage_path']}")
        except Exception as e:
            print(f"FATAL upload failure at [{n}/{total}] {f['storage_path']}: {e}", file=sys.stderr)
            print(f"Successfully uploaded: {n - 1}/{total}", file=sys.stderr)
            sys.exit(1)


def verify_signed_urls(pairs: list[tuple[int, int]], fs_items: list[dict]) -> None:
    """HEAD-check each Firestore signed URL to confirm restoration is visible."""
    ok, fail = 0, 0
    for _, j in pairs:
        url = fs_items[j].get("storage_url")
        if not url:
            fail += 1
            continue
        try:
            r = requests.head(url, timeout=10)
            if r.status_code == 200:
                ok += 1
            else:
                fail += 1
                print(f"  HEAD {r.status_code}: {fs_items[j]['storage_path']}", file=sys.stderr)
        except Exception as e:
            fail += 1
            print(f"  HEAD error: {fs_items[j]['storage_path']}: {e}", file=sys.stderr)
    print(f"\nVerification: {ok} OK / {fail} failed (out of {len(pairs)})")
    if fail > 0:
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--event-id", required=True)
    parser.add_argument("--zip", required=True, help="Path to the backup ZIP file")
    parser.add_argument("--project", required=True, help="GCP project ID")
    parser.add_argument("--bucket", required=True, help="GCS bucket name")
    parser.add_argument("--dry-run", action="store_true", help="Show matching table only, do not upload")
    args = parser.parse_args()

    db = firestore.Client(project=args.project)
    storage_client = storage.Client(project=args.project)
    bucket = storage_client.bucket(args.bucket)

    print(f"Loading Firestore docs for event_id={args.event_id} ...")
    fs_items = fetch_firestore_images(db, args.event_id)
    print(f"  {len(fs_items)} non-deleted docs found")

    print(f"Loading ZIP {args.zip} ...")
    zip_items = load_zip_images(args.zip)
    print(f"  {len(zip_items)} images extracted")

    if len(zip_items) != len(fs_items):
        print(
            f"ABORT: count mismatch (zip={len(zip_items)} vs firestore={len(fs_items)}). " "Manual review required.",
            file=sys.stderr,
        )
        sys.exit(1)

    print("Running Hungarian matching ...")
    pairs = match(zip_items, fs_items)
    assert_matches_clean(pairs, zip_items, fs_items)
    print(f"  All {len(pairs)} pairs matched cleanly (hamming=0, name match, score match)\n")

    print_match_table(pairs, zip_items, fs_items)

    if args.dry_run:
        print("\n[dry-run] No uploads performed.")
        return

    print(f"\nUploading {len(pairs)} images to gs://{args.bucket}/ ...")
    upload_all(pairs, zip_items, fs_items, bucket)

    print("\nVerifying via HEAD on signed URLs ...")
    verify_signed_urls(pairs, fs_items)

    print("\nRestore complete.")


if __name__ == "__main__":
    main()
