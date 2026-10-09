// Données générées par update.py (data/data.js → window.DATA)
const SPREAD_CODES = ["GR", "IT", "ES", "PT", "IE", "FR"];
const ALL_CODES = [...SPREAD_CODES, "DE"];
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const COLOR = c => css("--s" + (["GR","IT","ES","PT","IE","FR","DE"].indexOf(c) + 1));
const fmt = v => v == null ? "–" : v.toFixed(2).replace(".", ",");

// hidden : pays masqués via la légende ; au chargement, seules la France et l'Allemagne sont affichées
const state = { autoY: true, hidden: new Set(["GR", "IT", "ES", "PT", "IE"]) };

// ---- Préparation des données ------------------------------------------------
const months = DATA.months;
const de = DATA.series.DE;
const spreads = {};
for (const c of SPREAD_CODES) {
  spreads[c] = DATA.series[c].map((v, i) => v == null || de[i] == null ? null : +(v - de[i]).toFixed(4));
}
const monthDate = m => m + "-15";
const monthEnd = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10);   // encours fin de mois
const quarterEnd = q => { const [y, n] = q.split("-Q"); return new Date(Date.UTC(+y, 3 * n, 0)).toISOString().slice(0, 10); };  // dette = encours fin de trimestre
// Croissance nominale (croissance + inflation) et taux moyens de la dette, alignés sur les trimestres du PIB
const growth = DATA.growth.series;
const align = d => Object.fromEntries(ALL_CODES.map(c => [c, DATA.growth.periods.map(q => {
  const i = d.periods.indexOf(q);
  return i < 0 ? null : d.series[c][i];
})]));
const interest = align(DATA.interest);          // dette publique
const interestAll = align(DATA.interest_all);   // toute la dette : administrations, entreprises, ménages
const real = align(DATA.real);   // croissance en volume ; inflation (prix du PIB) = nominale − réelle
const inflation = Object.fromEntries(ALL_CODES.map(c => [c, growth[c].map((g, i) => g == null || real[c][i] == null ? null : +(g - real[c][i]).toFixed(2))]));
// Valeurs sur 4 trimestres glissants (ou annuelles avant 2000, rangées au 4e trimestre) : placées au milieu
// de leur période, pour que le chiffre de 1980 soit dessiné (et lu au survol) en 1980 et non fin 1980.
const windowMid = q => { const [y, n] = q.split("-Q"); return new Date(Date.UTC(+y, 3 * n - 6, 1)).toISOString().slice(0, 10); };
const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const windowLabel = q => {
  const [y, n] = q.split("-Q").map(Number);
  return n === 4 ? `année ${y}` : `${MOIS[3 * n % 12]} ${y - 1} → ${MOIS[3 * n - 1]} ${y}`;
};
const pct = v => `${fmt(v)} %`;
const pctGDP = v => `${v.toFixed(1).replace(".", ",")} % du PIB`;

// Panneaux à un seul pays (state.pick, choisi à droite du titre, commun à ces panneaux), indépendamment de la légende.
// traces(c) : courbes du pays c ; aire colorée remplie jusqu'à zéro ou jusqu'à la courbe précédente.
const colorArea = (color, y, fill) => ({ y, fill, fillcolor: color + "8c", line: { color, width: 1.5 } });
const area = (v, y, fill) => colorArea(css(v), y, fill);
const swatch = (v, l, x, style = "") => `<div><span class="sw${style}" style="background:${css(v)}"></span>${l} <b>${x}</b></div>`;
const hatched = (v, l, x) => `<div><span class="sw" style="background:repeating-linear-gradient(-45deg,${css(v)} 0 2px,transparent 2px 4px)"></span>${l} <b>${x}</b></div>`;
const hatch = v => ({ fillcolor: "rgba(0,0,0,0)", fillpattern: { shape: "/", fgcolor: css(v), bgcolor: "rgba(0,0,0,0)", size: 7, solidity: 0.3 } });
// Points ajoutés là où une courbe de keys change de signe entre deux points, toutes les courbes y étant interpolées
// linéairement (comme au tracé) : découpées à zéro, les parties positives et négatives suivent alors exactement la courbe,
// au lieu de rejoindre zéro au point suivant. {x: [...], nom: [...]} pour chaque courbe de series.
const stamp = t => new Date(t).toISOString().slice(0, 16).replace("T", " ");
function splitAtZero(xs, series, keys) {
  const ms = xs.map(Date.parse), names = Object.keys(series), out = { x: [] };
  names.forEach(k => { out[k] = []; });
  const at = (i, t) => names.forEach(k => {
    const a = series[k][i], b = series[k][i + 1];
    out[k].push(t === 0 ? a : a == null || b == null ? null : a + t * (b - a));
  });
  for (let i = 0; i < ms.length; i++) {
    out.x.push(xs[i]); at(i, 0);
    if (i + 1 === ms.length) break;
    const cross = keys.map(k => { const a = series[k][i], b = series[k][i + 1]; return a != null && b != null && a * b < 0 ? a / (a - b) : null; })
      .filter(t => t != null).sort((a, b) => a - b);
    for (const t of cross) { out.x.push(stamp(ms[i] + t * (ms[i + 1] - ms[i]))); at(i, t); }
  }
  return out;
}

function growthPanel(key, title, rate, rateLabel) {
  const xs = DATA.growth.periods.map(windowMid);
  return { key, title, rate, codes: ALL_CODES, zero: true, single: true, history: true, rg: true,
    x: xs, date: i => windowLabel(DATA.growth.periods[i]),
    // Inflation depuis zéro, croissance réelle empilée au-dessus (en dessous si elle est négative) jusqu'à la croissance
    // nominale (ligne) ; parties négatives hachurées. Chaque partie négative ou positive a sa propre courbe, remplie
    // jusqu'à la précédente (base invisible répétée) ; les bords sont tracés par les courbes de base.
    traces: c => {
      const d = splitAtZero(xs, { inf: inflation[c], real: real[c], nominal: growth[c], rate: rate[c] }, ["inf", "real"]), x = d.x;
      const inf = d.inf, sum = f => inf.map((v, i) => v == null || d.real[i] == null ? null : v + f(d.real[i], 0));
      const clip = f => inf.map(v => v == null ? null : f(v, 0));
      const none = { line: { width: 0 } };
      return [
        { x, ...area("--s2", clip(Math.max), "tozeroy"), ...none },
        { x, y: clip(Math.min), fill: "tozeroy", ...hatch("--s2"), ...none },
        { x, y: inf, line: { color: css("--s2"), width: 1.5 } },
        { x, ...area("--s3", sum(Math.max), "tonexty"), ...none },
        { x, y: inf, ...none },
        { x, y: sum(Math.min), fill: "tonexty", ...hatch("--s3"), ...none },
        { x, y: d.nominal, line: { color: css("--text-primary"), width: 2 } },
        { x, y: d.rate, connectgaps: true, line: { color: css("--text-primary"), width: 2, dash: "dot" } },   // 2000 : relie l'annuel au trimestriel
      ];
    },
    tip: (c, i) => [["--s2", inflation[c][i] < 0 ? "Inflation (baisse des prix)" : "Inflation", inflation[c][i]],
      ["--s3", real[c][i] < 0 ? "Croissance (récession)" : "Croissance", real[c][i]],
      ["--text-primary", "Inflation + croissance", growth[c][i]], ["--text-primary", rateLabel, rate[c][i], "dash"]]
      .filter(r => r[2] != null).map(([v, l, x, dash]) => x < 0 && v !== "--text-primary" ? hatched(v, l, pct(x)) : swatch(v, l, pct(x), dash ? " dash" : "")).join("") +
      (rate[c][i] == null || growth[c][i] == null ? "" : `<div class="muted">${rate[c][i] > growth[c][i]
        ? "r > g : les intérêts font grossir la dette plus vite que le PIB" : "r < g : la croissance allège le poids de la dette"}</div>`) };
}

// Fond des panneaux de croissance : rouge pâle quand le taux moyen de la dette dépasse la croissance nominale (r > g,
// effet boule de neige), bleu pâle sinon. Chaque point couvre jusqu'à mi-chemin de ses voisins ; périodes de même signe fusionnées.
// Taux manquant entre deux valeurs connues (2000 : rien avant l'annuel 1999) : interpolé, comme la courbe en pointillés qui les relie.
function rgShapes(p) {
  const c = state.pick, g = growth[c], ms = p.stamps, n = ms.length, out = [];
  const r = p.rate[c].slice();
  for (let i = 1, k = r.findIndex(v => v != null); k >= 0 && i < n; i++) {
    if (r[i] == null) continue;
    for (let j = k + 1; j < i; j++) r[j] = r[k] + (r[i] - r[k]) * (ms[j] - ms[k]) / (ms[i] - ms[k]);
    k = i;
  }
  const left = i => i > 0 ? (ms[i - 1] + ms[i]) / 2 : ms[0] - (ms[1] - ms[0]) / 2;
  const right = i => i < n - 1 ? (ms[i] + ms[i + 1]) / 2 : ms[i] + (ms[i] - ms[i - 1]) / 2;
  const iso = t => new Date(t).toISOString().slice(0, 10);
  const sign = i => r[i] == null || g[i] == null ? null : r[i] > g[i];
  for (let i = 0; i < n; i++) {
    const s = sign(i);
    if (s == null) continue;
    let j = i;
    while (j + 1 < n && sign(j + 1) === s) j++;
    out.push({ type: "rect", xref: "x" + p.n, yref: `y${p.n} domain`, x0: iso(left(i)), x1: iso(right(j)), y0: 0, y1: 1,
      fillcolor: css(s ? "--s5" : "--s1") + "1a", line: { width: 0 }, layer: "below" });
    i = j;
  }
  return out;
}

// PIB par la demande, Y = C + I + G + (X − M) (Md€ sur 4 trimestres glissants, annuels avant 2000), en Md€ ou en % du PIB
// (state.unit) : aires empilées C, I, G, puis exportations nettes hachurées entre C + I + G et le PIB (au-dessus en cas
// d'excédent, par-dessus G en cas de déficit). Y est la somme des composantes (écart statistique écarté, voir update.py).
const DEMAND = Object.fromEntries(ALL_CODES.map(c => [c, DATA.demand.periods.map((_, i) => {
  const [C, I, G, X, M] = ["C", "I", "G", "X", "M"].map(k => DATA.demand.series[c][k][i]);
  return C == null ? null : { C, I, G, X, M, Y: C + I + G + X - M };
})]));
const UNITS = { pct: "% du PIB", eur: "Md€" };
const mdEur = v => {   // décimales selon l'ordre de grandeur (Grèce des années 1950 : quelques dizaines de M€)
  const a = Math.abs(v), n = a >= 100 ? Math.round(a).toLocaleString("fr-FR") : a.toFixed(a >= 1 ? 1 : 2).replace(".", ",");
  return `${v < 0 ? "-" : ""}${n} Md€`;   // signe comme toFixed, ailleurs sur la page
};
const demandPanel = {
  key: "demand", title: "PIB par la demande",
  codes: ALL_CODES, single: true, fromZero: true, units: UNITS,
  x: DATA.demand.periods.map(windowMid), date: i => windowLabel(DATA.demand.periods[i]),
  traces: c => {
    const sum = (...ks) => DEMAND[c].map(d => d && +(ks.reduce((s, k) => s + d[k], 0) * (state.unit === "pct" ? 100 / d.Y : 1)).toFixed(4));
    return [
      area("--s1", sum("C"), "tozeroy"),
      area("--s4", sum("C", "I"), "tonexty"),
      area("--s6", sum("C", "I", "G"), "tonexty"),
      { y: sum("Y"), fill: "tonexty", ...hatch("--s2"), line: { color: css("--text-primary"), width: 2 } },
    ];
  },
  tip: (c, i) => {
    const d = DEMAND[c][i];
    if (!d) return "";
    const v = x => state.unit === "pct" ? `${(100 * x / d.Y).toFixed(1).replace(".", ",")} %` : mdEur(x);
    return swatch("--s1", "Consommation des ménages (C)", v(d.C)) + swatch("--s4", "Investissement (I)", v(d.I)) +
      swatch("--s6", "Consommation publique (G)", v(d.G)) +
      hatched("--s2", "Exportations − importations (X − M)", v(d.X - d.M)) +
      `<div class="muted">exportations ${v(d.X)}, importations ${v(d.M)}</div>` +
      swatch("--text-primary", "PIB (Y)", state.unit === "pct" ? mdEur(d.Y) : v(d.Y));
  },
};

// Un panneau par graphique. L'ordre d'affichage et les panneaux repliés sont dans state ;
// n = suffixe des axes Plotly (x, x2, x3…), attribué à chaque rendu aux seuls panneaux dépliés.
// Déficit public = déficit primaire + intérêts (% du PIB, 4 trimestres glissants depuis 2000, annuels du FMI avant) : aire du déficit primaire
// depuis zéro (hachurée vers le bas en cas d'excédent primaire), intérêts empilés au-dessus jusqu'au déficit total (ligne).
// Seules les périodes connues sont tracées (avant 2000, et IE et DE avant 2002 : un point annuel par an, reliés).
const DEFICIT = Object.fromEntries(ALL_CODES.map(c => [c, DATA.deficit.periods.map((q, i) => {
  const total = DATA.deficit.series[c][i], j = DATA.burden.periods.indexOf(q), interest = j < 0 ? null : DATA.burden.series[c][j];
  return total == null || interest == null ? null : { total, interest, primary: +(total - interest).toFixed(2) };
})]));
const deficitPanel = {
  key: "deficit", title: "Déficit public : déficit primaire et intérêts de la dette (% du PIB)", codes: ALL_CODES, zero: true, single: true,
  x: DATA.deficit.periods.map(windowMid), date: i => windowLabel(DATA.deficit.periods[i]),
  traces: c => {
    const idx = DEFICIT[c].flatMap((d, i) => d ? [i] : []), get = k => idx.map(i => DEFICIT[c][i][k]);
    const d = splitAtZero(idx.map(i => deficitPanel.x[i]), { primary: get("primary"), total: get("total") }, ["primary"]), x = d.x;
    return [
      // bord des aires du déficit primaire tracé une seule fois (par la 3e courbe), pas le long de zéro
      { x, ...area("--s1", d.primary.map(v => Math.max(v, 0)), "tozeroy"), line: { width: 0 } },
      { x, y: d.primary.map(v => Math.min(v, 0)), fill: "tozeroy", ...hatch("--s1"), line: { width: 0 } },
      { x, y: d.primary, line: { color: css("--s1"), width: 1.5 } },   // base des intérêts
      { x, ...area("--s2", d.total, "tonexty") },
      { x, y: d.total, line: { color: css("--text-primary"), width: 2 } },
    ];
  },
  tip: (c, i) => {
    const d = DEFICIT[c][i];
    if (!d) return "";
    return (d.primary < 0 ? hatched("--s1", "Excédent primaire", pctGDP(-d.primary)) : swatch("--s1", "Déficit primaire", pctGDP(d.primary))) +
      swatch("--s2", "Intérêts de la dette", pctGDP(d.interest)) +
      swatch("--text-primary", d.total < 0 ? "Excédent public" : "Déficit public", pctGDP(Math.abs(d.total)));
  },
};

// Explications affichées au survol d'un titre : ce que montre le graphique, formules, ce qu'il faut y observer
const explain = (what, formulas, watch) => `<div>${what}</div>` + formulas.map(f => `<div class="f">${f}</div>`).join("") +
  `<p><b>À observer :</b> ${watch}</p>`;
// Masse monétaire M3 de la zone euro (un seul tracé, sans choix du pays) : croissance sur 12 mois (ligne) et contribution
// de chaque source de création monétaire, empilées au-dessus de zéro si elles sont positives, en dessous (hachurées)
// sinon. Valeurs sur 12 mois glissants, placées au milieu de leur période comme les autres flux.
const MONEY = [["private", "--s1", "Crédit aux entreprises et ménages"], ["government", "--s2", "Crédit aux administrations publiques, dont QE"],
  ["external", "--s3", "Avoirs extérieurs nets"], ["other", "--s7", "Autres, surtout financements longs des banques"]];
const monthMid = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 6, 1)).toISOString().slice(0, 10);   // milieu des 12 mois finissant en m
const monthWindow = m => {
  const [y, n] = m.split("-").map(Number), s = new Date(Date.UTC(y, n - 12, 1));
  return `${MOIS[s.getUTCMonth()]} ${s.getUTCFullYear()} → ${MOIS[n - 1]} ${y}`;
};
const moneyPanel = {
  key: "money", title: "Masse monétaire M3 de la zone euro : croissance sur un an et ses sources (%)", codes: ALL_CODES,
  single: true, place: "zone euro", zero: true,
  x: DATA.money.periods.map(monthMid), date: i => monthWindow(DATA.money.periods[i]),
  traces: () => {
    const d = splitAtZero(moneyPanel.x, Object.fromEntries(["m3", ...MONEY.map(m => m[0])].map(k => [k, DATA.money[k]])), MONEY.map(m => m[0]));
    const stack = (f, style) => {   // aires empilées depuis zéro, chacune jusqu'à la précédente
      let acc = d.x.map(() => 0);
      return MONEY.map(([k, v], j) => {
        acc = acc.map((a, i) => a + f(d[k][i], 0));
        return { x: d.x, y: acc, fill: j ? "tonexty" : "tozeroy", ...style(v) };
      });
    };
    return [
      ...stack(Math.max, v => ({ fillcolor: css(v) + "8c", line: { color: css(v), width: 1.5 } })),
      ...stack(Math.min, v => ({ ...hatch(v), line: { color: css(v), width: 1 } })),
      { x: d.x, y: d.m3, line: { color: css("--text-primary"), width: 2 } },
    ];
  },
  tip: (c, i) => MONEY.map(([k, v, l]) => DATA.money[k][i] < 0 ? hatched(v, l, pct(DATA.money[k][i])) : swatch(v, l, pct(DATA.money[k][i]))).join("") +
    swatch("--text-primary", "Croissance de M3", pct(DATA.money.m3[i])),
};

// Dette publique détenue par l'Eurosystème par programme, en % de la dette publique : SMP (2010-2012), PSPP (QE),
// PEPP (Covid), aires empilées, total en ligne. Pour la zone euro (tous les États, sans les titres des institutions
// européennes, rapportés à la dette de la zone) ou un pays (state.holder, choisi à droite du titre, indépendant de la
// légende et du pays des autres panneaux). Dette en fin de mois interpolée entre deux fins de trimestre (update.py).
const H = DATA.holdings;
const PROGRAMS = [["SMP", "--s5", "SMP (2010-2012)"], ["PSPP", "--s1", "PSPP : QE"], ["PEPP", "--s2", "PEPP : Covid"]];
const heldBy = (prog, c, i) => c === "EA"   // Md€
  ? (prog === "SMP" ? H.SMP.total?.[i] ?? 0 : Object.entries(H[prog]).reduce((s, [k, v]) => k === "supra" ? s : s + v[i], 0))
  : H[prog][c]?.[i] ?? 0;
const heldShare = (prog, c, i) => { const d = H.debt[c][i]; return d ? 100 * heldBy(prog, c, i) / d : null; };
const holderName = () => state.holder === "EA" ? "zone euro" : DATA.names[state.holder];
const holdingsPanel = {
  key: "holdings", title: "Dette publique détenue par l'Eurosystème, par programme (% de la dette publique)", codes: ALL_CODES,
  single: true, place: holderName, fromZero: true,
  selects: () => [{ state: "holder", options: [["EA", "Zone euro"], ...ALL_CODES.map(c => [c, DATA.names[c]])] }],
  x: H.periods.map(monthEnd), date: i => `fin ${monthYear.format(PANEL.holdings.stamps[i])}`,
  traces: () => {
    let acc = H.periods.map(() => 0);
    return [
      ...PROGRAMS.map(([prog, v], j) => {
        acc = acc.map((a, i) => a == null || H.debt[state.holder][i] == null ? null : +(a + heldShare(prog, state.holder, i)).toFixed(2));
        return area(v, acc, j ? "tonexty" : "tozeroy");
      }),
      { y: acc, line: { color: css("--text-primary"), width: 2 } },
    ];
  },
  tip: (c, i) => {
    const h = state.holder, debt = H.debt[h][i];
    if (!debt) return "";
    const v = PROGRAMS.map(([prog]) => heldBy(prog, h, i)), total = v.reduce((a, b) => a + b, 0);
    const share = x => `${(100 * x / debt).toFixed(1).replace(".", ",")} %`;
    return PROGRAMS.map(([, color, label], j) => v[j] / debt >= 0.0005 ? swatch(color, label, share(v[j])) : "").reverse().join("") +
      swatch("--text-primary", "Total", share(total)) + `<div class="muted">${mdEur(total)} sur ${mdEur(debt)} de dette publique</div>`;
  },
};

const INFO = {
  spread: explain("Supplément de taux que les investisseurs exigent pour prêter à un État plutôt qu'à l'Allemagne, jugée la plus sûre " +
    "de la zone euro : c'est la prime de risque du pays (risque de défaut et, jusqu'en 2012, risque de sortie de l'euro).",
    [],
    "presque nul de 1999 à 2008, comme si toutes les dettes se valaient ; envolée de 2010 à 2012 (Grèce jusqu'à 27 %, " +
    "Portugal 12, Irlande près de 10, Espagne et Italie plus de 5) ; reflux après « Whatever it takes » puis avec le QE ; " +
    "poussée italienne en 2018 ; depuis 2024, la France s'écarte de l'Allemagne avec l'instabilité politique et budgétaire, " +
    "jusqu'à rejoindre l'Italie."),
  rate: explain("Taux auquel l'État emprunte aujourd'hui pour 10 ans sur les marchés. Il ne s'applique qu'aux nouveaux emprunts : " +
    "le coût moyen de toute la dette (graphique « taux moyen ») ne le suit que lentement, au fil des renouvellements.",
    [],
    "la longue baisse de 2000 à 2020 (inflation faible, taux de la BCE jusqu'à −0,5 %, QE), jusqu'à des taux négatifs en " +
    "Allemagne dès 2016 et brièvement en France en 2019-2020 : les investisseurs payaient pour prêter ; puis la remontée brutale " +
    "de 2022 avec l'inflation et la hausse des taux de la BCE."),
  debt: explain("Dette brute de toutes les administrations publiques (État, collectivités locales, sécurité sociale), au sens " +
    "de Maastricht, en fin de trimestre, rapportée au PIB des 4 derniers trimestres.",
    ["ΔD = r × D<sub>t−1</sub> + déficit primaire", "D : dette en euros ; r : taux moyen de la dette"],
    "la dette héritée de la guerre fond pendant les Trente Glorieuses (France : 40 % du PIB en 1950, 15 % en 1974) car r < g ; " +
    "elle remonte dans les années 1980-1990 (taux réels élevés, r > g) ; chaque crise (2009, 2020) la fait monter d'une marche " +
    "qui ne redescend guère ; restructuration grecque en 2012 ; Irlande : de 101 % à 74 % du PIB en 2015, surtout à cause du " +
    "bond du PIB (bénéfices des multinationales), pas d'un remboursement ; Allemagne : baisse de 2012 à 2019 grâce aux excédents et à r < g."),
  deficit: explain("Ce que les administrations publiques dépensent de plus qu'elles ne perçoivent sur un an, en % du PIB. " +
    "Le déficit primaire exclut les intérêts : c'est la partie qui " +
    "dépend des choix budgétaires de l'année.",
    [],
    "si r > g, il faut un excédent primaire pour que la dette cesse de monter en % du PIB ; l'Italie dégage un excédent " +
    "primaire presque chaque année de 1992 à 2019 : son déficit vient des intérêts ; récessions de 2009 et 2020 : les recettes chutent et " +
    "les plans de soutien gonflent le déficit primaire ; Irlande en 2010 : plus de 30 % du PIB avec le sauvetage des banques ; " +
    "Grèce : excédents primaires exigés par les plans d'aide après 2015 ; la règle européenne fixe le déficit à 3 % du PIB au plus."),
  holdings: explain("Part de la dette publique détenue par l'Eurosystème (la BCE et les banques centrales nationales), selon " +
    "le programme de rachat qui l'a achetée : le SMP, rachats ciblés de dette de la Grèce, de l'Irlande, du Portugal, de " +
    "l'Espagne et de l'Italie en pleine crise (2010-2012, environ 220 Md€ au plus haut), compensés par un retrait équivalent de " +
    "liquidités ; le PSPP, cœur du QE, à partir de 2015, réparti selon la part de chaque pays au capital de la BCE ; le PEPP, " +
    "lancé contre la crise du Covid en mars 2020 (enveloppe de 1 850 Md€), plus souple dans sa répartition et ouvert à la Grèce. " +
    "Le programme OMT, annoncé en 2012 avec « Whatever it takes », n'a jamais servi.",
    [],
    "le SMP fond au fil des remboursements et a presque disparu en 2021 ; le PSPP monte de 2015 à 2018, s'arrête en 2019 et " +
    "repart fin 2019 ; le PEPP bondit en 2020-2021 et ses achats nets cessent en mars 2022, ceux du PSPP en juillet 2022 ; l'Eurosystème " +
    "détient alors jusqu'à un tiers de la dette publique de la zone euro (2022 ; plus de 40 % pour l'Allemagne) ; en Grèce, " +
    "le SMP en représentait déjà un dixième en 2012 ; puis le QT : le PSPP n'est plus réinvesti depuis juillet 2023, le PEPP " +
    "depuis fin 2024 : l'encours baisse au rythme des remboursements, sans aucune vente, et sa part d'autant plus vite " +
    "que la dette, elle, continue de grossir."),
  money: explain("La masse monétaire M3 réunit les billets, les dépôts et les placements à court terme des ménages et des " +
    "entreprises de la zone euro. Elle naît quand une banque, ou la banque centrale, accorde un crédit ou achète un titre : " +
    "le prêt crée un dépôt du même montant ; elle disparaît quand le crédit est remboursé. Les aires montrent d'où vient sa " +
    "croissance sur un an : crédit aux entreprises et ménages, crédit aux administrations publiques, y compris les achats de " +
    "dette publique par l'Eurosystème, entrées de capitaux venus de l'étranger, et le reste, surtout l'épargne placée à long " +
    "terme dans les banques, qui sort de la monnaie. Hachures : la source détruit de la monnaie.",
    ["ΔM3 = Δcrédit au privé + Δcrédit aux administrations + Δavoirs extérieurs nets − Δfinancements longs des banques"],
    "2005-2007 : boom du crédit (immobilier en Espagne et en Irlande), M3 croît de plus de 10 % par an ; 2012-2014 : les " +
    "remboursements dépassent les nouveaux crédits (le crédit au privé retire 3 % à M3 en 2013), M3 ne progresse presque plus " +
    "et l'inflation tombe près de zéro : c'est ce qui conduit la BCE au QE ; 2015-2017 : le crédit aux administrations, porté " +
    "par les achats de la BCE, prend le relais ; 2020 : prêts garantis par l'État et PEPP portent la croissance de M3 à 12 % ; " +
    "2023 : avec le QT et la hausse des taux, le crédit aux administrations détruit de la monnaie et M3 cesse de croître. " +
    "Quand l'Eurosystème achète un titre à une banque, seules les réserves de la banque augmentent, pas M3 : la monnaie " +
    "n'apparaît que si le vendeur est un fonds, un assureur ou un ménage."),
  demand: explain("Le PIB mesure tout ce qui est produit dans le pays ; on le décompose ici par ses utilisations : consommation " +
    "des ménages (C), investissement des entreprises, des ménages (logement) et de l'État (I, stocks compris), consommation " +
    "publique, c'est-à-dire les services publics (G), et solde du commerce extérieur (X − M). Les importations sont retranchées " +
    "car elles sont déjà comptées dans C, I et G mais produites ailleurs.",
    ["Y = C + I + G + (X − M)"],
    "l'Allemagne vit d'excédents commerciaux depuis les années 2000 (jusqu'à 7 % du PIB) ; avant 2008, Grèce, Portugal et " +
    "Espagne importaient bien plus qu'ils n'exportaient (Grèce : −11 % du PIB en 2008), puis la crise les a fait passer en " +
    "excédent ; investissement espagnol à 30 % du PIB en 2007 (bulle immobilière) ; Irlande : exportations et importations " +
    "énormes (147 % du PIB) dues aux multinationales ; la consommation publique monte depuis 1950."),
  growth: explain("Croissance nominale du PIB (g, ligne pleine) décomposée en inflation (prix du PIB) et croissance réelle " +
    "(volumes), comparée au taux moyen payé sur la dette publique (r, pointillés). Fond rouge : r > g, la dette fait boule de " +
    "neige ; fond bleu : r < g, la croissance allège son poids.",
    ["g > r"],
    "les Trente Glorieuses : croissance et inflation fortes, r bien plus bas, la dette fond ; les années 1980-1990 : la " +
    "désinflation fait chuter g alors que r reste haut, la dette grossit d'elle-même ; de 2012 à 2021, r baisse lentement à " +
    "mesure que la dette est renouvelée à taux bas ; en 2022-2023, l'inflation fait bondir g alors que r ne suit qu'avec retard " +
    "(la dette française a une durée moyenne d'environ 8 ans)."),
  growthAll: explain("Même croissance nominale (g), comparée cette fois au taux moyen de toute la dette de l'économie hors " +
    "banques et assurances : administrations, entreprises non financières et ménages (r).",
    [],
    "ce taux suit les taux de la BCE bien plus vite que celui de l'État : beaucoup de crédits aux entreprises, et en Espagne " +
    "et au Portugal la plupart des prêts immobiliers, sont à taux variable (indexés sur l'Euribor), alors que l'État emprunte " +
    "à long terme et à taux fixe. Il plonge donc après 2012 (Espagne : 2,6 % contre 4,2 % pour l'État) et remonte plus vite " +
    "en 2022-2023 (France : de 1,3 % à 2,9 % en deux ans, contre 1,8 % pour l'État)."),
};

const PANELS = [
  { key: "spread", title: "Écart de taux d'emprunt d'État à 10 ans avec l'Allemagne (%)", codes: SPREAD_CODES, zero: true,
    x: months.map(monthDate), y: c => spreads[c], text: v => `${fmt(v)} %` },
  { key: "rate", title: "Taux d'emprunt d'État à 10 ans (%)", codes: ALL_CODES, zero: true,
    x: months.map(monthDate), y: c => DATA.series[c], text: v => `${fmt(v)} %` },
  { key: "debt", title: "Dette publique (% du PIB)", codes: ALL_CODES,
    x: DATA.debt.periods.map(quarterEnd), y: c => DATA.debt.series[c], text: pctGDP,
    date: i => { const q = DATA.debt.periods[i]; return q < "2000" ? `fin ${q.slice(0, 4)}` : monthYear.format(PANEL.debt.stamps[i]); } },   // encours : fin de période
  deficitPanel,
  holdingsPanel,
  moneyPanel,
  demandPanel,
  growthPanel("growth", "Inflation + croissance et taux moyen de la dette publique (%)", interest, "Taux moyen de la dette publique"),
  growthPanel("growthAll", "Inflation + croissance et taux moyen de toute la dette : État, entreprises, ménages (%)",
    interestAll, "Taux moyen de toute la dette"),
].map(panel => ({ ...panel, info: INFO[panel.key], stamps: panel.x.map(Date.parse) }));
const PANEL = Object.fromEntries(PANELS.map(p => [p.key, p]));

// Ordre et repli mémorisés dans le navigateur
state.order = PANELS.map(p => p.key);
state.folded = new Set();
try {
  const saved = JSON.parse(localStorage.getItem("panels"));
  // panneaux ajoutés depuis la sauvegarde : à la fin ; panneaux supprimés depuis : ignorés
  const order = saved.order.filter(k => PANEL[k]);
  state.order = [...order, ...state.order.filter(k => !order.includes(k))];
  state.folded = new Set(saved.folded.filter(k => PANEL[k]));
} catch {}
const savePanels = () => { try { localStorage.setItem("panels", JSON.stringify({ order: state.order, folded: [...state.folded] })); } catch {} };
state.pick = "FR";   // pays des panneaux « single »
try { const p = localStorage.getItem("pick"); if (ALL_CODES.includes(p)) state.pick = p; } catch {}
state.holder = "EA";   // émetteur du panneau de la dette détenue par l'Eurosystème (EA : zone euro)
try { const h = localStorage.getItem("holder"); if (h === "EA" || ALL_CODES.includes(h)) state.holder = h; } catch {}
state.unit = "pct";  // unité du panneau du PIB par la demande
try { const u = localStorage.getItem("unit"); if (UNITS[u]) state.unit = u; } catch {}
let shown = [];   // panneaux dépliés, dans l'ordre d'affichage

// ---- Construction des traces --------------------------------------------------
function traces(panel, code) {
  return {
    name: DATA.names[code], legendgroup: code, xaxis: "x" + panel.n, yaxis: "y" + panel.n,
    showlegend: false, visible: state.hidden.has(code) ? "legendonly" : true,
    type: "scatter", mode: "lines", x: panel.x, y: panel.y(code),
    line: { color: COLOR(code), width: 2 }, connectgaps: !!panel.connectgaps,
  };
}

// Panneau à un seul pays : courbes du pays choisi (panel.traces), qui ne dépendent pas de la légende (pas de legendgroup)
function singleTraces(panel) {
  const common = { xaxis: "x" + panel.n, yaxis: "y" + panel.n, showlegend: false, type: "scatter", mode: "lines", x: panel.x };
  return panel.traces(state.pick).map(t => ({ ...common, ...t }));
}
const buildTraces = () => shown.flatMap(panel => panel.single ? singleTraces(panel) : panel.codes.map(c => traces(panel, c)));

// ---- Mise en page ---------------------------------------------------------------
// [date, libellé, explication affichée au survol du libellé : effet sur les graphiques et raisons, pays éventuel]
// Un événement propre à un pays n'est affiché que si ce pays l'est (légende), dans sa couleur.
const EVENTS = [
  ["1999-01-01", "Euro", "Naissance de l'euro dans onze pays, dont la France, l'Allemagne, l'Italie, l'Espagne, le Portugal et l'Irlande. " +
    "Effet : les taux des pays du Sud convergent vers ceux de l'Allemagne (plus de risque de dévaluation) et leur charge d'intérêts baisse ; " +
    "les spreads restent presque nuls jusqu'en 2008, comme si toutes les dettes se valaient."],
  ["2001-01-01", "La Grèce dans l'euro", "La Grèce rejoint l'euro deux ans après les autres, sur la foi de chiffres de déficit " +
    "dont on apprendra en 2009 qu'ils étaient faux. Effet : son taux 10 ans s'aligne presque sur celui de l'Allemagne " +
    "et sa charge d'intérêts baisse, ce qui facilite l'endettement.", "GR"],
  ["2008-09-15", "Lehman", "Faillite de la banque Lehman Brothers : la crise financière américaine devient mondiale. " +
    "Effet : récession en 2009 (croissance négative), déficits qui se creusent et dette qui bondit partout ; " +
    "les investisseurs se réfugient sur la dette allemande et les spreads commencent à s'écarter."],
  ["2010-05-02", "1er plan grec", "Premier prêt de l'Union européenne et du FMI à la Grèce (110 Md€), qui avait caché l'ampleur de son déficit. " +
    "Effet : les marchés doutent de la solvabilité des pays fragiles ; les spreads de la Grèce, puis de l'Irlande, du Portugal, " +
    "de l'Espagne et de l'Italie s'envolent jusqu'en 2012."],
  ["2010-11-28", "Plan irlandais", "L'Irlande, qui a garanti toutes les dettes de ses banques ruinées par l'éclatement de sa bulle immobilière, " +
    "doit demander l'aide de l'Union européenne et du FMI (85 Md€). Effet : le déficit de 2010 dépasse 30 % du PIB (sauvetage des banques), " +
    "la dette bondit et la note s'effondre ; le spread irlandais culmine à l'été 2011.", "IE"],
  ["2011-05-05", "Plan portugais", "Le Portugal, faible croissance et dette en hausse, ne peut plus emprunter à des taux supportables " +
    "et obtient 78 Md€ de l'Union européenne et du FMI, en échange d'un programme d'austérité. Effet : le spread portugais monte " +
    "jusqu'en janvier 2012 et la note passe en catégorie spéculative ; récession en 2011-2012.", "PT"],
  ["2012-03-09", "Restructuration grecque", "Les créanciers privés de la Grèce acceptent d'effacer plus de la moitié de leurs créances " +
    "(environ 107 Md€), avec un 2e plan d'aide européen. Effet : c'est un défaut (note au plus bas) ; la dette grecque baisse d'un coup en 2012, " +
    "et le taux 10 ans grec, au-dessus de 30 % juste avant, commence à refluer.", "GR"],
  ["2012-06-09", "Sauvetage des banques espagnoles", "L'Espagne obtient jusqu'à 100 Md€ de prêts européens pour recapitaliser " +
    "ses caisses d'épargne, ruinées par l'éclatement de sa bulle immobilière. Effet : le taux 10 ans espagnol dépasse 7 % en juillet ; " +
    "le déficit de 2012 dépasse 10 % du PIB et la dette, encore à 36 % en 2007, grimpe vers 100 %.", "ES"],
  ["2012-07-26", "Whatever it takes", "Mario Draghi promet que la BCE fera « tout ce qu'il faudra » pour sauver l'euro (rachats illimités de dette " +
    "des pays en difficulté, programme OMT). Effet : sans même être utilisée, la promesse suffit ; les spreads refluent et les taux baissent pendant des années."],
  ["2015-03-09", "QE", "La BCE commence à acheter massivement de la dette publique (programme PSPP, dans le cadre d'achats d'actifs " +
    "de 60 Md€ par mois) : chaque banque centrale nationale achète surtout la dette de son propre État, en proportion de sa part au capital " +
    "de la BCE, et la paie en créant de la monnaie de banque centrale. Effet : la part de la dette détenue par l'Eurosystème monte d'environ 5 % " +
    "à 15-25 % en 2019 (la Grèce, trop mal notée, est exclue) ; les taux 10 ans et les spreads baissent, le taux allemand devient négatif."],
  ["2023-03-01", "QT", "Resserrement quantitatif : la BCE ne réinvestit plus qu'une partie des titres du programme APP arrivés à échéance, " +
    "puis plus aucun à partir de juillet 2023 ; même chose pour le PEPP à partir de juillet 2024, complètement fin 2024. Sans rien vendre, " +
    "l'Eurosystème laisse ainsi fondre son portefeuille. Effet : la part de la dette qu'il détient baisse chaque mois et les États doivent " +
    "trouver d'autres acheteurs (banques, fonds, ménages, investisseurs étrangers), ce qui pèse sur les taux longs."],
  ["2020-03-18", "Covid", "Confinements et arrêt d'une partie de l'économie. Effet : récession de 2020, déficits records pour soutenir " +
    "entreprises et salariés, bond de la dette ; la BCE rachète massivement de la dette publique (PEPP), ce qui maintient les taux bas. Rebond en 2021."],
  ["2022-07-21", "Hausse des taux BCE", "Face à une inflation proche de 10 %, la BCE relève ses taux pour la première fois depuis 2011 " +
    "(de −0,5 % à 4 % en un an). Effet : les taux 10 ans montent ; le taux moyen de la dette ne suit que lentement, " +
    "au fil des renouvellements, alors que l'inflation gonfle le PIB nominal : la dette fond temporairement."],
  ["2015-07-05", "Référendum grec", "Le gouvernement Syriza d'Alexis Tsipras refuse les conditions des créanciers et les soumet à référendum : " +
    "61 % de « non ». Les banques sont fermées, la sortie de l'euro est envisagée. Effet : le spread grec repart à la hausse ; " +
    "une semaine plus tard, Tsipras accepte un 3e plan d'aide, plus dur encore.", "GR"],
  ["2018-06-01", "Gouvernement Ligue-M5S", "Arrivée au pouvoir en Italie d'une coalition populiste (Ligue et Mouvement 5 étoiles) " +
    "qui a envisagé de sortir de l'euro et prévoit plus de déficit. Effet : le spread italien double en quelques semaines " +
    "(de 1,3 % à plus de 3 % à l'automne) ; Moody's abaisse la note en octobre.", "IT"],
];
const visibleEvents = () => EVENTS.filter(e => !e[3] || !state.hidden.has(e[3]));
// Événements historiques des panneaux de croissance (selon le pays choisi), libellés sur ces panneaux
const HISTORY = c => [
  ...(c === "FR" ? [["1945-06-01", "Début des Trente Glorieuses", "Reconstruction puis modernisation de la France, jusqu'au choc pétrolier de 1973. " +
    "Effet : forte croissance réelle (aire verte, environ 5 % par an) et inflation soutenue (aire orange), bien au-dessus d'un taux moyen " +
    "de la dette bas (taux encadrés par l'État) : la dette héritée de la guerre fond."]] : []),
  ["1973-10-16", "1er choc pétrolier", "L'OPEP quadruple le prix du pétrole. Effet : la croissance réelle (aire verte) se réduit, " +
    "jusqu'à devenir négative en 1975, mais l'inflation (aire orange) dépasse 10 % : le total reste élevé, c'est la stagflation. " +
    "Elle fait encore fondre la dette, mais met fin aux Trente Glorieuses (chômage de masse)."],
  ["1979-01-08", "2e choc pétrolier", "Révolution iranienne : le prix du pétrole double à nouveau. Effet : inflation vers 12 % (aire orange), " +
    "croissance réelle presque nulle (aire verte très fine). Pour casser l'inflation, la Fed (Volcker) relève fortement ses taux, suivie " +
    "par l'Europe : le taux moyen de la dette (pointillés) monte en 1981."],
  ...(c === "FR" ? [["1983-03-25", "Tournant de la rigueur", "Après la relance de 1981 et trois dévaluations, le gouvernement choisit de rester " +
    "dans le système monétaire européen : rigueur budgétaire, fin de l'indexation des salaires sur les prix, franc arrimé au mark. " +
    "Effet : l'inflation (aire orange) tombe de 12 % à moins de 3 % en 1987, alors que le taux moyen de la dette reste vers 9 % : " +
    "les courbes se croisent et la dette fait boule de neige jusqu'aux années 1990."]] : []),
];

// Géométrie verticale (px) : pour chaque panneau, un bandeau de titre, puis (s'il est déplié) le tracé et l'axe du temps
// Bandeau de titre : 44 px, ou la hauteur du titre s'il tient sur plusieurs lignes (mobile), mesurée par paintTitles()
const TITLE_H = 44, AXIS_H = 40;
function geometry(titleH = {}) {
  const plotH = Math.min(500, Math.max(320, Math.round(innerHeight * 0.42)));
  let y = 0;
  const blocks = state.order.map(key => {
    const b = { key, top: y, titleH: titleH[key] ?? TITLE_H };
    y += b.titleH;
    if (!state.folded.has(key)) { b.plotTop = y; b.plotBottom = y += plotH; y += AXIS_H; }
    b.bottom = y;
    return b;
  });
  return { blocks, height: y };
}

function baseLayout(geo) {
  const ink = css("--text-secondary"), grid = css("--grid");
  const axisCommon = {
    gridcolor: grid, linecolor: grid, tickfont: { color: ink }, zeroline: false,
  };
  const eventLine = (d, xref, yref, c) => ({
    type: "line", xref, yref, x0: d, x1: d, y0: 0, y1: 1,
    line: { color: c ? COLOR(c) : css("--zero"), width: 1, dash: "dot" }, layer: "below",
  });
  const shapes = [
    ...shown.filter(p => p.rg).flatMap(rgShapes),
    ...shown.flatMap(p => visibleEvents().map(([d, , , c]) => eventLine(d, "x" + p.n, `y${p.n} domain`, c))),
    ...shown.filter(p => p.history).flatMap(p => HISTORY(state.pick).map(([d]) => eventLine(d, "x" + p.n, `y${p.n} domain`))),
    ...shown.filter(p => p.zero).map(p => ({ type: "line", xref: "paper", yref: "y" + p.n, x0: 0, x1: 1, y0: 0, y1: 0, line: { color: css("--zero"), width: 1 }, layer: "below" })),
  ];
  const yCommon = { ...axisCommon, side: "right", fixedrange: false, ticklabelposition: "outside", automargin: true };
  const frac = px => 1 - px / geo.height;
  const axes = {};
  for (const p of shown) {
    const b = geo.blocks.find(b => b.key === p.key);
    axes["xaxis" + p.n] = { ...axisCommon, domain: [0, 1], anchor: "y" + p.n, type: "date",
      rangeslider: { visible: false }, ...(p.n && { matches: "x" }) };
    axes["yaxis" + p.n] = { ...yCommon, domain: [frac(b.plotBottom), frac(b.plotTop)] };
  }
  if (!shown.length) axes.xaxis = axes.yaxis = { visible: false };   // tout est replié
  return {
    height: geo.height,
    paper_bgcolor: css("--surface"), plot_bgcolor: css("--surface"),
    font: { family: "system-ui, -apple-system, Segoe UI, sans-serif", color: css("--text-primary") },
    separators: ", ",
    margin: { l: 16, r: 56, t: 0, b: 0 },
    hovermode: false,              // infobulle maison (voir « Survol »), plus fluide que celle de Plotly
    dragmode: "pan",
    ...axes,
    shapes,   // libellés des événements : HTML (voir paintEvents)
  };
}

Plotly.register({ moduleType: "locale", name: "fr", dictionary: {}, format: {
  days: ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"],
  shortDays: ["dim.","lun.","mar.","mer.","jeu.","ven.","sam."],
  months: ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"],
  shortMonths: ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."],
  date: "%d/%m/%Y", decimal: ",", thousands: " ",
}});

const chart = document.getElementById("chart");
const config = { responsive: true, scrollZoom: false, displayModeBar: false, locale: "fr", doubleClick: false };

// Reconstruit la figure (ordre, repli, thème) en conservant la fenêtre de temps et, en échelle manuelle, les échelles verticales
function render() {
  const fl = chart._fullLayout;
  const xRange = shown.length && fl?.xaxis?.range?.slice();
  const xL = xRange && xRange.map(fl.xaxis.r2l);   // en ms
  const yRanges = Object.fromEntries(shown.map(p => [p.key, fl?.["yaxis" + p.n]?.range?.slice()]));
  shown = state.order.map(k => PANEL[k]).filter(p => !state.folded.has(p.key));
  shown.forEach((p, i) => { p.n = i ? String(i + 1) : ""; });
  const geo = geometry(paintTitles());   // titres dessinés et mesurés d'abord : leur hauteur fixe celle des bandeaux
  const layout = baseLayout(geo);
  for (const p of shown) {
    if (xRange) layout["xaxis" + p.n].range = xRange;
    if (!state.autoY && yRanges[p.key]) layout["yaxis" + p.n].range = yRanges[p.key];
  }
  const data = buildTraces();
  // échelle auto calculée avant le tracé : un seul dessin, le graphique déplié apparaît directement à la bonne échelle
  if (state.autoY && xRange) Object.assign(layout, Object.fromEntries(Object.entries(autoRanges(data, xL))
    .map(([k, r]) => [k, { ...layout[k], range: r }])));
  chart.style.height = geo.height + "px";
  placeTitles(geo);
  paintVlines();
  return Plotly.react(chart, data, layout, config).then(() => state.autoY && shown.length && !xRange && fitY());
}

// ---- Échelles ---------------------------------------------------------------------
const xa = () => chart._fullLayout.xaxis;
function setAutoY(on) {
  state.autoY = on;
  document.getElementById("autoY").hidden = on;
  if (on) fitY();
}

// Ajuste l'échelle verticale de chaque graphique aux seules données visibles (séries affichées)
function fitY() {
  if (!shown.length) return;
  const upd = Object.fromEntries(Object.entries(autoRanges(chart.data, xa().range.map(xa().r2l))).map(([k, r]) => [k + ".range", r]));
  return Plotly.relayout(chart, upd);
}
// {yaxisN: [min, max]} des courbes visibles entre x0 et x1 (ms), avec une marge de 6 %
const msCache = new WeakMap();   // dates des courbes en ms, calculées une fois par tableau
const toMs = xs => { let m = msCache.get(xs); if (!m) msCache.set(xs, m = Float64Array.from(xs, Date.parse)); return m; };
function autoRanges(data, [x0, x1]) {
  const out = {};
  for (const p of shown) {
    const axis = "y" + p.n, yname = "yaxis" + p.n;
    let lo = p.fromZero ? 0 : Infinity, hi = -Infinity;   // aires empilées depuis zéro : zéro toujours visible
    for (const t of data) {
      if (t.yaxis !== axis || t.visible === "legendonly") continue;
      const ms = toMs(t.x), y = t.y;
      let a = 0, b = ms.length;   // dates triées : premier point ≥ x0 par dichotomie
      while (a < b) { const m = (a + b) >> 1; if (ms[m] < x0) a = m + 1; else b = m; }
      for (let i = a; i < ms.length && ms[i] <= x1; i++) {
        const v = y[i];
        if (v == null) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (hi === -Infinity) continue;
    const pad = (hi - lo) * 0.06 || 0.5;
    out[yname] = [p.fromZero ? 0 : lo - pad, hi + pad];
  }
  return out;
}

function setX(rangeL) {  // bornes en millisecondes
  if (!shown.length) return Promise.resolve();
  const r = rangeL.map(xa().l2r);
  const upd = Object.fromEntries(shown.map(p => [`xaxis${p.n}.range`, r]));
  // échelle auto dans le même appel : un seul dessin au lieu de deux (voir plotly_relayout)
  if (state.autoY) for (const [k, y] of Object.entries(autoRanges(chart.data, rangeL))) upd[k + ".range"] = y;
  return Plotly.relayout(chart, upd);
}


// Zones d'axes : position de la souris → axe des taux (droite) / axe du temps (dessous) / zone de tracé
const X_BAND = 34;
function hitTest(ev) {
  const fl = chart._fullLayout, s = fl._size, r = chart.getBoundingClientRect();
  const px = ev.clientX - r.left, py = ev.clientY - r.top;
  for (const yname of shown.map(p => "yaxis" + p.n)) {
    const d = fl[yname].domain, top = s.t + (1 - d[1]) * s.h, bot = s.t + (1 - d[0]) * s.h;
    const inX = px >= s.l && px <= s.l + s.w;
    if (px > s.l + s.w && py >= top && py <= bot) return { kind: "y", axis: yname };
    if (inX && py > bot && py < bot + X_BAND) return { kind: "x", px: s.l + s.w };
    if (inX && py >= top && py <= bot) return { kind: "plot", px, axis: yname };
  }
  return null;
}
const pxToL = px => xa().p2l(px - chart._fullLayout._size.l);

// Facteurs d'échelle : glisser sur un axe = étirer / comprimer (comme TradingView)
// Au plus un dessin par image, avec la dernière position de la souris, jamais deux dessins Plotly en même temps
let drag = null, frame = null, next = null, busy = false;
const throttle = fn => { next = fn; if (!frame && !busy) frame = requestAnimationFrame(flush); };
function flush() {
  frame = null;
  const fn = next; next = null;
  if (!fn) return;
  busy = true;
  Promise.resolve(fn()).finally(() => { busy = false; if (next) frame = requestAnimationFrame(flush); });
}

function scaleY(axis, range, f) {
  const c = (range[0] + range[1]) / 2, h = (range[1] - range[0]) / 2 * f;
  return Plotly.relayout(chart, { [axis + ".range"]: [c - h, c + h] });
}
// Axe du temps : bord droit fixe, la date saisie reste sous la souris (vers la droite = comprimer)
function grabX(d, clientX) {
  const s = chart._fullLayout._size;
  const a = Math.min(0.98, Math.max(0.01, (clientX - chart.getBoundingClientRect().left - s.l) / s.w));   // position dans le tracé
  const r1 = d.range[1];
  return setX([r1 - (r1 - d.grab) / (1 - a), r1]);   // (grab − r0) / (r1 − r0) = a
}
function scaleX(range, f, anchor) {  // anchor : point fixe (ms)
  return setX([anchor - (anchor - range[0]) * f, anchor + (range[1] - anchor) * f]);
}

chart.addEventListener("mousedown", ev => {
  if (ev.button !== 0) return;
  const hit = hitTest(ev);
  if (!hit || hit.kind === "plot") return;      // zone de tracé : déplacement standard
  ev.stopPropagation(); ev.preventDefault();
  if (hit.kind === "y") {
    setAutoY(false);
    drag = { ...hit, start: ev.clientY, range: chart._fullLayout[hit.axis].range.slice() };
  } else {
    const range = xa().range.map(xa().r2l);
    drag = { kind: "x", range, grab: pxToL(ev.clientX - chart.getBoundingClientRect().left) };   // date saisie
  }
}, true);

window.addEventListener("mousemove", ev => {
  if (!drag) {
    const hit = hitTest(ev);
    chart.classList.toggle("cur-ns", hit?.kind === "y");
    chart.classList.toggle("cur-ew", hit?.kind === "x");
    return;
  }
  const d = drag;
  throttle(() => {
    if (d.kind === "y") scaleY(d.axis, d.range, Math.exp((ev.clientY - d.start) * 0.006));   // vers le bas = comprimer
    else grabX(d, ev.clientX);
  });
});
window.addEventListener("mouseup", () => { drag = null; });

let wheelDelta = 0;
// Ctrl + molette sur le tracé = zoom temporel ; ailleurs (axes compris), la molette fait défiler la page.
chart.addEventListener("wheel", ev => {
  const hit = hitTest(ev);
  if (hit?.kind !== "plot" || !(ev.ctrlKey || ev.metaKey)) return;
  ev.preventDefault(); ev.stopPropagation();
  wheelDelta += ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY;   // cumulé jusqu'au prochain dessin
  throttle(() => { const f = Math.exp(wheelDelta * 0.0015); wheelDelta = 0; return scaleX(xa().range.map(xa().r2l), f, pxToL(hit.px)); });   // vers le bas = dézoomer
}, { capture: true, passive: false });

// Écran tactile : un doigt fait défiler la page (Plotly ne reçoit aucun toucher) ; deux doigts zoomment et déplacent le
// temps comme une photo : la date entre les doigts y reste, et l'écart entre les doigts fixe l'échelle (doigts deux fois
// plus proches = deux fois plus de temps à l'écran). Calculé depuis le début du geste, sans accumulation ni élan.
let pinch = null;
function pinchState(touches) {
  const [a, b] = touches, left = chart.getBoundingClientRect().left;
  return { mid: (a.clientX + b.clientX) / 2 - left, dist: Math.max(Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), 1) };
}
chart.addEventListener("touchstart", ev => {
  ev.stopPropagation();
  if (ev.touches.length !== 2 || !shown.length) return;
  ev.preventDefault();
  const g = pinchState(ev.touches), range = xa().range.map(xa().r2l);
  pinch = { ...g, msPerPx: (range[1] - range[0]) / chart._fullLayout._size.w, anchor: pxToL(g.mid) };
  hideHover();
}, { capture: true, passive: false });
chart.addEventListener("touchmove", ev => {
  ev.stopPropagation();
  if (!pinch || ev.touches.length !== 2) return;
  ev.preventDefault();
  const g = pinchState(ev.touches), s = chart._fullLayout._size;
  const k = pinch.msPerPx * pinch.dist / g.dist, r0 = pinch.anchor - (g.mid - s.l) * k;
  throttle(() => setX([r0, r0 + s.w * k]));
}, { capture: true, passive: false });
for (const type of ["touchend", "touchcancel"]) chart.addEventListener(type, ev => {
  ev.stopPropagation();
  if (ev.touches.length < 2) pinch = null;
}, { capture: true });

// Double-clic : axe vertical = échelle auto ; axe du temps ou tracé = vue initiale
chart.addEventListener("dblclick", ev => {
  const hit = hitTest(ev);
  if (!hit) return;
  if (hit.kind === "y") setAutoY(true);
  else showDefault();
});
// À brancher après le premier rendu (chart.on n'existe qu'ensuite)
function attachPlotlyEvents() {
  // Toute modification de l'axe du temps (déplacement, zoom) réajuste les taux en mode Auto
  chart.on("plotly_relayout", ev => {
    const keys = Object.keys(ev);   // « yaxisN.range » : échelles déjà ajustées par setX
    if (state.autoY && keys.some(k => k.startsWith("xaxis")) && !keys.some(k => /^yaxis\d*\.range$/.test(k))) fitY();
  });
  chart.on("plotly_restyle", () => state.autoY && fitY());   // pays masqué / affiché
  chart.on("plotly_afterplot", () => paintEvents());
  chart.on("plotly_relayouting", ev => {   // pendant un déplacement à la souris : bornes en cours
    const r = [ev["xaxis.range[0]"], ev["xaxis.range[1]"]];
    if (r[0] != null) paintEvents(r.map(xa().r2l));
  });
}

// ---- Libellés des événements (HTML) ------------------------------------------------
// Sur une seule ligne en haut du tracé ; un libellé trop proche du suivant est coupé (…).
// Événements généraux sur tous les graphiques, ceux propres à un pays sur le premier seulement ;
// panneau à un seul pays : événements historiques aussi.
const evLayer = document.getElementById("events");
const evTip = document.getElementById("evtip");
function paintEvents(range) {
  const fl = chart._fullLayout, s = fl._size;
  const [r0, r1] = range || xa().range.map(xa().r2l);
  const toPx = d => s.l + (Date.parse(d) - r0) / (r1 - r0) * s.w;
  const geo = titles.geo, html = [];
  shown.forEach((p, k) => {
    const list = [...(k === 0 ? visibleEvents() : EVENTS.filter(e => !e[3])), ...(p.history ? HISTORY(state.pick) : [])]
      .map(e => ({ e, x: toPx(e[0]) })).filter(o => o.x >= s.l && o.x < s.l + s.w).sort((a, b) => a.x - b.x);
    const top = geo.blocks.find(b => b.key === p.key).plotTop + 2;
    list.forEach((o, j) => {
      const width = (j + 1 < list.length ? list[j + 1].x - 6 : s.l + s.w) - o.x - 3;
      if (width > 14) html.push(`<div class="evlabel" data-d="${o.e[0]}" style="left:${o.x + 3}px;top:${top}px;max-width:${width}px${o.e[3] ? `;color:${COLOR(o.e[3])}` : ""}">${o.e[1]}</div>`);
    });
  });
  evLayer.innerHTML = html.join("");
}
evLayer.addEventListener("mouseover", ev => {
  const el = ev.target.closest(".evlabel");
  if (!el) return;
  const e = [...EVENTS, ...HISTORY(state.pick)].find(e => e[0] === el.dataset.d);
  hideHover();
  evTip.innerHTML = `<div class="date">${e[1]}</div>${e[2].replace(" Effet : ", "<p><b>Effet :</b> ")}`;
  evTip.classList.remove("info");
  evTip.hidden = false;
  const left = Math.min(el.offsetLeft, stage.clientWidth - evTip.offsetWidth - 8);
  Object.assign(evTip.style, { left: Math.max(0, left) + "px", top: el.offsetTop + el.offsetHeight + 4 + "px" });
});
evLayer.addEventListener("mouseout", ev => { if (ev.target.closest(".evlabel")) evTip.hidden = true; });

// ---- Contrôles --------------------------------------------------------------------
document.getElementById("autoY").onclick = () => setAutoY(true);

const lastMonth = months[months.length - 1];
const END = Date.UTC(+lastMonth.slice(0, 4), +lastMonth.slice(5, 7), 15);
const START = Date.UTC(2000, 0, 1);   // vue initiale ; l'historique depuis 1950 (croissance et taux) reste accessible en déplaçant
const showDefault = () => { setAutoY(true); return setX([START, END]); };

// ---- Légende (en haut de page, toujours visible) ---------------------------------
// Clic = masquer / afficher un pays ; double-clic = l'isoler (l'Allemagne reste en référence), ou tout réafficher.
const legend = document.getElementById("legend");
function paintLegend() {
  legend.innerHTML = ALL_CODES.map(c =>
    `<button data-c="${c}" class="${state.hidden.has(c) ? "off" : ""}"><span class="sw" style="background:${COLOR(c)}"></span>${DATA.names[c]}</button>`).join("");
}
function applyHidden() {
  paintLegend();
  return render();   // pas un simple restyle : les repères propres à un pays apparaissent ou disparaissent avec lui
}
let clickTimer = null;
legend.addEventListener("click", ev => {
  const c = ev.target.closest("button")?.dataset.c;
  if (!c) return;
  clearTimeout(clickTimer);
  if (ev.detail === 2) {   // double-clic
    const others = ALL_CODES.filter(x => x !== c && x !== "DE");
    const isolated = others.every(x => state.hidden.has(x)) && !state.hidden.has(c);
    state.hidden = new Set(isolated ? [] : others);
    applyHidden();
  } else if (ev.detail === 1) {
    clickTimer = setTimeout(() => {
      state.hidden.has(c) ? state.hidden.delete(c) : state.hidden.add(c);
      applyHidden();
    }, 250);
  }
});
// ---- En-tête sur mobile (écran étroit) : la ligne du titre suit le doigt ---------------------------------------
// Doigt posé : descendre de 10 px la remonte de 10 px, remonter la fait redescendre d'autant (jamais plus cachée que la
// distance au haut de page). Doigt levé : elle choisit aussitôt d'être entièrement cachée ou entièrement visible (le côté
// le plus proche) et ne bouge plus pendant l'élan, sauf pour réapparaître en arrivant en haut de page. Sans écran tactile
// (molette), elle suit le défilement et choisit 120 ms après son arrêt. La légende reste visible.
const header = document.querySelector("header"), controls = header.querySelector(".controls");
const narrow = matchMedia("(max-width: 700px)");
let rowH = 0, offset = 0, lastScroll = Math.max(scrollY, 0), touching = false, touchUsed = false, snapTimer = null;
function setOffset(v, animate = false) {
  v = narrow.matches ? v : 0;
  if (v === offset && !animate) return;
  offset = v;
  header.style.transition = animate ? "transform .2s ease" : "none";
  header.style.transform = v ? `translateY(${-v}px)` : "";
}
function measureTitleRow() {
  rowH = parseFloat(getComputedStyle(header).paddingTop) + controls.offsetHeight + parseFloat(getComputedStyle(controls).marginBottom) - 8;
  setOffset(Math.min(offset, rowH));
}
measureTitleRow();
addEventListener("resize", measureTitleRow);
const snapTitle = () => setOffset(offset > rowH / 2 && scrollY > rowH ? rowH : 0, true);
addEventListener("scroll", () => {
  const y = Math.max(scrollY, 0), dy = y - lastScroll;   // rebond iOS en haut de page : pas de défilement négatif
  lastScroll = y;
  if (touching || !touchUsed) setOffset(Math.max(0, Math.min(rowH, offset + dy, y)));
  else if (offset > y) setOffset(y);   // élan jusqu'en haut de page
  if (!touchUsed) { clearTimeout(snapTimer); snapTimer = setTimeout(snapTitle, 120); }
}, { passive: true });
// en capture : les graphiques arrêtent la propagation de leurs touchers
addEventListener("touchstart", () => { touching = touchUsed = true; lastScroll = Math.max(scrollY, 0); }, { capture: true, passive: true });
for (const type of ["touchend", "touchcancel"]) addEventListener(type, ev => {
  if (ev.touches.length || !touching) return;
  touching = false;
  snapTitle();
}, { capture: true, passive: true });

// ---- Thème clair / sombre -----------------------------------------------------------
const themeBtn = document.getElementById("theme");
const isDark = () => getComputedStyle(document.documentElement).colorScheme === "dark";
const paintThemeBtn = () => { themeBtn.textContent = isDark() ? "☀ Clair" : "☾ Sombre"; };
try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch {}
paintThemeBtn();
themeBtn.onclick = () => {
  const t = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch {}
  paintThemeBtn();
  paintLegend();
  render();
};

// ---- Survol : ligne verticale sur tous les graphiques + infobulle --------------------
// Suit la souris à chaque image (requestAnimationFrame) ; valeurs = point le plus proche de chaque courbe visible.
const hover = document.getElementById("hover");
const tip = document.getElementById("tip");
let vlines = [];
function paintVlines() {   // une ligne verticale par graphique déplié
  vlines.forEach(el => el.remove());
  vlines = shown.map(() => hover.appendChild(Object.assign(document.createElement("div"), { className: "vline" })));
}
const hline = hover.appendChild(Object.assign(document.createElement("div"), { className: "hline" }));   // courbe unique seulement
const monthYear = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

function nearest(ts, t) {   // indice de la date la plus proche (ts trié)
  let lo = 0, hi = ts.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; ts[mid] <= t ? lo = mid : hi = mid; }
  return t - ts[lo] <= ts[hi] - t ? lo : hi;
}

function hideHover() { hover.hidden = true; }
function showHover(ev, hit) {
  const fl = chart._fullLayout, s = fl._size, r = chart.getBoundingClientRect();
  const px = ev.clientX - r.left, py = ev.clientY - r.top;
  const t = pxToL(px);
  shown.forEach((p, i) => {
    const d = fl["yaxis" + p.n].domain;
    Object.assign(vlines[i].style, { left: px + "px", top: s.t + (1 - d[1]) * s.h + "px", height: (d[1] - d[0]) * s.h + "px" });
  });
  const panel = shown.find(p => "yaxis" + p.n === hit.axis);
  const i = nearest(panel.stamps, t);
  // au-delà des données (ex. avant 1950) : ligne verticale seule, pas d'infobulle figée sur le premier point
  const ts = panel.stamps, n = ts.length;
  if (t < ts[0] - (ts[1] - ts[0]) / 2 || t > ts[n - 1] + (ts[n - 1] - ts[n - 2]) / 2) {
    tip.hidden = hline.hidden = true;
    hover.hidden = false;
    return;
  }
  tip.hidden = false;
  if (panel.single) {
    const place = typeof panel.place === "function" ? panel.place() : panel.place || DATA.names[state.pick];
    tip.innerHTML = `<div class="date">${panel.date(i)} · ${place}</div>` + panel.tip(state.pick, i);
    hline.hidden = true;
    return placeTip(px, py, s, r);
  }
  const rows = panel.codes.filter(c => !state.hidden.has(c))
    .map(c => ({ c, v: panel.y(c)[i] })).filter(r => r.v != null).sort((a, b) => b.v - a.v);
  tip.innerHTML = `<div class="date">${panel.date ? panel.date(i) : monthYear.format(panel.stamps[i])}</div>` + rows.map(({ c, v }) =>
    `<div><span class="sw" style="background:${COLOR(c)}"></span>${DATA.names[c]} <b>${panel.text(v)}</b></div>`).join("");
  // une seule courbe : ligne horizontale à sa valeur (si elle est dans la zone visible)
  const ya = fl[hit.axis], y = rows.length === 1 ? ya._offset + ya.l2p(rows[0].v) : NaN;
  const d = ya.domain, inside = y >= s.t + (1 - d[1]) * s.h && y <= s.t + (1 - d[0]) * s.h;
  hline.hidden = !inside;
  if (inside) Object.assign(hline.style, { top: y + "px", left: s.l + "px", width: s.w + "px" });
  placeTip(px, py, s, r);
}
function placeTip(px, py, s, r) {
  hover.hidden = false;
  // à droite du curseur, ou à gauche s'il n'y a pas la place
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const left = Math.max(0, px + 16 + w > s.l + s.w ? px - 16 - w : px + 16);   // jamais hors de l'écran à gauche
  tip.style.transform = `translate(${left}px, ${Math.min(Math.max(py - h / 2, 0), r.height - h)}px)`;
}

let hoverFrame = null, lastEv = null;
chart.addEventListener("mousemove", ev => {
  lastEv = ev;
  if (hoverFrame) return;
  hoverFrame = requestAnimationFrame(() => {
    hoverFrame = null;
    const hit = hitTest(lastEv);
    hit?.kind === "plot" && !drag ? showHover(lastEv, hit) : hideHover();
  });
});
chart.addEventListener("mouseleave", hideHover);

// ---- Titres des graphiques : bouton −/+ (replier) et glisser-déposer (réordonner) ----------
const titles = document.getElementById("titles");
const dropLine = document.getElementById("dropline");
// Titres et listes de choix, puis hauteur de chaque bandeau {clé: px} : un titre sur plusieurs lignes agrandit son
// bandeau au lieu de déborder sur l'axe du graphique précédent. Les listes de choix sont à droite du titre, ou sur leur
// propre ligne sous le titre quand elles lui laisseraient moins de la moitié de la largeur (mobile).
function paintTitles() {
  titles.innerHTML = state.order.map(key => {
    const folded = state.folded.has(key), selects = folded ? [] : selectsOf(PANEL[key]);
    return `<div class="ptitle${folded ? " folded" : ""}" data-key="${key}" draggable="true">` +
      `<span class="ttl"><button class="fold" title="${folded ? "Afficher" : "Replier"} le graphique">${folded ? "+" : "−"}</button>` +
      `${PANEL[key].title}</span></div>` +
      (selects.length ? `<span class="picks" data-key="${key}">` +
        selects.map(({ state: k, options }) => `<select data-state="${k}">` + options.map(([v, l]) =>
          `<option value="${v}"${v === state[k] ? " selected" : ""}>${l}</option>`).join("") + "</select>").join("") + "</span>" : "");
  }).join("");
  const heights = {}, width = titles.clientWidth;
  for (const t of titles.querySelectorAll(".ptitle")) {
    const picks = titles.querySelector(`.picks[data-key="${t.dataset.key}"]`);
    const beside = picks && width - 16 - (56 + picks.offsetWidth + 12) >= width / 2;
    t.style.right = (beside ? 56 + picks.offsetWidth + 12 : 16) + "px";
    if (picks && !beside) {   // dessous : titre en haut du bandeau, listes alignées à gauche sous lui
      t.dataset.below = t.offsetHeight;
      Object.assign(picks.style, { left: "16px", right: "auto" });
      heights[t.dataset.key] = t.offsetHeight + picks.offsetHeight + 10;
    } else heights[t.dataset.key] = Math.max(TITLE_H, t.offsetHeight);
  }
  return heights;
}
// Place titres et listes de choix (alignées sur la dernière ligne du titre) selon la géométrie
function placeTitles(geo) {
  for (const b of geo.blocks) {
    const t = titles.querySelector(`.ptitle[data-key="${b.key}"]`), below = +t.dataset.below;
    Object.assign(t.style, { top: b.top + "px", height: (below || b.titleH) + "px" });
    const picks = titles.querySelector(`.picks[data-key="${b.key}"]`);
    if (picks) picks.style.top = (below ? b.top + below : b.top + b.titleH - 32) + "px";
  }
  titles.geo = geo;
}
// Largeur de fenêtre modifiée (rotation du téléphone…) : les titres peuvent changer de nombre de lignes
let resizeTimer = null, lastWidth = innerWidth;
addEventListener("resize", () => {
  if (innerWidth === lastWidth) return;   // barre d'adresse mobile qui apparaît ou disparaît : hauteur seule
  lastWidth = innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 150);
});
// Listes de choix à droite du titre : {state: clé de state (mémorisée dans le navigateur), options: [[valeur, libellé]]}.
// Par défaut, un panneau à un seul pays a le choix du pays (state.pick), précédé de l'unité s'il en propose.
const selectsOf = panel => panel.selects ? panel.selects() : panel.single && !panel.place
  ? [...(panel.units ? [{ state: "unit", options: Object.entries(panel.units) }] : []),
    { state: "pick", options: ALL_CODES.map(c => [c, DATA.names[c]]) }]
  : [];
// Repli et dépliage immédiats, sans animation
let busyFold = false;
async function toggleFold(key) {
  if (busyFold) return;
  busyFold = true;
  hideHover();
  state.folded.has(key) ? state.folded.delete(key) : state.folded.add(key);
  await render();
  savePanels();
  busyFold = false;
}
titles.addEventListener("change", ev => {
  const key = ev.target.dataset.state;
  if (!key) return;
  state[key] = ev.target.value;
  try { localStorage.setItem(key, state[key]); } catch {}
  render();
});
// à l'appui du bouton (pas au relâchement) : réaction immédiate
titles.addEventListener("pointerdown", ev => {
  if (ev.button !== 0) return;
  const key = ev.target.closest(".fold") && ev.target.closest(".ptitle").dataset.key;
  if (key) toggleFold(key);
});

// Position d'insertion = frontière de bloc la plus proche du curseur
function dropIndex(ev) {
  const y = ev.clientY - titles.getBoundingClientRect().top;
  const bounds = [0, ...titles.geo.blocks.map(b => b.bottom)];
  return bounds.reduce((best, b, i) => Math.abs(b - y) < Math.abs(bounds[best] - y) ? i : best, 0);
}
let dragKey = null;
// Survol du titre (hors bouton −/+) : explication du graphique, dans la bulle des événements, sous le titre
// (au-dessus s'il n'y a pas la place dans la fenêtre)
titles.addEventListener("mouseover", ev => {
  const ttl = ev.target.closest(".ttl");
  if (!ttl || dragKey) return;
  if (ev.target.closest(".fold")) { evTip.hidden = true; return; }
  const t = ttl.closest(".ptitle"), panel = PANEL[t.dataset.key];
  hideHover();
  evTip.innerHTML = `<div class="date">${panel.title}</div>${panel.info}`;
  evTip.classList.add("info");
  evTip.hidden = false;
  const below = t.offsetTop + t.offsetHeight + 4, above = t.offsetTop - evTip.offsetHeight - 4;
  const fits = stage.getBoundingClientRect().top + below + evTip.offsetHeight <= innerHeight;
  Object.assign(evTip.style, { left: t.offsetLeft + "px", top: (fits || above < 0 ? below : above) + "px" });
});
titles.addEventListener("mouseout", ev => {
  const ttl = ev.target.closest(".ttl");
  if (ttl && !ttl.contains(ev.relatedTarget)) evTip.hidden = true;
});
titles.addEventListener("dragstart", ev => {
  evTip.hidden = true;
  dragKey = ev.target.closest(".ptitle")?.dataset.key;
  ev.dataTransfer.effectAllowed = "move";
  ev.dataTransfer.setData("text/plain", dragKey);
  hideHover();
});
const stage = document.getElementById("stage");
stage.addEventListener("dragover", ev => {
  if (!dragKey) return;
  ev.preventDefault();
  const i = dropIndex(ev), bounds = [0, ...titles.geo.blocks.map(b => b.bottom)];
  dropLine.hidden = false;
  dropLine.style.top = bounds[i] + "px";
});
stage.addEventListener("drop", ev => {
  if (!dragKey) return;
  ev.preventDefault();
  const i = dropIndex(ev), from = state.order.indexOf(dragKey);
  const order = state.order.filter(k => k !== dragKey);
  order.splice(i > from ? i - 1 : i, 0, dragKey);
  state.order = order;
  endDrag();   // avant render() : le titre glissé est recréé, son « dragend » ne remonterait plus
  savePanels();
  render();
});
const endDrag = () => { dragKey = null; dropLine.hidden = true; };
document.addEventListener("dragend", endDrag);
stage.addEventListener("dragleave", ev => { if (!stage.contains(ev.relatedTarget)) dropLine.hidden = true; });

document.getElementById("updated").textContent = DATA.fetched.slice(0, 10);
paintLegend();
render().then(() => { attachPlotlyEvents(); showDefault(); });
