# CountyTax — property tax rate by U.S. county

Static site. Source: Census ACS 2024 5-year table-based summary files (B25103 taxes paid, B25077 home value, B25064 rent, B19013 income, B25003 tenure, B01003 population) from www2.census.gov; state due-date rules in data/state_rules.json (hand-verified).

```
../martday/.venv/bin/python scripts/normalize.py   # data/raw/*.dat -> data/counties.json
../martday/.venv/bin/python scripts/build.py --base / --origin https://<domain> --cname <domain>
```
