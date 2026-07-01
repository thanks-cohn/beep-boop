#!/usr/bin/env python3
"""
Location:
    src/tools/generate_search.py

Purpose:
    Compile AnimePlex's navigation search index.

Usage:
    python3 src/tools/generate_search.py

    python3 src/tools/generate_search.py --fetch src/data/fetch.json

Output:
    search.index.json next to fetch.json unless --out is provided.
"""

from __future__ import annotations

import argparse
import json
import re
import string
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


INDEX_VERSION = 1


def normalize(text: Any) -> str:
    if not isinstance(text, str):
        return ""

    text = text.lower()
    text = text.replace("_", " ")
    text = text.replace("-", " ")

    punctuation = string.punctuation.replace("_", "")
    text = text.translate(str.maketrans("", "", punctuation))

    text = re.sub(r"\s+", " ", text)

    return text.strip()


def display_from_slug(value: Any) -> str:
    text = str(value)
    text = text.replace("/", " ")
    text = text.replace("_", " ")
    text = text.replace("-", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text.title()


def ask_for_fetch_path() -> Path:
    while True:
        raw = input("Enter location of fetch.json: ").strip()

        if not raw:
            print("Please enter a path.")
            continue

        path = Path(raw).expanduser().resolve()

        if not path.exists():
            print(f"File does not exist: {path}")
            continue

        if not path.is_file():
            print(f"Not a file: {path}")
            continue

        return path


def find_default_fetch_path() -> Path | None:
    here = Path(__file__).resolve()

    for parent in [here.parent, *here.parents]:
        candidates = [
            parent / "src" / "data" / "fetch.json",
            parent / "data" / "fetch.json",
        ]

        for candidate in candidates:
            if candidate.exists() and candidate.is_file():
                return candidate

    return None


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def get_works(fetch_data: Any) -> list[Any]:
    if isinstance(fetch_data, dict):
        works = fetch_data.get("works", [])
        return works if isinstance(works, list) else []

    if isinstance(fetch_data, list):
        return fetch_data

    return []


def get_work_slug(work: dict[str, Any]) -> str:
    value = work.get("slug") or work.get("id") or work.get("name")
    return value if isinstance(value, str) else ""


def get_work_display(work: dict[str, Any], slug: str) -> str:
    value = (
        work.get("display")
        or work.get("title")
        or work.get("name")
        or display_from_slug(slug)
    )

    return value if isinstance(value, str) else ""


def get_work_source(work: dict[str, Any]) -> Any:
    return work.get("source")


def get_chapters(work: dict[str, Any]) -> list[Any]:
    chapters = work.get("chapters", [])
    return chapters if isinstance(chapters, list) else []


def make_work_entry(work: dict[str, Any]) -> dict[str, Any] | None:
    slug = get_work_slug(work)

    if not slug.strip():
        return None

    display = get_work_display(work, slug)

    if not display.strip():
        return None

    return {
        "display": display,
        "normalized": normalize(display),
        "slug": slug,
        "type": "work",
        "source": get_work_source(work),
    }


def make_chapter_entry(work: dict[str, Any], chapter: Any) -> dict[str, Any] | None:
    work_slug = get_work_slug(work)

    if not work_slug.strip():
        return None

    work_display = get_work_display(work, work_slug)

    if not work_display.strip():
        return None

    if isinstance(chapter, str):
        chapter_slug = chapter
        chapter_display = display_from_slug(chapter)
    elif isinstance(chapter, dict):
        chapter_slug = (
            chapter.get("slug")
            or chapter.get("chapter")
            or chapter.get("path")
            or chapter.get("id")
        )
        chapter_display = (
            chapter.get("display")
            or chapter.get("title")
            or chapter.get("name")
            or display_from_slug(chapter_slug)
        )
    else:
        return None

    if not isinstance(chapter_slug, str) or not chapter_slug.strip():
        return None

    if not isinstance(chapter_display, str) or not chapter_display.strip():
        return None

    display = f"{work_display} {chapter_display}"

    return {
        "display": display,
        "normalized": normalize(display),
        "slug": work_slug,
        "chapter": chapter_slug,
        "type": "chapter",
        "source": get_work_source(work),
    }


def build_index(fetch_data: Any) -> list[dict[str, Any]]:
    works = get_works(fetch_data)
    entries: list[dict[str, Any]] = []

    for work in works:
        if not isinstance(work, dict):
            continue

        #
        # Only include works from the enabled source.
        #
        # Change "e" to another source code, or remove this
        # block entirely to index every source.
        #
        if work.get("source") != "e":
            continue

        work_entry = make_work_entry(work)

        if work_entry:
            entries.append(work_entry)

        for chapter in get_chapters(work):
            chapter_entry = make_chapter_entry(work, chapter)

            if chapter_entry:
                entries.append(chapter_entry)

    entries.sort(
        key=lambda entry: (
            entry.get("normalized", ""),
            entry.get("type", ""),
            entry.get("slug", ""),
            entry.get("chapter", ""),
        )
    )

    return entries


def default_output_path(fetch_path: Path) -> Path:
    return fetch_path.parent / "search.index.json"


def write_index(output_path: Path, entries: list[dict[str, Any]]) -> None:
    payload = {
        "version": INDEX_VERSION,
        "generated": datetime.now(timezone.utc).isoformat(),
        "entries": entries,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=4, ensure_ascii=False)
        file.write("\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compile AnimePlex search.index.json from fetch.json."
    )

    parser.add_argument(
        "--fetch",
        type=Path,
        default=None,
        help="Path to fetch.json.",
    )

    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output path. Defaults to search.index.json beside fetch.json.",
    )

    parser.add_argument(
        "--ask",
        action="store_true",
        help="Always ask for the fetch.json path.",
    )

    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.fetch:
        fetch_path = args.fetch.expanduser().resolve()
    elif args.ask:
        fetch_path = ask_for_fetch_path()
    else:
        fetch_path = find_default_fetch_path() or ask_for_fetch_path()

    output_path = (
        args.out.expanduser().resolve()
        if args.out
        else default_output_path(fetch_path)
    )

    print(f"Loading fetch.json: {fetch_path}")

    fetch_data = load_json(fetch_path)

    print("Generating search index...")

    entries = build_index(fetch_data)

    write_index(output_path, entries)

    print(f"Generated {len(entries)} search entries.")
    print(f"Saved to: {output_path}")

    if len(entries) == 0:
        print("")
        print("Warning: generated 0 entries.")
        print("This usually means fetch.json does not contain a works array,")
        print("or its work/chapter fields use names this generator does not recognize.")


if __name__ == "__main__":
    main()
