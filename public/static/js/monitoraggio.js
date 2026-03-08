// ==========================================
// MATRIX Intelligence — Monitoraggio Disciplinare
// ==========================================
// Sezione indipendente da campagna.js.
// Gestisce il flusso: materia + volumi → analisi strategica per docente.
// Fase 1: CRUD, form, rendering statico.
// Fase 2 (futura): generaTargetMonitoraggio, LLM calls.

let allMonitoraggi = [];
let currentMonTargets = [];
let currentMonitoraggioId = null;

// ===================================================
// CARICAMENTO E LISTA
// ===================================================

async function loadMonitoraggi() {
  if (!supabaseClient) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return;

  // Carica risorse condivise (catalogo + framework) se non gia caricate
  loadCatalog();
  loadFrameworks();

  try {
    const { data, error } = await supabaseClient
      .from('campagne')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('tipo', 'monitoraggio')
      .order('created_at', { ascending: false });

    if (error) throw error;
    allMonitoraggi = data || [];
    renderMonitoraggiList();
  } catch (e) {
    showToast('Errore caricamento monitoraggi: ' + e.message, 'error');
  }
}

function renderMonitoraggiList() {
  const container = document.getElementById('monitoraggi-list');

  if (allMonitoraggi.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-gray-400">
        <i class="fas fa-binoculars text-4xl mb-3 block"></i>
        <p>Nessun monitoraggio creato</p>
        <p class="text-sm mt-1">Crea il tuo primo monitoraggio disciplinare per analizzare una materia</p>
      </div>`;
    return;
  }

  container.innerHTML = allMonitoraggi.map(m => {
    const volumi = m.volumi_monitoraggio || [];
    const volumiCount = volumi.length;
    const targetCount = (m.target_generati || []).length;
    const materia = m.libro_materia || 'Materia non specificata';

    // Badge stato
    let statusBadge;
    if (m.stato === 'completata' && targetCount > 0) {
      statusBadge = '<span class="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium"><i class="fas fa-check-circle mr-1"></i>Completato</span>';
    } else if (targetCount > 0) {
      statusBadge = '<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium"><i class="fas fa-spinner mr-1"></i>In elaborazione</span>';
    } else {
      statusBadge = '<span class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium"><i class="fas fa-edit mr-1"></i>Bozza</span>';
    }

    // Titoli dei volumi
    const volumiLabels = volumi.map(v => v.titolo).filter(Boolean).join(', ');

    // Bottoni azioni
    let actionButtons = '';
    if (targetCount > 0) {
      actionButtons += `
        <button onclick="viewMonitoraggioTargets('${m.id}')" class="px-3 py-1.5 bg-zanichelli-accent text-zanichelli-blue rounded-lg text-sm hover:bg-blue-100 transition-colors" title="Vedi risultati">
          <i class="fas fa-list mr-1"></i>Risultati
        </button>`;
    }

    return `
      <div class="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-1">
              <h3 class="font-semibold text-gray-800">
                <i class="fas fa-binoculars text-zanichelli-light mr-1.5 text-sm"></i>
                ${materia}
              </h3>
              ${statusBadge}
            </div>
            <p class="text-sm text-gray-500">${volumiLabels || 'Nessun volume inserito'}</p>
            <div class="flex items-center gap-4 mt-2 text-xs text-gray-400">
              <span><i class="fas fa-book mr-1"></i>${volumiCount} volum${volumiCount === 1 ? 'e' : 'i'}</span>
              <span><i class="fas fa-users mr-1"></i>${targetCount} docent${targetCount === 1 ? 'e' : 'i'}</span>
              <span><i class="fas fa-clock mr-1"></i>${formatDate(m.created_at)}</span>
            </div>
          </div>
          <div class="flex items-center gap-2 ml-4">
            ${actionButtons}
            <button onclick="deleteMonitoraggio('${m.id}')" class="px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-sm hover:bg-red-100 transition-colors" title="Elimina monitoraggio">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ===================================================
// FORM: MOSTRA / NASCONDI / GESTIONE VOLUMI
// ===================================================

function showNewMonitoraggioForm() {
  document.getElementById('monitoraggio-form-container').classList.remove('hidden');
  document.getElementById('btn-new-monitoraggio').classList.add('hidden');
  document.getElementById('monitoraggi-list').classList.add('hidden');

  // Reset form
  document.getElementById('mon-materia').value = '';
  resetMonitoraggioVolumi();
  validateMonitoraggioForm();
}

function hideMonitoraggioForm() {
  document.getElementById('monitoraggio-form-container').classList.add('hidden');
  document.getElementById('btn-new-monitoraggio').classList.remove('hidden');
  document.getElementById('monitoraggi-list').classList.remove('hidden');
}

function resetMonitoraggioVolumi() {
  const container = document.getElementById('mon-volumi-container');
  // Ricrea solo il primo volume
  container.innerHTML = createVolumeEntryHTML(0);
  document.getElementById('btn-add-volume').classList.remove('hidden');
  document.getElementById('mon-volume-limit-msg').classList.add('hidden');
  updateVolumiCount();
}

function createVolumeEntryHTML(index) {
  const removeBtn = index > 0
    ? `<button type="button" onclick="removeMonitoraggioVolume(this)" class="text-xs text-red-400 hover:text-red-600 transition-colors">
         <i class="fas fa-trash-alt mr-1"></i>Rimuovi
       </button>`
    : '';

  return `
    <div class="mon-volume-entry bg-gray-50 rounded-xl p-4 border border-gray-200" data-volume-index="${index}">
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-semibold text-gray-700">
          <i class="fas fa-book text-zanichelli-light mr-1"></i>Volume ${index + 1}
        </span>
        ${removeBtn}
      </div>
      <div class="space-y-3">
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Titolo del volume *</label>
          <input type="text" class="mon-vol-titolo w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-zanichelli-light outline-none"
                 placeholder="Es: Chimica Generale e Inorganica — Petrucci"
                 oninput="validateMonitoraggioForm()">
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Indice / Sommario dei capitoli *</label>
          <textarea class="mon-vol-indice w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-zanichelli-light outline-none" rows="4"
                    placeholder="Incolla qui l'indice del volume (capitoli principali). Necessario per l'analisi di allineamento."
                    oninput="validateMonitoraggioForm()"></textarea>
        </div>
      </div>
    </div>`;
}

function addMonitoraggioVolume() {
  const container = document.getElementById('mon-volumi-container');
  const entries = container.querySelectorAll('.mon-volume-entry');

  if (entries.length >= 5) return; // Hard limit

  const newIndex = entries.length;
  const div = document.createElement('div');
  div.innerHTML = createVolumeEntryHTML(newIndex);
  container.appendChild(div.firstElementChild);

  updateVolumiCount();
  validateMonitoraggioForm();

  // Se raggiunto il limite, nascondi il bottone e mostra il messaggio
  if (container.querySelectorAll('.mon-volume-entry').length >= 5) {
    document.getElementById('btn-add-volume').classList.add('hidden');
    document.getElementById('mon-volume-limit-msg').classList.remove('hidden');
  }
}

function removeMonitoraggioVolume(btn) {
  const entry = btn.closest('.mon-volume-entry');
  entry.remove();

  // Rinumera le entry rimaste
  const container = document.getElementById('mon-volumi-container');
  const entries = container.querySelectorAll('.mon-volume-entry');
  entries.forEach((el, i) => {
    el.dataset.volumeIndex = i;
    el.querySelector('.text-sm.font-semibold').innerHTML =
      `<i class="fas fa-book text-zanichelli-light mr-1"></i>Volume ${i + 1}`;
  });

  // Riabilita bottone aggiungi se sotto il limite
  if (entries.length < 5) {
    document.getElementById('btn-add-volume').classList.remove('hidden');
    document.getElementById('mon-volume-limit-msg').classList.add('hidden');
  }

  updateVolumiCount();
  validateMonitoraggioForm();
}

function updateVolumiCount() {
  const count = document.querySelectorAll('.mon-volume-entry').length;
  const label = document.getElementById('mon-volumi-count');
  if (label) label.textContent = `${count} di 5`;
}

function validateMonitoraggioForm() {
  const materia = document.getElementById('mon-materia')?.value.trim();
  const entries = document.querySelectorAll('.mon-volume-entry');
  const btn = document.getElementById('btn-avvia-monitoraggio');
  if (!btn) return;

  // Almeno un volume con titolo e indice compilati
  let hasValidVolume = false;
  entries.forEach(entry => {
    const titolo = entry.querySelector('.mon-vol-titolo')?.value.trim();
    const indice = entry.querySelector('.mon-vol-indice')?.value.trim();
    if (titolo && indice) hasValidVolume = true;
  });

  const isValid = materia && hasValidVolume;
  btn.disabled = !isValid;
}

// ===================================================
// CREAZIONE MONITORAGGIO
// ===================================================

async function handleCreateMonitoraggio(event) {
  event.preventDefault();

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    showToast('Sessione scaduta, effettua il login', 'error');
    return;
  }

  const materia = document.getElementById('mon-materia').value.trim();
  if (!materia) {
    showToast('Inserisci la materia da monitorare', 'warning');
    return;
  }

  // Raccogli volumi
  const entries = document.querySelectorAll('.mon-volume-entry');
  const volumi = [];
  entries.forEach(entry => {
    const titolo = entry.querySelector('.mon-vol-titolo')?.value.trim();
    const indice = entry.querySelector('.mon-vol-indice')?.value.trim();
    if (titolo && indice) {
      volumi.push({
        titolo: titolo,
        materia: materia,
        indice: indice,
        temi: [] // Saranno popolati via LLM nella Fase 2
      });
    }
  });

  if (volumi.length === 0) {
    showToast('Inserisci almeno un volume con titolo e indice', 'warning');
    return;
  }

  if (volumi.length > 5) {
    showToast('Massimo 5 volumi consentiti', 'warning');
    return;
  }

  // Costruisci il record
  const monitoraggio = {
    user_id: session.user.id,
    tipo: 'monitoraggio',
    libro_titolo: `Monitoraggio: ${materia}`,
    libro_materia: materia,
    libro_editore: 'Zanichelli',
    volumi_monitoraggio: volumi,
    stato: 'bozza'
  };

  try {
    const { data, error } = await supabaseClient
      .from('campagne')
      .insert(monitoraggio)
      .select()
      .single();

    if (error) throw error;

    showToast(`Monitoraggio "${materia}" creato con ${volumi.length} volum${volumi.length === 1 ? 'e' : 'i'}!`, 'success');
    hideMonitoraggioForm();
    await loadMonitoraggi();

    // Fase 2: qui verra avviata la generazione target
    // await generaTargetMonitoraggio(data.id);
    console.log('[Monitoraggio] Creato ID:', data.id, '— generazione target non ancora implementata (Fase 2)');

  } catch (e) {
    showToast('Errore creazione monitoraggio: ' + e.message, 'error');
    console.error('[Monitoraggio] Errore creazione:', e);
  }
}

// ===================================================
// ELIMINAZIONE
// ===================================================

async function deleteMonitoraggio(id) {
  if (!confirm('Eliminare questo monitoraggio? L\'operazione non e reversibile.')) return;

  try {
    const { error } = await supabaseClient
      .from('campagne')
      .delete()
      .eq('id', id);

    if (error) throw error;

    showToast('Monitoraggio eliminato', 'success');
    // Se era quello aperto, chiudi i risultati
    if (currentMonitoraggioId === id) {
      closeMonitoraggioResults();
    }
    await loadMonitoraggi();
  } catch (e) {
    showToast('Errore eliminazione: ' + e.message, 'error');
  }
}

// ===================================================
// VISUALIZZAZIONE TARGET
// ===================================================

function viewMonitoraggioTargets(monitoraggioId) {
  const mon = allMonitoraggi.find(m => m.id === monitoraggioId);
  if (!mon) return;

  currentMonTargets = mon.target_generati || [];
  currentMonitoraggioId = monitoraggioId;

  // Titolo
  document.getElementById('mon-result-title').textContent = mon.libro_materia || 'Monitoraggio';

  // Nascondi la colonna "Volume consigliato" se c'e un solo volume
  const volumi = mon.volumi_monitoraggio || [];
  const colVolume = document.getElementById('mon-col-volume');
  if (colVolume) {
    colVolume.style.display = volumi.length > 1 ? '' : 'none';
  }

  // Mostra il container risultati
  document.getElementById('monitoraggio-results-container').classList.remove('hidden');
  document.getElementById('monitoraggi-list').classList.add('hidden');
  document.getElementById('btn-new-monitoraggio').classList.add('hidden');

  // Render sintesi
  renderMonitoraggioSintesi(mon.sintesi_disciplina);

  // Render target
  renderMonitoraggioTargets(currentMonTargets, volumi.length > 1);
}

function closeMonitoraggioResults() {
  document.getElementById('monitoraggio-results-container').classList.add('hidden');
  document.getElementById('monitoraggi-list').classList.remove('hidden');
  document.getElementById('btn-new-monitoraggio').classList.remove('hidden');
  currentMonitoraggioId = null;
  currentMonTargets = [];
}

// ===================================================
// RENDERING: SINTESI DISCIPLINARE
// ===================================================

function renderMonitoraggioSintesi(sintesi) {
  const panel = document.getElementById('mon-sintesi-panel');
  if (!sintesi) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  document.getElementById('mon-stat-totale').textContent = sintesi.totale_docenti || 0;
  document.getElementById('mon-stat-difese').textContent = sintesi.difese_urgenti || 0;
  document.getElementById('mon-stat-upgrade').textContent = sintesi.upgrade_possibili || 0;
  document.getElementById('mon-stat-conquiste').textContent = sintesi.conquiste_possibili || 0;
  document.getElementById('mon-stat-nonvalutati').textContent = sintesi.non_valutati || 0;

  const notaEl = document.getElementById('mon-nota-strategica');
  if (sintesi.nota_strategica) {
    notaEl.innerHTML = `<i class="fas fa-lightbulb mr-1"></i>${sintesi.nota_strategica}`;
    notaEl.classList.remove('hidden');
  } else {
    notaEl.classList.add('hidden');
  }
}

// ===================================================
// RENDERING: TABELLA TARGET MONITORAGGIO
// ===================================================

function monitoraggioAzioneBadge(tipo) {
  const map = {
    'DIFESA': { label: 'Difesa', class: 'bg-red-100 text-red-700', icon: 'fa-shield-alt' },
    'UPGRADE': { label: 'Upgrade', class: 'bg-orange-100 text-orange-700', icon: 'fa-arrow-up' },
    'CONQUISTA': { label: 'Conquista', class: 'bg-green-100 text-green-700', icon: 'fa-flag' },
    'DA VERIFICARE': { label: 'Da verificare', class: 'bg-gray-100 text-gray-500', icon: 'fa-question-circle' }
  };
  const a = map[tipo] || { label: tipo || '—', class: 'bg-gray-100 text-gray-500', icon: 'fa-question-circle' };
  return `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${a.class}">
    <i class="fas ${a.icon} text-[10px]"></i>${a.label}
  </span>`;
}

function monitoraggioUrgenzaBadge(urgenza) {
  const map = {
    'ALTA': { label: 'Alta', class: 'bg-red-100 text-red-800' },
    'MEDIA': { label: 'Media', class: 'bg-orange-100 text-orange-700' },
    'BASSA': { label: 'Bassa', class: 'bg-gray-100 text-gray-500' }
  };
  const u = map[urgenza] || { label: urgenza || '—', class: 'bg-gray-100 text-gray-500' };
  return `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${u.class}">${u.label}</span>`;
}

function renderMonitoraggioTargets(targets, showVolumeColumn) {
  const tbody = document.getElementById('mon-target-table-body');

  if (!targets || targets.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="9" class="px-4 py-8 text-center text-gray-400">
        <i class="fas fa-binoculars text-3xl mb-2 block"></i>
        Nessun target generato — la generazione verra avviata nella Fase 2
      </td></tr>`;
    return;
  }

  tbody.innerHTML = targets.map((t, i) => {
    // Colore riga basato su urgenza
    const rowBg = t.urgenza === 'ALTA' ? 'bg-red-50/30' : t.urgenza === 'MEDIA' ? 'bg-orange-50/20' : '';

    // Colonna volume (visibile solo se multi-volume)
    const volumeCell = showVolumeColumn
      ? `<td class="px-4 py-3 text-sm text-gray-600">${truncate(t.volume_consigliato || '—', 35)}</td>`
      : `<td class="px-4 py-3 text-sm text-gray-600" style="display:none">${t.volume_consigliato || '—'}</td>`;

    // Pulsante email disabilitato per DA VERIFICARE
    const isVerificare = t.tipo_azione === 'DA VERIFICARE';
    const emailBtn = isVerificare
      ? `<button disabled class="px-3 py-1.5 bg-gray-200 text-gray-400 rounded-lg text-xs cursor-not-allowed whitespace-nowrap" title="Completa l'analisi prima di generare la mail">
           <i class="fas fa-envelope mr-1"></i>Mail
         </button>`
      : `<button onclick="generateMonitoraggioEmail(${i})" class="px-3 py-1.5 bg-zanichelli-blue text-white rounded-lg text-xs hover:bg-zanichelli-dark transition-colors whitespace-nowrap" title="Genera mail personalizzata">
           <i class="fas fa-envelope mr-1"></i>Mail
         </button>`;

    return `
      <tr class="border-t ${rowBg}">
        <td class="px-4 py-3 text-gray-500 text-xs">${i + 1}</td>
        <td class="px-4 py-3">
          <div class="font-medium text-gray-800">${t.docente_nome || '—'}</div>
          ${t.docente_email ? `<div class="text-xs text-gray-400">${t.docente_email}</div>` : ''}
        </td>
        <td class="px-4 py-3 text-gray-600 text-sm">
          ${t.ateneo || '—'}
          ${t.classe_laurea ? `<div class="text-xs text-gray-400">${t.classe_laurea}</div>` : ''}
        </td>
        <td class="px-4 py-3">${scenarioBadge(t.scenario)}</td>
        ${volumeCell}
        <td class="px-4 py-3">${monitoraggioAzioneBadge(t.tipo_azione)}</td>
        <td class="px-4 py-3">${monitoraggioUrgenzaBadge(t.urgenza)}</td>
        <td class="px-4 py-3 text-sm text-gray-600 max-w-xs">
          ${t.motivazione_scelta ? truncate(t.motivazione_scelta, 100) : '<span class="text-gray-400 italic">In attesa di analisi</span>'}
        </td>
        <td class="px-4 py-3 text-center">
          <div class="flex flex-col gap-1.5 items-center">
            <button onclick="refreshMonitoraggioDocente(${i})" 
                    class="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs hover:bg-amber-600 transition-colors whitespace-nowrap"
                    title="Rigenera l'analisi per questo docente">
              <i class="fas fa-sync-alt"></i>
            </button>
            ${emailBtn}
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ===================================================
// AZIONI SUI TARGET (PLACEHOLDER FASE 2)
// ===================================================

async function refreshMonitoraggioDocente(targetIndex) {
  // Fase 2: richiamera generaMatchingMultiVolume per il singolo docente
  showToast('Rigenerazione singola non ancora implementata (Fase 2)', 'info');
  console.log('[Monitoraggio] Refresh docente index:', targetIndex);
}

async function generateMonitoraggioEmail(targetIndex) {
  // Fase 2: generera email usando il volume ottimale come riferimento
  showToast('Generazione email non ancora implementata (Fase 2)', 'info');
  console.log('[Monitoraggio] Email docente index:', targetIndex);
}

// ===================================================
// EXPORT CSV
// ===================================================

function exportMonitoraggioCSV() {
  if (!currentMonTargets || currentMonTargets.length === 0) {
    showToast('Nessun dato da esportare', 'warning');
    return;
  }

  const mon = allMonitoraggi.find(m => m.id === currentMonitoraggioId);
  const materia = mon?.libro_materia || 'monitoraggio';
  const volumi = mon?.volumi_monitoraggio || [];
  const showVolume = volumi.length > 1;

  // Header
  let headers = ['#', 'Docente', 'Email', 'Ateneo', 'Classe', 'Scenario'];
  if (showVolume) headers.push('Volume consigliato');
  headers.push('Azione', 'Urgenza', 'Motivazione');

  // Righe
  const rows = currentMonTargets.map((t, i) => {
    let row = [
      i + 1,
      t.docente_nome || '',
      t.docente_email || '',
      t.ateneo || '',
      t.classe_laurea || '',
      t.scenario || ''
    ];
    if (showVolume) row.push(t.volume_consigliato || '');
    row.push(
      t.tipo_azione || '',
      t.urgenza || '',
      (t.motivazione_scelta || '').replace(/"/g, '""')
    );
    return row;
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const dateStr = new Date().toISOString().split('T')[0];
  downloadCSV(csvContent, `monitoraggio_${materia.replace(/\s+/g, '_')}_${dateStr}.csv`);
  showToast('CSV esportato!', 'success');
}

// ===================================================
// INIZIALIZZAZIONE — listener per validazione form
// ===================================================

document.addEventListener('DOMContentLoaded', () => {
  const materiaInput = document.getElementById('mon-materia');
  if (materiaInput) {
    materiaInput.addEventListener('input', validateMonitoraggioForm);
  }
});
