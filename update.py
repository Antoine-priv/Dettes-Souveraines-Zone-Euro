#!/usr/bin/env python3
"""Met à jour les données du site : taux 10 ans zone euro (2000 → aujourd'hui).

Sources, de la plus officielle à la plus récente :
  1. BCE : taux d'intérêt à long terme « critères de convergence » (moyenne
     mensuelle) — historique officiel, publié avec ~1 mois de retard ;
  2. CNBC : clôtures journalières des 2 dernières années — complètent les mois
     que la BCE n'a pas encore publiés (moyenne des jours du mois) ;
  3. TradingView : dernier cours (TVC:XX10Y) — taux du jour.

Écrit data/taux10y.js, chargé par index.html (fonctionne en ouvrant le fichier
directement comme sur GitHub Pages). Aucune dépendance : uniquement la
bibliothèque standard Python.
"""

import csv
import io
import json
import sys
import urllib.request
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "data" / "cache.json"
OUTPUT = ROOT / "data" / "taux10y.js"

START = "2000-01"
COUNTRIES = {  # ordre = ordre des couleurs
    "GR": "Grèce",
    "IT": "Italie",
    "ES": "Espagne",
    "PT": "Portugal",
    "IE": "Irlande",
    "FR": "France",
    "DE": "Allemagne",
}
ECB_URL = (
    "https://data-api.ecb.europa.eu/service/data/IRS/"
    "M.{code}.L.L40.CI.0000.EUR.N.Z?format=csvdata&startPeriod=" + START
)
CNBC_URL = "https://ts-api.cnbc.com/harmony/app/charts/1Y.json?symbol={code}10Y-{code}"
TV_URL = "https://scanner.tradingview.com/global/scan"
UA = {"User-Agent": "Mozilla/5.0"}


def http(url, data=None, headers=None, attempts=3, timeout=60):
    req = urllib.request.Request(url, data=data, headers={**UA, **(headers or {})})
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8")
        except OSError:
            if attempt == attempts:
                raise
            print(f"    nouvel essai ({attempt + 1}/{attempts})…", flush=True)


def fetch_ecb(code):
    """{'AAAA-MM': taux} — moyenne mensuelle officielle."""
    return {
        row["TIME_PERIOD"]: float(row["OBS_VALUE"])
        for row in csv.DictReader(io.StringIO(http(ECB_URL.format(code=code))))
        if row["OBS_VALUE"]
    }


def fetch_cnbc_daily(code):
    """{'AAAA-MM-JJ': clôture} — jours ouvrés uniquement."""
    bars = json.loads(http(CNBC_URL.format(code=code), timeout=30))["barData"]["priceBars"]
    out = {}
    for bar in bars:
        t = bar["tradeTime"]
        day = date(int(t[:4]), int(t[4:6]), int(t[6:8]))
        if day.weekday() < 5 and bar["close"]:
            out[day.isoformat()] = float(bar["close"])
    return out


def fetch_tradingview_live():
    """{'XX': dernier taux} pour tous les pays, en une requête."""
    body = json.dumps({
        "symbols": {"tickers": [f"TVC:{c}10Y" for c in COUNTRIES]},
        "columns": ["close"],
    }).encode()
    rows = json.loads(http(TV_URL, data=body, headers={"Content-Type": "application/json"}, timeout=30))["data"]
    return {r["s"].split(":")[1][:2]: r["d"][0] for r in rows if r["d"][0] is not None}


def download():
    data = {"ecb": {}, "daily": {}, "live": {}, "fetched": datetime.now().strftime("%d/%m/%Y %H:%M")}
    for code, name in COUNTRIES.items():
        print(f"  BCE : {name}…", flush=True)
        data["ecb"][code] = fetch_ecb(code)
    print("  CNBC : taux journaliers récents…", flush=True)
    for code in COUNTRIES:
        try:
            data["daily"][code] = fetch_cnbc_daily(code)
        except Exception as exc:
            print(f"    {code} indisponible ({exc})")
    print("  TradingView : taux du jour…", flush=True)
    try:
        data["live"] = fetch_tradingview_live()
        data["live_time"] = datetime.now().strftime("%d/%m/%Y %H:%M")
    except Exception as exc:
        print(f"    indisponible ({exc})")
    return data


def load_data():
    try:
        data = download()
        CACHE.parent.mkdir(exist_ok=True)
        CACHE.write_text(json.dumps(data))
        return data, False
    except Exception as exc:  # hors ligne : on retombe sur le cache
        if not CACHE.exists():
            sys.exit(f"Téléchargement impossible ({exc}) et aucun cache disponible.")
        print(f"  Téléchargement impossible ({exc}) → utilisation du cache.")
        data = json.loads(CACHE.read_text())
        if "ecb" not in data:  # ancien format de cache
            data = {"ecb": data["series"], "daily": {}, "live": {}, "fetched": data["fetched"]}
        return data, True


def merge(data):
    """Séries mensuelles : BCE, puis moyenne des jours (CNBC + taux du jour) pour les mois suivants."""
    today = date.today().isoformat()
    monthly = {}
    for code in COUNTRIES:
        ecb = dict(data["ecb"].get(code, {}))
        last_official = max(ecb) if ecb else "0000-00"
        daily = dict(data["daily"].get(code, {}))
        if code in data.get("live", {}):
            daily[today] = data["live"][code]
        by_month = {}
        for day, v in daily.items():
            if day[:7] > last_official:
                by_month.setdefault(day[:7], []).append(v)
        for m, vs in by_month.items():
            ecb[m] = sum(vs) / len(vs)
        monthly[code] = ecb
    return monthly


def main():
    print("Récupération des taux 10 ans…")
    data, from_cache = load_data()
    monthly = merge(data)
    months = sorted(set().union(*(s.keys() for s in monthly.values())))
    payload = {
        "months": months,
        "series": {c: [None if (v := monthly[c].get(m)) is None else round(v, 4) for m in months] for c in COUNTRIES},
        "names": COUNTRIES,
        "fetched": data["fetched"],
    }
    OUTPUT.write_text(
        "// Généré par update.py — ne pas modifier à la main.\n"
        f"window.DATA = {json.dumps(payload, ensure_ascii=False)};\n",
        encoding="utf-8",
    )
    official = max(max(s) for s in data["ecb"].values())
    source = " (cache, hors ligne)" if from_cache else ""
    print(f"BCE jusqu'à {official}, complété jusqu'à {months[-1]}{source}  →  {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
