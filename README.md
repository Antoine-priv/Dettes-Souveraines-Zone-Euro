# Spreads 10 ans zone euro

Site statique : spreads de taux souverains à 10 ans (Grèce, Italie, Espagne, Portugal, Irlande, France) face à l'Allemagne, et taux 10 ans de chaque pays, depuis 2000 (moyennes mensuelles).

## Voir le site

- **En local** : ouvrir `index.html` dans le navigateur (double-clic). Aucun serveur nécessaire.
- **GitHub Pages** : pousser le dépôt sur GitHub, puis *Settings → Pages → Deploy from a branch → `main` / `(root)`*.

## Mettre à jour les données

```sh
python3 update.py
```

Réécrit `data/taux10y.js` (aucune dépendance, Python 3.8+). Sources : BCE (taux à long terme, critères de convergence) ; pour les mois pas encore publiés par la BCE, moyenne des cours journaliers CNBC et du taux du jour TradingView. Sans connexion, le script réutilise `data/cache.json`.

## Structure

```
index.html          page
assets/app.js       graphiques (Plotly)
assets/style.css    styles, thèmes clair / sombre
assets/plotly.min.js
data/taux10y.js     données générées par update.py
data/cache.json     dernières données brutes téléchargées
update.py           récupération des données
```
