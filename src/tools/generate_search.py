#!/usr/bin/env python3
"""
X-Point I/O Passport
--------------------
Module: src/tools/generate_search.py
Purpose: Compile fetch.json + storage.json into a browser-searchable index.

X-IN (2)
    1. src/data/fetch.json
    2. src/data/storage.json

X-OUT (1)
    1. src/data/search.index.json

Runtime Contract
    The browser should not invent search URLs. Every result emitted here contains
    its final reader_url and, for chapters, its final manifest_url.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import string
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote


INDEX_VERSION = 2
DEFAULT_SOURCE = "e"


ALIASES = {
    "vol": "volume",
    "v": "volume",
    "ch": "chapter",
    "chap": "chapter",
    "pt": "part",
}


COMMON_TYPOS = {
    "vilume": "volume",
    "voluem": "volume",
    "xhapter": "chapter",
    "chaper": "chapter",
    "chaptr": "chapter",
}


def normalize(text: Any) -> str:
    value = str(text or "").lower()
    value = value.replace("_", " ").replace("-", " ").replace("/", " ")
    value = re.sub(r"([a-z])([0-9])", r"\1 \2", value)
    value = re.sub(r"([0-9])([a-z])", r"\1 \2", value)
    value = value.translate(str.maketrans("", "", string.punctuation.replace("_", "")))
    value = re.sub(r"\s+", " ", value).strip()
    return value


def canonical_token(token: str) -> str:
    token = COMMON_TYPOS.get(token, token)
    token = ALIASES.get(token, token)
    return token


def tokenize(*parts: Any) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []

    for part in parts:
        for raw in normalize(part).split():
            token = canonical_token(raw)
            if token and token not in seen:
                seen.add(token)
                output.append(token)

    return output


def compact_key(*parts: Any) -> str:
    return "".join(tokenize(*parts))


def display_from_slug(value: Any) -> str:
    text = str(value or "")
    text = text.replace("/", " ").replace("_", " ").replace("-", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text.title()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_index(path: Path, index: dict[str, Any], minify: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as file:
        temp_path = Path(file.name)
        try:
            if minify:
                json.dump(index, file, ensure_ascii=False, separators=(",", ":"))
            else:
                json.dump(index, file, ensure_ascii=False, indent=4)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        except BaseException:
            temp_path.unlink(missing_ok=True)
            raise

    try:
        temp_path.replace(path)
    except BaseException:
        temp_path.unlink(missing_ok=True)
        raise


def find_project_file(filename: str) -> Path | None:
    here = Path(__file__).resolve()

    for parent in [here.parent, *here.parents]:
        for candidate in [
            parent / "src" / "data" / filename,
            parent / "data" / filename,
            parent / filename,
        ]:
            if candidate.exists() and candidate.is_file():
                return candidate

    return None


def get_active_sources(storage: dict[str, Any]) -> tuple[str, dict[str, str]]:
    active = storage.get("active")
    if not isinstance(active, str) or not active:
        raise ValueError('storage.json must contain a string field named "active".')

    profile = storage.get(active)
    if not isinstance(profile, dict):
        raise ValueError(f'storage.json active profile "{active}" does not exist.')

    sources = profile.get("sources")
    if not isinstance(sources, dict):
        raise ValueError(f'storage.json profile "{active}" must contain sources.')

    cleaned: dict[str, str] = {}
    for key, value in sources.items():
        if isinstance(key, str) and isinstance(value, str) and value.strip():
            cleaned[key] = value.rstrip("/")

    return active, cleaned


def get_works(fetch_data: Any) -> list[dict[str, Any]]:
    if isinstance(fetch_data, dict):
        works = fetch_data.get("works", [])
    elif isinstance(fetch_data, list):
        works = fetch_data
    else:
        works = []

    return [work for work in works if isinstance(work, dict)]


def get_work_slug(work: dict[str, Any]) -> str:
    value = work.get("slug") or work.get("id") or work.get("name")
    return value if isinstance(value, str) else ""


def get_work_display(work: dict[str, Any], slug: str) -> str:
    value = work.get("display") or work.get("title") or work.get("name")
    return value if isinstance(value, str) and value.strip() else display_from_slug(slug)


def get_chapters(work: dict[str, Any]) -> list[Any]:
    chapters = work.get("chapters", [])
    return chapters if isinstance(chapters, list) else []


def load_work_manifest(fetch_path: Path | None, work: dict[str, Any]) -> dict[str, Any] | None:
    manifest = work.get("manifest")
    if not isinstance(manifest, str) or not manifest.strip() or not fetch_path:
        return None

    manifest_path = (fetch_path.parent / manifest).resolve()
    try:
        data = load_json(manifest_path)
    except FileNotFoundError:
        raise ValueError(f'Manifest not found for work "{get_work_slug(work)}": {manifest_path}')

    if not isinstance(data, dict):
        raise ValueError(f'Manifest must be a JSON object: {manifest_path}')

    merged = dict(work)
    for key in ["slug", "display", "title", "source", "thumb", "chapters"]:
        if key in data:
            merged[key] = data[key]
    return merged


def parse_chapter(chapter: Any) -> tuple[str, str] | None:
    if isinstance(chapter, str):
        return chapter, display_from_slug(chapter)

    if isinstance(chapter, dict):
        path = chapter.get("slug") or chapter.get("chapter") or chapter.get("path") or chapter.get("id")
        display = chapter.get("display") or chapter.get("title") or chapter.get("name") or display_from_slug(path)
        if isinstance(path, str) and path.strip() and isinstance(display, str) and display.strip():
            return path, display

    return None


def safe_path_join(*parts: str) -> str:
    cleaned = [str(part).strip("/") for part in parts if str(part).strip("/")]
    return "/".join(cleaned)


def reader_url(source: str, work_slug: str, chapter_path: str | None = None) -> str:
    query = [
        f"source={quote(source, safe='')}",
        f"work={quote(work_slug, safe='')}",
    ]

    if chapter_path:
        query.append(f"chapter={quote(chapter_path, safe='')}")

    return "/reader?" + "&".join(query)


def manifest_url(source_root: str, work_slug: str, chapter_path: str) -> str:
    return safe_path_join(source_root, work_slug, chapter_path, "item.json")


def add_token_ids(token_map: dict[str, list[int]], tokens: list[str], entry_id: int) -> None:
    for token in tokens:
        ids = token_map.setdefault(token, [])
        if not ids or ids[-1] != entry_id:
            ids.append(entry_id)


def add_prefix_ids(prefix_map: dict[str, list[int]], tokens: list[str], entry_id: int) -> None:
    for token in tokens:
        # Single-letter prefixes are useful for small libraries, but may become noisy later.
        # Keep max prefix length modest so the index does not bloat endlessly.
        max_len = min(len(token), 12)

        for size in range(1, max_len + 1):
            prefix = token[:size]
            ids = prefix_map.setdefault(prefix, [])

            if not ids or ids[-1] != entry_id:
                ids.append(entry_id)


def build_index(storage_data: dict[str, Any], fetch_data: Any, only_source: str, fetch_path: Path | None = None) -> dict[str, Any]:
    active_environment, sources = get_active_sources(storage_data)
    works = get_works(fetch_data)

    if only_source not in sources:
        raise ValueError(f'Active storage profile has no source "{only_source}".')

    entries: list[dict[str, Any]] = []
    token_map: dict[str, list[int]] = {}
    prefix_map: dict[str, list[int]] = {}
    compact_map: dict[str, list[int]] = {}
    skipped: list[dict[str, str]] = []

    for raw_work in works:
        work = load_work_manifest(fetch_path, raw_work) or raw_work
        source = work.get("source") or only_source
        if source != only_source:
            continue

        if source not in sources:
            skipped.append({"work": str(work.get("slug", "unknown")), "reason": f'unknown source "{source}"'})
            continue

        work_slug = get_work_slug(work)
        if not work_slug.strip():
            skipped.append({"work": "unknown", "reason": "missing work slug"})
            continue

        work_display = get_work_display(work, work_slug)
        source_root = sources[source]

        chapter_items = get_chapters(work)
        first_parsed_chapter = None
        for candidate_chapter in chapter_items:
            first_parsed_chapter = parse_chapter(candidate_chapter)
            if first_parsed_chapter:
                break

        if first_parsed_chapter:
            first_chapter_path, _first_chapter_display = first_parsed_chapter
            work_tokens = tokenize(work_display, work_slug)
            work_entry = {
                "id": len(entries),
                "type": "work",
                "source": source,
                "display": work_display,
                "work": work_slug,
                "chapter": first_chapter_path,
                "reader_url": reader_url(source, work_slug, first_chapter_path),
                "manifest_url": manifest_url(source_root, work_slug, first_chapter_path),
                "normalized": normalize(work_display),
                "tokens": work_tokens,
                "compact": compact_key(work_display, work_slug),
            }
            entries.append(work_entry)
            add_token_ids(token_map, work_tokens, work_entry["id"])
            add_prefix_ids(prefix_map, work_tokens, work_entry["id"])
            compact_map.setdefault(work_entry["compact"], []).append(work_entry["id"])
        else:
            skipped.append({"work": work_slug, "reason": "work has no valid chapters"})

        for chapter in chapter_items:
            parsed = parse_chapter(chapter)
            if not parsed:
                skipped.append({"work": work_slug, "reason": f"invalid chapter entry: {chapter!r}"})
                continue

            chapter_path, chapter_display = parsed
            display = f"{work_display} {chapter_display}"
            chapter_tokens = tokenize(work_display, work_slug, chapter_path, chapter_display)

            entry = {
                "id": len(entries),
                "type": "chapter",
                "source": source,
                "display": display,
                "work": work_slug,
                "chapter": chapter_path,
                "reader_url": reader_url(source, work_slug, chapter_path),
                "manifest_url": manifest_url(source_root, work_slug, chapter_path),
                "normalized": normalize(display),
                "tokens": chapter_tokens,
                "compact": compact_key(work_display, work_slug, chapter_path, chapter_display),
            }
            entries.append(entry)
            add_token_ids(token_map, chapter_tokens, entry["id"])
            add_prefix_ids(prefix_map, chapter_tokens, entry["id"])
            compact_map.setdefault(entry["compact"], []).append(entry["id"])

    return {
        "version": INDEX_VERSION,
        "generated": datetime.now(timezone.utc).isoformat(),
        "environment": active_environment,
        "source": only_source,
        "source_root": sources[only_source],
        "entries": entries,
        "tokens": token_map,
        "prefixes": prefix_map,
        "compact": compact_map,
        "skipped": skipped,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compile browser search.index.json from fetch.json + storage.json.")
    parser.add_argument("--fetch", type=Path, default=None, help="Path to fetch.json.")
    parser.add_argument("--storage", type=Path, default=None, help="Path to storage.json.")
    parser.add_argument("--out", type=Path, default=None, help="Output path. Defaults beside fetch.json.")
    parser.add_argument("--public-out", type=Path, default=None, help="Optional public deployment output path to keep synchronized with --out.")
    parser.add_argument("--source", default=DEFAULT_SOURCE, help='Source to index. Default: "e".')
    parser.add_argument("--minify", action="store_true", help="Write compact JSON.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    fetch_path = args.fetch.expanduser().resolve() if args.fetch else find_project_file("fetch.json")
    storage_path = args.storage.expanduser().resolve() if args.storage else find_project_file("storage.json")

    if not fetch_path:
        raise SystemExit("Could not find fetch.json. Use --fetch path/to/fetch.json")
    if not storage_path:
        raise SystemExit("Could not find storage.json. Use --storage path/to/storage.json")

    out_path = args.out.expanduser().resolve() if args.out else fetch_path.parent / "search.index.json"
    public_out_path = args.public_out.expanduser().resolve() if args.public_out else None

    index = build_index(load_json(storage_path), load_json(fetch_path), args.source, fetch_path)

    write_index(out_path, index, args.minify)
    wrote_public = public_out_path and public_out_path != out_path
    if wrote_public:
        write_index(public_out_path, index, args.minify)

    print(f"storage: {storage_path}")
    print(f"fetch:   {fetch_path}")
    print(f"env:     {index['environment']}")
    print(f"source:  {index['source']} -> {index['source_root']}")
    print(f"entries: {len(index['entries'])}")
    print(f"tokens:  {len(index['tokens'])}")
    print(f"skipped: {len(index['skipped'])}")
    print(f"saved:        {out_path}")
    if public_out_path:
        print(f"public saved: {public_out_path}")


if __name__ == "__main__":
    main()
