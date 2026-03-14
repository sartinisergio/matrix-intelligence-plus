// ==========================================
// MATRIX Intelligence — Staging Programmi
// Area di verifica prima della promozione al Database
// ==========================================

let stagingPrograms = [];

// --- Carica programmi in staging ---
async function loadStaging() {
  if (!supabaseClient) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return;

  // Carica catalogo e framework per i semafori
  await loadCatalog();
  await loadFrameworks();

  try {
    const { data, error } = await supabaseClient
      .from('programmi')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('stato', 'staging')
      .order('created_at', { ascending: false });

    if (error) throw error;

    stagingPrograms = data || [];
    populateStagingFilters();
    applyStagingFilters();
    updateStagingSummary();
  } catch (e) {
    showToast('Errore caricamento staging: ' + e.message, 'error');
  }
}

// --- Riepilogo staging ---
function updateStagingSummary() {
  const el = document.getElementById('staging-summary');
  if (!el) return;

  if (stagingPrograms.length === 0) {
    el.innerHTML = '';
    return;
  }

  const verified = stagingPrograms.filter(p => p.dati_verificati).length;
  const notVerified = stagingPrograms.length - verified;
  
  const materie = [...new Set(stagingPrograms.map(p => p.materia_inferita).filter(Boolean))];
  let fwMissing = [];
  let catMissing = [];
  
  for (const m of materie) {
    const fw = findFrameworkForSubject(m);
    if (!fw) fwMissing.push(m);
    const manuals = findManualsForSubject(m);
    if (!manuals || manuals.length === 0) catMissing.push(m);
  }

  const promotable = stagingPrograms.filter(p => {
    if (!p.dati_verificati) return false;
    const fw = findFrameworkForSubject(p.materia_inferita);
    const manuals = findManualsForSubject(p.materia_inferita);
    return fw && manuals && manuals.length > 0;
  }).length;

  el.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
      <div class="bg-white rounded-xl shadow-sm border p-4 text-center">
        <div class="text-2xl font-bold text-gray-800">${stagingPrograms.length}</div>
        <div class="text-xs text-gray-500 mt-1">In staging</div>
      </div>
      <div class="bg-white rounded-xl shadow-sm border p-4 text-center">
        <div class="text-2xl font-bold ${verified === stagingPrograms.length ? 'text-green-600' : 'text-amber-500'}">${verified}</div>
        <div class="text-xs text-gray-500 mt-1">Dati verificati</div>
      </div>
      <div class="bg-white rounded-xl shadow-sm border p-4 text-center">
        <div class="text-2xl font-bold ${fwMissing.length === 0 ? 'text-green-600' : 'text-red-500'}">${materie.length - fwMissing.length}/${materie.length}</div>
        <div class="text-xs text-gray-500 mt-1">Framework disponibili</div>
      </div>
      <div class="bg-white rounded-xl shadow-sm border p-4 text-center">
        <div class="text-2xl font-bold ${promotable > 0 ? 'text-green-600' : 'text-gray-400'}">${promotable}</div>
        <div class="text-xs text-gray-500 mt-1">Pronti per Database</div>
      </div>
    </div>
    ${fwMissing.length > 0 ? `
    <div class="mt-3 bg-red-50 border border-red-200 rounded-xl p-3">
      <p class="text-sm font-medium text-red-700"><i class="fas fa-exclamation-triangle mr-1"></i>Framework mancanti per: ${fwMissing.join(', ')}</p>
      <p class="text-xs text-red-500 mt-1">Segnala al gestore per la creazione del framework.</p>
    </div>` : ''}
    ${catMissing.length > 0 ? `
    <div class="mt-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
      <p class="text-sm font-medium text-orange-600"><i class="fas fa-book mr-1"></i>Catalogo manuali mancante per: ${catMissing.join(', ')}</p>
      <p class="text-xs text-orange-500 mt-1">Segnala al gestore per l'aggiornamento del catalogo.</p>
    </div>` : ''}
    ${promotable > 0 ? `
    <div class="mt-3 flex justify-end">
      <button onclick="promoteAllReady()" 
              class="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors flex items-center gap-2">
        <i class="fas fa-arrow-right"></i>
        Promuovi tutti i pronti al Database (${promotable})
      </button>
    </div>` : ''}
  `;
}

// --- Filtri staging ---
function populateStagingFilters() {
  const materie = [...new Set(stagingPrograms.map(p => p.materia_inferita).filter(Boolean))].sort();
  const select = document.getElementById('staging-filter-materia');
  if (!select) return;
  
  const current = select.value;
  select.innerHTML = '<option value="">Tutte le materie</option>' +
    materie.map(m => `<option value="${m}">${m}</option>`).join('');
  select.value = current;
}

function applyStagingFilters() {
  const search = (document.getElementById('staging-filter-search')?.value || '').toLowerCase();
  const materia = document.getElementById('staging-filter-materia')?.value || '';

  let filtered = stagingPrograms.filter(p => {
    if (search) {
      const str = `${p.docente_nome} ${p.ateneo} ${p.materia_inferita} ${p.corso_laurea}`.toLowerCase();
      if (!str.includes(search)) return false;
    }
    if (materia && p.materia_inferita !== materia) return false;
    return true;
  });

  renderStagingList(filtered);
  const countEl = document.getElementById('staging-count');
  if (countEl) countEl.textContent = `${filtered.length} programmi`;
}

function resetStagingFilters() {
  const s = document.getElementById('staging-filter-search');
  const m = document.getElementById('staging-filter-materia');
  if (s) s.value = '';
  if (m) m.value = '';
  applyStagingFilters();
}

// --- Badge relazione docente-manuale ---
function relazioneBadge(relazione) {
  const config = {
    'autore':              { color: 'bg-red-100 text-red-700 border-red-200',          icon: 'fa-pen-nib',        label: 'Autore del manuale' },
    'coautore':            { color: 'bg-red-100 text-red-700 border-red-200',          icon: 'fa-pen-nib',        label: 'Coautore del manuale' },
    'curatore':            { color: 'bg-orange-100 text-orange-700 border-orange-200', icon: 'fa-clipboard-list', label: 'Curatore del manuale' },
    'traduttore':          { color: 'bg-orange-100 text-orange-700 border-orange-200', icon: 'fa-language',       label: 'Traduttore del manuale' },
    'collega_ateneo':      { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: 'fa-university',     label: 'Collega stesso Ateneo' },
    'collega_dipartimento':{ color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: 'fa-door-open',      label: 'Collega stesso Dip.' }
  };
  if (!relazione || relazione === 'nessuna') return '';
  const c = config[relazione] || { color: 'bg-gray-100 text-gray-600 border-gray-200', icon: 'fa-link', label: relazione };
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.color}">
    <i class="fas ${c.icon} text-[10px]"></i>${c.label}
  </span>`;
}

// --- Render lista staging ---
function renderStagingList(programs) {
  const container = document.getElementById('staging-list');
  if (!container) return;

  if (programs.length === 0) {
    container.innerHTML = `
      <div class="text-center text-gray-400 py-12">
        <i class="fas fa-inbox text-3xl mb-2 block"></i>
        Nessun programma in staging. Carica dei PDF dalla sezione Upload.
      </div>`;
    return;
  }

  container.innerHTML = programs.map(p => {
    const mainManual = (p.manuali_citati || []).find(m => m.ruolo === 'principale');
    const manualText = mainManual ? `${mainManual.autore || ''} — ${mainManual.titolo || ''}` : 'Nessun manuale citato';
    
    // Semafori
    const dataOk = p.dati_verificati;
    const fw = findFrameworkForSubject(p.materia_inferita);
    const fwOk = !!fw;
    const manuals = findManualsForSubject(p.materia_inferita);
    const catOk = manuals && manuals.length > 0;
    const allOk = dataOk && fwOk && catOk;

    return `
      <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div class="p-4">
          <!-- Header riga -->
          <div class="flex items-start justify-between mb-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-semibold text-gray-800">${p.docente_nome || 'Docente non identificato'}</span>
                ${p.docente_email ? `<span class="text-xs text-gray-400">${p.docente_email}</span>` : ''}
              </div>
              <div class="text-sm text-gray-500 mt-0.5">
                ${p.ateneo || '—'} · ${p.materia_inferita || '—'} · ${p.classe_laurea || '—'}
              </div>
              <div class="text-xs text-gray-400 mt-1">
                <i class="fas fa-book text-gray-300 mr-1"></i>${truncate(manualText, 60)}
              </div>
            </div>
            <div class="flex items-center gap-2 flex-wrap justify-end">
              ${scenarioBadge(p.scenario_zanichelli)}
              ${relazioneBadge(p.relazione_docente_manuale)}
            </div>
          </div>

          <!-- Semafori -->
          <div class="flex items-center gap-4 mb-3 py-2 px-3 bg-gray-50 rounded-lg">
            <div class="flex items-center gap-1.5">
              <i class="fas fa-circle text-xs ${dataOk ? 'text-green-500' : 'text-red-500'}"></i>
              <span class="text-xs ${dataOk ? 'text-green-700' : 'text-red-600'}">Dati verificati</span>
            </div>
            <div class="flex items-center gap-1.5">
              <i class="fas fa-circle text-xs ${fwOk ? 'text-green-500' : 'text-red-500'}"></i>
              <span class="text-xs ${fwOk ? 'text-green-700' : 'text-red-600'}">Framework</span>
            </div>
            <div class="flex items-center gap-1.5">
              <i class="fas fa-circle text-xs ${catOk ? 'text-green-500' : 'text-red-500'}"></i>
              <span class="text-xs ${catOk ? 'text-green-700' : 'text-red-600'}">Catalogo manuali</span>
            </div>
          </div>

          <!-- Azioni -->
          <div class="flex items-center gap-2 flex-wrap">
            ${!dataOk ? `
              <button onclick="verifyStagingData('${p.id}')" 
                      class="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors">
                <i class="fas fa-check mr-1"></i>Verifica dati
              </button>` : `
              <span class="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium">
                <i class="fas fa-check-circle mr-1"></i>Dati OK
              </span>
              <button onclick="unverifyStagingData('${p.id}')" 
                      class="text-gray-400 hover:text-gray-600 text-xs" title="Annulla verifica">
                <i class="fas fa-undo"></i>
              </button>`}
            
            <button onclick="editStagingProgram('${p.id}')" 
                    class="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200 transition-colors">
              <i class="fas fa-edit mr-1"></i>Modifica
            </button>
            
            <button onclick="deleteStagingProgram('${p.id}')" 
                    class="px-3 py-1.5 bg-gray-100 text-red-500 rounded-lg text-xs hover:bg-red-50 transition-colors">
              <i class="fas fa-trash-alt mr-1"></i>Elimina
            </button>

            ${!fwOk ? `
              <button onclick="reportMissing('${p.materia_inferita}', 'framework')" 
                      class="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs hover:bg-red-100 transition-colors ml-auto">
                <i class="fas fa-flag mr-1"></i>Segnala framework mancante
              </button>` : ''}

            ${!catOk ? `
              <button onclick="reportMissing('${p.materia_inferita}', 'catalogo')" 
                      class="px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-xs hover:bg-orange-100 transition-colors ${fwOk ? 'ml-auto' : ''}">
                <i class="fas fa-flag mr-1"></i>Segnala catalogo mancante
              </button>` : ''}

            ${allOk ? `
              <button onclick="promoteSingle('${p.id}')" 
                      class="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 transition-colors ml-auto">
                <i class="fas fa-arrow-right mr-1"></i>Promuovi al Database
              </button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

// --- Verifica dati (segna come verificati) ---
async function verifyStagingData(programId) {
  const p = stagingPrograms.find(p => p.id === programId);
  if (!p) return;

  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');

  content.innerHTML = `
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-gray-800">
        <i class="fas fa-clipboard-check text-amber-500 mr-2"></i>
        Verifica dati estratti
      </h3>
      <p class="text-sm text-gray-500">Controlla che i dati siano corretti. Se necessario, modifica prima di confermare.</p>
      
      <div class="bg-gray-50 rounded-lg p-4 space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-[10px] text-gray-400 uppercase tracking-wide">Docente</label>
            <p class="text-sm font-medium text-gray-800">${p.docente_nome || '<span class="text-red-400">Non identificato</span>'}</p>
          </div>
          <div>
            <label class="text-[10px] text-gray-400 uppercase tracking-wide">Email</label>
            <p class="text-sm text-gray-600">${p.docente_email || '—'}</p>
          </div>
          <div>
            <label class="text-[10px] text-gray-400 uppercase tracking-wide">Ateneo</label>
            <p class="text-sm text-gray-600">${p.ateneo || '<span class="text-red-400">Non identificato</span>'}</p>
          </div>
          <div>
            <label class="text-[10px] text-gray-400 uppercase tracking-wide">Materia</label>
            <p class="text-sm text-gray-600">${p.materia_inferita || '<span class="text-red-400">Non identificata</span>'}</p>
          </div>
          <div>
            <label class="text-[10px] text-gray-400 uppercase tracking-wide">Corso di Laurea</label>
            <p class="text-sm text-gray-600">${p.corso_laurea || '—'}</p>
          </div>
          <div>
            <label class="text-[10px] text-gray-400 uppercase tracking-wide">Classe di Laurea</label>
            <p class="text-sm text-gray-600">${p.classe_laurea || '—'}</p>
          </div>
        </div>
        
        <div>
          <label class="text-[10px] text-gray-400 uppercase tracking-wide">Manuali citati</label>
          <div class="mt-1 space-y-1">
            ${(p.manuali_citati || []).map(m => `
              <div class="text-xs text-gray-600 flex items-center gap-2">
                <i class="fas fa-book text-gray-300"></i>
                <span>${m.autore || '?'} — ${m.titolo || '?'} (${m.editore || '?'})</span>
                <span class="text-[10px] ${m.ruolo === 'principale' ? 'text-green-500' : 'text-gray-400'}">${m.ruolo || ''}</span>
              </div>
            `).join('') || '<p class="text-xs text-gray-400">Nessun manuale citato</p>'}
          </div>
        </div>

        <div>
          <label class="text-[10px] text-gray-400 uppercase tracking-wide">Relazione docente — manuale adottato</label>
          <select id="stg-relazione-select" 
                  class="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-amber-300 outline-none bg-white">
            <option value="nessuna"              ${(p.relazione_docente_manuale||'nessuna')==='nessuna'              ? 'selected':''}>Nessuna relazione particolare</option>
            <option value="autore"               ${p.relazione_docente_manuale==='autore'               ? 'selected':''}>✍️ Docente è AUTORE del manuale adottato</option>
            <option value="coautore"             ${p.relazione_docente_manuale==='coautore'             ? 'selected':''}>✍️ Docente è COAUTORE del manuale adottato</option>
            <option value="curatore"             ${p.relazione_docente_manuale==='curatore'             ? 'selected':''}>📋 Docente è CURATORE del manuale adottato</option>
            <option value="traduttore"           ${p.relazione_docente_manuale==='traduttore'           ? 'selected':''}>🌐 Docente è TRADUTTORE del manuale adottato</option>
            <option value="collega_ateneo"       ${p.relazione_docente_manuale==='collega_ateneo'       ? 'selected':''}>🏛️ Autore è collega dello stesso Ateneo</option>
            <option value="collega_dipartimento" ${p.relazione_docente_manuale==='collega_dipartimento' ? 'selected':''}>🏢 Autore è collega dello stesso Dipartimento</option>
          </select>
          <p class="text-[10px] text-gray-400 mt-1">
            <i class="fas fa-info-circle mr-1"></i>
            Questa informazione condiziona la strategia generata dall'AI e il tipo di approccio consigliato.
          </p>
        </div>

      </div>

      <div class="flex gap-3 pt-2">
        <button onclick="confirmVerification('${p.id}')" 
                class="flex-1 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors">
          <i class="fas fa-check mr-1"></i>Dati corretti — Conferma
        </button>
        <button onclick="editStagingProgram('${p.id}'); closeModal();" 
                class="px-4 py-2 bg-amber-100 text-amber-700 rounded-lg font-medium hover:bg-amber-200 transition-colors">
          <i class="fas fa-edit mr-1"></i>Modifica
        </button>
        <button onclick="closeModal()" 
                class="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
          Annulla
        </button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
}

// --- Conferma verifica ---
async function confirmVerification(programId) {
  const p = stagingPrograms.find(p => p.id === programId);
  if (!p) return;

  // Leggi il selettore relazione se presente nella modale
  const relazioneEl = document.getElementById('stg-relazione-select');
  const relazione = relazioneEl ? relazioneEl.value : (p.relazione_docente_manuale || 'nessuna');

  try {
    const { error } = await supabaseClient
      .from('programmi')
      .update({ 
        dati_verificati: true,
        relazione_docente_manuale: relazione
      })
      .eq('id', p.id);

    if (error) throw error;

    p.dati_verificati = true;
    p.relazione_docente_manuale = relazione;
    closeModal();
    showToast('Dati verificati!', 'success');
    applyStagingFilters();
    updateStagingSummary();
  } catch (e) {
    showToast('Errore: ' + e.message, 'error');
  }
}

// --- Annulla verifica ---
async function unverifyStagingData(programId) {
  const p = stagingPrograms.find(p => p.id === programId);
  if (!p) return;

  try {
    const { error } = await supabaseClient
      .from('programmi')
      .update({ dati_verificati: false })
      .eq('id', p.id);

    if (error) throw error;

    p.dati_verificati = false;
    showToast('Verifica annullata', 'info');
    applyStagingFilters();
    updateStagingSummary();
  } catch (e) {
    showToast('Errore: ' + e.message, 'error');
  }
}

// --- Modifica programma staging ---
async function editStagingProgram(id) {
  const p = stagingPrograms.find(p => p.id === id);
  if (!p) return;

  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');

  content.innerHTML = `
    <form id="staging-edit-form" onsubmit="saveStagingEdit(event, '${id}')" class="space-y-4">
      <h3 class="text-lg font-semibold text-gray-800">
        <i class="fas fa-edit text-zanichelli-light mr-2"></i>Modifica programma
      </h3>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Docente</label>
          <input type="text" id="stg-edit-docente" value="${p.docente_nome || ''}" 
                 class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300 outline-none">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input type="email" id="stg-edit-email" value="${p.docente_email || ''}" 
                 class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300 outline-none">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Ateneo</label>
          <input type="text" id="stg-edit-ateneo" value="${p.ateneo || ''}" 
                 class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300 outline-none">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Materia</label>
          <input type="text" id="stg-edit-materia" value="${p.materia_inferita || ''}" 
                 class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300 outline-none">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Corso di Laurea</label>
          <input type="text" id="stg-edit-corso" value="${p.corso_laurea || ''}" 
                 class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300 outline-none">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Classe di Laurea</label>
          <input type="text" id="stg-edit-classe" value="${p.classe_laurea || ''}" 
                 class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300 outline-none">
        </div>
        <div class="col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Relazione docente — manuale adottato
          </label>
          <select id="stg-edit-relazione" 
                  class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300 outline-none bg-white text-sm">
            <option value="nessuna"              ${(p.relazione_docente_manuale||'nessuna')==='nessuna'              ?'selected':''}>Nessuna relazione particolare</option>
            <option value="autore"               ${p.relazione_docente_manuale==='autore'               ?'selected':''}>✍️ Autore del manuale adottato</option>
            <option value="coautore"             ${p.relazione_docente_manuale==='coautore'             ?'selected':''}>✍️ Coautore del manuale adottato</option>
            <option value="curatore"             ${p.relazione_docente_manuale==='curatore'             ?'selected':''}>📋 Curatore del manuale adottato</option>
            <option value="traduttore"           ${p.relazione_docente_manuale==='traduttore'           ?'selected':''}>🌐 Traduttore del manuale adottato</option>
            <option value="collega_ateneo"       ${p.relazione_docente_manuale==='collega_ateneo'       ?'selected':''}>🏛️ Collega stesso Ateneo dell'autore</option>
            <option value="collega_dipartimento" ${p.relazione_docente_manuale==='collega_dipartimento' ?'selected':''}>🏢 Collega stesso Dipartimento dell'autore</option>
          </select>
        </div>
      </div>
      <div class="flex gap-3 pt-2">
        <button type="submit" class="flex-1 py-2 bg-zanichelli-blue text-white rounded-lg font-medium hover:bg-zanichelli-dark transition-colors">
          <i class="fas fa-save mr-1"></i>Salva
        </button>
        <button type="button" onclick="closeModal()" class="px-6 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
          Annulla
        </button>
      </div>
    </form>
  `;

  modal.classList.remove('hidden');
}

// --- Salva modifica staging ---
async function saveStagingEdit(event, id) {
  event.preventDefault();

  const updates = {
    docente_nome: document.getElementById('stg-edit-docente').value || null,
    docente_email: document.getElementById('stg-edit-email').value || null,
    ateneo: document.getElementById('stg-edit-ateneo').value || null,
    materia_inferita: document.getElementById('stg-edit-materia').value || null,
    corso_laurea: document.getElementById('stg-edit-corso').value || null,
    classe_laurea: document.getElementById('stg-edit-classe').value || null,
    relazione_docente_manuale: document.getElementById('stg-edit-relazione')?.value || 'nessuna',
    dati_verificati: false,
    updated_at: new Date().toISOString()
  };

  try {
    const { error } = await supabaseClient.from('programmi').update(updates).eq('id', id);
    if (error) throw error;

    showToast('Programma aggiornato! Richiede nuova verifica.', 'success');
    closeModal();
    loadStaging();
  } catch (e) {
    showToast('Errore: ' + e.message, 'error');
  }
}

// --- Elimina programma staging ---
async function deleteStagingProgram(id) {
  if (!confirm('Eliminare questo programma dallo staging? L\'operazione non è reversibile.')) return;

  try {
    const { error } = await supabaseClient.from('programmi').delete().eq('id', id);
    if (error) throw error;

    showToast('Programma eliminato', 'success');
    loadStaging();
  } catch (e) {
    showToast('Errore: ' + e.message, 'error');
  }
}

// --- Promuovi singolo programma al Database ---
async function promoteSingle(programId) {
  const p = stagingPrograms.find(p => p.id === programId);
  if (!p) return;

  if (!p.dati_verificati) {
    showToast('Verifica prima i dati estratti', 'warning');
    return;
  }

  const fw = findFrameworkForSubject(p.materia_inferita);
  const manuals = findManualsForSubject(p.materia_inferita);

  if (!fw) {
    showToast(`Framework mancante per "${p.materia_inferita}". Segnala al gestore.`, 'error');
    return;
  }
  if (!manuals || manuals.length === 0) {
    showToast(`Catalogo manuali mancante per "${p.materia_inferita}". Segnala al gestore.`, 'error');
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('programmi')
      .update({ stato: 'database' })
      .eq('id', p.id);

    if (error) throw error;

    showToast(`${p.docente_nome || 'Programma'} promosso al Database!`, 'success');
    loadStaging();
  } catch (e) {
    showToast('Errore: ' + e.message, 'error');
  }
}

// --- Promuovi tutti i pronti ---
async function promoteAllReady() {
  const ready = stagingPrograms.filter(p => {
    if (!p.dati_verificati) return false;
    const fw = findFrameworkForSubject(p.materia_inferita);
    const manuals = findManualsForSubject(p.materia_inferita);
    return fw && manuals && manuals.length > 0;
  });

  if (ready.length === 0) {
    showToast('Nessun programma pronto per la promozione', 'warning');
    return;
  }

  if (!confirm(`Promuovere ${ready.length} programmi al Database?`)) return;

  let success = 0;
  for (const p of ready) {
    try {
      const { error } = await supabaseClient
        .from('programmi')
        .update({ stato: 'database' })
        .eq('id', p.id);

      if (!error) success++;
    } catch (e) {
      console.error('Errore promozione', p.docente_nome, e);
    }
  }

  showToast(`${success} programmi promossi al Database!`, 'success');
  loadStaging();
}

// --- Segnala risorsa mancante ---
function reportMissing(materia, type) {
  const label = type === 'framework' ? 'Framework di valutazione' : 'Catalogo manuali';
  
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');

  const progsForMateria = stagingPrograms.filter(p => p.materia_inferita === materia);
  const allManuali = [];
  progsForMateria.forEach(p => {
    (p.manuali_citati || []).forEach(m => {
      const key = `${m.autore}|${m.titolo}`;
      if (!allManuali.find(x => `${x.autore}|${x.titolo}` === key)) {
        allManuali.push(m);
      }
    });
  });

  const manualiList = allManuali.length > 0 ? 
    allManuali.map(m => `• ${m.autore || '?'} — ${m.titolo || '?'} (${m.editore || '?'})`).join('\n') :
    '(nessun manuale citato nei programmi)';

  const message = type === 'framework' ? 
    `Richiesta: creazione ${label} per "${materia}"\n\nProgrammi in attesa: ${progsForMateria.length}\n\nManuali citati nei programmi:\n${manualiList}` :
    `Richiesta: aggiornamento ${label} per "${materia}"\n\nProgrammi in attesa: ${progsForMateria.length}\n\nManuali citati dai docenti (da aggiungere al catalogo):\n${manualiList}`;

  content.innerHTML = `
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-gray-800">
        <i class="fas fa-flag text-red-500 mr-2"></i>
        Segnalazione: ${label} mancante
      </h3>
      <div class="bg-gray-50 rounded-lg p-3">
        <p class="text-sm text-gray-600"><strong>Materia:</strong> ${materia}</p>
        <p class="text-sm text-gray-600"><strong>Programmi in attesa:</strong> ${progsForMateria.length}</p>
      </div>
      
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Testo della segnalazione (copialo e invialo al gestore)</label>
        <textarea id="report-text" class="w-full px-3 py-2 border rounded-lg text-sm h-40 font-mono focus:ring-2 focus:ring-red-300 outline-none">${message}</textarea>
      </div>
      
      <div class="flex gap-3 pt-2">
        <button onclick="copyReportText()" 
                class="flex-1 py-2 bg-zanichelli-blue text-white rounded-lg font-medium hover:bg-zanichelli-dark transition-colors">
          <i class="fas fa-copy mr-1"></i>Copia negli appunti
        </button>
        <button onclick="closeModal()" 
                class="px-6 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
          Chiudi
        </button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
}

// --- Copia testo segnalazione ---
function copyReportText() {
  const text = document.getElementById('report-text');
  if (text) {
    text.select();
    document.execCommand('copy');
    showToast('Testo copiato negli appunti!', 'success');
  }
}
