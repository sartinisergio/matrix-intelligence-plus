-- =====================================================
-- MATRIX Intelligence — Monitoraggio Disciplinare
-- Migration: 001_monitoraggio_disciplinare.sql
-- =====================================================
-- Eseguire queste istruzioni su Supabase SQL Editor.
-- Non modificano dati esistenti, solo aggiunta colonne.
-- =====================================================

-- 1A: Nuove colonne sulla tabella campagne
ALTER TABLE campagne 
ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'novita' 
  CHECK (tipo IN ('novita', 'monitoraggio'));

ALTER TABLE campagne 
ADD COLUMN IF NOT EXISTS volumi_monitoraggio JSONB DEFAULT '[]';

-- 1B: Indice sulla colonna tipo
CREATE INDEX IF NOT EXISTS idx_campagne_tipo ON campagne (tipo);

-- 1D: Persistenza della sintesi disciplinare
ALTER TABLE campagne
ADD COLUMN IF NOT EXISTS sintesi_disciplina JSONB;

-- =====================================================
-- NOTA: La specifica originale prevedeva colonne aggiuntive
-- su una tabella 'target_campagna' (1C). Tuttavia, nel codebase
-- attuale i target sono salvati come JSONB nella colonna
-- 'target_generati' della tabella 'campagne'. 
-- I campi volume_consigliato, tipo_azione, urgenza, allineamento,
-- motivazione_scelta, valutazioni_volumi saranno quindi inclusi
-- come proprietà degli oggetti JSON all'interno di target_generati.
-- Nessuna ALTER TABLE aggiuntiva necessaria per i target.
-- =====================================================
