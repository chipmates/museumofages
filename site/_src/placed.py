"""The addresses of links the museum places itself: /a/<letter>/ in front of a real path. The function
functions/a/[x]/[[path]].js answers each with the real path's own files, so nothing is copied. The build brings the
walk's one script for them (js/placed.js) and checks the built folder for what would break them: a canonical or
hreflang line a prefixed page would read as its own address, a prefixed address in the sitemap or in a page, a
folder under /a/ of its own, a forward of the host on such an address, or a route list that keeps the function
away from it. Standard library only."""
import json
import re
import shutil
from pathlib import Path
from urllib.parse import urljoin, urlsplit

SRC = Path(__file__).resolve().parent
SCRIPT = "placed.js"
# Read from the count's own list, so the build and the function cannot name different letters.
SOURCE_LIST = SRC.parent / "functions" / "_count" / "source.js"
# A few addresses the function must be asked for: a page, a file of the pages, the walk.
PROBES = ("/a/{x}/", "/a/{x}/de/", "/a/{x}/static/site.css", "/a/{x}/w/a-wing")
PREFIXED = re.compile(r"^/a/[a-z](?:/|$)")


def letters():
    m = re.search(r"const PREFIXES = Object\.freeze\(\{([^}]*)\}\)", SOURCE_LIST.read_text(encoding="utf-8"))
    return re.findall(r"\b([a-z]): '", m.group(1)) if m else []


def _route_match(rule, path):
    return re.fullmatch(re.escape(rule).replace(r"\*", ".*"), path) is not None


def finish(out, static, origin):
    """Copies the walk's script into the built folder and returns the problems found, as a list of lines."""
    out = Path(out)
    problems = []
    shutil.copyfile(SRC / "js" / SCRIPT, out / static / SCRIPT)
    found = letters()
    if not found:
        return [f"{SOURCE_LIST.name}: the letters of the placed addresses cannot be read"]
    script = (SRC / "js" / SCRIPT).read_text(encoding="utf-8")
    if f"/^\\/a\\/[{''.join(found)}]" not in script:
        problems.append(f"js/{SCRIPT}: does not take the letters {''.join(found)} off the walk's address")
    if (out / "a").exists():
        problems.append("a/: the built folder has a folder of its own where the placed addresses stand")
    if re.search(r"/a/[a-z]/", (out / "sitemap.xml").read_text(encoding="utf-8")):
        problems.append("sitemap.xml: names a placed address")
    redirects = out / "_redirects"
    for line in (redirects.read_text(encoding="utf-8").splitlines() if redirects.is_file() else []):
        if line.split() and PREFIXED.match(line.split()[0]):
            problems.append(f"_redirects: forwards a placed address ({line.strip()})")
    routes = json.loads((out / "_routes.json").read_text(encoding="utf-8"))
    for x in found:
        for probe in (p.format(x=x) for p in PROBES):
            runs = any(_route_match(r, probe) for r in routes.get("include", [])) and not any(
                _route_match(r, probe) for r in routes.get("exclude", []))
            if not runs:
                problems.append(f"_routes.json: the function is not asked for {probe}")
    for path in sorted(out.rglob("*.html")):
        text = path.read_text(encoding="utf-8")
        name = path.relative_to(out)
        here = "/" if str(name.parent) == "." else f"/{name.parent.as_posix()}/"
        heads = re.findall(r'<link rel="(?:canonical|alternate)"[^>]*\shref="([^"]*)"', text)
        heads += re.findall(r'<meta property="og:url" content="([^"]*)"', text)
        for ref in heads:
            # a relative line would name the prefixed address on a prefixed page
            if not ref.startswith(origin + "/") or PREFIXED.match(urlsplit(ref).path):
                problems.append(f"{name}: {ref} does not name the real address in full")
        if '<link rel="canonical"' not in text and not re.search(r'<meta name="robots" content="noindex', text):
            problems.append(f"{name}: no canonical and no noindex, so a prefixed address of it would stand as a page of its own")
        refs = re.findall(r'\s(?:href|src|action|poster|data-music)="([^"]*)"', text)
        refs += [part.strip().split(" ")[0] for group in re.findall(r'\s(?:srcset|imagesrcset)="([^"]*)"', text)
                 for part in group.split(",")]
        for ref in refs:
            target = urlsplit(urljoin(origin + here, ref))
            if target.netloc == urlsplit(origin).netloc and PREFIXED.match(target.path):
                problems.append(f"{name}: links to the placed address {ref}")
    return problems
