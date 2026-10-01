// Données générées par update.py (data/taux10y.js → window.DATA)
const SPREAD_CODES = ["GR", "IT", "ES", "PT", "IE", "FR"];
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const COLOR = c => css("--s" + (["GR","IT","ES","PT","IE","FR","DE"].indexOf(c) + 1));
const fmt = v => v == null ? "–" : v.toFixed(2).replace(".", ",");

const state = { autoY: true };

// ---- Préparation des données ------------------------------------------------
const months = DATA.months;
const de = DATA.series.DE;
const spreads = {};
for (const c of SPREAD_CODES) {
  spreads[c] = DATA.series[c].map((v, i) => v == null || de[i] == null ? null : +(v - de[i]).toFixed(4));
}
const monthDate = m => m + "-15";

// ---- Construction des traces --------------------------------------------------
// kind = "spread" (graphique du haut) ou "rate" (taux 10 ans, graphique du bas)
function traces(code, kind) {
  const label = DATA.names[code];
  const color = COLOR(code);
  const spread = kind === "spread";
  const vals = spread ? spreads[code] : DATA.series[code];
  const fmtV = v => spread ? `${fmt(v)} pt (${Math.round(v * 100)} pb)` : `${fmt(v)} %`;
  return {
    name: label, legendgroup: code, xaxis: spread ? "x" : "x2", yaxis: spread ? "y" : "y2",
    showlegend: spread || code === "DE",
    type: "scatter", mode: "lines", x: months.map(monthDate), y: vals,
    line: { color, width: 2 }, connectgaps: false,
    text: vals.map(v => v == null ? "" : `${label} : ${fmtV(v)}`),
    hovertemplate: "%{text}<extra></extra>",
  };
}

function buildTraces() {
  return [
    ...SPREAD_CODES.map(c => traces(c, "spread")),
    ...[...SPREAD_CODES, "DE"].map(c => traces(c, "rate")),
  ];
}

// ---- Mise en page ---------------------------------------------------------------
const EVENTS = [
  ["2008-09-15", "Lehman"],
  ["2010-05-02", "1er plan grec"],
  ["2012-07-26", "« Whatever it takes »"],
  ["2020-03-18", "PEPP"],
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
    showspikes: true, spikemode: "across", spikethickness: 1, spikecolor: css("--text-muted"), spikedash: "dot",
  };
  const eventLine = (d, xref, yref) => ({
    type: "line", xref, yref, x0: d, x1: d, y0: 0, y1: 1,
    line: { color: css("--zero"), width: 1, dash: "dot" }, layer: "below",
  });
  const shapes = [
    ...EVENTS.map(([d]) => eventLine(d, "x", "y domain")),
    ...EVENTS.map(([d]) => eventLine(d, "x2", "y2 domain")),
    ...["y", "y2"].map(yref => ({ type: "line", xref: "paper", yref, x0: 0, x1: 1, y0: 0, y1: 0, line: { color: css("--zero"), width: 1 }, layer: "below" })),
  ];
  const annotations = EVENTS.map(([d, t]) => ({
    x: d, xref: "x", y: 1, yref: "paper", yanchor: "top", xanchor: "left", xshift: 3, text: t, showarrow: false,
    font: { size: 11, color: css("--text-muted") },
  }));
  const yCommon = { ...axisCommon, side: "right", fixedrange: false, ticklabelposition: "outside", automargin: true };
  return {
    uirevision: "keep",            // conserve zoom / déplacements entre deux changements de vue
    paper_bgcolor: css("--surface"), plot_bgcolor: css("--surface"),
    font: { family: "system-ui, -apple-system, Segoe UI, sans-serif", color: css("--text-primary") },
    separators: ", ",
    margin: { l: 16, r: 56, t: 40, b: 32 },
    hovermode: "x unified",
    hoverlabel: { bgcolor: css("--surface"), bordercolor: grid, font: { color: css("--text-primary") } },
    dragmode: "pan",
    legend: { orientation: "h", y: 1, x: 1, xanchor: "right", yanchor: "bottom", font: { color: ink }, itemclick: "toggle", itemdoubleclick: "toggleothers" },
    xaxis:  { ...axisCommon, domain: [0, 1], anchor: "y", type: "date", rangeslider: { visible: false } },
    xaxis2: { ...axisCommon, domain: [0, 1], anchor: "y2", type: "date", matches: "x", rangeslider: { visible: false } },
    yaxis:  { ...yCommon, domain: [0.55, 1] },
    yaxis2: { ...yCommon, domain: [0, 0.45] },
    shapes, annotations: [...annotations,
      chartTitle("Spread 10 ans vs Allemagne (points de %)", 1, 4),
      chartTitle("Taux 10 ans (%)", 0.45, 4)],
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
    for (const k of ["xaxis", "xaxis2", "yaxis", "yaxis2"]) {
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

// Ajuste l'échelle des taux aux seules données visibles (séries affichées)
function fitY() {
  const [x0, x1] = xa().range.map(xa().r2l);
  const upd = {};
  for (const [axis, yname] of [["y", "yaxis"], ["y2", "yaxis2"]]) {
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
  return Plotly.relayout(chart, { "xaxis.range": r, "xaxis2.range": r });
}


// Zones d'axes : position de la souris → axe des taux (droite) / axe du temps (dessous) / zone de tracé
const X_BAND = 34;
function hitTest(ev) {
  const fl = chart._fullLayout, s = fl._size, r = chart.getBoundingClientRect();
  const px = ev.clientX - r.left, py = ev.clientY - r.top;
  for (const yname of ["yaxis", "yaxis2"]) {
    const d = fl[yname].domain, top = s.t + (1 - d[1]) * s.h, bot = s.t + (1 - d[0]) * s.h;
    const inX = px >= s.l && px <= s.l + s.w;
    if (px > s.l + s.w && py >= top && py <= bot) return { kind: "y", axis: yname };
    if (inX && py > bot && py < bot + X_BAND) return { kind: "x", px: s.l + s.w };
    if (inX && py >= top && py <= bot) return { kind: "plot", px };
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

// Molette : sur le tracé ou l'axe du temps = zoom temporel ; sur l'axe des taux = échelle des taux
chart.addEventListener("wheel", ev => {
  const hit = hitTest(ev);
  if (!hit) return;
  ev.preventDefault(); ev.stopPropagation();
  const delta = ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY;
  const f = Math.exp(delta * 0.0015);           // molette vers le bas = dézoomer
  if (hit.kind === "y") {
    setAutoY(false);
    throttle(() => scaleY(hit.axis, chart._fullLayout[hit.axis].range, f));
  } else {
    throttle(() => scaleX(xa().range.map(xa().r2l), f, pxToL(hit.px)));
  }
}, { capture: true, passive: false });

// Double-clic : axe des taux = échelle auto ; axe du temps ou tracé = toute la période
chart.addEventListener("dblclick", ev => {
  const hit = hitTest(ev);
  if (!hit) return;
  if (hit.kind === "y") setAutoY(true);
  else showAll();
});
// À brancher après le premier rendu (chart.on n'existe qu'ensuite)
function attachPlotlyEvents() {
  // Toute modification de l'axe du temps (déplacement, zoom) réajuste les taux en mode Auto
  chart.on("plotly_relayout", ev => {
    if (state.autoY && Object.keys(ev).some(k => k.startsWith("xaxis"))) fitY();
  });
  chart.on("plotly_restyle", () => state.autoY && fitY());   // pays masqué / affiché
  // Double-clic sur la légende : isoler un pays dans les deux graphiques (l'Allemagne reste affichée en référence).
  // Si le pays est déjà isolé, le double-clic réaffiche tous les pays.
  chart.on("plotly_legenddoubleclick", ev => {
    const g = chart.data[ev.curveNumber].legendgroup;
    const keep = t => t.legendgroup === g || t.legendgroup === "DE";
    const othersShown = chart.data.some(t => !keep(t) && t.visible !== "legendonly");
    Plotly.restyle(chart, { visible: chart.data.map(t => !othersShown || keep(t) ? true : "legendonly") });
    return false;   // annule le comportement par défaut de Plotly
  });
}

// ---- Contrôles --------------------------------------------------------------------
document.getElementById("autoY").onclick = () => setAutoY(true);

const lastMonth = months[months.length - 1];
const END = Date.UTC(+lastMonth.slice(0, 4), +lastMonth.slice(5, 7), 15);
const FIRST = Date.UTC(1999, 10, 15);
const showAll = () => { setAutoY(true); return setX([FIRST, END]); };
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
  render();
};

render().then(() => { attachPlotlyEvents(); showAll(); });
