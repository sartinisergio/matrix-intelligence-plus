# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MATRIX Intelligence Plus** is an AI-powered commercial intelligence platform for university textbook promoters (targeting Italian universities). It analyzes exam syllabi PDFs, identifies textbook adoptions, and generates personalized outreach campaigns with ready-to-send emails. Production URL: https://matrix-intelligence.netlify.app

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server on localhost:3000
npm run build        # Build for Cloudflare Pages (outputs to dist/)
node build-netlify.mjs  # Build static HTML for Netlify (outputs to dist/)
npm run preview      # Preview with Wrangler (Cloudflare)
npm run deploy       # Deploy to Cloudflare Pages
```

There is no test suite. There is no linter configured.

## Architecture

### Dual Deployment Model

The app targets two platforms via separate build paths:
- **Cloudflare Pages**: `vite.config.ts` uses `@hono/vite-build` with entry `src/index.tsx`
- **Netlify**: `build-netlify.mjs` extracts HTML templates from `src/index.tsx` via regex, generating static `dist/index.html` and `dist/dashboard.html`

Both targets serve the same frontend code — the Netlify build is purely static HTML extraction.

### Backend (`src/index.tsx`)

A single 1,874-line Hono file. It serves only 4 routes: `GET /`, `GET /login`, `GET /dashboard`, and `GET /api/health`. The real application logic lives entirely in the frontend JS modules. The backend's role is to render HTML templates containing the JS module `<script>` tags.

### Frontend Modules (`public/static/js/`)

Vanilla JavaScript modules loaded in dependency order. No bundler processes them — they are served as-is. Module responsibilities and load order:

| Module | Purpose |
|--------|---------|
| `config.js` | Supabase client init, OpenAI key management, app-wide config |
| `utils.js` | Toast notifications, badge helpers, CSV export |
| `auth.js` | Supabase Auth login/register, role detection, session management |
| `llm.js` | All OpenAI API calls and prompt construction |
| `upload.js` | PDF drag-drop, PDF.js text extraction, batch upload with progress |
| `database.js` | `programmi` table CRUD, catalog matching, scenario filtering |
| `archivio.js` | Adoption archive view with filters and stats |
| `campagna.js` | Campaign CRUD, 2-phase AI intelligence generation, email templates |
| `staging.js` | Staging area validation and promotion workflow |
| `gestione.js` | Admin panel for frameworks, catalog, and user management (gestore role only) |
| `sync.js` | Incremental sync from Matrix GitHub repository |
| `analisi.js` | Unified analysis section orchestrating campagna + monitoraggio |
| `monitoraggio.js` | Multi-volume disciplinary monitoring |

### Data Flow

```
PDF Upload → PDF.js (client) → OpenAI extraction → staging (programmi.stato='staging')
                                                        ↓
                                              Promoter validates/corrects
                                                        ↓
                                              Production DB (stato='database')
                                                        ↓
                                        Campaign creation (campagne table)
                                                        ↓
                             2-Phase AI: pre-evaluation → complete analysis + emails
```

### State & Storage

- **Supabase**: All persistent data. Credentials (URL + anon key) stored in `localStorage` so users can self-configure. Anon key is safe to expose — security enforced via Row-Level Security (RLS).
- **localStorage**: OpenAI API key (never sent to server), LLM model selection, Supabase credentials, Matrix sync timestamps, synced catalog/framework JSON blobs, email signature.
- **No server-side sessions**: Auth state managed entirely by Supabase client SDK.

### Role System

Two roles: `promotore` (standard) and `gestore` (admin). Stored in the `profili` table. The `gestione.js` section only renders for gestores. First registered user auto-becomes gestore; if no gestore exists, any user can self-promote via Settings.

### LLM Integration

All AI calls go through `llm.js` directly from the browser using the user's OpenAI API key from localStorage. The backend never touches the key. Supported models: `gpt-4o-mini` (default/recommended), `gpt-4o`, `gpt-4.1-mini`, `gpt-4.1`.

**Two-phase campaign intelligence**:
1. **Pre-evaluation** (no volume yet): crosses program themes + competitor index + disciplinary framework → SITUATION/LEVERAGE/NEGOTIATION cards
2. **Complete analysis** (volume index available): re-runs with direct volume vs competitor comparison

**Scenario classification** (Zanichelli presence in program):
- **A (Green)**: Framework + textbooks available → full qualitative analysis
- **B (Yellow)**: Framework or textbooks only → partial
- **C (Orange)**: No resources → basic matching

### Static Data Fallback

`/public/static/data/catalogo_manuali.json` (85 textbooks) and `catalogo_framework.json` (21 disciplinary frameworks) are fallbacks when no Matrix sync data exists in localStorage.

### Matrix Sync

`sync.js` fetches from the GitHub repository `sartinisergio/matrix-analisi-programmi`. It compares local vs remote manifests and downloads only changed entries. "Force complete" resets and re-downloads everything.

## Database Schema (Supabase)

```sql
profili         -- user_id (UUID), email, ruolo ('promotore'|'gestore')
programmi       -- docente_nome, docente_email, ateneo, corso_laurea, classe_laurea,
                --   materia_inferita, manuali_citati (JSONB), scenario_zanichelli,
                --   temi (JSONB), stato (NULL|'staging'|'database'), dati_verificati,
                --   manual_catalog_id/title/author/publisher
campagne        -- libro_titolo/autore/editore/materia, indice (text), temi (JSONB),
                --   target_generati (JSONB), tipo ('campagna'|'monitoraggio'),
                --   volumi_monitoraggio (JSONB), sintesi_disciplina (JSONB),
                --   stato ('bozza'|'completata')
frameworks_condivisi      -- nome, materia, dati (JSONB), caricato_da
catalogo_manuali_condiviso -- titolo, autore, editore, materia, is_zanichelli, dati (JSONB)
```

Migration files live in `sql/`.

## Key Conventions

- **Italian UI**: All user-facing strings, variable names, and database field names are in Italian.
- **Zanichelli detection**: Uses `is_zanichelli` flag on catalog entries, or checks for `editore === 'CEA'` (Zanichelli sub-brand), or the `type` field from Matrix sync data.
- **Progress rendering**: Heavy async operations use `requestAnimationFrame`-based progress bars, not simple CSS transitions.
- **No import/export syntax**: Frontend modules are loaded as classic scripts (not ES modules) — they share a global scope. Functions and state are attached to `window` or declared globally.
- **Email template types**: Three templates keyed by scenario — "Conquest" (Zanichelli absent), "Update" (Zanichelli primary), "Upgrade" (Zanichelli alternative).
