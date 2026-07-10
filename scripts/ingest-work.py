#!/usr/bin/env python3
"""AnimePlex work ingestion wizard and one-command runner.

Security notes:
- Preferred: keep GitHub/R2 secrets in environment variables or an ignored local file.
- Supported for temporary workers/test buckets: paste raw GitHub/R2 values at prompts, pass
  them as CLI args, or fill the HARDCODED_* constants below in a private copy of this file.
- The script hides secrets in printed commands and never writes the rclone credentials to disk.
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
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
DEFAULT_THUMB_LOCATION = "first-chapter"  # "first-chapter" or "work-root"

# Optional private-worker/test-bucket convenience values.
# Leave these blank in the public repo. In a private temporary copy, you may fill them.
HARDCODED_GITHUB_TOKEN = ""
HARDCODED_R2_REMOTE_NAME = "animeplex-temp"
HARDCODED_R2_ACCOUNT_ID = ""
HARDCODED_R2_ACCESS_KEY_ID = ""
HARDCODED_R2_SECRET_ACCESS_KEY = ""
HARDCODED_R2_BUCKET = "extended"
HARDCODED_R2_PREFIX = "works"
HARDCODED_R2_ENDPOINT = ""  # optional; if blank and account id is set, endpoint is derived


@dataclass
class Chapter:
    rel: str
    path: Path
    images: list[Path]
    pages: int
    padding: int
    extension: str


def clean_input(value: str) -> str:
    """Strip accidental shell quotes and surrounding whitespace."""
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
    # Preserve useful punctuation from the real folder name while removing the scraper-style separator.
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
    """True for actual reader pages; false for generated helper images like thumb.webp."""
    if not path.is_file() or path.suffix.lower() not in IMAGE_EXTS:
        return False
    if path.name.lower() in {"thumb.webp", "thumbnail.webp", "cover.webp"}:
        return False
    return True


def detect_chapters(root: Path) -> list[Chapter]:
    chapters: list[Chapter] = []
    for d in sorted([p for p in root.rglob("*") if p.is_dir()]):
        imgs = sorted([p for p in d.iterdir() if is_page_image(p)], key=natural_key)
        if not imgs:
            continue
        rel = d.relative_to(root).as_posix()
        nums = [re.match(r"^(\d+)", p.stem) for p in imgs]
        padding = max((len(m.group(1)) for m in nums if m), default=3)
        ext = imgs[0].suffix.lower().lstrip(".")
        chapters.append(Chapter(rel, d, imgs, len(imgs), padding, ext))
    return chapters


def require_pillow() -> Any:
    try:
        from PIL import Image
        return Image
    except ImportError as e:
        raise SystemExit("Image resize/thumb generation requires Pillow. Install with: python -m pip install Pillow") from e


def normalize_images(
    chapters: list[Chapter],
    width: int | None,
    quality: int,
    convert: str | None,
    delete_originals: bool,
    dry: bool,
) -> None:
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
    """Rename every chapter's pages to 001.ext, 002.ext, ... in natural order.

    This fixes folders that start at 035.webp or any other offset while keeping item.json
    compatible with the reader's simple 001..N URL generation. Generated helper files like
    thumb.webp are excluded before this runs.
    """
    for ch in chapters:
        if not ch.images:
            continue

        ext = ch.images[0].suffix.lower()
        if any(p.suffix.lower() != ext for p in ch.images):
            raise SystemExit(f"Mixed image extensions in {ch.path}. Convert first or clean the folder.")

        padding = max(default_padding, len(str(len(ch.images))), ch.padding or 0)
        targets = [ch.path / f"{i:0{padding}d}{ext}" for i in range(1, len(ch.images) + 1)]

        if [p.resolve() for p in ch.images] == [p.resolve() for p in targets]:
            ch.padding = padding
            ch.extension = ext.lstrip(".")
            continue

        print(f"renumber: {ch.rel} -> 001{ext}..{len(ch.images):0{padding}d}{ext}")
        if dry:
            ch.images = targets
            ch.padding = padding
            ch.extension = ext.lstrip(".")
            continue

        temp_paths: list[Path] = []
        for idx, src in enumerate(ch.images):
            tmp = ch.path / f".__ingest_tmp_{idx:05d}{src.suffix.lower()}"
            if tmp.exists():
                tmp.unlink()
            src.rename(tmp)
            temp_paths.append(tmp)

        for tmp, dest in zip(temp_paths, targets):
            if dest.exists():
                dest.unlink()
            tmp.rename(dest)

        ch.images = targets
        ch.padding = padding
        ch.extension = ext.lstrip(".")


def thumb_rel(chapters: list[Chapter], thumb_location: str) -> str:
    if thumb_location == "first-chapter":
        return f"{chapters[0].rel}/thumb.webp"
    return "thumb.webp"


def thumb_url(cdn: str, slug: str, chapters: list[Chapter], thumb_location: str) -> str:
    return f"{cdn.rstrip('/')}/{slug}/{thumb_rel(chapters, thumb_location)}"


def generate_thumb(work_root: Path, chapters: list[Chapter], quality: int, dry: bool, thumb_location: str) -> Path:
    """Create thumb.webp from the first page, either at work root or first chapter."""
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
    return {
        "slug": slug,
        "display": display,
        "source": source,
        "manifest": f"works/{slug}.json",
        "thumb": thumb_url(cdn, slug, chapters, thumb_location),
    }


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


def run(cmd: list[str], dry: bool, env: dict[str, str] | None = None) -> None:
    print("$ " + safe_cmd(cmd))
    if not dry:
        subprocess.run(cmd, check=True, env=env)


def parse_github_token_answer(answer: str) -> tuple[str, str | None]:
    """Accept GITHUB_TOKEN, a raw token, or export GITHUB_TOKEN='token'."""
    answer = clean_input(answer)
    if not answer:
        return DEFAULT_TOKEN_ENV, None

    m = re.match(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$", answer)
    if m:
        name = m.group(1)
        raw = clean_input(m.group(2))
        return name, raw

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


def r2_endpoint(account_id: str, endpoint: str) -> str:
    endpoint = clean_input(endpoint)
    if endpoint:
        return endpoint.rstrip("/")
    account_id = clean_input(account_id)
    return f"https://{account_id}.r2.cloudflarestorage.com" if account_id else ""


def rclone_remote_env(
    remote_name: str,
    account_id: str,
    endpoint: str,
    access_key_id: str,
    secret_access_key: str,
) -> dict[str, str]:
    """Build temporary rclone config in environment variables; no config file is written."""
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


def masked_remote(remote: str) -> str:
    return remote.replace(HARDCODED_R2_ACCESS_KEY_ID, "***") if HARDCODED_R2_ACCESS_KEY_ID else remote


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest a curated AnimePlex work folder.")
    ap.add_argument("folder", nargs="?")
    ap.add_argument("--slug")
    ap.add_argument("--display")
    ap.add_argument("--source", default="e")
    ap.add_argument("--parent-work-id", type=int)
    ap.add_argument("--cdn-base", default=DEFAULT_CDN)
    ap.add_argument("--repo-data", default="src/data")
    ap.add_argument("--resize-width", type=int)
    ap.add_argument("--quality", type=int, default=85)
    ap.add_argument("--convert", choices=["webp"])
    ap.add_argument("--generate-thumb", action="store_true")
    ap.add_argument("--thumb-location", choices=["first-chapter", "work-root"], default=DEFAULT_THUMB_LOCATION)
    ap.add_argument("--delete-originals", action="store_true")
    ap.add_argument("--normalize-page-numbers", action="store_true", help="Rename pages in each chapter to 001.ext, 002.ext, ...")
    ap.add_argument("--no-normalize-page-numbers", action="store_true", help="Do not ask/perform page renumbering in guided mode.")
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
    ap.add_argument("--use-r2-values", action="store_true", help="Use R2 values from CLI/HARDCODED_* instead of existing rclone config.")
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
        folder_answer = ask("Where is the curated work folder?", "~/works/A_Certain_Magical_Index")
        args.folder = folder_answer
        folder_name = expand_path(folder_answer).name

        suggested_slug = slugify_name(folder_name)
        args.slug = ask("Work slug?", suggested_slug)

        suggested_display = display_from_folder_name(folder_name)
        args.display = ask("Display title?", suggested_display)

        args.source = ask("Source letter?", args.source or "e")
        p = ask("Parent work id?", "")
        args.parent_work_id = int(p) if p else None
        args.cdn_base = ask("CDN base URL?", DEFAULT_CDN)
        args.repo_data = ask("Repo data folder?", "src/data")

        if ask_bool("Resize images?", False):
            args.resize_width = int(ask("Width?", "600"))
            args.quality = int(ask("Quality?", "85"))
            args.convert = "webp" if ask_bool("Convert to webp?", False) else None
            args.delete_originals = ask_bool("Delete originals after conversion?", False)

        if not args.no_normalize_page_numbers:
            args.normalize_page_numbers = ask_bool("Normalize/renumber pages to 001.ext onward?", True)

        args.generate_thumb = ask_bool("Generate thumb.webp?", True)
        # Default is first-chapter because the reader/rotunda expect <work>/<first chapter>/thumb.webp.
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

    root = expand_path(args.folder)
    slug = args.slug or slugify_name(root.name)
    display = args.display or display_from_slug(slug)
    data = Path(args.repo_data)

    chapters = detect_chapters(root)
    if not chapters:
        raise SystemExit(f"No image chapter folders found under {root}")

    normalize_images(chapters, args.resize_width, args.quality, args.convert, args.delete_originals, args.dry_run)

    if args.normalize_page_numbers and not args.no_normalize_page_numbers:
        renumber_pages(chapters, args.dry_run)

    if args.generate_thumb:
        thumb_path = generate_thumb(root, chapters, args.quality, args.dry_run, args.thumb_location)
        print(f"thumb: {thumb_path}")

    for ch in chapters:
        ch.pages = len(ch.images)
        ch.padding = max([len(m.group(1)) for p in ch.images if (m := re.match(r"^(\d+)", p.stem))] or [ch.padding])
        ch.extension = ch.images[0].suffix.lower().lstrip(".")
        item = {
            "version": 1,
            "id": f"{slug}-{ch.rel.replace('/', '-')}",
            "parent_work_slug": slug,
            "slug": Path(ch.rel).name,
            "type": "chapter",
            "title": display,
            "subtitle": Path(ch.rel).name.replace("_", " ").title(),
            "base_url": f"{args.cdn_base.rstrip('/')}/{slug}/{ch.rel}",
            "pages": ch.pages,
            "padding": ch.padding,
            "extension": ch.extension,
        }
        if args.parent_work_id is not None:
            item["parent_work_id"] = args.parent_work_id
        write_json(ch.path / "item.json", item, args.dry_run)

    manifest = {
        "version": 1,
        "slug": slug,
        "display": display,
        "source": args.source,
        "thumb": thumb_url(args.cdn_base, slug, chapters, args.thumb_location),
        "chapters": [c.rel for c in chapters],
    }
    write_json(data / "works" / f"{slug}.json", manifest, args.dry_run)

    ent = pointer(slug, display, args.source, args.cdn_base, chapters, args.thumb_location)
    if args.update_fetch and not args.no_fetch_update:
        upsert_pointer(data / "fetch.json", ent, args.dry_run)
    if args.update_rotunda and not args.no_rotunda:
        upsert_pointer(data / "rotunda.json", ent, args.dry_run)

    if args.generate_search and not args.no_search:
        run([
            sys.executable,
            "scripts/generate_search.py",
            "--fetch", str(data / "fetch.json"),
            "--storage", str(data / "storage.json"),
            "--out", str(data / "search.index.json"),
            "--source", args.source,
        ], args.dry_run)

    uploaded = False
    if args.upload and not args.no_upload:
        if args.use_r2_values:
            upload_env = rclone_remote_env(
                args.r2_remote_name,
                args.r2_account_id,
                args.r2_endpoint,
                args.r2_access_key_id,
                args.r2_secret_access_key,
            )
            if not args.remote:
                args.remote = f"{args.r2_remote_name}:{args.r2_bucket}/{args.r2_prefix.strip('/')}"
        if not args.remote:
            raise SystemExit("--remote is required for upload")
        dest = f"{args.remote.rstrip('/')}/{slug}"
        if args.upload == "rclone":
            cmd = ["rclone", "copy", str(root), dest, "--progress"]
        else:
            cmd = ["rsync", "-av", "--progress", str(root) + "/", dest + "/"]
        run(cmd, args.dry_run, env=upload_env)
        uploaded = True

    if args.commit_push:
        token = token_value or os.getenv(args.github_token_env or DEFAULT_TOKEN_ENV) or HARDCODED_GITHUB_TOKEN or None
        if not token:
            raise SystemExit(f"GitHub token not found. Set {args.github_token_env}=... or paste the raw token when prompted.")
        run(["git", "add", str(data / "fetch.json"), str(data / "rotunda.json"), str(data / "search.index.json"), str(data / "works" / f"{slug}.json")], args.dry_run)
        run(["git", "commit", "-m", f"Add AnimePlex work {display}"], args.dry_run)
        git_push_with_optional_token(token, args.dry_run)

    print(
        f"\nAnimePlex ingest complete.\n\n"
        f"Detected:\n"
        f"- Work: {display}\n"
        f"- Slug: {slug}\n"
        f"- Source: {args.source}\n"
        f"- Chapters: {len(chapters)}\n"
        f"- Pages: {sum(c.pages for c in chapters)}\n"
        f"- Extension: {chapters[0].extension}\n"
        f"- Padding: {max(c.padding for c in chapters)}\n\n"
        f"Generated:\n"
        f"- item.json files: {len(chapters)}\n"
        + (f"- thumb.webp at {thumb_rel(chapters, args.thumb_location)}\n" if args.generate_thumb else "")
        + f"- {data / 'works' / f'{slug}.json'}\n\n"
        f"Updated:\n"
        + (f"- {data / 'fetch.json'}\n" if args.update_fetch and not args.no_fetch_update else "")
        + (f"- {data / 'rotunda.json'}\n" if args.update_rotunda and not args.no_rotunda else "")
        + (f"- {data / 'search.index.json'}\n" if args.generate_search and not args.no_search else "")
        + (f"\nUploaded:\n- {root}\n  -> {args.remote.rstrip('/') + '/' + slug}\n" if uploaded else "\nUploaded:\n- skipped\n")
        + ("\nGitHub:\n- committed changed JSON files\n- pushed to selected branch\n" if args.commit_push else "\nGitHub:\n- skipped\n")
    )


if __name__ == "__main__":
    main()
