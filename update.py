#!/usr/bin/env python3
"""Met à jour les données du site : taux 10 ans, dette et déficit publics (2000 → aujourd'hui).

Taux 10 ans, de la source la plus officielle à la plus récente :
  1. BCE : taux d'intérêt à long terme « critères de convergence » (moyenne
     mensuelle) — historique officiel, publié avec ~1 mois de retard ;
  2. CNBC : clôtures journalières des 2 dernières années — complètent les mois
     que la BCE n'a pas encore publiés (moyenne des jours du mois) ;
  3. TradingView : dernier cours (TVC:XX10Y) — taux du jour.

Finances publiques (Eurostat, administrations publiques S13) :
  - dette brute au sens de Maastricht en % du PIB, trimestrielle (gov_10q_ggdebt) ;
  - déficit sur 4 trimestres glissants : somme du solde public (B9, gov_10q_ggnfa)
    / somme du PIB (B1GQ, namq_10_gdp), en euros non corrigés des variations
    saisonnières — les séries CVS sont incomplètes (Italie absente). Au 4e
    trimestre, on retrouve le chiffre annuel officiel à 0,1 point près. Les
    années sans données trimestrielles (IE, DE avant 2002) reprennent le
    chiffre annuel (gov_10dd_edpt1).

Budget de la France (gov_10a_main, annuel, millions d'euros) : recettes et
dépenses de l'État et des organismes centraux (S1311), des collectivités locales
(S1313) et de la sécurité sociale (S1314), avec les transferts entre eux ; sert
aux diagrammes de Sankey de budget.html (data/budget.js).

Écrit data/data.js, chargé par index.html (fonctionne en ouvrant le fichier
directement comme sur GitHub Pages). Aucune dépendance : uniquement la
bibliothèque standard Python.
"""

import csv
import io
import json
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "data" / "cache.json"
OUTPUT = ROOT / "data" / "data.js"

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
EUROSTAT_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{dataset}"
EUROSTAT_GEO = {"GR": "EL"}  # Eurostat code la Grèce « EL »
UA = {"User-Agent": "Mozilla/5.0"}
OUTPUT_BUDGET = ROOT / "data" / "budget.js"
BUDGET_START = "2005"

# Budget de la France : sous-secteurs des administrations publiques (ordre = ordre des couleurs)
SUBSECTORS = {"S1311": "État", "S1314": "Sécurité sociale", "S1313": "Collectivités locales"}
BUDGET_ITEMS = [
    "TR", "TE", "P11_P12_P131", "D2REC", "D211REC", "D5REC", "D51A_C1REC", "D51B_C2REC", "D61REC", "D91REC",
    "P2", "P5", "NP", "D1PAY", "D3PAY", "D41PAY", "D62PAY", "D62PAY_GF1002", "D62PAY_GF1003", "D62PAY_GF1005",
    "D632PAY", "D76PAY",
] + [f"{t}PAY_{s}" for t in ("D4", "D7", "D9") for s in SUBSECTORS]  # transferts entre sous-secteurs
# Postes du diagramme : (libellé, formule = liste de (signe, opération)). Le dernier poste de chaque
# liste est le solde (total − postes nommés − transferts internes), calculé à part.
REVENUES = [
    ("TVA", [(1, "D211REC")]),
    ("Autres impôts sur la production", [(1, "D2REC"), (-1, "D211REC")]),
    ("Impôts sur le revenu (IR, CSG)", [(1, "D51A_C1REC")]),
    ("Impôt sur les sociétés", [(1, "D51B_C2REC")]),
    ("Impôts sur le patrimoine, successions", [(1, "D5REC"), (-1, "D51A_C1REC"), (-1, "D51B_C2REC"), (1, "D91REC")]),
    ("Cotisations sociales", [(1, "D61REC")]),
    ("Ventes et recettes de services", [(1, "P11_P12_P131")]),
    ("Autres recettes", None),
]
EXPENSES = [
    ("Rémunération des agents", [(1, "D1PAY")]),
    ("Achats courants", [(1, "P2")]),
    ("Investissement", [(1, "P5"), (1, "NP")]),
    ("Retraites", [(1, "D62PAY_GF1002"), (1, "D62PAY_GF1003")]),
    ("Chômage", [(1, "D62PAY_GF1005")]),
    ("Autres prestations en espèces", [(1, "D62PAY"), (-1, "D62PAY_GF1002"), (-1, "D62PAY_GF1003"), (-1, "D62PAY_GF1005")]),
    ("Soins et prestations en nature", [(1, "D632PAY")]),
    ("Intérêts de la dette", [(1, "D41PAY")]),
    ("Subventions", [(1, "D3PAY")]),
    ("Contribution au budget de l'UE", [(1, "D76PAY")]),
    ("Autres transferts et dépenses", None),
]


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


def fetch_eurostat(dataset, start, **filters):
    """{'XX': {période: valeur}} pour tous les pays — période 'AAAA' ou 'AAAA-Qn'.
    Les filtres doivent réduire toutes les dimensions à une valeur, sauf geo et time."""
    geos = [EUROSTAT_GEO.get(c, c) for c in COUNTRIES]
    query = urllib.parse.urlencode(
        [("format", "JSON"), ("sinceTimePeriod", start), *filters.items()] + [("geo", g) for g in geos]
    )
    d = json.loads(http(EUROSTAT_URL.format(dataset=dataset) + "?" + query))
    # JSON-stat : index à plat sur les dimensions (seules geo et time ont plusieurs valeurs)
    geo = {i: g for g, i in d["dimension"]["geo"]["category"]["index"].items()}
    time = {i: t for t, i in d["dimension"]["time"]["category"]["index"].items()}
    code = {EUROSTAT_GEO.get(c, c): c for c in COUNTRIES}
    out = {c: {} for c in COUNTRIES}
    for k, v in d["value"].items():
        g, t = divmod(int(k), len(time))
        out[code[geo[g]]][time[t]] = v
    return out


def fetch_budget():
    """{secteur: {opération: {'AAAA': valeur}}} pour la France, en millions d'euros."""
    query = urllib.parse.urlencode(
        [("format", "JSON"), ("geo", "FR"), ("unit", "MIO_EUR"), ("sinceTimePeriod", BUDGET_START)]
        + [("sector", s) for s in ("S13", *SUBSECTORS)] + [("na_item", i) for i in BUDGET_ITEMS]
    )
    d = json.loads(http(EUROSTAT_URL.format(dataset="gov_10a_main") + "?" + query))
    dims = {k: {i: c for c, i in d["dimension"][k]["category"]["index"].items()} for k in d["id"]}
    out = {}
    for k, v in d["value"].items():
        coords, k = {}, int(k)
        for dim, size in reversed(list(zip(d["id"], d["size"]))):
            k, coords[dim] = divmod(k, size)
        out.setdefault(dims["sector"][coords["sector"]], {}).setdefault(dims["na_item"][coords["na_item"]], {})[
            dims["time"][coords["time"]]] = v
    return out


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
    print("  Eurostat : dette et déficit publics…", flush=True)
    gov = {"sector": "S13", "unit": "PC_GDP"}
    data["debt"] = fetch_eurostat("gov_10q_ggdebt", "2000-Q1", na_item="GD", **gov)
    data["balance"] = fetch_eurostat("gov_10dd_edpt1", "2000", na_item="B9", **gov)
    data["balance_q"] = fetch_eurostat("gov_10q_ggnfa", "1999-Q2", na_item="B9", sector="S13", unit="MIO_EUR", s_adj="NSA")
    data["gdp_q"] = fetch_eurostat("namq_10_gdp", "1999-Q2", na_item="B1GQ", unit="CP_MEUR", s_adj="NSA")
    print("  Eurostat : budget de la France…", flush=True)
    data["budget"] = fetch_budget()
    data["gdp_fr"] = fetch_eurostat("nama_10_gdp", BUDGET_START, na_item="B1GQ", unit="CP_MEUR")["FR"]
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


def table(series, periods, digits):
    return {c: [None if (v := series.get(c, {}).get(p)) is None else round(v, digits) for p in periods] for c in COUNTRIES}


def public_finances(series):
    periods = sorted(set().union(*(s.keys() for s in series.values()))) if series else []
    return {"periods": periods, "series": table(series, periods, 2)}


def rolling_deficit(data):
    """{'XX': {'AAAA-Qn': déficit en % du PIB sur les 4 trimestres finissant à Qn}} (déficit > 0)."""
    out = {}
    for c in COUNTRIES:
        b9, gdp = data.get("balance_q", {}).get(c, {}), data.get("gdp_q", {}).get(c, {})
        qs = sorted(set(b9) & set(gdp))
        out[c] = {
            qs[i]: -100 * sum(b9[q] for q in qs[i - 3:i + 1]) / sum(gdp[q] for q in qs[i - 3:i + 1])
            for i in range(3, len(qs))
            if qs[i] >= "2000-Q1" and quarters_apart(qs[i - 3], qs[i]) == 3
        }
        # Années sans données trimestrielles : chiffre annuel officiel, placé au 4e trimestre
        for y, v in data.get("balance", {}).get(c, {}).items():
            if not any(q.startswith(y) for q in out[c]):
                out[c][f"{y}-Q4"] = -v
    return out


def budget(data):
    """Par année : pour chaque sous-secteur, recettes et dépenses propres par poste (hors transferts
    entre administrations), transferts versés aux autres sous-secteurs et solde, en milliards d'euros.
    Retraites et chômage ne sont pas encore détaillés pour la dernière année : leurs postes sont alors
    vides et tout va dans « Autres prestations en espèces »."""
    raw = data.get("budget", {})
    get = lambda s, i, y: raw.get(s, {}).get(i, {}).get(y)
    years = sorted(y for y in raw.get("S13", {}).get("TR", {})
                   if all(get(s, i, y) is not None for s in SUBSECTORS for i in ("TR", "TE")))
    out = {}
    for y in years:
        val = lambda s, i: get(s, i, y) or 0
        calc = lambda s, f: sum(sign * val(s, i) for sign, i in f)
        # transferts courants, en capital et revenus de la propriété versés de p à r
        to = {p: {r: sum(val(p, f"{t}PAY_{r}") for t in ("D4", "D7", "D9")) for r in SUBSECTORS if r != p}
              for p in SUBSECTORS}
        year = {}
        for s in SUBSECTORS:
            received = sum(to[p][s] for p in SUBSECTORS if p != s)
            paid = sum(to[s].values())
            rev = [calc(s, f) for _, f in REVENUES[:-1]]
            exp = [calc(s, f) for _, f in EXPENSES[:-1]]
            rev.append(val(s, "TR") - sum(rev) - received)
            exp.append(val(s, "TE") - sum(exp) - paid)
            if min(rev + exp) < -5000:   # petits résidus négatifs (asymétries payeur / receveur) : ignorés à l'affichage
                print(f"    attention {y} {s} : poste négatif ({min(rev + exp):.0f} M€)")
            year[s] = {"rev": [round(v / 1000, 2) for v in rev], "exp": [round(v / 1000, 2) for v in exp],
                       "to": {r: round(v / 1000, 2) for r, v in to[s].items()},
                       "balance": round((val(s, "TR") - val(s, "TE")) / 1000, 2)}
        own = sum(sum(year[s]["rev"]) for s in SUBSECTORS) * 1000
        if abs(own - val("S13", "TR")) > 1000:   # recettes consolidées : à 1 Md€ près
            print(f"    attention {y} : recettes propres {own:.0f} ≠ recettes consolidées {val('S13', 'TR'):.0f} M€")
        out[y] = year
    gdp = data.get("gdp_fr", {})
    return {"years": years, "sectors": SUBSECTORS, "revenues": [r for r, _ in REVENUES],
            "expenses": [e for e, _ in EXPENSES], "data": out,
            "gdp": {y: round(gdp[y] / 1000, 1) for y in years if y in gdp},
            "detailed": [y for y in years if all(get(s, "D62PAY_GF1002", y) is not None for s in SUBSECTORS)]}


def quarters_apart(a, b):
    return (int(b[:4]) - int(a[:4])) * 4 + int(b[-1]) - int(a[-1])


def main():
    print("Récupération des taux 10 ans…")
    data, from_cache = load_data()
    monthly = merge(data)
    months = sorted(set().union(*(s.keys() for s in monthly.values())))
    payload = {
        "months": months,
        "series": table(monthly, months, 4),
        # Les deux tableaux suivants : listes de périodes + valeurs alignées par pays
        "debt": public_finances(data.get("debt", {})),
        "deficit": public_finances(rolling_deficit(data)),
        "names": COUNTRIES,
        "fetched": data["fetched"],
    }
    OUTPUT.write_text(
        "// Généré par update.py — ne pas modifier à la main.\n"
        f"window.DATA = {json.dumps(payload, ensure_ascii=False)};\n",
        encoding="utf-8",
    )
    budget_payload = budget(data)
    OUTPUT_BUDGET.write_text(
        "// Généré par update.py — ne pas modifier à la main.\n"
        f"window.BUDGET = {json.dumps(budget_payload, ensure_ascii=False)};\n",
        encoding="utf-8",
    )
    official = max(max(s) for s in data["ecb"].values())
    source = " (cache, hors ligne)" if from_cache else ""
    print(f"BCE jusqu'à {official}, complété jusqu'à {months[-1]}{source}  →  {OUTPUT.relative_to(ROOT)}")
    for key in ("debt", "deficit"):
        if periods := payload[key]["periods"]:
            print(f"Eurostat {key} : {periods[0]} → {periods[-1]}")
    if years := budget_payload["years"]:
        print(f"Eurostat budget de la France : {years[0]} → {years[-1]}  →  {OUTPUT_BUDGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
