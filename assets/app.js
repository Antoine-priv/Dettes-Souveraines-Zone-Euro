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
const quarterEnd = q => { const [y, n] = q.split("-Q"); return new Date(Date.UTC(+y, 3 * n, 0)).toISOString().slice(0, 10); };  // dette = encours fin de trimestre
// Croissance nominale (croissance + inflation) et taux moyen de la dette, alignés sur les trimestres du PIB
const growth = DATA.growth.series;
const interest = Object.fromEntries(ALL_CODES.map(c => [c, DATA.growth.periods.map(q => {
  const i = DATA.interest.periods.indexOf(q);
  return i < 0 ? null : DATA.interest.series[c][i];
})]));
const align = d => Object.fromEntries(ALL_CODES.map(c => [c, DATA.growth.periods.map(q => {
  const i = d.periods.indexOf(q);
  return i < 0 ? null : d.series[c][i];
})]));
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

// Un panneau par graphique. L'ordre d'affichage et les panneaux repliés sont dans state ;
// n = suffixe des axes Plotly (x, x2, x3…), attribué à chaque rendu aux seuls panneaux dépliés.
const PANELS = [
  { key: "spread", title: "Spread 10 ans vs Allemagne (points de %)", codes: SPREAD_CODES, zero: true,
    x: months.map(monthDate), y: c => spreads[c], text: v => `${fmt(v)} pt (${Math.round(v * 100)} pb)` },
  { key: "rate", title: "Taux 10 ans (%)", codes: ALL_CODES, zero: true,
    x: months.map(monthDate), y: c => DATA.series[c], text: v => `${fmt(v)} %` },
  { key: "debt", title: "Dette publique (% du PIB)", codes: ALL_CODES,
    x: DATA.debt.periods.map(quarterEnd), y: c => DATA.debt.series[c], text: pctGDP },
  { key: "deficit", title: "Déficit public (% du PIB)", codes: ALL_CODES, zero: true,
    connectgaps: true,   // IE et DE avant 2002 : un point annuel par an
    x: DATA.deficit.periods.map(quarterEnd), y: c => DATA.deficit.series[c],
    text: v => v < 0 ? `excédent de ${pctGDP(-v)}` : pctGDP(v) },
  // un seul pays à la fois (state.pick, choisi à droite du titre), indépendamment de la légende
  { key: "growth", title: "Inflation + croissance et taux moyen de la dette (%)", codes: ALL_CODES, zero: true, single: true,
    x: DATA.growth.periods.map(windowMid), y: c => growth[c], date: i => windowLabel(DATA.growth.periods[i]),
    tip: (c, i) => [["--s2", "Inflation", inflation[c][i]], ["--s3", "Croissance", real[c][i]],
      ["--text-primary", "Inflation + croissance", growth[c][i]], ["--text-primary", "Taux moyen de la dette", interest[c][i], "dash"]]
      .map(([v, l, x, dash]) => `<div><span class="sw${dash ? " dash" : ""}" style="background:${css(v)}"></span>${l} <b>${pct(x)}</b></div>`).join("") },
].map(panel => ({ ...panel, stamps: panel.x.map(Date.parse) }));
const PANEL = Object.fromEntries(PANELS.map(p => [p.key, p]));

// Ordre et repli mémorisés dans le navigateur
state.order = PANELS.map(p => p.key);
state.folded = new Set();
try {
  const saved = JSON.parse(localStorage.getItem("panels"));
  // panneaux ajoutés depuis la sauvegarde : à la fin
  if (saved.order.every(k => PANEL[k])) state.order = [...saved.order, ...state.order.filter(k => !saved.order.includes(k))];
  state.folded = new Set(saved.folded.filter(k => PANEL[k]));
} catch {}
const savePanels = () => { try { localStorage.setItem("panels", JSON.stringify({ order: state.order, folded: [...state.folded] })); } catch {} };
state.pick = "FR";   // pays du panneau « single »
try { const p = localStorage.getItem("pick"); if (ALL_CODES.includes(p)) state.pick = p; } catch {}
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

// Panneau à un seul pays : aires empilées inflation (0 → inflation) puis croissance (→ inflation + croissance),
// et taux moyen de la dette en pointillés ; ces courbes ne dépendent pas de la légende (pas de legendgroup).
function singleTraces(panel) {
  const c = state.pick, common = { xaxis: "x" + panel.n, yaxis: "y" + panel.n, showlegend: false, type: "scatter", mode: "lines", x: panel.x };
  const area = (v, y, fill) => ({ ...common, y, fill, fillcolor: css(v) + "8c", line: { color: css(v), width: 1.5 } });
  return [
    area("--s2", inflation[c], "tozeroy"),
    area("--s3", growth[c], "tonexty"),
    { ...common, y: interest[c], connectgaps: true, line: { color: css("--text-primary"), width: 2, dash: "dot" } },   // 2000 : relie l'annuel au trimestriel
  ];
}
const buildTraces = () => shown.flatMap(panel => panel.single ? singleTraces(panel) : panel.codes.map(c => traces(panel, c)));

// ---- Mise en page ---------------------------------------------------------------
const EVENTS = [
  ["2008-09-15", "Lehman"],
  ["2010-05-02", "1er plan grec"],
  ["2012-07-26", "Whatever it takes"],
  ["2020-03-18", "Covid"],
  ["2022-07-21", "Hausse des taux BCE"],
];
// Événements historiques du panneau à un seul pays (selon le pays choisi), libellés sur ce panneau ;
// 3e valeur = ligne du libellé (décalé vers le bas pour ne pas chevaucher le précédent)
const HISTORY = c => [
  ...(c === "FR" ? [["1945-06-01", "Début des Trente Glorieuses", 0]] : []),
  ["1973-10-16", c === "FR" ? "1er choc pétrolier, fin des Trente Glorieuses" : "1er choc pétrolier", 0],
  ["1979-01-08", "2e choc pétrolier", 1],
  ...(c === "FR" ? [["1983-03-25", "Tournant de la rigueur", 2]] : []),
];

// Géométrie verticale (px) : pour chaque panneau, un bandeau de titre, puis (s'il est déplié) le tracé et l'axe du temps
const TITLE_H = 44, AXIS_H = 40;
function geometry() {
  const plotH = Math.max(320, Math.round(innerHeight * 0.42));
  let y = 0;
  const blocks = state.order.map(key => {
    const b = { key, top: y };
    y += TITLE_H;
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
  const eventLine = (d, xref, yref) => ({
    type: "line", xref, yref, x0: d, x1: d, y0: 0, y1: 1,
    line: { color: css("--zero"), width: 1, dash: "dot" }, layer: "below",
  });
  const shapes = [
    ...shown.flatMap(p => EVENTS.map(([d]) => eventLine(d, "x" + p.n, `y${p.n} domain`))),
    ...shown.filter(p => p.single).flatMap(p => HISTORY(state.pick).map(([d]) => eventLine(d, "x" + p.n, `y${p.n} domain`))),
    ...shown.filter(p => p.zero).map(p => ({ type: "line", xref: "paper", yref: "y" + p.n, x0: 0, x1: 1, y0: 0, y1: 0, line: { color: css("--zero"), width: 1 }, layer: "below" })),
  ];
  // libellés des événements : premier graphique affiché seulement
  const label = (d, t, n, row = 0) => ({
    x: d, xref: "x" + n, y: 1, yref: `y${n} domain`, yanchor: "top", xanchor: "left", xshift: 3, yshift: -15 * row, text: t, showarrow: false,
    font: { size: 11, color: css("--text-muted") },
  });
  const annotations = [
    ...(shown.length ? EVENTS.map(([d, t]) => label(d, t, "")) : []),
    ...shown.filter(p => p.single).flatMap(p => HISTORY(state.pick).map(([d, t, row]) => label(d, t, p.n, row))),
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
    shapes, annotations,
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
  const geo = geometry();
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
  paintTitles(geo);
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
function autoRanges(data, [x0, x1]) {
  const out = {};
  for (const [axis, yname] of shown.map(p => ["y" + p.n, "yaxis" + p.n])) {
    let lo = Infinity, hi = -Infinity;
    for (const t of data) {
      if (t.yaxis !== axis || t.visible === "legendonly") continue;
      t.x.forEach((x, i) => {
        const tx = Date.parse(x), v = t.y[i];
        if (tx < x0 || tx > x1 || v == null) return;
        lo = Math.min(lo, v); hi = Math.max(hi, v);
      });
    }
    if (lo === Infinity) continue;
    const pad = (hi - lo) * 0.06 || 0.5;
    out[yname] = [lo - pad, hi + pad];
  }
  return out;
}

function setX(rangeL) {  // bornes en millisecondes
  if (!shown.length) return Promise.resolve();
  const r = rangeL.map(xa().l2r);
  return Plotly.relayout(chart, Object.fromEntries(shown.map(p => [`xaxis${p.n}.range`, r])));
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
let drag = null, frame = null;
const throttle = fn => { if (frame) return; frame = requestAnimationFrame(() => { frame = null; fn(); }); };

function scaleY(axis, range, f) {
  const c = (range[0] + range[1]) / 2, h = (range[1] - range[0]) / 2 * f;
  return Plotly.relayout(chart, { [axis + ".range"]: [c - h, c + h] });
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
    drag = { kind: "x", start: ev.clientX, range, anchor: range[1] };   // ancré au bord droit
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
    else scaleX(d.range, Math.exp(-(ev.clientX - d.start) * 0.006), d.anchor);             // vers la droite = étirer
  });
});
window.addEventListener("mouseup", () => { drag = null; });

// Ctrl + molette sur le tracé = zoom temporel ; ailleurs (axes compris), la molette fait défiler la page.
chart.addEventListener("wheel", ev => {
  const hit = hitTest(ev);
  if (hit?.kind !== "plot" || !(ev.ctrlKey || ev.metaKey)) return;
  ev.preventDefault(); ev.stopPropagation();
  const delta = ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY;
  throttle(() => scaleX(xa().range.map(xa().r2l), Math.exp(delta * 0.0015), pxToL(hit.px)));   // vers le bas = dézoomer
}, { capture: true, passive: false });

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
    if (state.autoY && Object.keys(ev).some(k => k.startsWith("xaxis"))) fitY();
  });
  chart.on("plotly_restyle", () => state.autoY && fitY());   // pays masqué / affiché
}

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
  return Plotly.restyle(chart, { visible: chart.data.map(t => state.hidden.has(t.legendgroup) ? "legendonly" : true) });
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
  if (panel.single) {
    tip.innerHTML = `<div class="date">${panel.date(i)} · ${DATA.names[state.pick]}</div>` + panel.tip(state.pick, i);
    hline.hidden = true;
    return placeTip(px, py, s, r);
  }
  const rows = panel.codes.filter(c => !state.hidden.has(c))
    .map(c => ({ c, v: panel.y(c)[i] })).filter(r => r.v != null).sort((a, b) => b.v - a.v);
  tip.innerHTML = `<div class="date">${monthYear.format(panel.stamps[i])}</div>` + rows.map(({ c, v }) =>
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
  const left = px + 16 + w > s.l + s.w ? px - 16 - w : px + 16;
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
function paintTitles(geo) {
  titles.innerHTML = geo.blocks.map(b => {
    const folded = state.folded.has(b.key);
    return `<div class="ptitle${folded ? " folded" : ""}" data-key="${b.key}" draggable="true" style="top:${b.top}px">` +
      `<span class="ttl"><button class="fold" title="${folded ? "Afficher" : "Replier"} le graphique">${folded ? "+" : "−"}</button>` +
      `${PANEL[b.key].title}</span></div>` +
      (PANEL[b.key].single && !folded ? `<select class="pick" style="top:${b.top + 12}px">` +
        ALL_CODES.map(c => `<option value="${c}"${c === state.pick ? " selected" : ""}>${DATA.names[c]}</option>`).join("") + "</select>" : "");
  }).join("");
  titles.geo = geo;
}
// Repli en fondu : un cache couleur de fond recouvre le graphique (tracé + axe du temps) et devient opaque,
// puis les autres graphiques se décalent d'un coup. Le dépliage, lui, est immédiat.
const FADE_MS = 220;
let animating = false;
function makeCover(key, opacity) {
  const b = geometry().blocks.find(b => b.key === key);
  const cover = stage.appendChild(Object.assign(document.createElement("div"), { className: "cover" }));
  Object.assign(cover.style, { top: b.plotTop + "px", height: b.bottom - b.plotTop + "px", opacity });
  return cover;
}
const fade = (cover, from, to) =>
  cover.animate([{ opacity: from }, { opacity: to }], { duration: FADE_MS, easing: "ease", fill: "forwards" }).finished;
async function toggleFold(key) {
  if (animating) return;
  animating = true;
  hideHover();
  if (state.folded.has(key)) {
    state.folded.delete(key);   // dépliage : affichage immédiat, sans fondu
    await render();
  } else {
    const cover = makeCover(key, 0);
    await fade(cover, 0, 1);
    state.folded.add(key);
    await render();
    cover.remove();
  }
  savePanels();
  animating = false;
}
titles.addEventListener("change", ev => {
  if (!ev.target.matches(".pick")) return;
  state.pick = ev.target.value;
  try { localStorage.setItem("pick", state.pick); } catch {}
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
titles.addEventListener("dragstart", ev => {
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

paintLegend();
render().then(() => { attachPlotlyEvents(); showDefault(); });
