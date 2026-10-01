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
const pctGDP = v => `${v.toFixed(1).replace(".", ",")} % du PIB`;

// Un panneau par graphique, de haut en bas ; n = suffixe des axes Plotly (x, x2, x3…)
const PANELS = [
  { title: "Spread 10 ans vs Allemagne (points de %)", codes: SPREAD_CODES,
    x: months.map(monthDate), y: c => spreads[c], text: v => `${fmt(v)} pt (${Math.round(v * 100)} pb)` },
  { title: "Taux 10 ans (%)", codes: ALL_CODES,
    x: months.map(monthDate), y: c => DATA.series[c], text: v => `${fmt(v)} %` },
  { title: "Dette publique (% du PIB)", codes: ALL_CODES,
    x: DATA.debt.periods.map(quarterEnd), y: c => DATA.debt.series[c], text: pctGDP },
  { title: "Déficit public (% du PIB)", codes: ALL_CODES, zero: true,
    connectgaps: true,   // IE et DE avant 2002 : un point annuel par an
    x: DATA.deficit.periods.map(quarterEnd), y: c => DATA.deficit.series[c],
    text: v => v < 0 ? `excédent de ${pctGDP(-v)}` : pctGDP(v) },
].map((panel, i) => ({ ...panel, n: i ? String(i + 1) : "" }));
PANELS[0].zero = PANELS[1].zero = true;

// ---- Construction des traces --------------------------------------------------
function traces(panel, code) {
  const label = DATA.names[code];
  const vals = panel.y(code);
  return {
    name: label, legendgroup: code, xaxis: "x" + panel.n, yaxis: "y" + panel.n,
    showlegend: false, visible: state.hidden.has(code) ? "legendonly" : true,
    type: "scatter", mode: "lines", x: panel.x, y: vals,
    line: { color: COLOR(code), width: 2 }, connectgaps: !!panel.connectgaps,
  };
}

const buildTraces = () => PANELS.flatMap(panel => panel.codes.map(c => traces(panel, c)));

// ---- Mise en page ---------------------------------------------------------------
const EVENTS = [
  ["2008-09-15", "Lehman"],
  ["2010-05-02", "1er plan grec"],
  ["2012-07-26", "Whatever it takes"],
  ["2020-03-18", "Covid"],
  ["2022-07-21", "Hausse des taux BCE"],
];

const chartTitle = (text, y, yshift) => ({
  text: `<b>${text}</b>`, xref: "paper", yref: "paper", x: 0, y, yshift, xanchor: "left", yanchor: "bottom",
  showarrow: false, font: { size: 18, color: css("--text-primary") },
});

function baseLayout() {
  const ink = css("--text-secondary"), grid = css("--grid");
  const axisCommon = {
    gridcolor: grid, linecolor: grid, tickfont: { color: ink }, zeroline: false,
  };
  const eventLine = (d, xref, yref) => ({
    type: "line", xref, yref, x0: d, x1: d, y0: 0, y1: 1,
    line: { color: css("--zero"), width: 1, dash: "dot" }, layer: "below",
  });
  const shapes = [
    ...PANELS.flatMap(p => EVENTS.map(([d]) => eventLine(d, "x" + p.n, `y${p.n} domain`))),
    ...PANELS.filter(p => p.zero).map(p => ({ type: "line", xref: "paper", yref: "y" + p.n, x0: 0, x1: 1, y0: 0, y1: 0, line: { color: css("--zero"), width: 1 }, layer: "below" })),
  ];
  const annotations = EVENTS.map(([d, t]) => ({
    x: d, xref: "x", y: 1, yref: "paper", yanchor: "top", xanchor: "left", xshift: 3, text: t, showarrow: false,
    font: { size: 11, color: css("--text-muted") },
  }));
  const yCommon = { ...axisCommon, side: "right", fixedrange: false, ticklabelposition: "outside", automargin: true };
  const GAP = 0.05, H = (1 - GAP * (PANELS.length - 1)) / PANELS.length;
  const axes = {};
  PANELS.forEach((p, i) => {
    const top = 1 - i * (H + GAP);
    axes["xaxis" + p.n] = { ...axisCommon, domain: [0, 1], anchor: "y" + p.n, type: "date",
      rangeslider: { visible: false }, ...(p.n && { matches: "x" }) };
    axes["yaxis" + p.n] = { ...yCommon, domain: [top - H, top] };
    p.top = top;
  });
  return {
    uirevision: "keep",            // conserve zoom / déplacements entre deux changements de vue
    paper_bgcolor: css("--surface"), plot_bgcolor: css("--surface"),
    font: { family: "system-ui, -apple-system, Segoe UI, sans-serif", color: css("--text-primary") },
    separators: ", ",
    margin: { l: 16, r: 56, t: 40, b: 32 },
    hovermode: false,              // infobulle maison (voir « Survol »), plus fluide que celle de Plotly
    dragmode: "pan",
    ...axes,
    shapes, annotations: [...annotations, ...PANELS.map(p => chartTitle(p.title, p.top, 4))],
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

let layout = baseLayout();
function render() {
  // conserve la fenêtre visible courante
  const cur = chart.layout;
  if (cur) {
    for (const k of PANELS.flatMap(p => ["xaxis" + p.n, "yaxis" + p.n])) {
      if (cur[k] && cur[k].range && !cur[k].autorange) layout[k].range = cur[k].range.slice();
    }
  }
  return Plotly.react(chart, buildTraces(), layout, config);
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
  const [x0, x1] = xa().range.map(xa().r2l);
  const upd = {};
  for (const [axis, yname] of PANELS.map(p => ["y" + p.n, "yaxis" + p.n])) {
    let lo = Infinity, hi = -Infinity;
    for (const t of chart.data) {
      if (t.yaxis !== axis || t.visible === "legendonly") continue;
      t.x.forEach((x, i) => {
        const tx = Date.parse(x), v = t.y[i];
        if (tx < x0 || tx > x1 || v == null) return;
        lo = Math.min(lo, v); hi = Math.max(hi, v);
      });
    }
    if (lo === Infinity) continue;
    const pad = (hi - lo) * 0.06 || 0.5;
    upd[yname + ".range"] = [lo - pad, hi + pad];
  }
  return Plotly.relayout(chart, upd);
}

function setX(rangeL) {  // bornes en millisecondes
  const r = rangeL.map(xa().l2r);
  return Plotly.relayout(chart, Object.fromEntries(PANELS.map(p => [`xaxis${p.n}.range`, r])));
}


// Zones d'axes : position de la souris → axe des taux (droite) / axe du temps (dessous) / zone de tracé
const X_BAND = 34;
function hitTest(ev) {
  const fl = chart._fullLayout, s = fl._size, r = chart.getBoundingClientRect();
  const px = ev.clientX - r.left, py = ev.clientY - r.top;
  for (const yname of PANELS.map(p => "yaxis" + p.n)) {
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
const START = Date.UTC(2005, 0, 1);   // vue initiale ; les données depuis 2000 restent accessibles en déplaçant
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
  layout = baseLayout();
  paintLegend();
  render();
};

// ---- Survol : ligne verticale sur tous les graphiques + infobulle --------------------
// Suit la souris à chaque image (requestAnimationFrame) ; valeurs = point le plus proche de chaque courbe visible.
const hover = document.getElementById("hover");
const tip = document.getElementById("tip");
const vlines = PANELS.map(() => hover.appendChild(Object.assign(document.createElement("div"), { className: "vline" })));
const hline = hover.appendChild(Object.assign(document.createElement("div"), { className: "hline" }));   // courbe unique seulement
const stamps = PANELS.map(p => p.x.map(Date.parse));
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
  PANELS.forEach((p, i) => {
    const d = fl["yaxis" + p.n].domain;
    Object.assign(vlines[i].style, { left: px + "px", top: s.t + (1 - d[1]) * s.h + "px", height: (d[1] - d[0]) * s.h + "px" });
  });
  const pi = PANELS.findIndex(p => "yaxis" + p.n === hit.axis), panel = PANELS[pi];
  const i = nearest(stamps[pi], t);
  const rows = panel.codes.filter(c => !state.hidden.has(c))
    .map(c => ({ c, v: panel.y(c)[i] })).filter(r => r.v != null).sort((a, b) => b.v - a.v);
  tip.innerHTML = `<div class="date">${monthYear.format(stamps[pi][i])}</div>` + rows.map(({ c, v }) =>
    `<div><span class="sw" style="background:${COLOR(c)}"></span>${DATA.names[c]} <b>${panel.text(v)}</b></div>`).join("");
  // une seule courbe : ligne horizontale à sa valeur (si elle est dans la zone visible)
  const ya = fl[hit.axis], y = rows.length === 1 ? ya._offset + ya.l2p(rows[0].v) : NaN;
  const d = ya.domain, inside = y >= s.t + (1 - d[1]) * s.h && y <= s.t + (1 - d[0]) * s.h;
  hline.hidden = !inside;
  if (inside) Object.assign(hline.style, { top: y + "px", left: s.l + "px", width: s.w + "px" });
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

paintLegend();
render().then(() => { attachPlotlyEvents(); showDefault(); });
