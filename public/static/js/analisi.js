// ==========================================
// MATRIX Intelligence — Analisi Unificata
// ==========================================
// Orchestratore che unifica Campagna novità e Monitoraggio disciplinare.
// Flusso: Seleziona materia → Seleziona volumi → Avvia analisi
//   - 1 volume  → flusso Campagna (campagna.js)
//   - 2+ volumi → flusso Monitoraggio (monitoraggio.js)
// Le sezioni legacy Campagne e Monitoraggio restano come motori,
// ma l'utente interagisce solo con questa sezione.

let allAnalisi = []; // Tutte le analisi (campagne + monitoraggi) dell'utente

// ===================================================
// PROGRESS BAR — visibile nella sezione Analisi
// ===================================================

function showAnalisiProgress(title) {
  const container = document.getElementById('analisi-progress');
  if (!container) return;
  container.classList.remove('hidden');
  const titleEl = document.getElementById('analisi-progress-title');
  if (titleEl) titleEl.textContent = title || 'Analisi in corso...';
  updateAnalisiProgress(0, 1, 'Preparazione...');
  // Nascondi lista e form
  const list = document.getElementById('analisi-list');
  if (list) list.classList.add('hidden');
  const btn = document.getElementById('btn-new-analisi');
  if (btn) btn.classList.add('hidden');
}

function updateAnalisiProgress(current, total, detail) {
  const bar = document.getElementById('analisi-progress-bar');
  const text = document.getElementById('analisi-progress-text');
  const detailEl = document.getElementById('analisi-progress-detail');
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  if (bar) bar.style.width = pct + '%';
  if (text) text.textContent = `${current}/${total}`;
  if (detailEl) detailEl.textContent = detail || '';
}

function hideAnalisiProgress() {
  const container = document.getElementById('analisi-progress');
  if (container) container.classList.add('hidden');
  // Ripristina lista e bottone
  const list = document.getElementById('analisi-list');
  if (list) list.classList.remove('hidden');
  const btn = document.getElementById('btn-new-analisi');
  if (btn) btn.classList.remove('hidden');
}

// ===================================================
// CARICAMENTO E LISTA ANALISI
// ===================================================

async function loadAnalisi() {
  if (!supabaseClient) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return;

  // Carica risorse condivise in background
  loadCatalog();
  loadFrameworks();

  try {
    const { data, error } = await supabaseClient
      .from('campagne')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    allAnalisi = data || [];

    // Determina il tipo in base ai dati (la colonna 'tipo' potrebbe non esistere)
    // Un record è monitoraggio se ha volumi_monitoraggio con 2+ volumi, oppure tipo === 'monitoraggio'
    allAnalisi.forEach(a => {
      if (!a.tipo) {
        a.tipo = (a.volumi_monitoraggio && a.volumi_monitoraggio.length > 1) ? 'monitoraggio' : 'campagna';
      }
    });

    // Aggiorna anche le liste interne di campagna.js e monitoraggio.js
    allCampaigns = allAnalisi.filter(a => a.tipo !== 'monitoraggio');
    allMonitoraggi = allAnalisi.filter(a => a.tipo === 'monitoraggio');

    renderAnalisiList();
  } catch (e) {
    showToast('Errore caricamento analisi: ' + e.message, 'error');
  }
}

function renderAnalisiList() {
  const container = document.getElementById('analisi-list');
  if (!container) return;

  if (allAnalisi.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-gray-400">
        <i class="fas fa-microscope text-4xl mb-3 block"></i>
        <p>Nessuna analisi creata</p>
        <p class="text-sm mt-1">Crea la tua prima analisi per generare intelligence di mercato</p>
      </div>`;
    return;
  }

  container.innerHTML = allAnalisi.map(a => {
    const isMonitoraggio = a.tipo === 'monitoraggio';
    const targetCount = (a.target_generati || []).length;
    const volumi = a.volumi_monitoraggio || [];
    const volumiCount = volumi.length;

    // Icona e tipo
    const tipoIcon = isMonitoraggio ? 'fa-binoculars' : 'fa-bullseye';
    const tipoLabel = isMonitoraggio ? 'Monitoraggio' : 'Campagna';
    const tipoBadgeClass = isMonitoraggio ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700';

    // Titolo
    const titolo = isMonitoraggio
      ? (a.libro_materia || 'Monitoraggio')
      : (a.libro_titolo || 'Campagna senza titolo');
    const sottotitolo = isMonitoraggio
      ? (volumi.map(v => v.titolo).filter(Boolean).join(', ') || 'Nessun volume')
      : `${a.libro_autore || ''} ${a.libro_editore ? '— ' + a.libro_editore : ''}`;

    // Badge stato
    let statusBadge;
    if (a.stato === 'completata' && targetCount > 0) {
      statusBadge = '<span class="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium"><i class="fas fa-check-circle mr-1"></i>Completata</span>';
    } else if (targetCount > 0) {
      statusBadge = '<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium"><i class="fas fa-spinner mr-1"></i>In elaborazione</span>';
    } else {
      statusBadge = '<span class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium"><i class="fas fa-edit mr-1"></i>Bozza</span>';
    }

    // Pre-valutazione (solo campagne)
    const isPreVal = !isMonitoraggio && a.stato === 'bozza' && targetCount > 0;
    if (isPreVal) {
      statusBadge = '<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium"><i class="fas fa-search mr-1"></i>Pre-valutazione</span>';
    }

    // Bottoni azioni
    let actionButtons = '';
    if (targetCount > 0) {
      actionButtons += `
        <button onclick="viewAnalisiResults('${a.id}')" class="px-3 py-1.5 bg-zanichelli-accent text-zanichelli-blue rounded-lg text-sm hover:bg-blue-100 transition-colors" title="Vedi risultati">
          <i class="fas fa-list mr-1"></i>Risultati
        </button>`;
    }
    if (isPreVal) {
      actionButtons += `
        <button onclick="showCompleteCampaign('${a.id}')" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors" title="Aggiungi indice e rigenera">
          <i class="fas fa-plus-circle mr-1"></i>Completa
        </button>`;
    }
    if (targetCount === 0 && a.stato !== 'completata') {
      const genFn = isMonitoraggio
        ? `generaTargetMonitoraggio('${a.id}')`
        : `generateTargets('${a.id}')`;
      actionButtons += `
        <button onclick="${genFn}" class="px-3 py-1.5 bg-zanichelli-blue text-white rounded-lg text-sm hover:bg-zanichelli-dark transition-colors" title="Genera analisi">
          <i class="fas fa-magic mr-1"></i>Genera
        </button>`;
    }
    if (a.stato === 'completata' && targetCount > 0) {
      const regenFn = isMonitoraggio
        ? `generaTargetMonitoraggio('${a.id}')`
        : `generateTargets('${a.id}')`;
      actionButtons += `
        <button onclick="${regenFn}" class="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors" title="Rigenera">
          <i class="fas fa-sync-alt mr-1"></i>
        </button>`;
    }

    return `
      <div class="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-1">
              <h3 class="font-semibold text-gray-800">
                <i class="fas ${tipoIcon} text-zanichelli-light mr-1.5 text-sm"></i>
                ${titolo}
              </h3>
              <span class="px-2 py-0.5 ${tipoBadgeClass} rounded-full text-[10px] font-medium uppercase">${tipoLabel}</span>
              ${statusBadge}
            </div>
            <p class="text-sm text-gray-500">${sottotitolo}</p>
            <div class="flex items-center gap-4 mt-2 text-xs text-gray-400">
              <span><i class="fas fa-tag mr-1"></i>${a.libro_materia || '—'}</span>
              ${isMonitoraggio ? `<span><i class="fas fa-book mr-1"></i>${volumiCount} volum${volumiCount === 1 ? 'e' : 'i'}</span>` : ''}
              <span><i class="fas fa-users mr-1"></i>${targetCount} target</span>
              <span><i class="fas fa-calendar mr-1"></i>${formatDate(a.created_at)}</span>
            </div>
            ${isPreVal ? `<div class="mt-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg inline-flex items-center gap-1">
               <i class="fas fa-lightbulb"></i>
               Aggiungi l'indice del volume per motivazioni personalizzate
             </div>` : ''}
          </div>
          <div class="flex items-center gap-2 ml-4">
            ${actionButtons}
            <button onclick="deleteAnalisi('${a.id}', ${isMonitoraggio})" class="text-gray-400 hover:text-red-500 p-1" title="Elimina">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ===================================================
// VISUALIZZA RISULTATI ANALISI
// ===================================================

function viewAnalisiResults(analisiId) {
  const analisi = allAnalisi.find(a => a.id === analisiId);
  if (!analisi) return;

  const isMonitoraggio = analisi.tipo === 'monitoraggio';

  if (isMonitoraggio) {
    // Delega a monitoraggio.js
    // Prima assicuriamo che allMonitoraggi sia aggiornato
    if (!allMonitoraggi.find(m => m.id === analisiId)) {
      allMonitoraggi = allAnalisi.filter(a => a.tipo === 'monitoraggio');
    }
    // Naviga alla sezione monitoraggio e mostra risultati
    navigateTo('monitoraggio');
    setTimeout(() => viewMonitoraggioTargets(analisiId), 100);
  } else {
    // Delega a campagna.js
    if (!allCampaigns.find(c => c.id === analisiId)) {
      allCampaigns = allAnalisi.filter(a => a.tipo !== 'monitoraggio');
    }
    navigateTo('campagne');
    setTimeout(() => viewTargets(analisiId), 100);
  }
}

// ===================================================
// ELIMINA ANALISI
// ===================================================

async function deleteAnalisi(id, isMonitoraggio) {
  const tipo = isMonitoraggio ? 'monitoraggio' : 'campagna';
  if (!confirm(`Eliminare questa ${tipo} e tutti i risultati generati?`)) return;

  try {
    const { error } = await supabaseClient.from('campagne').delete().eq('id', id);
    if (error) throw error;

    showToast('Analisi eliminata', 'success');
    await loadAnalisi();
  } catch (e) {
    showToast('Errore eliminazione: ' + e.message, 'error');
  }
}

// ===================================================
// FORM: NUOVA ANALISI
// ===================================================

async function showNewAnalisiForm() {
  document.getElementById('analisi-form-container').classList.remove('hidden');
  document.getElementById('btn-new-analisi').classList.add('hidden');
  document.getElementById('analisi-list').classList.add('hidden');

  // Carica catalogo
  await loadCatalog();

  // Popola dropdown materie dal catalogo (tutte le materie con volumi Zanichelli)
  const materiaSelect = document.getElementById('analisi-materia');
  materiaSelect.innerHTML = '<option value="">— Seleziona materia dal catalogo —</option>';

  const materieConVolumi = {};
  for (const m of catalogManuals) {
    if (m.is_zanichelli && m.subject) {
      if (!materieConVolumi[m.subject]) materieConVolumi[m.subject] = 0;
      materieConVolumi[m.subject]++;
    }
  }

  Object.keys(materieConVolumi).sort().forEach(mat => {
    const opt = document.createElement('option');
    opt.value = mat;
    opt.textContent = `${mat} (${materieConVolumi[mat]} volumi Zanichelli)`;
    materiaSelect.appendChild(opt);
  });

  // Reset
  document.getElementById('analisi-volumi-section').classList.add('hidden');
  document.getElementById('analisi-volumi-container').innerHTML = '';
  document.getElementById('analisi-docenti-count').classList.add('hidden');
  const etichettaEl = document.getElementById('analisi-etichetta');
  if (etichettaEl) etichettaEl.value = '';
  validateAnalisiForm();
}

function hideAnalisiForm() {
  document.getElementById('analisi-form-container').classList.add('hidden');
  document.getElementById('btn-new-analisi').classList.remove('hidden');
  document.getElementById('analisi-list').classList.remove('hidden');
}

// ===================================================
// MATERIA CHANGE → Mostra volumi disponibili
// ===================================================

async function onAnalisiMateriaChange() {
  const materia = document.getElementById('analisi-materia').value;
  const volumiSection = document.getElementById('analisi-volumi-section');
  const volumiContainer = document.getElementById('analisi-volumi-container');
  const noVolumiMsg = document.getElementById('analisi-no-volumi-msg');
  const countEl = document.getElementById('analisi-volumi-count');
  const docentiCountEl = document.getElementById('analisi-docenti-count');

  if (!materia) {
    volumiSection.classList.add('hidden');
    docentiCountEl.classList.add('hidden');
    validateAnalisiForm();
    return;
  }

  // Mostra conteggio docenti disponibili
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      const { data: programs } = await supabaseClient
        .from('programmi')
        .select('id, materia_inferita')
        .eq('user_id', session.user.id);

      const matching = (programs || []).filter(p => checkSubjectMatch(materia, p.materia_inferita));
      docentiCountEl.classList.remove('hidden');
      if (matching.length > 0) {
        docentiCountEl.className = 'mt-2 text-xs px-3 py-2 rounded-lg bg-green-50 text-green-700';
        docentiCountEl.innerHTML = `<i class="fas fa-users mr-1"></i>${matching.length} docent${matching.length === 1 ? 'e' : 'i'} di ${materia} trovati nel tuo database`;
      } else {
        docentiCountEl.className = 'mt-2 text-xs px-3 py-2 rounded-lg bg-red-50 text-red-600';
        docentiCountEl.innerHTML = `<i class="fas fa-exclamation-triangle mr-1"></i>Nessun docente di ${materia} trovato. Carica prima i programmi dalla sezione Upload.`;
      }
    }
  } catch (e) {
    console.warn('[Analisi] Errore conteggio docenti:', e);
  }

  // Filtra volumi Zanichelli per la materia selezionata
  const volumiZan = catalogManuals.filter(m =>
    m.is_zanichelli && checkSubjectMatch(m.subject, materia)
  );

  volumiSection.classList.remove('hidden');

  if (volumiZan.length === 0) {
    volumiContainer.innerHTML = '';
    noVolumiMsg.classList.remove('hidden');
    countEl.textContent = '0 volumi';
    validateAnalisiForm();
    return;
  }

  noVolumiMsg.classList.add('hidden');
  countEl.textContent = `${volumiZan.length} volumi disponibili`;

  // Genera checkbox per ogni volume Zanichelli
  volumiContainer.innerHTML = volumiZan.map((v, i) => `
    <label class="analisi-volume-checkbox flex items-start gap-3 bg-gray-50 rounded-xl p-4 border border-gray-200 cursor-pointer hover:bg-blue-50/30 hover:border-zanichelli-light transition-colors"
           data-manual-id="${v.id}">
      <input type="checkbox" name="analisi-vol" value="${v.id}" onchange="validateAnalisiForm()"
             class="mt-1 w-4 h-4 text-zanichelli-blue rounded focus:ring-zanichelli-light">
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <span class="font-medium text-gray-800 text-sm">${v.title}</span>
          <span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium">Zanichelli</span>
        </div>
        <div class="text-xs text-gray-500 mt-0.5">${v.author} — ${v.chapters_count || '?'} capitoli</div>
        ${v.chapters_summary ? `<details class="mt-2">
          <summary class="text-xs text-zanichelli-light cursor-pointer hover:text-zanichelli-dark">Mostra indice capitoli</summary>
          <pre class="mt-1 text-xs text-gray-500 whitespace-pre-wrap max-h-32 overflow-y-auto bg-white p-2 rounded border">${v.chapters_summary.substring(0, 500)}${v.chapters_summary.length > 500 ? '\n...' : ''}</pre>
        </details>` : '<div class="text-xs text-amber-500 mt-1"><i class="fas fa-exclamation-circle mr-1"></i>Indice non disponibile nel catalogo</div>'}
      </div>
    </label>
  `).join('') + `
    <label class="analisi-volume-checkbox flex items-start gap-3 bg-amber-50 rounded-xl p-4 border-2 border-dashed border-amber-300 cursor-pointer hover:bg-amber-100/50 hover:border-amber-400 transition-colors"
           data-manual-id="__novita__">
      <input type="checkbox" name="analisi-vol" value="__novita__" onchange="validateAnalisiForm()"
             class="mt-1 w-4 h-4 text-amber-500 rounded focus:ring-amber-300">
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <span class="font-medium text-amber-800 text-sm"><i class="fas fa-star mr-1"></i>Volume non ancora disponibile (novita)</span>
        </div>
        <div class="text-xs text-amber-600 mt-0.5">Il nuovo volume non e ancora in catalogo. L'analisi partira come <strong>pre-valutazione</strong>: verranno analizzati i programmi dei docenti e identificate le leve per il cambio. Potrai completare l'analisi quando avrai l'indice del volume.</div>
      </div>
    </label>
  `;

  validateAnalisiForm();
}

// ===================================================
// VALIDAZIONE FORM
// ===================================================

function validateAnalisiForm() {
  const materia = document.getElementById('analisi-materia')?.value;
  const btn = document.getElementById('btn-avvia-analisi');
  if (!btn) return;

  // Checkbox selezionate (inclusa eventuale __novita__)
  const checked = document.querySelectorAll('input[name="analisi-vol"]:checked');
  const hasNovita = Array.from(checked).some(cb => cb.value === '__novita__');
  const catalogChecked = Array.from(checked).filter(cb => cb.value !== '__novita__');
  const totalSelected = checked.length;
  const isValid = materia && totalSelected > 0 && totalSelected <= 5;
  btn.disabled = !isValid;

  // Aggiorna contatore
  const countEl = document.getElementById('analisi-volumi-count');
  if (countEl && materia) {
    const total = document.querySelectorAll('input[name="analisi-vol"]').length - 1; // -1 per novita
    const novLabel = hasNovita ? ' + novita' : '';
    countEl.textContent = `${catalogChecked.length} selezionat${catalogChecked.length === 1 ? 'o' : 'i'} su ${total}${novLabel}`;
  }

  // Aggiorna badge tipo analisi e label pulsante
  const tipoBadge = document.getElementById('analisi-tipo-badge');
  const tipoLabel = document.getElementById('analisi-tipo-label');
  const btnLabel = document.getElementById('btn-avvia-analisi-label');

  if (totalSelected === 0) {
    if (tipoBadge) { tipoBadge.classList.add('hidden'); tipoBadge.innerHTML = ''; }
    if (tipoLabel) tipoLabel.textContent = '';
    if (btnLabel) btnLabel.textContent = 'Crea Analisi e Avvia';
  } else if (totalSelected === 1 && hasNovita) {
    // Solo novita selezionata → pre-valutazione pura
    if (tipoBadge) {
      tipoBadge.classList.remove('hidden');
      tipoBadge.innerHTML = `
        <div class="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <i class="fas fa-star mr-1"></i>
          <strong>Pre-valutazione novita</strong> — il volume non e ancora disponibile. Verranno analizzati i programmi dei docenti per identificare gap, leve e opportunita. Potrai completare l'analisi quando avrai l'indice.
        </div>`;
    }
    if (tipoLabel) tipoLabel.textContent = 'Tipo: Pre-valutazione novita';
    if (btnLabel) btnLabel.textContent = 'Crea Pre-valutazione e Genera Target';
  } else if (totalSelected === 1) {
    if (tipoBadge) {
      tipoBadge.classList.remove('hidden');
      tipoBadge.innerHTML = `
        <div class="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          <i class="fas fa-bullseye mr-1"></i>
          <strong>Campagna novita</strong> — analisi di mercato per un singolo volume: matching docenti, rilevanza e motivazioni personalizzate.
        </div>`;
    }
    if (tipoLabel) tipoLabel.textContent = 'Tipo: Campagna novita (1 volume)';
    if (btnLabel) btnLabel.textContent = 'Crea Campagna e Genera Target';
  } else {
    if (tipoBadge) {
      tipoBadge.classList.remove('hidden');
      tipoBadge.innerHTML = `
        <div class="px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700">
          <i class="fas fa-binoculars mr-1"></i>
          <strong>Monitoraggio disciplinare</strong> — analisi strategica confrontando ${totalSelected}${hasNovita ? ' (incl. novita)' : ''} volumi Zanichelli con tutti i docenti della materia.
        </div>`;
    }
    if (tipoLabel) tipoLabel.textContent = `Tipo: Monitoraggio disciplinare (${checked.length} volumi)`;
    if (btnLabel) btnLabel.textContent = 'Crea Monitoraggio e Avvia Analisi';
  }
}

// ===================================================
// CREAZIONE ANALISI
// ===================================================

async function handleCreateAnalisi(event) {
  event.preventDefault();

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    showToast('Sessione scaduta, effettua il login', 'error');
    return;
  }

  const materia = document.getElementById('analisi-materia').value;
  if (!materia) {
    showToast('Seleziona la materia', 'warning');
    return;
  }

  const etichetta = document.getElementById('analisi-etichetta')?.value?.trim() || '';

  // Raccogli volumi selezionati (checkbox)
  const checkedBoxes = document.querySelectorAll('input[name="analisi-vol"]:checked');
  const hasNovita = Array.from(checkedBoxes).some(cb => cb.value === '__novita__');

  const volumi = [];

  // Aggiungi volumi dal catalogo
  checkedBoxes.forEach(cb => {
    if (cb.value === '__novita__') return; // gestito sotto
    const manual = catalogManuals.find(m => m.id === cb.value);
    if (manual) {
      volumi.push({
        id: manual.id,
        titolo: manual.title,
        autore: manual.author,
        editore: manual.publisher,
        materia: manual.subject,
        indice: manual.chapters_summary || '',
        chapters_count: manual.chapters_count || 0,
        temi: []
      });
    }
  });

  // Se selezionato "Volume non ancora disponibile" → volume novita placeholder
  if (hasNovita) {
    volumi.push({
      id: 'novita_' + Date.now(),
      titolo: 'Volume novita — ' + materia,
      autore: '',
      editore: 'Zanichelli',
      materia: materia,
      indice: '',
      chapters_count: 0,
      temi: [],
      is_novita: true
    });
  }

  if (volumi.length === 0) {
    showToast('Seleziona almeno un volume', 'warning');
    return;
  }
  if (volumi.length > 5) {
    showToast('Massimo 5 volumi consentiti', 'warning');
    return;
  }

  // BIFORCAZIONE: 1 volume → Campagna, 2+ → Monitoraggio
  const isMonitoraggio = volumi.length > 1;

  if (isMonitoraggio) {
    await createAnalisiMonitoraggio(session, materia, etichetta, volumi);
  } else {
    await createAnalisiCampagna(session, materia, etichetta, volumi[0]);
  }
}

// --- Crea analisi di tipo Campagna (1 volume) ---
async function createAnalisiCampagna(session, materia, etichetta, volume) {
  const isNovita = !!volume.is_novita;
  const titolo = isNovita
    ? (etichetta ? `Novita: ${materia} — ${etichetta}` : `Novita: ${materia}`)
    : volume.titolo;

  const campaign = {
    user_id: session.user.id,
    libro_titolo: titolo,
    libro_autore: volume.autore || '',
    libro_editore: volume.editore || 'Zanichelli',
    libro_materia: materia,
    libro_indice: volume.indice || null,
    libro_temi: [],
    stato: 'bozza'
  };

  try {
    const { data, error } = await supabaseClient.from('campagne').insert(campaign).select().single();
    if (error) throw error;

    const progressLabel = isNovita
      ? `Pre-valutazione novita: ${materia}`
      : `Campagna novita: ${volume.titolo}`;
    showToast(`${isNovita ? 'Pre-valutazione' : 'Campagna'} "${titolo}" creata! Generazione target in corso...`, 'success');
    hideAnalisiForm();

    // Mostra barra di progresso nella sezione Analisi
    showAnalisiProgress(progressLabel);
    updateAnalisiProgress(0, 1, 'Generazione target in corso — analisi dei programmi...');

    // Genera i target (delega a campagna.js)
    await generateTargets(data.id);

    hideAnalisiProgress();
    // Ricarica per aggiornare lo stato
    await loadAnalisi();
  } catch (e) {
    hideAnalisiProgress();
    showToast('Errore creazione campagna: ' + e.message, 'error');
  }
}

// --- Crea analisi di tipo Monitoraggio (2+ volumi) ---
async function createAnalisiMonitoraggio(session, materia, etichetta, volumi) {
  const titoloLabel = etichetta
    ? `Monitoraggio: ${materia} — ${etichetta}`
    : `Monitoraggio: ${materia}`;

  const monitoraggio = {
    user_id: session.user.id,
    tipo: 'monitoraggio',
    libro_titolo: titoloLabel,
    libro_materia: materia,
    libro_editore: 'Zanichelli',
    volumi_monitoraggio: volumi,
    stato: 'bozza'
  };

  try {
    // Prima prova con il campo 'tipo'
    let { data, error } = await supabaseClient.from('campagne').insert(monitoraggio).select().single();

    // Se la colonna 'tipo' non esiste, riprova senza
    if (error && error.message && error.message.includes('tipo')) {
      console.warn('[Analisi] Colonna tipo non presente, retry senza campo tipo');
      const { tipo, ...monSenzaTipo } = monitoraggio;
      const retry = await supabaseClient.from('campagne').insert(monSenzaTipo).select().single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;

    // Imposta tipo localmente per la UI anche se non salvato nel DB
    if (!data.tipo) data.tipo = 'monitoraggio';

    showToast(`Monitoraggio "${materia}" creato con ${volumi.length} volumi!`, 'success');
    hideAnalisiForm();

    // Mostra barra di progresso nella sezione Analisi
    showAnalisiProgress(`Monitoraggio disciplinare: ${materia}`);
    updateAnalisiProgress(0, 1, `Avvio analisi di ${volumi.length} volumi...`);

    // Aggiorna allMonitoraggi per la generazione
    allMonitoraggi.unshift(data);

    await loadAnalisi();

    // Avvia la generazione (delega a monitoraggio.js)
    await generaTargetMonitoraggio(data.id);

    hideAnalisiProgress();
    await loadAnalisi();
  } catch (e) {
    hideAnalisiProgress();
    showToast('Errore creazione monitoraggio: ' + e.message, 'error');
  }
}

// ===================================================
// FUNZIONI DI SUPPORTO PER CHIUSURA RISULTATI
// ===================================================

// Funzione chiamata da monitoraggio.js closeMonitoraggioResults()
// per tornare alla sezione Analisi invece che alla lista monitoraggi
function closeAnalisiMonitoraggioResults() {
  // Chiudi i risultati monitoraggio
  const resultsContainer = document.getElementById('monitoraggio-results-container');
  if (resultsContainer) resultsContainer.classList.add('hidden');

  // Mostra nuovamente la lista monitoraggi (per compatibilita)
  const monList = document.getElementById('monitoraggi-list');
  if (monList) monList.classList.remove('hidden');
  const btnNew = document.getElementById('btn-new-monitoraggio');
  if (btnNew) btnNew.classList.remove('hidden');

  // Torna alla sezione Analisi
  navigateTo('analisi');
}

// Funzione per tornare alla sezione Analisi dalla vista Campagne
function closeAnalisiCampaignResults() {
  const resultsContainer = document.getElementById('target-results-container');
  if (resultsContainer) resultsContainer.classList.add('hidden');

  navigateTo('analisi');
}

// ===================================================
// HELPER: getZanichelliFromCatalog (usato da campagna.js)
// ===================================================
// Questa funzione e definita qui perche usata da isZanichelliAuthor in campagna.js
// Se non esiste ancora, la definiamo

if (typeof getZanichelliFromCatalog !== 'function') {
  function getZanichelliFromCatalog() {
    if (!catalogManuals || !catalogManuals.length) return [];
    return catalogManuals.filter(m => m.is_zanichelli);
  }
  window.getZanichelliFromCatalog = getZanichelliFromCatalog;
}
