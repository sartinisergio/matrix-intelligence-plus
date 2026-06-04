# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

MATRIX Intelligence Plus is an AI-powered commercial intelligence platform for Zanichelli university textbook promoters. It analyzes Italian university exam programs (PDFs), matches them against a catalog of 85+ manuals, and generates personalized email campaigns. The UI and all data are in Italian.

## Build & Development Commands

```bash
npm install              # Install dependencies
npm run dev              # Dev server (Hono + Cloudflare Pages adapter)
npm run build            # Production build for Cloudflare Pages → dist/
npm run build:netlify    # Production build for Netlify (static HTML) → dist/
npm run preview          # Preview Cloudflare build locally
npm run deploy           # Build + deploy to Cloudflare Pages
```

There is no test suite — all testing is manual via the browser.

## Architecture

The app is a **minimal Hono backend + vanilla JS SPA**. The Hono server (`src/index.tsx`) serves two HTML shells: a login page (at `/` and `/login`) and a dashboard (at `/dashboard`). All business logic lives in the browser.

### Frontend Module Load Order

The dashboard HTML loads these scripts in sequence — each depends on the previous ones:

1. `config.js` — Supabase client init, OpenAI model config, Zanichelli catalog lookup
2. `utils.js` — Toast notifications, formatting helpers, tab navigation
3. `auth.js` — Login/register, session management, role checks
4. `llm.js` — OpenAI API calls with prompt templates; enforces JSON mode, sanitizes invalid UTF-8
5. `upload.js` — PDF drag-drop UI, PDF.js text extraction, batch processing
6. `database.js` — Supabase CRUD for `programmi` table, manual auto-matching, filtering
7. `archivio.js` — Adoption archive with CSV export
8. `campagna.js` — Campaign creation (largest module, 104KB); 2-phase AI analysis + email generation
9. `staging.js` — Staging validation workflow (human review before DB promotion)
10. `gestione.js` — Admin panel for frameworks, catalog, and user management (gestore role only)
11. `sync.js` — Incremental data sync from the Matrix GitHub repo
12. `analisi.js` — Unified analysis workflows (campaigns + monitoring)
13. `monitoraggio.js` — Disciplinary-level monitoring across multiple volumes

### Data Flow

```
PDF Upload
  → PDF.js extracts text (client-side)
    → llm.js pre-classifies via GPT (docente, ateneo, materia, manuali)
      → staging table (human validation checkpoint)
        → programmi table (on approval)
          → database.js auto-matches with catalog
            → campagna.js / monitoraggio.js generate campaigns
              → Email templates (3 scenarios: Conquista, Aggiornamento, Upgrade)
```

### Supabase Schema

Key tables (all with Row-Level Security):
- `profili` — User profiles; roles: `promotore` (default) or `gestore` (admin)
- `programmi` — University exam programs (docente, ateneo, materia, scenario, manuali)
- `campagne` — Promotional campaigns; `tipo` is `'novita'` or `'monitoraggio'`
- `frameworks_condivisi` — Shared disciplinary evaluation frameworks (gestore-managed)
- `catalogo_manuali_condiviso` — Shared manual catalog (gestore-managed)

The first registered user automatically becomes `gestore`; others register as `promotore` and can self-promote from Settings.

### Deployment Targets

- **Netlify (production)**: `npm run build:netlify` → `build-netlify.mjs` generates static HTML + `_redirects` for SPA routing; Netlify Functions proxy API calls
- **Cloudflare Pages (optional)**: `npm run build` → Hono server in `dist/`
- `netlify/functions/health.mjs` provides a health-check endpoint

### Static Data

`public/data/catalogo_manuali.json` (85+ textbooks) and `public/data/catalogo_framework.json` (21 frameworks) are used as static fallbacks when the Supabase shared catalog is unavailable.

### GitHub Actions

`.github/workflows/supabase-keepalive.yml` runs every 3 days at 08:00 UTC to prevent Supabase free-tier hibernation.

## Key Conventions

- **Language**: All UI text, variable names for business concepts, and data values are in Italian.
- **API keys at runtime**: OpenAI key and Supabase credentials are stored in `localStorage`, entered by each user in Settings. There are no `.env` files.
- **Supabase anon key**: The public anon key in `config.js` is intentionally public; security is enforced by RLS policies.
- **JSON mode**: All OpenAI calls use `response_format: { type: "json_object" }`. Responses are sanitized for invalid UTF-8 before `JSON.parse`.
- **DB columns**: snake_case. JS variables: camelCase.
