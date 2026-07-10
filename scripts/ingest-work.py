#!/usr/bin/env python3
"""AnimePlex work ingestion wizard, single-work runner, and batch ingester.

Single mode: behaves like the original wizard.
Batch mode: point it at a parent folder containing many work folders. Each immediate
subfolder becomes one work. Slug/display/parent_work_id are inferred automatically.
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import hashlib
import re
import shlex
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
DEFAULT_CDN = "https://cdn.animeplex.lol/works"
DEFAULT_UPLOAD_REMOTE = "animeplex.lol:extended/works"
DEFAULT_TOKEN_ENV = "GITHUB_TOKEN"
DEFAULT_THUMB_LOCATION = "first-chapter"

HARDCODED_GITHUB_TOKEN = ""
HARDCODED_R2_REMOTE_NAME = "animeplex-temp"
HARDCODED_R2_ACCOUNT_ID = ""
HARDCODED_R2_ACCESS_KEY_ID = ""
HARDCODED_R2_SECRET_ACCESS_KEY = ""
HARDCODED_R2_BUCKET = "extended"
HARDCODED_R2_PREFIX = "works"
HARDCODED_R2_ENDPOINT = ""


@dataclass
class Chapter:
    rel: str
    path: Path
    images: list[Path]
    pages: int
    padding: int
    extension: str


@dataclass
class WorkSpec:
    root: Path
    slug: str
    display: str
    parent_work_id: int | None


def clean_input(value: str) -> str:
    value = (value or "").strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        value = value[1:-1].strip()
    return value


def ask(prompt: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default not in (None, "") else ""
    value = clean_input(input(f"{prompt}{suffix}: "))
    return value or (default or "")


def ask_secret(prompt: str, default: str | None = None) -> str:
    suffix = " [hidden default]" if default else ""
    value = clean_input(getpass.getpass(f"{prompt}{suffix}: "))
    return value or (default or "")


def ask_bool(prompt: str, default: bool = False) -> bool:
    d = "Y/n" if default else "y/N"
    return ask(f"{prompt} ({d})", "y" if default else "n").lower() in {"y", "yes", "true", "1"}


def expand_path(value: str) -> Path:
    return Path(clean_input(value)).expanduser().resolve()


def slugify_name(name: str) -> str:
    name = clean_input(name)
    name = re.sub(r"[’']", "", name)
    name = re.sub(r"[^A-Za-z0-9.-]+", "_", name)
    name = re.sub(r"_+", "_", name).strip("_")
    return name or "Untitled_Work"


def display_from_slug(slug: str) -> str:
    text = slug.replace("_", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def display_from_folder_name(name: str) -> str:
    text = clean_input(name)
    text = text.replace(" _ ", " ")
    text = text.replace("_", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text or display_from_slug(slugify_name(name))


def load_json(path: Path, fallback: Any = None) -> Any:
    if not path.exists():
        return fallback
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: Any, dry: bool = False) -> None:
    if dry:
        print(f"DRY write {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def natural_key(path: Path) -> list[Any]:
    return [int(x) if x.isdigit() else x.lower() for x in re.split(r"(\d+)", path.name)]


def is_page_image(path: Path) -> bool:
    """Return True only for reader pages, excluding generated helper images."""
    if not path.is_file() or path.suffix.lower() not in IMAGE_EXTS:
        return False
    return path.name.lower() not in {"thumb.webp", "thumbnail.webp", "cover.webp"}


def detect_chapters(root: Path) -> list[Chapter]:
    """Recursively detect any folder that directly contains page images as a chapter."""
    chapters: list[Chapter] = []
    for d in sorted([p for p in root.rglob("*") if p.is_dir()], key=lambda x: natural_key(x)):
        imgs = sorted([p for p in d.iterdir() if is_page_image(p)], key=natural_key)
        if not imgs:
            continue
        rel = d.relative_to(root).as_posix()
        nums = [re.match(r"^(\d+)", p.stem) for p in imgs]
        padding = max((len(m.group(1)) for m in nums if m), default=3)
        ext = imgs[0].suffix.lower().lstrip(".")
        chapters.append(Chapter(rel, d, imgs, len(imgs), padding, ext))
    return chapters


def immediate_work_folders(parent: Path) -> list[Path]:
    candidates = [p for p in sorted(parent.iterdir(), key=natural_key) if p.is_dir()]
    return [p for p in candidates if detect_chapters(p)]


def require_pillow() -> Any:
    try:
        from PIL import Image
        return Image
    except ImportError as e:
        raise SystemExit("Image resize/thumb generation requires Pillow. Install with: python -m pip install Pillow") from e


def normalize_images(chapters: list[Chapter], width: int | None, quality: int, convert: str | None, delete_originals: bool, dry: bool) -> None:
    if not width and not convert:
        return
    Image = require_pillow()
    for ch in chapters:
        new: list[Path] = []
        for img in ch.images:
            out = img.with_suffix(f".{convert}") if convert else img
            if dry:
                new.append(out)
                continue
            with Image.open(img) as im:
                if width and im.width > width:
                    h = round(im.height * (width / im.width))
                    im = im.resize((width, h))
                save_kwargs = {"quality": quality} if out.suffix.lower() in {".jpg", ".jpeg", ".webp"} else {}
                if out.suffix.lower() == ".webp" and im.mode not in {"RGB", "RGBA"}:
                    im = im.convert("RGB")
                im.save(out, **save_kwargs)
            if convert and delete_originals and out != img:
                img.unlink()
            new.append(out)
        ch.images = sorted(new, key=natural_key)
        ch.extension = ch.images[0].suffix.lower().lstrip(".")


def renumber_pages(chapters: list[Chapter], dry: bool, default_padding: int = 3) -> None:
    """Rename pages in every chapter to 001.ext, 002.ext, ... in detected order.

    Numeric filenames are naturally sorted. Non-numeric filenames are sorted by their
    existing natural filename order and then renamed. A two-phase temporary rename avoids
    collisions when targets such as 001.webp already exist.
    """
    for ch in chapters:
        if not ch.images:
            continue

        extensions = {p.suffix.lower() for p in ch.images}
        if len(extensions) != 1:
            raise SystemExit(
                f"Mixed image extensions in {ch.path}. Convert them first with --convert webp "
                "or make the chapter use one extension."
            )

        ext = ch.images[0].suffix.lower()
        padding = max(default_padding, len(str(len(ch.images))))
        targets = [ch.path / f"{i:0{padding}d}{ext}" for i in range(1, len(ch.images) + 1)]

        if [p.resolve() for p in ch.images] == [p.resolve() for p in targets]:
            ch.padding = padding
            ch.extension = ext.lstrip(".")
            continue

        print(f"renumber: {ch.rel} -> {targets[0].name} .. {targets[-1].name}")
        if dry:
            ch.images = targets
            ch.padding = padding
            ch.extension = ext.lstrip(".")
            continue

        temp_paths: list[Path] = []
        for index, source in enumerate(ch.images):
            temporary = ch.path / f".__ingest_tmp_{index:06d}{source.suffix.lower()}"
            if temporary.exists():
                temporary.unlink()
            source.rename(temporary)
            temp_paths.append(temporary)

        for temporary, target in zip(temp_paths, targets):
            if target.exists():
                target.unlink()
            temporary.rename(target)

        ch.images = targets
        ch.pages = len(targets)
        ch.padding = padding
        ch.extension = ext.lstrip(".")


def thumb_rel(chapters: list[Chapter], thumb_location: str) -> str:
    if thumb_location == "first-chapter":
        return f"{chapters[0].rel}/thumb.webp"
    return "thumb.webp"


def thumb_url(cdn: str, slug: str, chapters: list[Chapter], thumb_location: str) -> str:
    return f"{cdn.rstrip('/')}/{slug}/{thumb_rel(chapters, thumb_location)}"


def generate_thumb(work_root: Path, chapters: list[Chapter], quality: int, dry: bool, thumb_location: str) -> Path:
    if not chapters:
        raise SystemExit("No chapters detected; cannot generate thumbnail.")
    thumb = chapters[0].path / "thumb.webp" if thumb_location == "first-chapter" else work_root / "thumb.webp"
    first_page = chapters[0].images[0]
    if dry:
        print(f"DRY thumb {first_page} -> {thumb}")
        return thumb
    Image = require_pillow()
    with Image.open(first_page) as im:
        if im.mode not in {"RGB", "RGBA"}:
            im = im.convert("RGB")
        im.thumbnail((600, 900))
        im.save(thumb, "WEBP", quality=quality)
    return thumb


def pointer(slug: str, display: str, source: str, cdn: str, chapters: list[Chapter], thumb_location: str) -> dict[str, Any]:
    return {"slug": slug, "display": display, "source": source, "manifest": f"works/{slug}.json", "thumb": thumb_url(cdn, slug, chapters, thumb_location)}


def upsert_pointer(path: Path, entry: dict[str, Any], dry: bool) -> None:
    data = load_json(path, {"version": 2, "default": {}, "works": []})
    works = data.setdefault("works", [])
    for i, w in enumerate(works):
        if isinstance(w, dict) and w.get("slug") == entry["slug"]:
            works[i] = entry
            break
    else:
        works.append(entry)
    write_json(path, data, dry)


def safe_cmd(cmd: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in cmd)


def run(cmd: list[str], dry: bool, env: dict[str, str] | None = None, check: bool = True) -> subprocess.CompletedProcess[str] | None:
    print("$ " + safe_cmd(cmd))
    if dry:
        return None
    return subprocess.run(cmd, check=check, env=env, text=True)


def parse_github_token_answer(answer: str) -> tuple[str, str | None]:
    answer = clean_input(answer)
    if not answer:
        return DEFAULT_TOKEN_ENV, None
    m = re.match(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$", answer)
    if m:
        return m.group(1), clean_input(m.group(2))
    if answer.startswith(("github_pat_", "ghp_", "gho_", "ghu_", "ghs_", "ghr_")):
        return DEFAULT_TOKEN_ENV, answer
    return answer, None


def git_push_with_optional_token(token: str | None, dry: bool) -> None:
    if not token:
        run(["git", "push"], dry)
        return
    remote_url = subprocess.check_output(["git", "remote", "get-url", "origin"], text=True).strip()
    if remote_url.startswith("https://github.com/"):
        authed_url = remote_url.replace("https://github.com/", f"https://x-access-token:{quote(token, safe='')}@github.com/", 1)
        print("$ git push origin HEAD  # token hidden")
        if not dry:
            subprocess.run(["git", "push", authed_url, "HEAD"], check=True)
    else:
        run(["git", "push"], dry)


def has_staged_changes() -> bool:
    return subprocess.run(["git", "diff", "--cached", "--quiet"]).returncode != 0


def r2_endpoint(account_id: str, endpoint: str) -> str:
    endpoint = clean_input(endpoint)
    if endpoint:
        return endpoint.rstrip("/")
    account_id = clean_input(account_id)
    return f"https://{account_id}.r2.cloudflarestorage.com" if account_id else ""


def rclone_remote_env(remote_name: str, account_id: str, endpoint: str, access_key_id: str, secret_access_key: str) -> dict[str, str]:
    remote_key = re.sub(r"[^A-Za-z0-9]", "_", remote_name).upper()
    endpoint_value = r2_endpoint(account_id, endpoint)
    if not endpoint_value:
        raise SystemExit("R2 endpoint/account id is required for built-in R2 credentials.")
    if not access_key_id or not secret_access_key:
        raise SystemExit("R2 access key id and secret access key are required for built-in R2 credentials.")
    env = os.environ.copy()
    env[f"RCLONE_CONFIG_{remote_key}_TYPE"] = "s3"
    env[f"RCLONE_CONFIG_{remote_key}_PROVIDER"] = "Cloudflare"
    env[f"RCLONE_CONFIG_{remote_key}_ACCESS_KEY_ID"] = access_key_id
    env[f"RCLONE_CONFIG_{remote_key}_SECRET_ACCESS_KEY"] = secret_access_key
    env[f"RCLONE_CONFIG_{remote_key}_ENDPOINT"] = endpoint_value
    env[f"RCLONE_CONFIG_{remote_key}_ACL"] = "private"
    return env


def deterministic_parent_work_id(slug: str) -> int:
    digest = hashlib.sha256(slug.encode("utf-8")).digest()
    value = int.from_bytes(digest[:8], "big")
    return 1_000_000_000 + (value % 8_999_999_999)


def existing_parent_work_id(data_dir: Path, slug: str) -> int | None:
    manifest = load_json(data_dir / "works" / f"{slug}.json", None)
    if isinstance(manifest, dict) and isinstance(manifest.get("parent_work_id"), int):
        return manifest["parent_work_id"]
    return None


def make_work_spec(root: Path, data_dir: Path, slug: str | None = None, display: str | None = None, parent_work_id: int | None = None, auto_id: bool = False) -> WorkSpec:
    real_slug = slug or slugify_name(root.name)
    real_display = display or display_from_folder_name(root.name)
    real_parent = parent_work_id
    if auto_id and real_parent is None:
        real_parent = existing_parent_work_id(data_dir, real_slug) or deterministic_parent_work_id(real_slug)
    return WorkSpec(root=root, slug=real_slug, display=real_display, parent_work_id=real_parent)


def ingest_one_work(spec: WorkSpec, args: argparse.Namespace) -> tuple[dict[str, Any], list[Path], list[Chapter]]:
    data = Path(args.repo_data)
    chapters = detect_chapters(spec.root)
    if not chapters:
        raise SystemExit(f"No image chapter folders found under {spec.root}")

    normalize_images(chapters, args.resize_width, args.quality, args.convert, args.delete_originals, args.dry_run)

    if args.normalize_page_numbers and not args.no_normalize_page_numbers:
        renumber_pages(chapters, args.dry_run)

    if args.generate_thumb:
        thumb_path = generate_thumb(spec.root, chapters, args.quality, args.dry_run, args.thumb_location)
        print(f"thumb: {thumb_path}")

    written: list[Path] = []
    for ch in chapters:
        ch.pages = len(ch.images)
        ch.padding = max([len(m.group(1)) for p in ch.images if (m := re.match(r"^(\d+)", p.stem))] or [ch.padding])
        ch.extension = ch.images[0].suffix.lower().lstrip(".")
        item = {
            "version": 1,
            "id": f"{spec.slug}-{ch.rel.replace('/', '-')}",
            "parent_work_slug": spec.slug,
            "slug": Path(ch.rel).name,
            "type": "chapter",
            "title": spec.display,
            "subtitle": Path(ch.rel).name.replace("_", " ").title(),
            "base_url": f"{args.cdn_base.rstrip('/')}/{spec.slug}/{ch.rel}",
            "pages": ch.pages,
            "padding": ch.padding,
            "extension": ch.extension,
        }
        if spec.parent_work_id is not None:
            item["parent_work_id"] = spec.parent_work_id
        write_json(ch.path / "item.json", item, args.dry_run)

    manifest = {
        "version": 1,
        "slug": spec.slug,
        "display": spec.display,
        "source": args.source,
        "thumb": thumb_url(args.cdn_base, spec.slug, chapters, args.thumb_location),
        "chapters": [c.rel for c in chapters],
    }
    if spec.parent_work_id is not None:
        manifest["parent_work_id"] = spec.parent_work_id
    manifest_path = data / "works" / f"{spec.slug}.json"
    write_json(manifest_path, manifest, args.dry_run)
    written.append(manifest_path)

    ent = pointer(spec.slug, spec.display, args.source, args.cdn_base, chapters, args.thumb_location)
    if args.update_fetch and not args.no_fetch_update:
        upsert_pointer(data / "fetch.json", ent, args.dry_run)
        written.append(data / "fetch.json")
    if args.update_rotunda and not args.no_rotunda:
        upsert_pointer(data / "rotunda.json", ent, args.dry_run)
        written.append(data / "rotunda.json")

    return manifest, written, chapters


def print_work_summary(spec: WorkSpec, chapters: list[Chapter], args: argparse.Namespace) -> None:
    print(
        f"\nDetected work:\n"
        f"- Work: {spec.display}\n"
        f"- Slug: {spec.slug}\n"
        f"- Parent work id: {spec.parent_work_id if spec.parent_work_id is not None else 'none'}\n"
        f"- Chapters: {len(chapters)}\n"
        f"- Pages: {sum(c.pages for c in chapters)}\n"
        f"- Extension: {chapters[0].extension}\n"
        f"- Thumb: {thumb_rel(chapters, args.thumb_location) if args.generate_thumb else 'skipped'}\n"
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest AnimePlex work folders.")
    ap.add_argument("folder", nargs="?", help="Single work folder, or parent folder in --multi mode.")
    ap.add_argument("--multi", action="store_true", help="Treat folder as a parent containing many work folders.")
    ap.add_argument("--slug")
    ap.add_argument("--display")
    ap.add_argument("--source", default="e")
    ap.add_argument("--parent-work-id", type=int)
    ap.add_argument("--auto-parent-work-id", action="store_true", help="Generate/reuse parent_work_id automatically.")
    ap.add_argument("--cdn-base", default=DEFAULT_CDN)
    ap.add_argument("--repo-data", default="src/data")
    ap.add_argument("--resize-width", type=int)
    ap.add_argument("--quality", type=int, default=85)
    ap.add_argument("--convert", choices=["webp"])
    ap.add_argument("--normalize-page-numbers", action="store_true", help="Rename every chapter to 001.ext onward.")
    ap.add_argument("--no-normalize-page-numbers", action="store_true", help="Keep original page filenames.")
    ap.add_argument("--generate-thumb", action="store_true")
    ap.add_argument("--thumb-location", choices=["first-chapter", "work-root"], default=DEFAULT_THUMB_LOCATION)
    ap.add_argument("--delete-originals", action="store_true")
    ap.add_argument("--update-fetch", action="store_true")
    ap.add_argument("--update-rotunda", action="store_true")
    ap.add_argument("--generate-search", action="store_true")
    ap.add_argument("--upload", choices=["rclone", "rsync"])
    ap.add_argument("--remote")
    ap.add_argument("--yes", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-upload", action="store_true")
    ap.add_argument("--no-search", action="store_true")
    ap.add_argument("--no-rotunda", action="store_true")
    ap.add_argument("--no-fetch-update", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--commit-push", action="store_true")
    ap.add_argument("--github-repo")
    ap.add_argument("--github-token-env", default=DEFAULT_TOKEN_ENV)
    ap.add_argument("--github-token", default=HARDCODED_GITHUB_TOKEN or None)
    ap.add_argument("--use-r2-values", action="store_true")
    ap.add_argument("--r2-remote-name", default=HARDCODED_R2_REMOTE_NAME)
    ap.add_argument("--r2-account-id", default=HARDCODED_R2_ACCOUNT_ID)
    ap.add_argument("--r2-endpoint", default=HARDCODED_R2_ENDPOINT)
    ap.add_argument("--r2-access-key-id", default=HARDCODED_R2_ACCESS_KEY_ID)
    ap.add_argument("--r2-secret-access-key", default=HARDCODED_R2_SECRET_ACCESS_KEY)
    ap.add_argument("--r2-bucket", default=HARDCODED_R2_BUCKET)
    ap.add_argument("--r2-prefix", default=HARDCODED_R2_PREFIX)
    args = ap.parse_args()

    guided = not args.folder
    token_value: str | None = args.github_token
    upload_env: dict[str, str] | None = None

    if guided:
        mode = ask("Ingest mode: 1 single work, 2 multiple work folders", "1")
        args.multi = mode.strip() == "2"
        folder_prompt = "Where is the parent folder containing work folders?" if args.multi else "Where is the curated work folder?"
        args.folder = ask(folder_prompt, "~/works")

        data_dir = Path(args.repo_data)
        if not args.multi:
            folder_name = expand_path(args.folder).name
            suggested_slug = slugify_name(folder_name)
            args.slug = ask("Work slug?", suggested_slug)
            suggested_display = display_from_folder_name(folder_name)
            args.display = ask("Display title?", suggested_display)
            p = ask("Parent work id?", "")
            args.parent_work_id = int(p) if p else None
        else:
            print("Batch mode uses each immediate subfolder name as the display-name source and auto-generates/reuses parent_work_id.")
            args.auto_parent_work_id = True

        args.source = ask("Source letter?", args.source or "e")
        args.cdn_base = ask("CDN base URL?", DEFAULT_CDN)
        args.repo_data = ask("Repo data folder?", "src/data")

        if ask_bool("Resize images?", False):
            args.resize_width = int(ask("Width?", "600"))
            args.quality = int(ask("Quality?", "85"))
            args.convert = "webp" if ask_bool("Convert to webp?", False) else None
            args.delete_originals = ask_bool("Delete originals after conversion?", False)

        args.normalize_page_numbers = ask_bool("Normalize/renumber every chapter to 001.ext onward?", True)
        args.generate_thumb = ask_bool("Generate thumb.webp?", True)
        args.thumb_location = DEFAULT_THUMB_LOCATION
        args.update_fetch = ask_bool("Update fetch.json?", True)
        args.update_rotunda = ask_bool("Update rotunda.json?", True)
        args.generate_search = ask_bool("Regenerate search.index.json?", True)

        if ask_bool("Upload to R2/CDN?", False):
            args.upload = ask("Upload method?", "rclone")
            if args.upload == "rclone" and ask_bool("Use pasted/built-in R2 credentials instead of existing rclone config?", False):
                args.use_r2_values = True
                args.r2_remote_name = ask("Temporary rclone remote name", args.r2_remote_name)
                args.r2_account_id = ask("Cloudflare account id", args.r2_account_id)
                args.r2_endpoint = ask("R2 endpoint URL", args.r2_endpoint or r2_endpoint(args.r2_account_id, ""))
                args.r2_bucket = ask("R2 bucket", args.r2_bucket)
                args.r2_prefix = ask("R2 prefix before work slug", args.r2_prefix)
                args.r2_access_key_id = ask("R2 access key id", args.r2_access_key_id)
                args.r2_secret_access_key = ask_secret("R2 secret access key", args.r2_secret_access_key)
                args.remote = f"{args.r2_remote_name}:{args.r2_bucket}/{args.r2_prefix.strip('/')}"
            else:
                args.remote = ask("Upload remote/destination before work slug?", DEFAULT_UPLOAD_REMOTE)

        args.commit_push = ask_bool("Commit/push to GitHub?", False)
        if args.commit_push:
            args.github_repo = ask("GitHub repo? optional; current git origin is used", "")
            token_answer = ask("GitHub token env var OR raw token OR export command", DEFAULT_TOKEN_ENV)
            args.github_token_env, parsed_token = parse_github_token_answer(token_answer)
            token_value = parsed_token or token_value

    if not guided and not args.no_normalize_page_numbers:
        args.normalize_page_numbers = True

    root = expand_path(args.folder)
    data = Path(args.repo_data)
    if args.multi:
        work_roots = immediate_work_folders(root)
        if not work_roots:
            raise SystemExit(f"No immediate work folders with image chapters found under {root}")
        specs = [make_work_spec(w, data, auto_id=True) for w in work_roots]
    else:
        specs = [make_work_spec(root, data, args.slug, args.display, args.parent_work_id, args.auto_parent_work_id)]

    print("\nWorks to ingest:")
    for spec in specs:
        print(f"- {spec.display} -> {spec.slug}")

    all_written: list[Path] = []
    all_summaries: list[tuple[WorkSpec, list[Chapter]]] = []
    for spec in specs:
        print(f"\n=== Ingesting {spec.display} ===")
        _manifest, written, chapters = ingest_one_work(spec, args)
        all_written.extend(written)
        all_summaries.append((spec, chapters))
        print_work_summary(spec, chapters, args)

    if args.generate_search and not args.no_search:
        run([
            sys.executable,
            "scripts/generate_search.py",
            "--fetch", str(data / "fetch.json"),
            "--storage", str(data / "storage.json"),
            "--out", str(data / "search.index.json"),
            "--source", args.source,
        ], args.dry_run)
        all_written.append(data / "search.index.json")

    uploaded = False
    if args.upload and not args.no_upload:
        if args.use_r2_values:
            upload_env = rclone_remote_env(args.r2_remote_name, args.r2_account_id, args.r2_endpoint, args.r2_access_key_id, args.r2_secret_access_key)
            if not args.remote:
                args.remote = f"{args.r2_remote_name}:{args.r2_bucket}/{args.r2_prefix.strip('/')}"
        if not args.remote:
            raise SystemExit("--remote is required for upload")
        for spec in specs:
            dest = f"{args.remote.rstrip('/')}/{spec.slug}"
            cmd = ["rclone", "copy", str(spec.root), dest, "--progress"] if args.upload == "rclone" else ["rsync", "-av", "--progress", str(spec.root) + "/", dest + "/"]
            run(cmd, args.dry_run, env=upload_env)
        uploaded = True

    if args.commit_push:
        token = token_value or os.getenv(args.github_token_env or DEFAULT_TOKEN_ENV) or HARDCODED_GITHUB_TOKEN or None
        if not token:
            raise SystemExit(f"GitHub token not found. Set {args.github_token_env}=... or paste the raw token when prompted.")
        paths = sorted({str(p) for p in all_written})
        run(["git", "add", *paths], args.dry_run)
        if args.dry_run or has_staged_changes():
            msg = f"Add AnimePlex works batch ({len(specs)})" if len(specs) > 1 else f"Add AnimePlex work {specs[0].display}"
            run(["git", "commit", "-m", msg], args.dry_run)
            git_push_with_optional_token(token, args.dry_run)
        else:
            print("GitHub: no staged data changes to commit; skipping commit/push.")

    print("\nAnimePlex ingest complete.")
    print(f"Works: {len(specs)}")
    print(f"Uploaded: {'yes' if uploaded else 'skipped'}")
    for spec, chapters in all_summaries:
        print(f"- {spec.display}: {len(chapters)} chapters, {sum(c.pages for c in chapters)} pages, slug={spec.slug}")


if __name__ == "__main__":
    main()
