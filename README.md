# Creao Client Dashboards

Hosted at **[app.creao.co](https://app.creao.co)**.

## Structure

- `/` — landing page with links to each client dashboard
- `/brian-jupina/` — Brian Jupina dashboard
- `/nelson-bendeck/` — Nelson Bendeck dashboard
- `/jim-erwin/` — Jim Erwin dashboard

## Hosting

Deployed via **GitHub Pages** from the `main` branch root.

Custom domain `app.creao.co` is configured via the `CNAME` file in the repo root.

## Updating dashboard data

Each client folder is self-contained with `index.html`, `style.css`, `app.js`, and `config.js` (which holds `window.DASHBOARD_DATA`). Edit and push to update.
