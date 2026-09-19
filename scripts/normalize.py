#!/usr/bin/env python3
"""ACS 2024 5-year table-based summary files (data/raw/*.dat, www2.census.gov) -> data/counties.json
Effective rate = median real estate taxes paid (B25103_E001) / median owner-occupied home value (B25077_E001).
States come from the same files (sumlevel 040); US from 010."""
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw"
TABLES = {"b25103": ["tax_med", "tax_mortgage", "tax_nomortgage"], "b25077": ["home_med"], "b25064": ["rent_med"], "b19013": ["income_med"],
          "b25003": ["units", "owner_units", "renter_units"], "b01003": ["population"]}
STATES = {"01": ("Alabama", "AL"), "02": ("Alaska", "AK"), "04": ("Arizona", "AZ"), "05": ("Arkansas", "AR"), "06": ("California", "CA"), "08": ("Colorado", "CO"), "09": ("Connecticut", "CT"), "10": ("Delaware", "DE"), "11": ("District of Columbia", "DC"), "12": ("Florida", "FL"), "13": ("Georgia", "GA"), "15": ("Hawaii", "HI"), "16": ("Idaho", "ID"), "17": ("Illinois", "IL"), "18": ("Indiana", "IN"), "19": ("Iowa", "IA"), "20": ("Kansas", "KS"), "21": ("Kentucky", "KY"), "22": ("Louisiana", "LA"), "23": ("Maine", "ME"), "24": ("Maryland", "MD"), "25": ("Massachusetts", "MA"), "26": ("Michigan", "MI"), "27": ("Minnesota", "MN"), "28": ("Mississippi", "MS"), "29": ("Missouri", "MO"), "30": ("Montana", "MT"), "31": ("Nebraska", "NE"), "32": ("Nevada", "NV"), "33": ("New Hampshire", "NH"), "34": ("New Jersey", "NJ"), "35": ("New Mexico", "NM"), "36": ("New York", "NY"), "37": ("North Carolina", "NC"), "38": ("North Dakota", "ND"), "39": ("Ohio", "OH"), "40": ("Oklahoma", "OK"), "41": ("Oregon", "OR"), "42": ("Pennsylvania", "PA"), "44": ("Rhode Island", "RI"), "45": ("South Carolina", "SC"), "46": ("South Dakota", "SD"), "47": ("Tennessee", "TN"), "48": ("Texas", "TX"), "49": ("Utah", "UT"), "50": ("Vermont", "VT"), "51": ("Virginia", "VA"), "53": ("Washington", "WA"), "54": ("West Virginia", "WV"), "55": ("Wisconsin", "WI"), "56": ("Wyoming", "WY"), "72": ("Puerto Rico", "PR")}


def num(v):
    try:
        f = float(v)
        return None if f < 0 else (int(f) if f.is_integer() else f)  # -666666666 = suppressed
    except (TypeError, ValueError):
        return None


def load(table, cols):
    out = {}
    with open(RAW / f"{table}.dat") as fh:
        head = fh.readline().rstrip("\n").split("|")
        idx = [head.index(f"{table.upper()}_E{i + 1:03d}") for i in range(len(cols))]
        for line in fh:
            p = line.rstrip("\n").split("|")
            g = p[0]
            if g[:9] in ("0500000US", "0400000US", "0100000US"):
                out[g] = {c: num(p[i]) for c, i in zip(cols, idx)}
    return out


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()  # Doña Ana -> dona-ana
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")


def main():
    names = {}
    with open(RAW / "geos.dat", encoding="utf-8-sig") as fh:
        head = fh.readline().rstrip("\n").split("|")
        gi, ni = head.index("GEO_ID"), head.index("NAME")
        for line in fh:
            p = line.rstrip("\n").split("|")
            if p[gi][:9] in ("0500000US", "0400000US", "0100000US"):
                names[p[gi]] = p[ni]
    merged = defaultdict(dict)
    for t, cols in TABLES.items():
        for g, vals in load(t, cols).items():
            merged[g].update(vals)
    recs = []
    for g, v in merged.items():
        fips = g.split("US")[1]
        tax, home = v.get("tax_med"), v.get("home_med")
        # ACS jam values: 199 = "less than $200", 10001 = "$10,000 or more" (and 2000001 = "$2,000,000 or more" for value) — no rate from a bound
        v["tax_bound"] = "lt200" if tax == 199 else ("ge10000" if tax == 10001 else None)
        v["home_bound"] = "ge2m" if home == 2000001 else None
        v["rate"] = (tax / home * 100) if (tax is not None and home and not v["tax_bound"] and not v["home_bound"]) else None
        if g.startswith("0500000US"):
            st = STATES.get(fips[:2])
            if not st:
                continue
            name = names[g]
            county = name.split(",")[0].strip()
            recs.append({"level": "county", "fips": fips, "name": county, "state": st[0], "st": st[1], "slug": slug(county), **v})
        elif g.startswith("0400000US"):
            st = STATES.get(fips)
            if st:
                recs.append({"level": "state", "fips": fips, "name": st[0], "state": st[0], "st": st[1], "slug": slug(st[0]), **v})
        else:
            recs.append({"level": "us", "fips": "US", "name": "United States", "state": "", "st": "US", "slug": "us", **v})
    seen = set()
    for r in recs:
        if r["level"] == "county":
            k = (r["st"], r["slug"])
            n = 2
            while k in seen:
                r["slug"] = f"{slug(r['name'])}-{n}"; k = (r["st"], r["slug"]); n += 1
            seen.add(k)
    counties = [r for r in recs if r["level"] == "county"]
    with_rate = [r for r in counties if r["rate"]]
    print(f"{len(counties)} counties ({len(with_rate)} with a rate), {sum(1 for r in recs if r['level']=='state')} states")
    (ROOT / "data/counties.json").write_text(json.dumps({"source": {"name": "U.S. Census Bureau, ACS 2024 5-year (tables B25103, B25077, B25064, B19013, B25003, B01003)", "url": "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/", "fetched": "2026-09-19", "vintage": "2020–2024"}, "records": recs}, separators=(",", ":")))


if __name__ == "__main__":
    main()
