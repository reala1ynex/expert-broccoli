# GrowOps Planner

GrowOps Planner is an offline-first desktop app for crop planning, grow management, plant health diagnostics, compatibility checking, harvest tracking, local exports, and backups.

The app is intentionally local-first:

- No cloud account is required.
- No remote database is required.
- No paid external APIs are required.
- SQLite stores structured app data when running in Tauri.
- Local folders store photos, JSON backups, CSV exports, and app files.
- The React UI includes a browser fallback store for development smoke testing, but packaged desktop use is the target.

## Stack

- Tauri desktop shell, primary target Windows
- React + TypeScript + Vite
- Installable iPad-friendly PWA build from the same React app
- Tailwind CSS with shadcn/ui-style local components
- SQLite through a narrow Rust command API
- Zod validation in the frontend
- Local JSON backup/restore and CSV export

## Features

- New GrowOps Lab tab for trial design, GDD and phenology calculations, VPD and climate analysis, irrigation and nutrient calculators, IPM scouting, sensor CSV imports, scenario simulation, and a local research library
- GrowOps Lab visual charts for trial comparisons, GDD accumulation, and imported sensor trends
- Polished desktop visual system with original packaged crop-operations artwork, a custom app icon, refined dashboard surfaces, upgraded tables, controls, panels, and map canvases
- iPad web app mode with Safari Add to Home Screen metadata, PWA manifest, service worker app-shell caching, IndexedDB persistence, touch-safe controls, and responsive tablet navigation
- Local workspace/farm profiles with climate dates, currency, units, production tags, and notes
- Growing environments for fields, tunnels, greenhouses, indoor rooms, racks, containers, and nurseries
- Farm-level environment map with drag/resize editing, snap-to-grid controls, ruler labels, auto-arrange, dimension-scaled layout, duplicate/delete actions, and precision fields for exact sizing
- 2D layout planner with drag/resize editing for environments areas and units, plus precision tables for beds, rows, racks, channels, trays, reservoirs, and zones
- Automatic planning calculations for environment usable area, climate assumptions, unit plant slots, root depth, assigned planting area, expected yield, and expected revenue, with manual overrides
- Guided plan builder that detects linked seed inventory and ordered seed rows, supports production goals, fills the best-fit planting mix from crop compatibility, open units, spacing, season timing, capacity, yield, seed coverage, and projected revenue, then reserves countable seed inventory for generated plans
- Built-in editable crop library with vegetables, herbs, fruiting crops, roots, legumes, strawberries, and microgreens
- Growing methods and media catalog covering soil, containers, nursery, hydroponic, aquaponic, vertical, and microgreens systems
- Season planner with generated crop dates, successions, expected yield, expected revenue, supplies, and tasks
- Compatibility engine for crop, environment, method, medium, pH, EC, spacing, root depth, humidity, season length, and hydroponic suitability
- Task calendar with daily, weekly/table, calendar-list, and kanban views
- Seed and supply list with CSV export
- Harvest and revenue tracking with crop performance snapshot
- Offline rule-based plant health diagnostics with ranked causes, evidence, checks, actions, correction plans, prevention, urgency, and advisory disclaimers
- Local assistant-style recommendations for space utilization, bed conflicts, seed lot links, seed reservations, expiring seed, labor peaks, successions, diagnostics, backups, rotation risk, and protected-culture humidity risk
- Data management page with local paths, full JSON backup, JSON restore, CSV exports, demo reset, and backup history
- Fresh Start action for a clean workspace that keeps built-in crop, method, and media libraries
- Quick Delete tools for batch cleanup of plantings, tasks, harvests, diagnostics, environments, growing areas, units, supplies, seed orders, recommendations, and custom crops
- Optional Web Import for reviewed crop reference notes and local weather snapshots from public no-key sources
- Optional private collaboration by shared group code and local sync package exchange
- Bluetooth handoff for Windows using the same group-code sync package and the native Bluetooth File Transfer wizard
- Undo restore for destructive actions, plus Ctrl+Z restore while the undo snapshot is available
- Persistent Restore Center with capped local restore points for destructive actions and backup imports
- Traceability page connecting plantings to crop profile, location, seed orders, supplies, tasks, diagnostics, harvest lots, linked expenses, and printable trace reports
- Ctrl+K command palette for navigation, reports, calendar export, and quick actions
- Bulk edit for tasks, plantings, crops, and harvest logs
- Saved task table filters and column visibility presets
- Printable crop plan, weekly work plan, task sheet, harvest, profitability, diagnostics, traceability, inventory, and seed reservation reports
- QR labels for plantings, environments, beds/units, inventory lots, supply items, harvest lots, and diagnostic cases
- Calendar export to `.ics`
- Inventory lot tracking and expense/profitability tracking
- Collaboration import/export history
- Light/dark mode and desktop sidebar navigation

## Install

Prerequisites for full desktop development:

1. Install Node.js LTS with `npm`.
2. Install Rust and Cargo from the official Rust toolchain.
3. On Windows, install the Visual Studio Build Tools required by Tauri.

Then install dependencies:

```bash
npm install
```

## Development

Run the browser development server:

```bash
npm run dev
```

Run the Tauri desktop app:

```bash
npm run tauri:dev
```

## Build

Build the web bundle:

```bash
npm run build
```

Build the iPad/web PWA bundle:

```bash
npm run web:build
```

The iPad/web output is written to `dist-web/`. Host that folder from any static web server. For iPad installation, serve it over HTTPS, open it in Safari, then use Share -> Add to Home Screen. Normal app data is stored in the browser's IndexedDB with localStorage fallback; backups and CSV exports download as local files.

Prepare the iPad/web build for GitHub Pages:

```bash
npm run web:pages
```

This runs the web build, adds the GitHub Pages `.nojekyll` marker, and copies `index.html` to `404.html` so the app shell can reload cleanly from static hosting.

Package the Windows desktop app:

```bash
npm run tauri:build
```

The default Windows package is the NSIS setup executable at `src-tauri/target/release/bundle/nsis/`. Tauri also provides a path to macOS and Linux packaging when those platform toolchains are available.

Preview the iPad/web build on your local network:

```bash
npm run web:preview
```

For testing from an iPad on the same Wi-Fi network, open the computer's LAN address and the preview port shown by Vite. Some PWA install/offline behavior requires HTTPS on iPadOS, so use a real HTTPS static host for final testing.

## GitHub Pages Web Deployment

This repo includes `.github/workflows/growops-pages.yml`, which builds and deploys the iPad/web version to GitHub Pages whenever you push to `main` or `master`.

1. Create a GitHub repository and push this project.
2. In the repository, open Settings -> Pages.
3. Set Build and deployment -> Source to GitHub Actions.
4. Push to `main` or run the `Deploy GrowOps web app` workflow manually from the Actions tab.
5. Open the deployed HTTPS URL on the iPad, then use Safari Share -> Add to Home Screen.

The web app is built with relative asset paths, so it can run from either a GitHub Pages project path like `username.github.io/repo-name/` or a custom root domain.

## Test And Lint

```bash
npm run typecheck
npm run lint
npm test
```

The included Node tests cover compatibility checks, diagnostic scoring scenarios, date planning, task generation, and backup validation behavior. `npm run lint` performs repository sanity checks for unfinished-work markers, secret-like text, and remote API dependencies.

## Local Data Location

When running inside Tauri, the Settings and Data pages show exact local paths for:

- SQLite database: `growops.sqlite3`
- Photo folder
- Backup folder
- Export folder
- App data folder

The backend does not expose arbitrary filesystem access to the frontend. It only writes controlled backup, CSV, and photo files into app-owned folders.

In the iPad/web build, there is no Tauri backend. The app stores the validated snapshot in IndexedDB, uses local previews for photo attachments, and exports backups/CSVs through browser downloads.

## Backup And Restore

Use Data -> Export full JSON backup to create a local backup file. Use Data -> Import backup JSON to restore a backup. Imports are parsed and sanitized before replacing local app state.

Use Data -> Fresh start to reset to a clean local workspace while keeping the built-in crop, growing method, and growing media libraries available. Use Data -> Load demo data when you want sample farm records for testing.

CSV exports are available for:

- Crop plan
- Task list
- Harvest log
- Diagnostic history
- Seed and supply list

## Optional Web Import

Web Import is off by default and only runs when the user presses Fetch. Current import options use public no-key sources:

- Wikipedia page summaries for crop or plant reference notes
- Open-Meteo geocoding and forecast endpoints for local weather snapshots

Fetched data is previewed before it is saved locally.

## Private Collaboration

Collaboration is local-file based. One user creates or enters a shared group code, exports a sync package, and privately sends it to the other user. The other user enters the same group code and imports the package. The app rejects packages with a different group code.

There is no hosted relay, cloud account, or background sync service in this version.

Collaboration import and export events are recorded locally so users can see when packages were created, sent by Bluetooth handoff, or merged.

## Bluetooth Handoff

The Collaboration page can create a Bluetooth-ready sync package in the app export folder, reveal the file, open Windows Bluetooth settings, and launch the Windows Bluetooth File Transfer wizard. This is an offline handoff workflow rather than live background sync. Both devices still need to use the same group code before importing peer packages.

## Recommended Next Features

The highest-value production additions are:

- Native updater install flow using Tauri's updater plugin once a public key and release endpoint are available
- Windows Authenticode signing with a real code-signing certificate
- Labor tracking by person, task, crop, and environment
- Image gallery management with annotation and before/after comparison
- Native code signing and fully automated signed updater install flow once release certificates and signing keys are available
- Optional LAN peer sync for same-network collaboration
- Role labels and change history for private collaboration packages
- Sensor import templates for CSV logger files
- Diagnostic image gallery with annotation and before/after comparison

## Updates And Release Signing

Settings includes an optional update manifest checker for a Tauri-style static JSON manifest. This checks whether a newer signed release is listed, but it does not auto-install updates yet.

Tauri updater releases require a public key in `tauri.conf.json`, a private signing key stored outside the repository, and update artifacts generated during build. Windows SmartScreen trust also requires a separate Windows code-signing certificate. Do not commit private signing keys or certificates.

## Known Limitations

- Photo attachments are supporting evidence only. The app does not perform offline computer-vision diagnosis.
- Diagnostic results are advisory and rule-based; disease confirmation may require a lab, extension office, or local crop advisor.
- Chemical and pesticide decisions must follow product labels and local law.
- The current SQLite layer stores each domain entity as validated JSON in dedicated domain tables. This keeps the offline schema modular while leaving room for later relational reporting migrations.
- Automatic cloud sync is intentionally not implemented; private collaboration currently uses explicit local sync packages.
- Bluetooth handoff opens Windows system tools and exchanges sync files; it is not a direct live Bluetooth database session.
