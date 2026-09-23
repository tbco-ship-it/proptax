#!/usr/bin/env python3
"""Generate the static CountyTax site into dist/ from data/counties.json (+ data/state_rules.json when present)."""
import argparse
import datetime as dt
import hashlib
import json
import math
import re
import shutil
from xml.sax.saxutils import escape
from collections import defaultdict
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
SITE = "CountyTax"
MIN_POP_RANK = 20000  # rankings ignore tiny counties where a $200 topcode swings the rate


def usd(n, dec=0):
    if n is None:
        return "—"
    if dec == 0:
        return f"${math.floor(n + 0.5):,}"  # same rounding as Math.round in app.js
    return f"${n:,.{dec}f}"


def tax_amount(n):
    """Census topcodes/bottomcodes shown as the range they are, never as a figure."""
    if n == 199:
        return "Less than $200"
    if n == 10001:
        return "$10,000 or more"
    return usd(n)


def relative_to(rate, benchmark):
    """'Above'/'Below' only when the two differ at the displayed precision (2 decimals); the same rule on home (app.js) and county pages."""
    if rate is None or benchmark is None:
        return ""
    shown = lambda x: math.floor(x * 100 + 0.5)
    if shown(rate) == shown(benchmark):
        return "About the same as"
    return "Above" if rate > benchmark else "Below"


def pct(n):
    return "—" if n is None else f"{n:.2f}%"


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def mmdd(s):
    """'11-01' -> 'Nov 1'; anything else passes through."""
    m = re.fullmatch(r"(\d{2})-(\d{2})", s or "")
    return f"{MONTHS[int(m.group(1)) - 1]} {int(m.group(2))}" if m else (s or "")


def write_sitemaps(urls, origin, base, lastmod=None, limit=5000):
    """One sitemap index plus a file per section, so Search Console reports coverage per section
    instead of one opaque pile. urls is a list of (shard, path)."""
    shards = defaultdict(list)
    for shard, u in urls:
        shards[shard].append(u)
    for k in [k for k, v in shards.items() if len(v) < 10 and k != "core"]:
        shards["core"] += shards.pop(k)
    out = DIST / "sitemaps"
    out.mkdir(parents=True, exist_ok=True)
    names = []
    for shard in sorted(shards):
        rows = shards[shard]
        parts = [rows[i:i + limit] for i in range(0, len(rows), limit)] or [[]]
        for n, part in enumerate(parts, 1):
            fn = f"{shard}.xml" if len(parts) == 1 else f"{shard}-{n}.xml"
            lm = f"<lastmod>{lastmod}</lastmod>" if lastmod else ""
            body = "\n".join(f"<url><loc>{escape(origin + base + u)}</loc>{lm}</url>" for u in part)
            (out / fn).write_text('<?xml version="1.0" encoding="UTF-8"?>\n'
                                  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                  + body + "\n</urlset>")
            names.append(fn)
    idx = "".join(f"<sitemap><loc>{origin}{base}sitemaps/{n}</loc></sitemap>" for n in names)
    (DIST / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n'
                                      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                                      + idx + "</sitemapindex>")
    return names


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="/proptax/")
    ap.add_argument("--origin", default="https://tbco-ship-it.github.io")
    ap.add_argument("--cname", default="")
    ap.add_argument("--adsense-pub", default="pub-8425563704095379")
    args = ap.parse_args()
    base = args.base if args.base.endswith("/") else args.base + "/"
    origin = args.origin.rstrip("/")
    today = dt.date.today()

    data = json.loads((ROOT / "data/counties.json").read_text())
    recs, source = data["records"], data["source"]
    rules_path = ROOT / "data/state_rules.json"
    rules = {r["code"]: r for r in json.loads(rules_path.read_text())} if rules_path.exists() else {}
    us = next(r for r in recs if r["level"] == "us")
    states = {r["st"]: dict(r, counties=[]) for r in recs if r["level"] == "state"}
    counties = [r for r in recs if r["level"] == "county" and r["st"] in states]
    for c in counties:
        c["path"] = f"{c['st'].lower()}/{c['slug']}/"
        c["tax_label"] = "less than $200" if c.get("tax_bound") == "lt200" else ("$10,000 or more" if c.get("tax_bound") == "ge10000" else usd(c["tax_med"]))
        c["home_label"] = "$2,000,000 or more" if c.get("home_bound") else usd(c["home_med"])
        c["topcoded"] = bool(c.get("tax_bound") or c.get("home_bound"))
        c["ratio_us"] = round(c["rate"] / us["rate"], 2) if c["rate"] else None
        states[c["st"]]["counties"].append(c)
    for st, s in states.items():
        s["path"] = f"{st.lower()}/"
        s["rules"] = rules.get(st)
        s["counties"].sort(key=lambda c: -(c["rate"] or 0))
        ranked = [c for c in s["counties"] if c["rate"]]
        for i, c in enumerate(ranked):
            c["rank_state"], c["n_state"] = i + 1, len(ranked)
        s["ratio_us"] = round(s["rate"] / us["rate"], 2) if s["rate"] else None
        for c in s["counties"]:
            c["ratio_state"] = round(c["rate"] / s["rate"], 2) if c["rate"] and s["rate"] else None
        # state-hub comparison: the same median-priced house in the highest- vs lowest-rate county, and the counties where most people live
        pool = [c for c in ranked if (c["population"] or 0) >= MIN_POP_RANK] or ranked
        s["spread"] = None
        if len(pool) >= 3 and s["home_med"]:
            hi, lo = pool[0], pool[-1]
            hi_tax, lo_tax = (math.floor(c["rate"] / 100 * s["home_med"] + 0.5) for c in (hi, lo))  # rounded like usd() so the shown gap adds up
            s["spread"] = {"hi": hi, "lo": lo, "hi_tax": hi_tax, "lo_tax": lo_tax, "gap": hi_tax - lo_tax, "small_pool": pool is ranked}
        for c in s["counties"]:
            c["income_share"] = c["tax_med"] / c["income_med"] * 100 if c["rate"] and not c.get("tax_bound") and c.get("income_med") else None
        s["populous"] = sorted(s["counties"], key=lambda c: -(c["population"] or 0))[:5] if len(s["counties"]) > 5 else []
    ranked_us = sorted([c for c in counties if c["rate"] and (c["population"] or 0) >= MIN_POP_RANK], key=lambda c: -c["rate"])
    for i, c in enumerate(ranked_us):
        c["rank_us"], c["n_us"] = i + 1, len(ranked_us)
    state_list = sorted(states.values(), key=lambda s: -(s["rate"] or 0))
    for i, s in enumerate([s for s in state_list if s["rate"]]):
        s["rank"] = i + 1

    h = hashlib.md5()
    for f in sorted((ROOT / "static").glob("*")):
        h.update(f.read_bytes())
    v = h.hexdigest()[:8]
    env = Environment(loader=FileSystemLoader(ROOT / "templates"), autoescape=select_autoescape(["html"]))
    env.filters["usd"] = usd
    env.filters["tax_amount"] = tax_amount
    env.filters["relative_to"] = relative_to
    env.filters["pct"] = pct
    env.filters["mmdd"] = mmdd
    env.globals["STATE_NAMES"] = {st: s["name"] for st, s in states.items()}
    env.globals.update(site=SITE, base=base, origin=origin, today=today.isoformat(), v=v, adsense_pub=args.adsense_pub,
                       us=us, states=states, state_list=state_list, n_counties=len(counties), source=source, rules=rules, MIN_POP_RANK=MIN_POP_RANK)

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    shutil.copytree(ROOT / "static", DIST / "static")
    # search index: [name, st, slug, rate (unrounded), tax_label, home_label, pop, rate_status (ok|bounded|missing)]
    items = [[c["name"], c["st"], c["slug"], c["rate"], c["tax_label"], c["home_label"], c["population"], c.get("rate_status") or ("ok" if c["rate"] else "missing")] for c in counties]
    items += [[s["name"], s["st"], "", s["rate"], usd(s["tax_med"]), usd(s["home_med"]), s["population"], "ok" if s["rate"] else "missing"] for s in states.values()]
    (DIST / "static/index.json").write_text(json.dumps({"us": [us["rate"], us["tax_med"], us["home_med"]], "states": {st: s["name"] for st, s in states.items()}, "items": items}, separators=(",", ":")))

    urls = []

    def write(path, template, sm=None, **ctx):
        out = DIST / path
        out.mkdir(parents=True, exist_ok=True)
        (out / "index.html").write_text(env.get_template(template).render(path=path, **ctx))
        urls.append((sm or path.split("/")[0] or "core", path))

    write("", "index.html", top=ranked_us[:8], bottom=ranked_us[-8:][::-1])
    for page in ("about", "methodology", "privacy", "terms", "contact"):
        write(f"{page}/", f"{page}.html")
    write("states/", "states.html")
    write("rankings/highest/", "ranking.html", title="Counties with the highest property tax rates", rows=ranked_us[:100], kind="highest")
    write("rankings/lowest/", "ranking.html", title="Counties with the lowest property tax rates", rows=ranked_us[-100:][::-1], kind="lowest")
    write("guide/how-property-tax-is-calculated/", "guide_calc.html")
    write("guide/appeal/", "guide_appeal.html")
    write("guide/due-dates/", "guide_due.html")
    for st, s in states.items():
        write(s["path"], "state.html", s=s)
        for c in s["counties"]:
            # No benchmark → no "similar rate" list (comparing against 0 just surfaced the state's cheapest counties)
            near = sorted([x for x in s["counties"] if x is not c and x["rate"]], key=lambda x: abs(x["rate"] - c["rate"]))[:6] if c["rate"] else []
            write(c["path"], "county.html", s=s, c=c, near=near)

    write_sitemaps(urls, origin, base)  # no lastmod: a rebuild is not a content change
    (DIST / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {origin}{base}sitemap.xml\n")
    (DIST / "404.html").write_text(env.get_template("404.html").render(path="404"))
    (DIST / ".nojekyll").write_text("")
    key = (ROOT / "static/indexnow-key.txt").read_text().strip()
    (DIST / f"{key}.txt").write_text(key + "\n")
    if args.adsense_pub:
        (DIST / "ads.txt").write_text(f"google.com, {args.adsense_pub}, DIRECT, f08c47fec0942fa0\n")
    if args.cname:
        (DIST / "CNAME").write_text(args.cname + "\n")
    print(f"built {len(urls)} pages ({len(counties)} counties, {len(states)} states, rules for {len(rules)}) -> {DIST}")


if __name__ == "__main__":
    main()
