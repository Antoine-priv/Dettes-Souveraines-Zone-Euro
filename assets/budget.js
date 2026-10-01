// Diagrammes de Sankey du budget de la France (data/budget.js → window.BUDGET, en milliards d'euros)
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const B = BUDGET;
const SECTORS = Object.keys(B.sectors);   // État, Sécurité sociale, Collectivités locales
// Couleur de chaque sous-secteur ; le déficit (emprunt) a la sienne
const SECTOR_VAR = { S1311: "--s1", S1314: "--s3", S1313: "--s6" };
const DEFICIT_VAR = "--s2";
const FROM = { S1311: "de l'État", S1314: "de la Sécurité sociale", S1313: "des collectivités" };
const TO = { S1311: "à l'État", S1314: "à la Sécurité sociale", S1313: "aux collectivités" };
const BY = { S1311: "par l'État", S1314: "par la Sécurité sociale", S1313: "par les collectivités" };

const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const md = v => `${(v < 10 ? nf1 : nf0).format(v)} Md€`;
let year = B.detailed.at(-1) || B.years.at(-1);   // dernière année où retraites et chômage sont détaillés
const pib = v => B.gdp[year] ? ` (${nf1.format(100 * v / B.gdp[year])} % du PIB)` : "";

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// Petit constructeur de diagramme : colonnes de nœuds (positions imposées, dans l'ordre donné) + liens
function sankey() {
  const nodes = [], links = [], index = {};
  return {
    node(key, col, label, color) { index[key] = nodes.length; nodes.push({ key, col, label, color, in: 0, out: 0, parts: [] }); },
    link(from, to, value, sector, text) {
      if (!(value > 0.05)) return;   // les résidus nuls ou négatifs ne sont pas tracés
      const a = nodes[index[from]], b = nodes[index[to]];
      a.out += value; b.in += value;
      links.push({ source: index[from], target: index[to], value, sector, text });
      for (const n of [a, b]) n.parts.push([sector, value]);
    },
    build(height) {
      const used = nodes.filter(n => n.in || n.out);
      const cols = [...new Set(used.map(n => n.col))].sort((a, b) => a - b);
      const pad = 12, pf = pad / height;
      // Position de chaque nœud : centre vertical cumulé dans sa colonne, les colonnes ayant le même total
      for (const c of cols) {
        const col = used.filter(n => n.col === c);
        const total = col.reduce((s, n) => s + Math.max(n.in, n.out), 0);
        const free = 1 - (col.length - 1) * pf;
        let acc = 0;
        col.forEach((n, i) => {
          const v = Math.max(n.in, n.out);
          n.x = c === 0 ? 0.001 : c === cols.at(-1) ? 0.999 : c / cols.at(-1);
          n.y = Math.min(0.999, Math.max(0.001, (acc + v / 2) / total * free + i * pf));
          acc += v;
        });
      }
      const ids = new Map(used.map((n, i) => [nodes.indexOf(n), i]));
      const color = s => css(s === "deficit" ? DEFICIT_VAR : SECTOR_VAR[s]);
      // Infobulle d'un nœud : total puis répartition par sous-secteur
      const split = n => {
        const by = {};
        for (const [s, v] of n.parts) by[s] = (by[s] || 0) + v;
        const rows = Object.entries(by).filter(([s]) => s !== "deficit");
        if (rows.length < 2) return "";
        return "<br>" + rows.sort((a, b) => b[1] - a[1]).map(([s, v]) => `${B.sectors[s]} : ${md(v / 2 ** (n.in && n.out ? 1 : 0))}`).join("<br>");
      };
      // libellés dessinés en HTML hors du diagramme (voir placeLabels)
      this.labels = used.map(n => ({ col: n.col === cols[0] ? "left" : n.col === cols.at(-1) ? "right" : "mid",
                                     text: n.label, value: md(Math.max(n.in, n.out)) }));
      return {
        type: "sankey", arrangement: "fixed", valueformat: ".0f",
        hoverlabel: { bgcolor: css("--surface"), bordercolor: css("--grid"), font: { color: css("--text-primary") } },
        node: {
          pad, thickness: 14, line: { width: 0 },
          label: used.map(() => ""),
          color: used.map(n => n.color ? css(n.color) : css("--zero")),
          x: used.map(n => n.x), y: used.map(n => n.y),
          customdata: used.map(n => `<b>${n.label}</b><br>${md(Math.max(n.in, n.out))}${pib(Math.max(n.in, n.out))}${split(n)}`),
          hovertemplate: "%{customdata}<extra></extra>",
        },
        link: {
          source: links.map(l => ids.get(l.source)), target: links.map(l => ids.get(l.target)),
          value: links.map(l => l.value),
          color: links.map(l => rgba(color(l.sector), 0.42)),
          customdata: links.map(l => `${l.text}<br><b>${md(l.value)}</b>${pib(l.value)}`),
          hovertemplate: "%{customdata}<extra></extra>",
        },
      };
    },
  };
}

// ---- Comptes consolidés : les transferts entre administrations disparaissent ----------------------
// Recettes (couleur = administration qui les perçoit) → administrations publiques → dépenses (couleur = qui dépense)
function consolidated(d) {
  const g = sankey();
  B.revenues.forEach((r, i) => g.node("r" + i, 0, r));
  g.node("deficit", 0, "Déficit (emprunt)", DEFICIT_VAR);
  g.node("apu", 1, "Administrations publiques", "--text-secondary");
  B.expenses.forEach((e, i) => g.node("e" + i, 2, e));
  g.node("surplus", 2, "Excédent");
  for (const s of SECTORS) {
    d[s].rev.forEach((v, i) => g.link("r" + i, "apu", v, s, `${B.revenues[i]} perçus ${BY[s]}`));
    d[s].exp.forEach((v, i) => g.link("apu", "e" + i, v, s, `${B.expenses[i]} payés ${BY[s]}`));
    if (d[s].balance < 0) g.link("deficit", "apu", -d[s].balance, s, `Déficit ${FROM[s]}`);
    else g.link("apu", "surplus", d[s].balance, s, `Excédent ${FROM[s]}`);
  }
  return g;
}

// ---- Comptes non consolidés : le compte de chaque administration, transferts reçus et versés compris ----
// Recettes et dépenses regroupées par administration (un bloc de sa couleur) : aucun croisement
function unconsolidated(d) {
  const g = sankey();
  for (const s of SECTORS) {
    B.revenues.forEach((r, i) => g.node(`r${i}${s}`, 0, r, SECTOR_VAR[s]));
    for (const p of SECTORS) if (p !== s) g.node(`from${p}${s}`, 0, `Reçu ${FROM[p]}`, SECTOR_VAR[p]);
    g.node("deficit" + s, 0, `Déficit ${FROM[s]}`, DEFICIT_VAR);
  }
  for (const s of SECTORS) g.node(s, 1, B.sectors[s], SECTOR_VAR[s]);
  for (const s of SECTORS) {
    B.expenses.forEach((e, i) => g.node(`e${i}${s}`, 2, e, SECTOR_VAR[s]));
    for (const r of SECTORS) if (r !== s) g.node(`to${r}${s}`, 2, `Versé ${TO[r]}`, SECTOR_VAR[r]);
    g.node("surplus" + s, 2, `Excédent ${FROM[s]}`);
  }
  for (const s of SECTORS) {
    d[s].rev.forEach((v, i) => g.link(`r${i}${s}`, s, v, s, `${B.revenues[i]} perçus ${BY[s]}`));
    d[s].exp.forEach((v, i) => g.link(s, `e${i}${s}`, v, s, `${B.expenses[i]} payés ${BY[s]}`));
    for (const [r, v] of Object.entries(d[s].to)) {
      g.link(s, `to${r}${s}`, v, s, `Transferts ${FROM[s]} ${TO[r]}`);
      g.link(`from${s}${r}`, r, v, r, `Transferts ${FROM[s]} ${TO[r]}`);
    }
    if (d[s].balance < 0) g.link("deficit" + s, s, -d[s].balance, s, `Déficit ${FROM[s]}`);
    else g.link(s, "surplus" + s, d[s].balance, s, `Excédent ${FROM[s]}`);
  }
  return g;
}

// ---- Rendu ---------------------------------------------------------------------------------------
const CONFIG = { displayModeBar: false, responsive: true };
const SIDE = 280;   // largeur réservée aux libellés de part et d'autre du diagramme
const labels = {};
function draw(id, g, height) {
  const layout = {
    height, margin: { l: SIDE, r: SIDE, t: 28, b: 8 },
    paper_bgcolor: "rgba(0,0,0,0)", font: { color: css("--text-primary") },
  };
  const trace = g.build(height - 36);
  labels[id] = g.labels;
  const gd = document.getElementById(id);
  Plotly.react(gd, [trace], layout, CONFIG).then(() => placeLabels(id));
  if (!gd._labelsHooked) { gd._labelsHooked = true; gd.on("plotly_afterplot", () => placeLabels(id)); }
}

// Libellés à gauche des nœuds de gauche, à droite de ceux de droite, au-dessus de ceux du milieu
function placeLabels(id) {
  const gd = document.getElementById(id);
  let layer = gd.parentNode.querySelector(".labels");
  if (!layer) layer = gd.parentNode.appendChild(Object.assign(document.createElement("div"), { className: "labels" }));
  const box = gd.parentNode.getBoundingClientRect();
  layer.innerHTML = "";
  gd.querySelectorAll(".sankey-node").forEach((el, i) => {
    const info = labels[id][el.__data__?.node?.pointNumber ?? i];
    const r = el.querySelector(".node-rect").getBoundingClientRect();
    if (!info || r.height < 2) return;   // nœud trop fin : infobulle seulement
    const div = layer.appendChild(document.createElement("div"));
    div.className = "nlabel " + info.col;
    div.innerHTML = `${info.text} <span>${info.value}</span>`;
    const top = r.top - box.top, mid = top + r.height / 2;
    if (info.col === "left") Object.assign(div.style, { right: box.right - r.left + 8 + "px", top: mid + "px" });
    else if (info.col === "right") Object.assign(div.style, { left: r.right - box.left + 8 + "px", top: mid + "px" });
    else Object.assign(div.style, { left: r.left - box.left + r.width / 2 + "px", top: top - 4 + "px" });
  });
}

function totals(d, consolidated) {
  const sum = (s, k) => d[s][k].reduce((a, v) => a + v, 0);
  const transfers = consolidated ? 0 : SECTORS.reduce((a, s) => a + Object.values(d[s].to).reduce((x, v) => x + v, 0), 0);
  const rev = SECTORS.reduce((a, s) => a + sum(s, "rev"), 0) + transfers;
  const exp = SECTORS.reduce((a, s) => a + sum(s, "exp"), 0) + transfers;
  return `${md(rev)} de recettes, ${md(exp)} de dépenses en ${year}`;
}

function render() {
  const d = B.data[year];
  const h = Math.max(640, Math.round(innerHeight * 0.85));
  draw("cons", consolidated(d), h);
  draw("raw", unconsolidated(d), h);
  document.getElementById("sum-cons").textContent = totals(d, true);
  document.getElementById("sum-raw").textContent = totals(d, false);
}

// Choix de l'année (les plus récentes en premier)
const select = document.getElementById("year");
select.innerHTML = B.years.slice().reverse().map(y => `<option${y === year ? " selected" : ""}>${y}</option>`).join("");
select.onchange = () => { year = select.value; render(); };

// Légende : une couleur par administration
function paintLegend() {
  const item = (v, label) => `<span class="item"><span class="sw block" style="background:${css(v)}"></span>${label}</span>`;
  document.getElementById("legend").innerHTML =
    SECTORS.map(s => item(SECTOR_VAR[s], B.sectors[s])).join("") + item(DEFICIT_VAR, "Déficit");
}

// ---- Thème clair / sombre (même réglage que la page principale) --------------------------------
const themeBtn = document.getElementById("theme");
const isDark = () => getComputedStyle(document.documentElement).colorScheme === "dark";
const paintThemeBtn = () => { themeBtn.textContent = isDark() ? "☀ Clair" : "☾ Sombre"; };
try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch {}
themeBtn.onclick = () => {
  const t = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch {}
  paintThemeBtn();
  paintLegend();
  render();
};
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { paintThemeBtn(); paintLegend(); render(); });

paintThemeBtn();
paintLegend();
render();
