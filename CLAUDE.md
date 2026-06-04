# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Cosa fa questo progetto

MATRIX Intelligence Plus è una piattaforma di intelligenza commerciale basata su IA per i promotori universitari Zanichelli. Analizza i programmi d'esame universitari italiani (PDF), li abbina a un catalogo di 85+ manuali e genera campagne email personalizzate. Tutta l'interfaccia e i dati sono in italiano.

## Comandi di build e sviluppo

```bash
npm install              # Installa le dipendenze
npm run dev              # Server di sviluppo (Hono + adapter Cloudflare Pages)
npm run build            # Build di produzione per Cloudflare Pages → dist/
npm run build:netlify    # Build di produzione per Netlify (HTML statico) → dist/
npm run preview          # Anteprima locale della build Cloudflare
npm run deploy           # Build + deploy su Cloudflare Pages
```

Non esiste una suite di test: tutto il testing è manuale via browser.

## Architettura

L'app è una **SPA vanilla JS con backend Hono minimale**. Il server Hono (`src/index.tsx`) serve due shell HTML: una pagina di login (su `/` e `/login`) e una dashboard (su `/dashboard`). Tutta la logica di business gira nel browser.

### Ordine di caricamento dei moduli frontend

La dashboard carica questi script in sequenza — ciascuno dipende dai precedenti:

1. `config.js` — Inizializzazione client Supabase, configurazione modelli OpenAI, lookup catalogo Zanichelli
2. `utils.js` — Toast di notifica, helper di formattazione, navigazione tra tab
3. `auth.js` — Login/registrazione, gestione sessione, controllo ruoli
4. `llm.js` — Chiamate API OpenAI con prompt template; impone la modalità JSON, sanifica UTF-8 non valido
5. `upload.js` — UI drag-drop PDF, estrazione testo con PDF.js, elaborazione batch
6. `database.js` — CRUD Supabase sulla tabella `programmi`, abbinamento automatico manuali, filtri
7. `archivio.js` — Archivio adozioni con export CSV
8. `campagna.js` — Creazione campagne (modulo più grande, 104KB); analisi AI in 2 fasi + generazione email
9. `staging.js` — Workflow di validazione staging (revisione umana prima della promozione in DB)
10. `gestione.js` — Pannello admin per framework, catalogo e utenti (solo ruolo gestore)
11. `sync.js` — Sincronizzazione incrementale dei dati dal repo GitHub Matrix
12. `analisi.js` — Workflow di analisi unificata (campagne + monitoraggio)
13. `monitoraggio.js` — Monitoraggio disciplinare su più volumi

### Flusso dei dati

```
Upload PDF
  → PDF.js estrae il testo (client-side)
    → llm.js pre-classifica via GPT (docente, ateneo, materia, manuali)
      → tabella staging (checkpoint di validazione umana)
        → tabella programmi (dopo approvazione)
          → database.js abbina automaticamente al catalogo
            → campagna.js / monitoraggio.js generano le campagne
              → Template email (3 scenari: Conquista, Aggiornamento, Upgrade)
```

### Schema Supabase

Tabelle principali (tutte con Row-Level Security):
- `profili` — Profili utente; ruoli: `promotore` (default) o `gestore` (admin)
- `programmi` — Programmi d'esame universitari (docente, ateneo, materia, scenario, manuali)
- `campagne` — Campagne promozionali; `tipo` è `'novita'` o `'monitoraggio'`
- `frameworks_condivisi` — Framework disciplinari condivisi (gestiti dal gestore)
- `catalogo_manuali_condiviso` — Catalogo manuali condiviso (gestito dal gestore)

Il primo utente registrato diventa automaticamente `gestore`; gli altri si registrano come `promotore` e possono auto-promuoversi dalle Impostazioni.

### Target di deploy

- **Netlify (produzione)**: `npm run build:netlify` → `build-netlify.mjs` genera HTML statico + `_redirects` per il routing SPA; le Netlify Functions fanno da proxy alle chiamate API
- **Cloudflare Pages (opzionale)**: `npm run build` → server Hono in `dist/`
- `netlify/functions/health.mjs` fornisce un endpoint di health-check

### Dati statici

`public/data/catalogo_manuali.json` (85+ libri) e `public/data/catalogo_framework.json` (21 framework) sono usati come fallback statico quando il catalogo condiviso su Supabase non è disponibile.

### GitHub Actions

`.github/workflows/supabase-keepalive.yml` viene eseguito ogni 3 giorni alle 08:00 UTC per evitare l'ibernazione del piano free Supabase.

## Convenzioni principali

- **Lingua**: Tutto il testo dell'interfaccia, i nomi delle variabili per i concetti di business e i valori dei dati sono in italiano.
- **Chiavi API a runtime**: La chiave OpenAI e le credenziali Supabase sono salvate in `localStorage`, inserite da ogni utente nelle Impostazioni. Non esistono file `.env`.
- **Anon key Supabase**: La chiave pubblica anon in `config.js` è intenzionalmente pubblica; la sicurezza è garantita dalle policy RLS.
- **Modalità JSON**: Tutte le chiamate OpenAI usano `response_format: { type: "json_object" }`. Le risposte vengono sanificate da UTF-8 non valido prima del `JSON.parse`.
- **Colonne DB**: snake_case. Variabili JS: camelCase.
