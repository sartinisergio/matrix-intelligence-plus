# CLAUDE.md

Questo file fornisce indicazioni a Claude Code (claude.ai/code) quando lavora con il codice in questo repository.

## Panoramica del Progetto

**MATRIX Intelligence Plus** è una piattaforma di intelligenza commerciale alimentata da AI per promotori di libri di testo universitari (mercato italiano). Analizza PDF di programmi d'esame, identifica adozioni di testi e genera campagne di contatto personalizzate con email pronte all'invio. URL di produzione: https://matrix-intelligence.netlify.app

## Comandi di Sviluppo

```bash
npm install              # Installa le dipendenze
npm run dev              # Avvia il dev server Vite su localhost:3000
npm run build            # Build per Cloudflare Pages (output in dist/)
node build-netlify.mjs   # Build HTML statico per Netlify (output in dist/)
npm run preview          # Anteprima con Wrangler (Cloudflare)
npm run deploy           # Deploy su Cloudflare Pages
```

Non esiste una suite di test né un linter configurato.

## Architettura

### Doppio Target di Deployment

L'app supporta due piattaforme tramite percorsi di build separati:
- **Cloudflare Pages**: `vite.config.ts` usa `@hono/vite-build` con entry point `src/index.tsx`
- **Netlify**: `build-netlify.mjs` estrae i template HTML da `src/index.tsx` tramite regex, generando `dist/index.html` e `dist/dashboard.html` statici

Entrambi i target servono lo stesso codice frontend — la build Netlify è una pura estrazione statica dell'HTML.

### Backend (`src/index.tsx`)

Un singolo file Hono da 1.874 righe. Gestisce solo 4 route: `GET /`, `GET /login`, `GET /dashboard` e `GET /api/health`. Tutta la logica applicativa vive nei moduli JS del frontend. Il ruolo del backend è rendere i template HTML che includono i tag `<script>` dei moduli JS.

### Moduli Frontend (`public/static/js/`)

Moduli JavaScript vanilla caricati in ordine di dipendenza. Non vengono processati da un bundler — sono serviti così come sono. Responsabilità e ordine di caricamento:

| Modulo | Scopo |
|--------|-------|
| `config.js` | Inizializzazione client Supabase, gestione chiave OpenAI, configurazione globale |
| `utils.js` | Notifiche toast, badge helper, esportazione CSV |
| `auth.js` | Login/registrazione Supabase Auth, rilevamento ruolo, gestione sessione |
| `llm.js` | Tutte le chiamate OpenAI API e costruzione dei prompt |
| `upload.js` | Drag-drop PDF, estrazione testo via PDF.js, upload batch con progress bar |
| `database.js` | CRUD tabella `programmi`, corrispondenza catalogo, filtri per scenario |
| `archivio.js` | Vista archivio adozioni con filtri e statistiche |
| `campagna.js` | CRUD campagne, generazione intelligenza AI a 2 fasi, template email |
| `staging.js` | Area di staging, validazione e workflow di promozione |
| `gestione.js` | Pannello admin per framework, catalogo e utenti (solo ruolo gestore) |
| `sync.js` | Sincronizzazione incrementale dal repository GitHub Matrix |
| `analisi.js` | Sezione analisi unificata che orchestra campagna + monitoraggio |
| `monitoraggio.js` | Monitoraggio disciplinare multi-volume |

### Flusso dei Dati

```
Upload PDF → PDF.js (client) → estrazione OpenAI → staging (programmi.stato='staging')
                                                           ↓
                                              Il promotore valida/corregge
                                                           ↓
                                              DB produzione (stato='database')
                                                           ↓
                                         Creazione campagna (tabella campagne)
                                                           ↓
                              AI a 2 fasi: pre-valutazione → analisi completa + email
```

### Stato e Storage

- **Supabase**: tutti i dati persistenti. Le credenziali (URL + anon key) sono in `localStorage` per permettere la self-configurazione. L'anon key è sicura lato client — la sicurezza è garantita da Row-Level Security (RLS).
- **localStorage**: chiave API OpenAI (mai inviata al server), selezione modello LLM, credenziali Supabase, timestamp sincronizzazione Matrix, blob JSON di catalogo/framework sincronizzati, firma email.
- **Nessuna sessione server-side**: lo stato di autenticazione è gestito interamente dall'SDK client di Supabase.

### Sistema dei Ruoli

Due ruoli: `promotore` (standard) e `gestore` (admin). Memorizzati nella tabella `profili`. La sezione `gestione.js` viene renderizzata solo per i gestori. Il primo utente registrato diventa automaticamente gestore; se non esiste nessun gestore, qualsiasi utente può auto-promuoversi dalle Impostazioni.

### Integrazione LLM

Tutte le chiamate AI vengono effettuate da `llm.js` direttamente dal browser, usando la chiave OpenAI dell'utente da localStorage. Il backend non tocca mai la chiave. Modelli supportati: `gpt-4o-mini` (default/consigliato), `gpt-4o`, `gpt-4.1-mini`, `gpt-4.1`.

**Intelligenza campagna a 2 fasi**:
1. **Pre-valutazione** (volume non ancora disponibile): incrocia temi del programma + indice competitor + framework disciplinare → schede SITUAZIONE/LEVA/NEGOZIAZIONE
2. **Analisi completa** (indice del volume disponibile): rigenera con confronto diretto volume vs competitor

**Classificazione scenario** (presenza Zanichelli nel programma):
- **A (Verde)**: framework + libri disponibili → analisi qualitativa completa
- **B (Giallo)**: solo framework o solo libri → analisi parziale
- **C (Arancione)**: nessuna risorsa → corrispondenza base

### Dati Statici di Fallback

`/public/static/data/catalogo_manuali.json` (85 libri) e `catalogo_framework.json` (21 framework disciplinari) vengono usati come fallback quando non esistono dati Matrix sincronizzati in localStorage.

### Sincronizzazione Matrix

`sync.js` recupera dati dal repository GitHub `sartinisergio/matrix-analisi-programmi`. Confronta i manifest locali con quelli remoti e scarica solo le voci modificate. Il pulsante "Forza completa" azzera e riscarica tutto.

## Schema Database (Supabase)

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
frameworks_condivisi       -- nome, materia, dati (JSONB), caricato_da
catalogo_manuali_condiviso -- titolo, autore, editore, materia, is_zanichelli, dati (JSONB)
```

I file di migrazione si trovano in `sql/`.

## Convenzioni Chiave

- **UI in italiano**: tutte le stringhe visibili all'utente, i nomi delle variabili e i campi del database sono in italiano.
- **Rilevamento Zanichelli**: usa il flag `is_zanichelli` sulle voci del catalogo, oppure controlla `editore === 'CEA'` (marchio secondario Zanichelli), oppure il campo `type` dai dati di sync Matrix.
- **Rendering progress bar**: le operazioni async pesanti usano progress bar basate su `requestAnimationFrame`, non semplici transizioni CSS.
- **Nessuna sintassi import/export**: i moduli frontend sono caricati come script classici (non ES modules) — condividono lo scope globale. Funzioni e stato sono attaccati a `window` o dichiarati globalmente.
- **Tipi di template email**: tre template distinti per scenario — "Conquista" (Zanichelli assente), "Aggiornamento" (Zanichelli primario), "Upgrade" (Zanichelli alternativo).
