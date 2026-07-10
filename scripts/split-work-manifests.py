#!/usr/bin/env python3
"""Split an embedded AnimePlex catalog into pointer entries plus per-work manifests."""
import argparse, json
from pathlib import Path


def read_json(path):
    with Path(path).open('r', encoding='utf-8') as fh:
        return json.load(fh)


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    if path.exists() and path.read_text(encoding='utf-8') == text:
        return False
    path.write_text(text, encoding='utf-8')
    return True


def dedupe_works(works):
    seen, result = set(), []
    for work in works:
        slug = work.get('slug')
        if not slug or slug in seen:
            continue
        seen.add(slug)
        result.append(work)
    return result


def pointer_catalog(catalog, works_dir, thumb_base):
    pointers = []
    for work in dedupe_works(catalog.get('works', [])):
        slug = work['slug']
        source = work.get('source', catalog.get('default', {}).get('source'))
        manifest_name = f'{slug}.json'
        manifest = {
            'version': 1,
            'slug': slug,
            'display': work.get('display', slug),
            'source': source,
            'chapters': work.get('chapters', []),
        }
        yield ('manifest', Path(works_dir) / manifest_name, manifest)
        pointer = {k: v for k, v in work.items() if k != 'chapters'}
        pointer.update({
            'slug': slug,
            'display': work.get('display', slug),
            'source': source,
            'manifest': f'works/{manifest_name}',
            'thumb': f'{thumb_base.rstrip("/")}/{slug}/thumb.webp',
        })
        pointers.append(pointer)
    out = {
        'version': catalog.get('version', 2),
        'default': catalog.get('default', {}),
        'works': pointers,
    }
    yield ('catalog', None, out)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--output-fetch', required=True)
    parser.add_argument('--output-rotunda')
    parser.add_argument('--works-dir', required=True)
    parser.add_argument('--thumb-base', required=True)
    parser.add_argument('--dry-run', action='store_true', help='print intended writes without changing files')
    args = parser.parse_args()

    catalog = read_json(args.input)
    generated = list(pointer_catalog(catalog, args.works_dir, args.thumb_base))
    fetch_catalog = next(data for kind, _, data in generated if kind == 'catalog')
    writes = [(path, data) for kind, path, data in generated if kind == 'manifest']
    writes.append((Path(args.output_fetch), fetch_catalog))
    if args.output_rotunda:
        writes.append((Path(args.output_rotunda), fetch_catalog))

    for path, data in writes:
        if args.dry_run:
            print(f'would write {path}')
        else:
            changed = write_json(path, data)
            print(f'{"wrote" if changed else "unchanged"} {path}')

if __name__ == '__main__':
    main()
