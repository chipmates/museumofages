#!/usr/bin/env python3
"""Asks a local server for every address a built search page points at.

    python3 pages/check_links.py <server> <page> [<page> ...] [--known <path> ...]

    <server>  for example http://127.0.0.1:6161
    <page>    a built page's path from the site's root, for example <wing>/<topic>/
    --known   a path of the site that is expected to be missing today (a wing's own page before
              the site builds it). It is reported, and it does not fail the run.

Serve a folder that holds the built site AND the built pages: dist/ after the site's build holds both.
Only the local server is asked. An address on another host is listed, never fetched.
The exit code is 1 when an address of the site itself is not found, apart from the --known ones,
the ones in KNOWN_ELSEWHERE (the museum app's own routes, which the join brings) and the ones the
host forwards: the built folder's _redirects names them, and a plain file server knows nothing of it.
"""
import html
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

# Routes of the museum app. They are not part of the static pages.
KNOWN_ELSEWHERE = (r"^/w/[a-z0-9-]+$",)


def addresses(text):
    found = set()
    for attr in ("href", "src"):
        found |= set(re.findall(rf'<(?:a|img|link|source|script)\b[^>]*\b{attr}="([^"]+)"', text))
    for group in re.findall(r'\b(?:srcset|imagesrcset)="([^"]+)"', text):
        found |= {part.strip().split(" ")[0] for part in group.split(",")}
    found |= set(re.findall(r'url\("([^"]+)"\)', text))
    return {html.unescape(a) for a in found if not a.startswith(("data:", "#", "mailto:"))}


def fetch(target):
    """The answer code and the body. A folder without a page of its own counts as not found:
    the test server answers it with a listing of its files."""
    try:
        with urllib.request.urlopen(target, timeout=10) as answer:
            body = answer.read()
            code = answer.status
    except urllib.error.HTTPError as err:
        return err.code, ""
    kind = answer.headers.get("Content-Type", "")
    text = body.decode("utf-8", "replace") if kind.startswith("text/") else ""
    if "<title>Directory listing for" in text:
        return 404, ""
    return code, text


def forwards(base):
    """The addresses the host forwards, each with where it sends them: the built folder's _redirects."""
    try:
        with urllib.request.urlopen(f"{base}/_redirects", timeout=10) as answer:
            lines = answer.read().decode("utf-8", "replace").splitlines()
    except urllib.error.HTTPError:
        return {}
    rows = (line.split() for line in lines if line.strip() and not line.lstrip().startswith("#"))
    return {row[0]: row[1] for row in rows if len(row) >= 2}


def main(base, pages, known=()):
    base = base.rstrip("/")
    host = urllib.parse.urlsplit(base).netloc
    forwarded = forwards(base)
    bad = 0
    for page in pages:
        url = f"{base}/{page.lstrip('/')}"
        text = urllib.request.urlopen(url, timeout=10).read().decode("utf-8")
        canonical = set(re.findall(r'<link rel="(?:canonical|alternate)"[^>]*href="([^"]+)"', text))
        print(f"\n{url}")
        for ref in sorted(addresses(text) - canonical):
            target = urllib.parse.urljoin(url, ref)
            parts = urllib.parse.urlsplit(target)
            if parts.netloc != host:
                print(f"  outside  {ref}")
                continue
            if parts.path in forwarded:
                print(f"  forward  {ref}  (the host sends it to {forwarded[parts.path]})")
                continue
            code, body = fetch(target.split("#")[0])
            note = ""
            if code != 200:
                if any(re.search(p, parts.path) for p in KNOWN_ELSEWHERE):
                    note = "  (the museum app's route, known)"
                elif parts.path.rstrip("/") in {k.rstrip("/") for k in known}:
                    note = "  (named as known: not built yet)"
                else:
                    bad += 1
                    note = "  NOT FOUND"
            elif "#" in ref:
                anchor = ref.split("#", 1)[1]
                if f'id="{anchor}"' not in body:
                    bad += 1
                    note = f"  the page has no #{anchor}"
            print(f"  {code}      {ref}{note}")
    return 1 if bad else 0


if __name__ == "__main__":
    args, known = [], []
    rest = iter(sys.argv[1:])
    for arg in rest:
        if arg == "--known":
            known.append(next(rest))
        else:
            args.append(arg)
    if len(args) < 2:
        raise SystemExit(__doc__)
    sys.exit(main(args[0], args[1:], known))
