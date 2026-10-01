# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Static site (French UI) charting euro-area 10-year sovereign bond spreads vs Germany and raw 10-year rates, monthly, since 2000. No build step, no dependencies, no tests. The user communicates in French; keep UI text, comments and commit messages in French.

## Commands

- View the site: open `index.html` directly in a browser (`file://`). No server needed.
- Refresh data: `python3 update.py` (stdlib only). Rewrites `data/taux10y.js` and `data/cache.json`.
- Headless screenshot to check rendering (Firefox is a snap here, so the profile must live under `~/snap/firefox/common/` and the output path must not be a dotfile):
  `firefox --headless --no-remote --profile ~/snap/firefox/common/<prof> --window-size=1400,900 --screenshot "$PWD/shot.png" "file://$PWD/index.html"`

## Architecture

- **Data pipeline (`update.py`)**: ECB SDW API (official monthly long-term rates, ~1 month lag) → CNBC daily closes → TradingView live quote. Months after the last ECB month are filled with the average of daily values (`merge()`). If the download fails, it falls back to `data/cache.json`. Output is a JS file (`window.DATA = {months, series: {code: [...]}, names, fetched}`), **not JSON**, because `fetch()` is blocked on `file://`. Keep it that way so double-clicking `index.html` keeps working.
- **Front end**: `index.html` loads `assets/plotly.min.js` (vendored), `data/taux10y.js`, then `assets/app.js` as classic scripts sharing globals.
  - `app.js` builds one Plotly figure with two stacked subplots of equal height: spreads (`x`/`y`) on top and raw rates for all 7 countries (`x2`/`y2`) below. The x-axes are linked via `matches`.
  - Traces share a `legendgroup` per country, so the legend hides or isolates a country in both subplots. A custom `plotly_legenddoubleclick` keeps Germany visible as the reference.
  - Axis interaction is custom, TradingView-style: `hitTest()` maps mouse position to the y-axis band, x-axis band or plot area. Drag and wheel on an axis rescale it, and `fitY()` auto-fits y to visible data while `state.autoY` is on. The "Échelle auto" button is only shown when autoY is off.
  - Theming: CSS custom properties in `assets/style.css`, with dark mode via `prefers-color-scheme` overridden by `:root[data-theme]`. The choice is persisted in `localStorage`. Plotly colors are read from CSS vars at layout build time, so a theme change must rebuild `baseLayout()` and re-render.
  - Series colors map to `--s1..--s7` in the order GR, IT, ES, PT, IE, FR, DE (`COLOR()` in `app.js`, matching `COUNTRIES` order in `update.py`).
- **Deployment**: `.github/workflows/update.yml` runs `update.py` on weekdays at 18:00 UTC (or manually), commits `data/`, then deploys the repo root to GitHub Pages (Pages source must be "GitHub Actions"). Pushes to `main` only redeploy. The user does not want anything pushed unless they ask.

## UI preferences

The user wants a minimal ("épuré") page: no explanatory grey notes or footers, monthly resolution with lines only, one title per chart plus a global title, and no extra control buttons.
