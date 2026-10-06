#!/usr/bin/env python3
"""Fetches the pictures and the music the site's build needs, which the repository does not keep.

    python3 _src/tools/fetch.py                     fetch every listed file that is missing or differs
    python3 _src/tools/fetch.py --check             say what is missing or differs, fetch nothing
    python3 _src/tools/fetch.py --from <folder>     copy them from a folder laid out like the built site, no network
    python3 _src/tools/fetch.py --record [path ...] write each listed file's hash and size as it stands here, and
                                                     add the paths given (after a new cut by make_images.py)

The museum's art lives outside the repository: these files are frames of its film, cuts of them and the film's
music, and some frames show reproductions that carry their own terms. fetch-list.json names each file by its place
in site/, its address on the live site, its size and its SHA-256. A file is kept only when its hash agrees. A file
that is complete is never fetched again, and a broken download goes on where it stopped. One file at a time.
Standard library only.
"""
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parent.parent
LIST = HERE.parent / "fetch-list.json"
AGENT = "MuseumOfAges-site-fetch/1.0 (+https://museumofages.org; contact@museumofages.org)"
# Where a listed folder is served on the site.
SERVED = {"_src/img/": "/static/img/", "pages/pics/img/": "/static/img/", "_src/media/": "/static/media/"}


def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def place(entry):
    """The file's place in site/. A path that leaves site/ stops the tool."""
    path = (SITE / entry["path"]).resolve()
    if SITE.resolve() not in path.parents or not entry["url"].startswith("/") or ".." in entry["url"]:
        raise SystemExit(f"fetch: the list names {entry['path']} at {entry['url']}, outside the site")
    return path


def good(entry):
    path = place(entry)
    return path.is_file() and path.stat().st_size == entry["bytes"] and digest(path) == entry["sha256"]


def mb(n):
    return f"{n / 1e6:.1f} MB"


def download(url, part):
    """One file into part, going on from what part already holds where the server allows it."""
    have = part.stat().st_size if part.exists() else 0
    request = urllib.request.Request(url, headers={"User-Agent": AGENT, **({"Range": f"bytes={have}-"} if have else {})})
    try:
        answer = urllib.request.urlopen(request, timeout=30)
    except urllib.error.HTTPError as error:
        if error.code != 416 or not have:
            raise
        # what part holds is not a beginning of the file: start over
        part.unlink()
        return download(url, part)
    with answer:
        mode = "ab" if have and answer.status == 206 else "wb"
        with open(part, mode) as f:
            for block in iter(lambda: answer.read(1 << 16), b""):
                f.write(block)


def fetch(entries, origin, source=None):
    todo = [e for e in entries if not good(e)]
    print(f"{len(entries)} files listed, {mb(sum(e['bytes'] for e in entries))} in all. "
          f"{len(todo)} to {'copy' if source else 'fetch'}, {mb(sum(e['bytes'] for e in todo))}"
          + ("" if source else f", from {origin}") + ".", flush=True)
    failed = []
    for i, e in enumerate(todo, 1):
        path = place(e)
        path.parent.mkdir(parents=True, exist_ok=True)
        part = path.with_name(path.name + ".part")
        try:
            if source:
                part.write_bytes((Path(source) / e["url"].lstrip("/")).read_bytes())
            else:
                for attempt in range(3):
                    try:
                        download(origin + e["url"], part)
                        break
                    except urllib.error.HTTPError:
                        raise
                    except (urllib.error.URLError, TimeoutError, ConnectionError):
                        if attempt == 2:
                            raise
                        time.sleep(2 + 3 * attempt)
            if part.stat().st_size != e["bytes"] or digest(part) != e["sha256"]:
                part.unlink()
                raise ValueError("its size or hash is not the listed one")
            part.replace(path)
            print(f"[{i}/{len(todo)}] {e['path']}", flush=True)
        except (OSError, ValueError, urllib.error.URLError) as error:
            failed.append(f"{e['path']}: {error}")
    if failed:
        raise SystemExit("fetch: these files are not here yet:\n" + "\n".join(failed))
    print("Every listed file is here and agrees with its hash.")


def record(listed, extra):
    entries = {e["path"]: e for e in listed["files"]}
    for rel in extra:
        rel = str((SITE / rel).resolve().relative_to(SITE.resolve()))
        folder = next((k for k in SERVED if rel.startswith(k)), None)
        if folder is None:
            raise SystemExit(f"fetch: {rel} is not in a folder the site serves ({', '.join(SERVED)})")
        entries.setdefault(rel, {"path": rel, "url": SERVED[folder] + rel[len(folder):]})
    for e in entries.values():
        path = place(e)
        if not path.is_file():
            raise SystemExit(f"fetch: {e['path']} is not here, so its hash cannot be written")
        e.update(bytes=path.stat().st_size, sha256=digest(path))
    listed["files"] = sorted(entries.values(), key=lambda e: e["path"])
    LIST.write_text(json.dumps(listed, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{LIST.name}: {len(listed['files'])} files, {mb(sum(e['bytes'] for e in listed['files']))}")


def main():
    listed = json.loads(LIST.read_text(encoding="utf-8"))
    args = sys.argv[1:]
    if "--record" in args:
        return record(listed, [a for a in args if a != "--record"])
    entries = listed["files"]
    if "--check" in args:
        bad = [e["path"] for e in entries if not good(e)]
        print("\n".join(bad) or "Every listed file is here and agrees with its hash.")
        sys.exit(1 if bad else 0)
    source = args[args.index("--from") + 1] if "--from" in args else None
    fetch(entries, listed["origin"].rstrip("/"), source)


if __name__ == "__main__":
    main()
