"""The site's languages, read from languages.json by both builds: which are built, which are listed, where each
one's pages stand, and a language's words in the registry. Standard library only.

English and German keep their words in registry.json as they always did. Every other language keeps its share of
the registry in registry.<code>.json beside it: the same keys, one string where the registry has one per language.
A wing's page, its topic pages and its door in that language are not written there: they come from the table's
slugs and from the English door."""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TABLE = HERE / "languages.json"
# A language's own files that are not its words: its approved locked lines and its house rules.
LANG_DIR = HERE / "lang"
CODE = r"[a-z]{2}(?:-[A-Z]{2})?"
FOLDER = r"[a-z]{2}(?:-[a-z]{2})?/"
SLUG = r"[a-z0-9]+(?:-[a-z0-9]+)*"
# The registry's leaves a language does not write: they come from the table.
DERIVED = re.compile(r"^(?:[^.]+\.page|[^.]+\.door|[^.]+\.topics\.\d+\.slug)$")


class Languages:
    def __init__(self, path=TABLE):
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        self.path = Path(path)
        self.entries = {e["code"]: e for e in data["languages"]}
        self.order = [e["code"] for e in data["languages"]]
        self.built = tuple(c for c in self.order if c in data["BUILT"])
        self.listed = tuple(c for c in self.order if c in data["LISTED"])
        self.problems = self.check(data)

    def check(self, data):
        p, where = [], self.path.name
        for name in ("BUILT", "LISTED"):
            unknown = [c for c in data[name] if c not in self.entries]
            if unknown:
                p.append(f"{where}: {name} names {unknown}, which the table does not hold")
        if [c for c in data["LISTED"] if c not in data["BUILT"]]:
            p.append(f"{where}: a listed language is always built")
        if self.order[:1] != ["en"] or "en" not in self.listed:
            p.append(f"{where}: English comes first and is always listed: its pages stand at the site's root")
        folders = [e.get("folder") for e in self.entries.values()]
        if len(set(folders)) != len(folders):
            p.append(f"{where}: two languages share a folder")
        for code, e in self.entries.items():
            if not re.fullmatch(CODE, code):
                p.append(f"{where}: {code!r} is not a language code")
            missing = [k for k in ("folder", "html", "name", "og", "deed", "status", "slugs") if k not in e]
            if missing:
                p.append(f"{where}: {code} lacks {', '.join(missing)}")
                continue
            if (code == "en") != (e["folder"] == "") or (code != "en" and not re.fullmatch(FOLDER, e["folder"])):
                p.append(f"{where}: {code}'s folder {e['folder']!r} is not a folder at the site's root (English has none)")
            if e["status"] not in ("ai", "native"):
                p.append(f"{where}: {code}'s status is {e['status']!r}, not ai or native")
            if not re.fullmatch(r"[a-z]{2}_[A-Z]{2}", e["og"]):
                p.append(f"{where}: {code}'s og locale {e['og']!r} is not of the form xx_XX")
            s = e["slugs"]
            for kind in ("what", "imprint", "privacy"):
                if kind not in s or not (s[kind] is None and kind == "imprint" or re.fullmatch(SLUG, s[kind] or "")):
                    p.append(f"{where}: {code}'s slug for {kind} is not a plain folder name")
            for kind in ("wings", "topics"):
                for key, slug in s.get(kind, {}).items():
                    if not re.fullmatch(SLUG, slug or ""):
                        p.append(f"{where}: {code}'s slug for {kind}.{key} is not a plain folder name")
        if self.entries.get("en", {}).get("slugs", {}).get("imprint") is None:
            p.append(f"{where}: English has its own legal notice, the one every other language links")
        return p

    def folder(self, code):
        return self.entries[code]["folder"]

    def html(self, code):
        return self.entries[code]["html"]

    def has_imprint(self, code):
        return self.entries[code]["slugs"]["imprint"] is not None

    def page(self, code, kind):
        """A page of the site's own, by its kind (home, what, imprint, privacy), as an address from the site's root.
        A language without a legal notice of its own links the English one."""
        if kind == "home":
            return self.folder(code)
        if kind == "imprint" and not self.has_imprint(code):
            code = "en"
        return f'{self.folder(code)}{self.entries[code]["slugs"][kind]}/'

    def door_lang(self, code):
        """The language as a wing's door names it: lower case."""
        return code.lower()

    def shown(self, code):
        """The languages a page in this language offers: the listed ones, and its own while it is not listed."""
        return tuple(c for c in self.order if c in self.listed or c == code)


def leaves(obj, path=""):
    """{path: leaf} of every per-language leaf of the registry (a dict that holds English), lists by their index."""
    out = {}
    if isinstance(obj, dict):
        if "en" in obj and all(isinstance(v, str) for v in obj.values()):
            return {path: obj}
        for k, v in obj.items():
            out.update(leaves(v, f"{path}.{k}" if path else k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            out.update(leaves(v, f"{path}.{i}"))
    return out


def at(obj, path):
    for step in path.split("."):
        if isinstance(obj, list):
            if not step.isdigit() or int(step) >= len(obj):
                return None
            obj = obj[int(step)]
        elif isinstance(obj, dict) and step in obj:
            obj = obj[step]
        else:
            return None
    return obj


def merge_leaves(obj, own, code, name, derived=None, optional=r"(^|\.)lang$"):
    """Writes code into every per-language leaf of obj, in place, from own (the language's file, the same keys with
    one string per leaf; None where there is no file). A leaf that already holds the language keeps it. derived(path,
    leaf) gives a leaf's value where the language does not write it, or None. A leaf on optional takes English's value
    where the file has none. Returns the problems."""
    problems = []
    for path, leaf in leaves(obj).items():
        if code in leaf:
            continue
        value = derived(path, leaf) if derived else None
        if isinstance(value, str):
            leaf[code] = value
            continue
        if value is not None:
            problems.append(value[1])
            continue
        text = at(own, path) if own is not None else None
        if isinstance(text, str) and text.strip():
            leaf[code] = text
        elif re.search(optional, path):
            leaf[code] = leaf["en"]
        elif own is None:
            return [f"{name} is missing: the words of {code} in it"]
        else:
            problems.append(f"{name}: {path} is missing")
    return problems


def load_own(folder, stem, code):
    """A language's file beside its English source (<stem>.<code>.json), or None."""
    file = Path(folder) / f"{stem}.{code}.json"
    return json.loads(file.read_text(encoding="utf-8")) if file.is_file() else None


def merge_registry(registry, folder, langs, codes=None):
    """Writes every language of codes into the registry's per-language leaves, in place: the words from
    registry.<code>.json in folder, the pages and the doors from the table. Returns the problems, which stop a build."""
    problems = []
    for code in codes or langs.built:
        if code not in langs.entries:
            problems.append(f"{code}: not a language of {langs.path.name}")
            continue
        slugs = langs.entries[code]["slugs"]

        def derived(path, leaf, code=code, slugs=slugs):
            if not DERIVED.match(path):
                return None
            wing = path.split(".", 1)[0]
            if path.endswith(".page"):
                if wing in slugs.get("wings", {}):
                    return langs.folder(code) + slugs["wings"][wing]
                return (None, f"{langs.path.name}: {code} has no slug for the page of the wing {wing!r}")
            if path.endswith(".door"):
                door, mine = leaf["en"], f"lang={langs.door_lang(code)}"
                return re.sub(r"\blang=en\b", mine, door) if "lang=en" in door else door + ("&" if "?" in door else "?") + mine
            if leaf["en"] in slugs.get("topics", {}):
                return slugs["topics"][leaf["en"]]
            return (None, f"{langs.path.name}: {code} has no slug for the topic page {leaf['en']!r} of {wing!r}")

        problems += merge_leaves(registry, load_own(folder, "registry", code), code, f"registry.{code}.json", derived)
    # English and German stand in the registry itself: where the table names their pages too, the two agree
    for code in ("en", "de"):
        for wing, slug in langs.entries.get(code, {}).get("slugs", {}).get("wings", {}).items():
            page = (registry.get(wing) or {}).get("page", {}).get(code)
            if page is not None and page.strip("/") != langs.folder(code) + slug:
                problems.append(f"{langs.path.name}: the {code} page of {wing!r} is {page!r} in the registry and "
                                f"{langs.folder(code) + slug!r} in the table")
    return problems
