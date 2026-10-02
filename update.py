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
  - croissance nominale du PIB (croissance + inflation) et taux apparent de la dette
    (intérêts versés / dette un an plus tôt), sur 4 trimestres glissants ; avant 2000, chiffres
    annuels depuis 1950 (FMI « Public Finances in Modern History », Global Macro Database) ;
  - dette avant 2000 : chiffres annuels du FMI depuis 1950 ;
  - charge d'intérêts en % du PIB sur 4 trimestres glissants (D41PAY / PIB), annuelle avant 2000 (FMI) ;
  - déficit sur 4 trimestres glissants : somme du solde public (B9, gov_10q_ggnfa)
    / somme du PIB (B1GQ, namq_10_gdp), en euros non corrigés des variations
    saisonnières — les séries CVS sont incomplètes (Italie absente). Au 4e
    trimestre, on retrouve le chiffre annuel officiel à 0,1 point près. Les
    années sans données trimestrielles (IE, DE avant 2002) reprennent le
    chiffre annuel (gov_10dd_edpt1).

Budget de la France (annuel, millions d'euros ; recettes : gov_10a_main, dépenses par
fonction : gov_10a_exp) : recettes et dépenses de l'État et des organismes centraux (S1311), des collectivités locales
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
# Historique annuel 1950-1999 (avant les séries trimestrielles d'Eurostat) : intérêts versés et dette en %
# du PIB du FMI (« Public Finances in Modern History »), PIB nominal et réel de la Global Macro Database
HIST_START, HIST_END = 1949, 1999
IMF_URL = "https://www.imf.org/external/datamapper/api/v1/{indicator}"
GMD_URL = "https://www.globalmacrodata.com/GMD.csv"
ISO3 = {"GR": "GRC", "IT": "ITA", "ES": "ESP", "PT": "PRT", "IE": "IRL", "FR": "FRA", "DE": "DEU"}
OUTPUT_BUDGET = ROOT / "data" / "budget.js"
BUDGET_START = "2005"

# Budget de la France : sous-secteurs des administrations publiques (ordre = ordre des couleurs)
SUBSECTORS = {"S1311": "État", "S1314": "Sécurité sociale", "S1313": "Collectivités locales"}
BUDGET_ITEMS = [
    "TR", "TE", "P11_P12_P131", "D2REC", "D211REC", "D5REC", "D51A_C1REC", "D51B_C2REC",
    "D61REC", "D611REC", "D613REC", "D91REC",
] + [f"{t}PAY_{s}" for t in ("D4", "D7", "D9") for s in SUBSECTORS]  # transferts entre sous-secteurs
# Cotisations imputées = cotisations sociales reçues − cotisations effectives des employeurs et des
# ménages : pour l'État, la contrepartie des retraites des fonctionnaires, qu'il paie lui-même.
IMPUTED = [(1, "D61REC"), (-1, "D611REC"), (-1, "D613REC")]
# Postes de recettes : (libellé, formule = liste de (signe, opération)). Le dernier est le solde
# (total − postes nommés − transferts internes), calculé à part.
REVENUES = [
    ("TVA", [(1, "D211REC")]),
    ("Autres impôts sur la production", [(1, "D2REC"), (-1, "D211REC")]),
    ("Impôts sur le revenu (IR, CSG)", [(1, "D51A_C1REC")]),
    ("Impôt sur les sociétés", [(1, "D51B_C2REC")]),
    ("Impôts sur le patrimoine, successions", [(1, "D5REC"), (-1, "D51A_C1REC"), (-1, "D51B_C2REC"), (1, "D91REC")]),
    ("Cotisations sociales", [(1, "D611REC"), (1, "D613REC")]),
    ("Cotisations retraite imputées", IMPUTED),
    ("Ventes et recettes de services", [(1, "P11_P12_P131")]),
    ("Autres recettes", None),
]
# Dépenses par fonction (COFOG, gov_10a_exp), regroupées par bloc ; la recherche réunit les
# postes R&D de toutes les fonctions. Le dernier poste reçoit le reste de la fonction 01.
RD = ["GF0104", "GF0105", "GF0204", "GF0305", "GF0408", "GF0505", "GF0605", "GF0705", "GF0805", "GF0907", "GF1008"]
FUNCTIONS = [
    ("Retraites", ["GF1002", "GF1003"]),
    ("Santé", ["GF0701", "GF0702", "GF0703", "GF0704", "GF0706"]),
    ("Maladie, invalidité (indemnités)", ["GF1001"]),
    ("Famille", ["GF1004"]),
    ("Chômage", ["GF1005"]),
    ("Logement, RSA et solidarité", ["GF1006", "GF1007", "GF1009"]),
    ("Enseignement", ["GF0901", "GF0902", "GF0903", "GF0904", "GF0905", "GF0906", "GF0908"]),
    ("Recherche", RD),
    ("Défense", ["GF0201", "GF0202", "GF0203", "GF0205"]),
    ("Sécurité (police, pompiers)", ["GF0301", "GF0302", "GF0306"]),
    ("Justice et prisons", ["GF0303", "GF0304"]),
    ("Économie, emploi, transports", ["GF0401", "GF0402", "GF0403", "GF0404", "GF0405", "GF0406", "GF0407", "GF0409"]),
    ("Environnement", ["GF0501", "GF0502", "GF0503", "GF0504", "GF0506"]),
    ("Urbanisme, eau, équipements", ["GF0601", "GF0602", "GF0603", "GF0604", "GF0606"]),
    ("Culture, sport, médias", ["GF0801", "GF0802", "GF0803", "GF0804", "GF0806"]),
    ("Administration générale", ["GF0101", "GF0102", "GF0103", "GF0106", "GF0108"]),
    ("Intérêts de la dette", ["GF0107"]),
]
COFOG_ITEMS = ["TE", "D1"] + [f"{t}_{s}" for t in ("D4", "D7", "D9") for s in SUBSECTORS]
# Les cotisations imputées sont réparties entre fonctions au prorata de la masse salariale (D1),
# pondérée par les taux employeur du CAS Pensions : 126,07 % pour les militaires, 74,28 % pour les civils.
MILITARY_WEIGHT = 126.07 / 74.28



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


def fetch_france(dataset, items, by_cofog=False):
    """{secteur: {opération: {'AAAA': valeur}}} pour la France, en millions d'euros
    (avec by_cofog : {secteur: {opération: {fonction: {'AAAA': valeur}}}})."""
    query = urllib.parse.urlencode(
        [("format", "JSON"), ("geo", "FR"), ("unit", "MIO_EUR"), ("sinceTimePeriod", BUDGET_START)]
        + [("sector", s) for s in ("S13", *SUBSECTORS)] + [("na_item", i) for i in items]
    )
    d = json.loads(http(EUROSTAT_URL.format(dataset=dataset) + "?" + query))
    dims = {k: {i: c for c, i in d["dimension"][k]["category"]["index"].items()} for k in d["id"]}
    out = {}
    for k, v in d["value"].items():
        coords, k = {}, int(k)
        for dim, size in reversed(list(zip(d["id"], d["size"]))):
            k, coords[dim] = divmod(k, size)
        node = out.setdefault(dims["sector"][coords["sector"]], {}).setdefault(dims["na_item"][coords["na_item"]], {})
        if by_cofog:
            node = node.setdefault(dims["cofog99"][coords["cofog99"]], {})
        node[dims["time"][coords["time"]]] = v
    return out


def fetch_history():
    """{'ie'|'d'|'ngdp'|'rgdp': {'XX': {'AAAA': valeur}}}, années HIST_START → HIST_END."""
    years = {str(y) for y in range(HIST_START, HIST_END + 1)}
    out = {}
    for key in ("ie", "d"):   # % du PIB
        # le FMI refuse les navigateurs (403) mais accepte un client en ligne de commande
        values = json.loads(http(IMF_URL.format(indicator=key), headers={"User-Agent": "curl/8"}))["values"][key]
        out[key] = {c: {y: v for y, v in values.get(iso, {}).items() if y in years and v is not None} for c, iso in ISO3.items()}
    out["ngdp"], out["rgdp"] = {c: {} for c in COUNTRIES}, {c: {} for c in COUNTRIES}
    code = {iso: c for c, iso in ISO3.items()}
    for row in csv.DictReader(io.StringIO(http(GMD_URL, timeout=180))):
        if (c := code.get(row["ISO3"])) and row["year"] in years:
            for key, col in (("ngdp", "nGDP"), ("rgdp", "rGDP")):
                if row[col]:
                    out[key][c][row["year"]] = float(row[col])
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
    data["gdp_q"] = fetch_eurostat("namq_10_gdp", "1998-Q1", na_item="B1GQ", unit="CP_MEUR", s_adj="NSA")
    data["real_q"] = fetch_eurostat("namq_10_gdp", "1998-Q1", na_item="B1GQ", unit="CLV10_MEUR", s_adj="NSA")
    data["interest_q"] = fetch_eurostat("gov_10q_ggnfa", "1999-Q1", na_item="D41PAY", sector="S13", unit="MIO_EUR", s_adj="NSA")
    data["debt_eur"] = fetch_eurostat("gov_10q_ggdebt", "1999-Q1", na_item="GD", sector="S13", unit="MIO_EUR")
    data["interest_a"] = fetch_eurostat("gov_10a_main", "2000", na_item="D41PAY", sector="S13", unit="PC_GDP")
    print("  FMI et Global Macro Database : historique depuis 1950…", flush=True)
    try:
        data["hist"] = fetch_history()
    except Exception as exc:   # données figées : on garde celles du cache
        print(f"    indisponible ({exc})")
        if CACHE.exists():
            data["hist"] = json.loads(CACHE.read_text()).get("hist", {})
    print("  Eurostat : budget de la France…", flush=True)
    data["budget"] = fetch_france("gov_10a_main", BUDGET_ITEMS)
    data["cofog"] = fetch_france("gov_10a_exp", COFOG_ITEMS, by_cofog=True)
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


def history_debt(data):
    """Dette trimestrielle d'Eurostat, précédée de la dette annuelle du FMI (fin d'année, au 4e trimestre) de 1950 à 1999."""
    hist = data.get("hist", {}).get("d", {})
    return {c: {**{f"{y}-Q4": v for y, v in hist.get(c, {}).items() if "1950" <= y <= str(HIST_END)},
                **data.get("debt", {}).get(c, {})} for c in COUNTRIES}


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


def sum4(series, q):
    """Somme des 4 trimestres finissant à q, ou None s'il en manque un."""
    y, n = int(q[:4]), int(q[-1])
    qs = [f"{y - (n - k <= 0)}-Q{(n - k - 1) % 4 + 1}" for k in range(4)]
    return sum(series[x] for x in qs) if all(x in series for x in qs) else None


def year_before(q):
    return f"{int(q[:4]) - 1}{q[4:]}"


def growth_vs_rate(data):
    """Croissance nominale du PIB (croissance réelle + inflation), croissance réelle (volume) et taux
    apparent de la dette, en %, sur 4 trimestres glissants : {'growth'|'real'|'rate': {'XX': {q: %}}}.
    L'inflation (prix du PIB) se déduit par différence : nominale − réelle.
    Avant 2000 : chiffres annuels (placés au 4e trimestre) tirés de l'historique ; taux apparent =
    intérêts / dette de l'année précédente, ramenés de % du PIB en euros par la croissance nominale.
    Taux apparent = intérêts versés sur 4 trimestres / dette un an plus tôt : c'est le coût moyen de
    toute la dette, qui suit le taux de marché avec retard, au rythme du renouvellement des emprunts."""
    def yoy(series):
        out = {}
        for q in series:
            now, before = sum4(series, q), sum4(series, year_before(q))
            if q >= "2000-Q1" and now and before:
                out[q] = 100 * (now / before - 1)
        return out

    growth, real, rate = {}, {}, {}
    for c in COUNTRIES:
        d41, debt = (data.get(k, {}).get(c, {}) for k in ("interest_q", "debt_eur"))
        growth[c] = yoy(data.get("gdp_q", {}).get(c, {}))
        real[c] = yoy(data.get("real_q", {}).get(c, {}))
        rate[c] = {}
        for q in d41:
            paid, owed = sum4(d41, q), debt.get(year_before(q))
            if q >= "2000-Q1" and paid is not None and owed:
                rate[c][q] = 100 * paid / owed
    hist = data.get("hist", {})
    for c in COUNTRIES:
        h = {k: hist.get(k, {}).get(c, {}) for k in ("ie", "d", "ngdp", "rgdp")}
        for y in range(HIST_START + 1, HIST_END + 1):
            y0, y1 = str(y - 1), str(y)
            if not (h["ngdp"].get(y0) and h["ngdp"].get(y1)):
                continue
            nominal = h["ngdp"][y1] / h["ngdp"][y0] - 1
            growth[c][f"{y}-Q4"] = 100 * nominal
            if h["rgdp"].get(y0) and h["rgdp"].get(y1):
                real[c][f"{y}-Q4"] = 100 * (h["rgdp"][y1] / h["rgdp"][y0] - 1)
            if h["ie"].get(y1) is not None and h["d"].get(y0):
                rate[c][f"{y}-Q4"] = 100 * h["ie"][y1] / h["d"][y0] * (1 + nominal)
    return {"growth": growth, "real": real, "rate": rate}


def interest_burden(data):
    """{'XX': {q: intérêts versés en % du PIB}} sur 4 trimestres glissants ; avant 2000 et pour les années sans
    données trimestrielles (IE, DE avant 2002), chiffre annuel (FMI, puis Eurostat) placé au 4e trimestre."""
    out = {}
    for c in COUNTRIES:
        d41, gdp = data.get("interest_q", {}).get(c, {}), data.get("gdp_q", {}).get(c, {})
        out[c] = {q: 100 * paid / total for q in d41
                  if q >= "2000-Q1" and (paid := sum4(d41, q)) is not None and (total := sum4(gdp, q))}
        for y, v in data.get("interest_a", {}).get(c, {}).items():
            if not any(q.startswith(y) for q in out[c]):
                out[c][f"{y}-Q4"] = v
        for y, v in data.get("hist", {}).get("ie", {}).get(c, {}).items():
            if "1950" <= y <= str(HIST_END):
                out[c][f"{y}-Q4"] = v
    return out


def budget(data):
    """Par année : pour chaque sous-secteur, recettes propres par poste et dépenses propres par fonction
    (hors transferts entre administrations), cotisations retraite imputées de chaque fonction,
    transferts versés aux autres sous-secteurs et solde, en milliards d'euros. Seules les années où
    Eurostat détaille par fonction les transferts entre administrations (depuis 2009) sont retenues."""
    raw, cofog = data.get("budget", {}), data.get("cofog", {})
    get = lambda s, i, y: raw.get(s, {}).get(i, {}).get(y)
    fget = lambda s, i, f, y: cofog.get(s, {}).get(i, {}).get(f, {}).get(y)
    years = sorted(y for y in raw.get("S13", {}).get("TR", {})
                   if all(get(s, i, y) is not None for s in SUBSECTORS for i in ("TR", "TE"))
                   and fget("S1311", "D7_S1313", "GF0108", y) is not None)
    out = {}
    for y in years:
        val = lambda s, i: get(s, i, y) or 0
        calc = lambda s, f: sum(sign * val(s, i) for sign, i in f)
        fval = lambda s, i, codes: sum(fget(s, i, c, y) or 0 for c in codes)
        # transferts courants, en capital et revenus de la propriété versés de p à r
        to = {p: {r: sum(val(p, f"{t}PAY_{r}") for t in ("D4", "D7", "D9")) for r in SUBSECTORS if r != p}
              for p in SUBSECTORS}
        year = {}
        for s in SUBSECTORS:
            received = sum(to[p][s] for p in SUBSECTORS if p != s)
            rev = [calc(s, f) for _, f in REVENUES[:-1]]
            rev.append(val(s, "TR") - sum(rev) - received)
            intra = [f"{t}_{r}" for t in ("D4", "D7", "D9") for r in SUBSECTORS if r != s]
            exp = [fval(s, "TE", codes) - sum(fval(s, i, codes) for i in intra) for _, codes in FUNCTIONS]
            # cotisations imputées réparties selon la masse salariale (militaires pondérés)
            wages = [fval(s, "D1", codes) + (MILITARY_WEIGHT - 1) * fval(s, "D1", [c for c in codes if c == "GF0201"])
                     for _, codes in FUNCTIONS]
            imputed = calc(s, IMPUTED)
            imp = [imputed * w / sum(wages) if sum(wages) else 0 for w in wages]
            if min(rev) < -5000:   # petits résidus négatifs (asymétries payeur / receveur) : ignorés à l'affichage
                print(f"    attention {y} {s} : recette négative ({min(rev):.0f} M€)")
            md = lambda vs: [round(v / 1000, 2) for v in vs]
            year[s] = {"rev": md(rev), "exp": md(e - i for e, i in zip(exp, imp)), "imp": md(imp),
                       "to": {r: round(v / 1000, 2) for r, v in to[s].items()},
                       "balance": round((val(s, "TR") - val(s, "TE")) / 1000, 2)}
        out[y] = year
    gdp = data.get("gdp_fr", {})
    return {"years": years, "sectors": SUBSECTORS, "revenues": [r for r, _ in REVENUES],
            "functions": [f for f, _ in FUNCTIONS], "data": out,
            "gdp": {y: round(gdp[y] / 1000, 1) for y in years if y in gdp}}


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
        "debt": public_finances(history_debt(data)),
        "deficit": public_finances(rolling_deficit(data)),
        "growth": public_finances((gr := growth_vs_rate(data))["growth"]),
        "real": public_finances(gr["real"]),
        "interest": public_finances(gr["rate"]),
        "burden": public_finances(interest_burden(data)),
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
    for key in ("debt", "deficit", "growth", "real", "interest", "burden"):
        if periods := payload[key]["periods"]:
            print(f"Eurostat {key} : {periods[0]} → {periods[-1]}")
    if years := budget_payload["years"]:
        print(f"Eurostat budget de la France : {years[0]} → {years[-1]}  →  {OUTPUT_BUDGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
