# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Static site (French UI) charting, since 2000, for GR/IT/ES/PT/IE/FR/DE: 10-year bond spreads vs Germany and 10-year rates (monthly), public debt (% GDP, quarterly) and public deficit (% GDP, annual). No build step, no dependencies, no tests. The user communicates in French; keep UI text, comments and commit messages in French.

## Commands

- View the site: open `index.html` directly in a browser (`file://`). No server needed.
- Refresh data: `python3 update.py` (stdlib only). Rewrites `data/data.js` and `data/cache.json`.
- Headless screenshot to check rendering (Firefox is a snap here, so the profile must live under `~/snap/firefox/common/` and the output path must not be a dotfile):
  `firefox --headless --no-remote --profile ~/snap/firefox/common/<prof> --window-size=1400,900 --screenshot "$PWD/shot.png" "file://$PWD/index.html"`

## Architecture

- **Data pipeline (`update.py`)**: ECB SDW API (official monthly long-term rates, ~1 month lag) → CNBC daily closes → TradingView live quote. Months after the last ECB month are filled with the average of daily values (`merge()`). Debt (`gov_10q_ggdebt`) and deficit (`gov_10dd_edpt1`, B9 sign-flipped so deficit > 0) come from the Eurostat JSON-stat API; Greece is `EL` there. Quarterly SCA deficit was rejected: Italy is missing. If the download fails, it falls back to `data/cache.json`. Output is a JS file (`window.DATA = {months, series, debt: {periods, series}, deficit: {periods, series}, names, fetched}`), **not JSON**, because `fetch()` is blocked on `file://`. Keep it that way so double-clicking `index.html` keeps working.
- **Front end**: `index.html` loads `assets/plotly.min.js` (vendored), `data/data.js`, then `assets/app.js` as classic scripts sharing globals.
  - `app.js` builds one Plotly figure from the `PANELS` array: stacked subplots of equal height (spreads, rates, debt, deficit), axes `x`/`y`, `x2`/`y2`… with x-axes linked via `matches`. Adding a chart means adding a `PANELS` entry; layout, fitY, hitTest and setX iterate over it. Only the first panel shows the legend and event labels.
  - Traces share a `legendgroup` per country, so the legend hides or isolates a country in all subplots. A custom `plotly_legenddoubleclick` keeps Germany visible as the reference.
  - Axis interaction is custom, TradingView-style: `hitTest()` maps mouse position to the y-axis band, x-axis band or plot area. Drag and wheel on an axis rescale it; wheel on the plot scrolls the page (Ctrl + wheel zooms time), and `fitY()` auto-fits y to visible data while `state.autoY` is on. The "Échelle auto" button is only shown when autoY is off.
  - Theming: CSS custom properties in `assets/style.css`, with dark mode via `prefers-color-scheme` overridden by `:root[data-theme]`. The choice is persisted in `localStorage`. Plotly colors are read from CSS vars at layout build time, so a theme change must rebuild `baseLayout()` and re-render.
  - Series colors map to `--s1..--s7` in the order GR, IT, ES, PT, IE, FR, DE (`COLOR()` in `app.js`, matching `COUNTRIES` order in `update.py`).
- **Deployment**: `.github/workflows/update.yml` runs `update.py` on weekdays at 18:00 UTC (or manually), commits `data/`, then deploys the repo root to GitHub Pages (Pages source must be "GitHub Actions"). Pushes to `main` only redeploy. Never push unless the user asks.

## UI preferences

The user wants a minimal ("épuré") page: no explanatory grey notes or footers, monthly resolution with lines only, one title per chart plus a global title, and no extra control buttons.

## Git

Always commit after each change (French commit message), without waiting to be asked. Never push unless the user asks.
