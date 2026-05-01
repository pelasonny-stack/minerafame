/* ── Admin core: auth, state, save flow, draft autosave ──────────────────── */
(function () {
  'use strict';
  const U = window.adminUtils;
  const { $, deepClone, deepEqual, getAtPath, setAtPath, debounce, toast, modal, confirmModal } = U;

  const CFG = window.ADMIN_CONFIG || {};
  if (!CFG.SITE || !CFG.WORKER_URL || !CFG.SCHEMA_URL) {
    document.body.innerHTML = '<p style="padding:40px">ADMIN_CONFIG inválido. Cargá la página correcta.</p>';
    return;
  }
  const SITE = CFG.SITE;
  const WORKER_URL = CFG.WORKER_URL.replace(/\/$/, '');
  if (WORKER_URL.includes('<') || !/^https?:\/\//.test(WORKER_URL)) {
    document.body.innerHTML = `
      <div style="font-family:system-ui;max-width:560px;margin:80px auto;padding:32px;border:1px solid #e6e4de;border-radius:8px">
        <h1 style="margin-top:0">Worker no configurado</h1>
        <p>La URL del Cloudflare Worker todavía es un placeholder.</p>
        <p>Editá <code>admin-${SITE}-...html</code> y reemplazá <code>${escapeHtml(WORKER_URL)}</code> por la URL real del worker (ej: <code>https://caesarstone-cms.tu-subdomain.workers.dev</code>).</p>
      </div>`;
    return;
  }
  function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  const TOKEN_KEY = `cms-token-${SITE}`;
  const DRAFT_KEY = `cms-draft-${SITE}`;

  /* ── State ── */
  const state = {
    token: sessionStorage.getItem(TOKEN_KEY),
    expiresAt: parseInt(sessionStorage.getItem(`${TOKEN_KEY}-exp`) || '0', 10),
    schema: null,
    originalContent: null,
    currentContent: null,
    sha: null,
    pendingUploads: [],   // [{uploadId, file, path}]
    pendingPreviews: {},  // {uploadId: blobUrl}
    uploadedHashes: {},
    dirtyPaths: new Set(),
  };

  /* ── Mobile gate ── */
  if (matchMedia('(max-width: 1023px)').matches) {
    document.body.dataset.view = 'mobile-gate';
    return;
  }

  /* ── DOM refs ── */
  const refs = {
    loginForm: $('#login-form'),
    loginErr:  $('.login-error'),
    btnLogout: $('#btn-logout'),
    btnSave:   $('#btn-save'),
    btnReload: $('#btn-reload'),
    pwToggle:  $('.pw-toggle'),
    dirtyCount:$('.dirty-count'),
    dirtyN:    $('.dirty-count b'),
    siteName:  $('.topbar-brand'),
    lastEdit:  $('#last-edit-time'),
  };

  refs.siteName.textContent = `${CFG.SITE_NAME || SITE.toUpperCase()} · CMS`;

  /* ── Init ── */
  if (state.token && state.expiresAt > Date.now()) {
    bootEditor().catch(showLogin);
  } else {
    showLogin();
  }

  /* ── Login ── */
  refs.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    refs.loginErr.hidden = true;
    const fd = new FormData(refs.loginForm);
    try {
      const res = await fetch(`${WORKER_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: fd.get('user'), pass: fd.get('pass') }),
      });
      if (!res.ok) {
        const j = await safeJson(res);
        const code = j?.error?.code;
        throw new Error(code && FRIENDLY_ERRORS[code] ? FRIENDLY_ERRORS[code] : (res.status === 401 ? 'Usuario o contraseña incorrectos.' : `Error ${res.status}`));
      }
      const { token, expiresAt } = await res.json();
      state.token = token;
      state.expiresAt = expiresAt;
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(`${TOKEN_KEY}-exp`, String(expiresAt));
      await bootEditor();
    } catch (err) {
      refs.loginErr.textContent = err.message;
      refs.loginErr.hidden = false;
    }
  });

  refs.pwToggle.addEventListener('click', () => {
    const input = refs.loginForm.querySelector('input[name=pass]');
    input.type = input.type === 'password' ? 'text' : 'password';
    refs.pwToggle.textContent = input.type === 'password' ? 'Ver' : 'Ocultar';
  });

  /* ── Logout ── */
  refs.btnLogout.addEventListener('click', async () => {
    if (state.dirtyPaths.size) {
      const ok = await confirmModal('Tenés cambios sin guardar. ¿Salir igual?');
      if (!ok) return;
    }
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(`${TOKEN_KEY}-exp`);
    sessionStorage.removeItem(DRAFT_KEY);
    state.token = null;
    showLogin();
  });

  /* ── Save ── */
  refs.btnSave.addEventListener('click', () => save());
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (state.dirtyPaths.size === 0) return;
    e.preventDefault();
    e.returnValue = '';
  });

  /* ── Reload ── */
  refs.btnReload.addEventListener('click', async () => {
    if (state.dirtyPaths.size && !await confirmModal('Vas a descartar todos los cambios sin guardar. ¿Continuar?')) return;
    sessionStorage.removeItem(DRAFT_KEY);
    await loadContent();
    renderUI();
    state.dirtyPaths.clear();
    state.pendingUploads = [];
    state.pendingPreviews = {};
    updateDirtyUI();
    toast('info', 'Contenido recargado');
  });

  /* ── boot ── */
  async function bootEditor() {
    document.body.dataset.view = 'editor';
    if (!state.schema) {
      const r = await fetch(CFG.SCHEMA_URL);
      if (!r.ok) throw new Error('No se pudo cargar el schema');
      state.schema = await r.json();
    }
    await loadContent();
    maybeRestoreDraft();
    renderUI();
    updateDirtyUI();
    initCmdK();
    maybeShowWelcome();
  }

  /* Welcome modal first-login */
  function maybeShowWelcome() {
    const KEY = `cms-welcomed-${SITE}`;
    if (localStorage.getItem(KEY) === '1') return;
    setTimeout(() => {
      modal({
        title: '👋 Bienvenido al CMS',
        bodyHtml: `
          <p>Acá podés <b>cambiar texto, imágenes y links</b> del sitio.</p>
          <ol style="padding-left:20px;line-height:1.7">
            <li>Las <b>secciones</b> están agrupadas en la izquierda. Hacé click para expandir.</li>
            <li>Cada cambio se marca con <span style="border-left:3px solid #8B5E1E;padding:2px 6px">borde ocre</span>. Apretá <b>Guardar</b> arriba a la derecha.</li>
            <li>Después de guardar, tu sitio se actualiza en <b>1 a 10 minutos</b>.</li>
            <li>Apretá <b>Cmd/Ctrl + K</b> para buscar cualquier campo.</li>
          </ol>
          <p style="color:#6B6B68;font-size:12px;margin-top:20px">Si te trabás, todos los cambios quedan guardados como borrador en tu navegador hasta que los confirmes.</p>
        `,
        buttons: [{ label: 'Empezar', primary: true, value: true }],
      });
      localStorage.setItem(KEY, '1');
    }, 600);
  }

  /* Cmd+K command palette */
  function initCmdK() {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCmdK();
      }
    });
  }

  function flattenSchema(schema) {
    const out = [];
    (schema.sections || []).forEach(s => {
      out.push({ kind: 'section', id: `sec-${s.id}`, label: `${s.icon || ''} ${s.label}`, hint: 'Sección' });
      (s.fields || []).forEach(f => {
        if (!f.label) return;
        out.push({ kind: 'field', id: `sec-${s.id}`, label: f.label, hint: s.label, path: f.path });
      });
    });
    return out;
  }

  function openCmdK() {
    const items = flattenSchema(state.schema || {});
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay cmdk-overlay';
    overlay.innerHTML = `
      <div class="cmdk-card" role="dialog" aria-modal="true" aria-label="Buscar campo">
        <input class="cmdk-input" placeholder="Buscar sección o campo…" autofocus>
        <ul class="cmdk-list" role="listbox"></ul>
        <div class="cmdk-foot">↑↓ navegar · Enter ir · Esc cerrar</div>
      </div>
    `;
    const input = overlay.querySelector('.cmdk-input');
    const list = overlay.querySelector('.cmdk-list');
    let selected = 0;
    let filtered = items;

    const render = () => {
      list.innerHTML = filtered.slice(0, 20).map((it, i) => `
        <li class="cmdk-item ${i === selected ? 'is-selected' : ''}" data-i="${i}">
          <span class="cmdk-kind">${it.kind === 'section' ? '◇' : '·'}</span>
          <span class="cmdk-label">${escapeHtml(it.label)}</span>
          <span class="cmdk-hint">${escapeHtml(it.hint || '')}</span>
        </li>
      `).join('') || '<li class="cmdk-empty">Sin resultados</li>';
    };
    render();

    const goto = (i) => {
      const it = filtered[i];
      if (!it) return;
      close();
      const el = document.getElementById(it.id);
      if (el) {
        el.classList.remove('is-collapsed');
        const tog = el.querySelector('.collapse-toggle');
        if (tog) { tog.textContent = '−'; tog.setAttribute('aria-expanded', 'true'); }
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    input.addEventListener('input', () => {
      const q = input.value.toLowerCase().trim();
      filtered = q
        ? items.filter(it => it.label.toLowerCase().includes(q) || (it.hint || '').toLowerCase().includes(q))
        : items;
      selected = 0;
      render();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(selected + 1, Math.min(filtered.length, 20) - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(selected - 1, 0); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); goto(selected); }
      else if (e.key === 'Escape') { close(); }
    });
    list.addEventListener('click', (e) => {
      const li = e.target.closest('.cmdk-item');
      if (!li) return;
      goto(parseInt(li.dataset.i, 10));
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const close = () => overlay.remove();
    root.appendChild(overlay);
  }

  async function loadContent() {
    const r = await fetchWithAuth(`/api/content?site=${SITE}`);
    if (r.status === 401) { handleSessionExpired(); throw new Error('TOKEN_EXPIRED'); }
    if (!r.ok) throw new Error(`No se pudo cargar el content (${r.status})`);
    const { content, sha } = await r.json();
    state.sha = sha;
    state.originalContent = deepClone(content || {});
    state.currentContent = deepClone(content || {});
  }

  function maybeRestoreDraft() {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (draft.sha !== state.sha) {
        sessionStorage.removeItem(DRAFT_KEY);
        return;
      }
      // ofrecer restaurar
      setTimeout(async () => {
        const ok = await confirmModal('Tenés cambios sin guardar de tu sesión anterior. ¿Recuperarlos?');
        if (ok) {
          state.currentContent = draft.currentContent;
          state.dirtyPaths = new Set(draft.dirtyPaths || []);
          state.pendingUploads = []; // archivos no se persisten
          state.pendingPreviews = {};
          renderUI();
          updateDirtyUI();
          toast('info', 'Cambios recuperados (sin imágenes pendientes)');
        } else {
          sessionStorage.removeItem(DRAFT_KEY);
        }
      }, 200);
    } catch { sessionStorage.removeItem(DRAFT_KEY); }
  }

  function renderUI() {
    const scrollY = window.scrollY;
    const expandedSections = new Set(
      Array.from(document.querySelectorAll('.editor-section'))
        .filter(s => !s.classList.contains('is-collapsed'))
        .map(s => s.id)
    );
    window.adminRender.init({
      state,
      onChange: () => {
        updateDirtyUI();
        scheduleAutosave();
      },
    });
    window.adminRender.renderEditor(state.schema, state.currentContent);
    // restaurar collapsed state + scroll
    document.querySelectorAll('.editor-section').forEach(s => {
      if (!expandedSections.has(s.id)) {
        s.classList.add('is-collapsed');
        const t = s.querySelector('.collapse-toggle');
        if (t) { t.textContent = '+'; t.setAttribute('aria-expanded', 'false'); }
      }
    });
    window.scrollTo(0, scrollY);
  }

  function getDiff() {
    const out = [];
    for (const p of state.dirtyPaths) {
      const before = getAtPath(state.originalContent, p);
      const after  = getAtPath(state.currentContent, p);
      if (!deepEqual(before, after)) out.push({ path: p, before, after });
    }
    return out;
  }

  function updateDirtyUI() {
    const n = getDiff().length;
    refs.btnSave.disabled = n === 0 && state.pendingUploads.length === 0;
    refs.btnSave.textContent = (n + state.pendingUploads.length) ? `Guardar cambios (${n + state.pendingUploads.length})` : 'Guardar cambios';
    refs.dirtyCount.hidden = (n + state.pendingUploads.length) === 0;
    refs.dirtyN.textContent = String(n + state.pendingUploads.length);
  }

  const scheduleAutosave = debounce(() => {
    safeSessionSet(DRAFT_KEY, JSON.stringify({
      sha: state.sha,
      currentContent: state.currentContent,
      dirtyPaths: [...state.dirtyPaths],
      ts: Date.now(),
    }));
    refs.lastEdit.textContent = 'ahora';
    setTimeout(() => { refs.lastEdit.textContent = 'hace segundos'; }, 60000);
  }, 1000);

  /* mapeo de error codes a textos amigables */
  const FRIENDLY_ERRORS = {
    INVALID_CREDS: 'Usuario o contraseña incorrectos.',
    TOKEN_EXPIRED: 'Tu sesión expiró. Volvé a entrar.',
    TOKEN_MISSING: 'Sesión inválida. Recargá la página.',
    INVALID_TOKEN: 'Sesión inválida. Volvé a entrar.',
    STALE_SHA: 'Otro cambio se guardó antes. Recargá el contenido y volvé a intentar.',
    IMAGE_TOO_LARGE: 'La imagen pesa más de 15 MB. Comprimila o usá una más chica.',
    INVALID_MIME: 'Formato no soportado. Usá JPG, PNG, WebP o SVG.',
    INVALID_BODY: 'Algo en el formulario no es válido. Revisá los campos.',
    GH_API_ERROR: 'No pudimos guardar en el servidor. Probá de nuevo en un minuto.',
    RATE_LIMITED: 'Muchos intentos seguidos. Esperá un minuto.',
    MAINTENANCE: 'CMS en mantenimiento. Probá más tarde.',
    NOT_FOUND: 'No encontramos eso.',
    FORBIDDEN: 'No tenés permisos para esto.',
    INTERNAL: 'Algo falló del lado del servidor. Probá de nuevo.',
  };
  function friendlyError(codeOrMsg) {
    if (!codeOrMsg) return 'Error desconocido.';
    return FRIENDLY_ERRORS[codeOrMsg] || codeOrMsg;
  }

  /* sessionStorage seguro: detecta quota excedida */
  function safeSessionSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn('sessionStorage quota excedida', e);
      toast('warn', 'Cambios sin guardar son demasiados para auto-guardar. Guardá ya para no perderlos.');
      return false;
    }
  }

  /* Token check: detecta si vence pronto */
  function tokenAboutToExpire(marginMs = 30000) {
    if (!state.expiresAt) return false;
    return state.expiresAt - Date.now() < marginMs;
  }

  /* ── Save flow (2 fases) ── */
  async function save() {
    const diff = getDiff();
    if (diff.length === 0 && state.pendingUploads.length === 0) return;

    // Pre-check: token a punto de vencer → forzar relogin antes de subir nada
    if (tokenAboutToExpire(60000)) {
      toast('warn', 'Tu sesión está por vencer. Entrá de nuevo y volvé a guardar.');
      handleSessionExpired();
      return;
    }

    // Modal diff humanizado
    const bodyHtml = diff.map(d => {
      const human = humanizePath(d.path);
      const before = humanizeValue(d.before);
      const after  = humanizeValue(d.after);
      const sectionTag = human.section
        ? `<span class="diff-section">${escapeHtml(human.icon || '')} ${escapeHtml(human.section)}</span>`
        : '';
      const techWarn = human.isTechnical
        ? `<div class="diff-tech-warn">⚠ Campo técnico interno. Cambialo solo si sabés qué hacés.</div>`
        : '';
      return `
      <div class="diff-item${human.isTechnical ? ' is-technical' : ''}">
        <div class="diff-path">${escapeHtml(human.label)}${sectionTag ? ' ' + sectionTag : ''}</div>
        ${techWarn}
        <div class="diff-row">
          <div class="diff-before">${before}</div>
          <div class="diff-arrow">→</div>
          <div class="diff-after">${after}</div>
        </div>
      </div>`;
    }).join('') + (state.pendingUploads.length ? `<p class="diff-uploads">📷 <b>${state.pendingUploads.length}</b> imagen(es) nueva(s) que se van a subir.</p>` : '');
    const totalChanges = diff.length + state.pendingUploads.length;
    const titleText = totalChanges === 1 ? 'Vas a guardar 1 cambio' : `Vas a guardar ${totalChanges} cambios`;
    const helperFooter = `<p class="diff-helper">Una vez confirmado, tu sitio se actualiza en <b>1 a 10 minutos</b>. Podés volver a editar cuando quieras.</p>`;
    const ok = await modal({
      title: titleText,
      bodyHtml: (bodyHtml || '<p>Solo subir imágenes pendientes.</p>') + helperFooter,
      buttons: [
        { label: 'Cancelar', value: false },
        { label: 'Confirmar y publicar', primary: true, value: true },
      ],
    });
    if (!ok) return;

    refs.btnSave.disabled = true;
    refs.btnSave.textContent = 'Guardando…';

    try {
      // Phase 1: upload images
      for (let i = 0; i < state.pendingUploads.length; i++) {
        const u = state.pendingUploads[i];
        refs.btnSave.textContent = `Subiendo ${i + 1}/${state.pendingUploads.length}…`;
        const result = await window.adminUpload.uploadImage({
          workerUrl: WORKER_URL,
          token: state.token,
          site: SITE,
          file: u.file,
          hashCache: state.uploadedHashes,
        });
        replacePlaceholderInContent(`pending:${u.uploadId}`, result.path);
      }
      state.pendingUploads = [];
      Object.values(state.pendingPreviews).forEach(u => URL.revokeObjectURL(u));
      state.pendingPreviews = {};

      // Phase 2: POST content
      refs.btnSave.textContent = 'Guardando contenido…';
      const r = await fetchWithAuth('/api/content', {
        method: 'POST',
        body: JSON.stringify({
          site: SITE,
          content: state.currentContent,
          sha: state.sha,
        }),
      });
      if (r.status === 409) {
        toast('error', friendlyError('STALE_SHA'));
        return;
      }
      if (r.status === 401) { handleSessionExpired(); return; }
      if (!r.ok) {
        const j = await safeJson(r);
        throw new Error(friendlyError(j?.error?.code) || `Falló al guardar (HTTP ${r.status})`);
      }
      const { newSha } = await r.json();
      state.originalContent = deepClone(state.currentContent);
      state.sha = newSha;
      state.dirtyPaths.clear();
      sessionStorage.removeItem(DRAFT_KEY);
      document.querySelectorAll('.is-dirty').forEach(el => el.classList.remove('is-dirty'));
      updateDirtyUI();
      const liveUrl = SITE === 'cs' ? 'index.html' : 'minera-fame.html';
      toast('success', `Guardado. Tu sitio se actualiza en 1-10 min. Abrir → ${liveUrl}`);
    } catch (err) {
      console.error('save error', err);
      toast('error', err.message || 'Error al guardar');
    } finally {
      updateDirtyUI();
      if (!refs.btnSave.disabled) refs.btnSave.textContent = 'Guardar cambios';
    }
  }

  function replacePlaceholderInContent(placeholder, realPath) {
    const walk = (node) => {
      if (typeof node === 'string') return node === placeholder ? realPath : node;
      if (Array.isArray(node)) return node.map(walk);
      if (node && typeof node === 'object') {
        const out = {};
        for (const k of Object.keys(node)) out[k] = walk(node[k]);
        return out;
      }
      return node;
    };
    state.currentContent = walk(state.currentContent);
  }

  /* ── Auth helpers ── */
  async function fetchWithAuth(endpoint, init = {}) {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${state.token}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(`${WORKER_URL}${endpoint}`, { ...init, headers });
  }

  function handleSessionExpired() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(`${TOKEN_KEY}-exp`);
    state.token = null;
    state.expiresAt = 0;
    document.body.dataset.view = 'login';
    refs.loginErr.textContent = 'Tu sesión expiró — entrá de nuevo. Tus cambios siguen guardados.';
    refs.loginErr.hidden = false;
  }

  function showLogin() {
    document.body.dataset.view = 'login';
  }

  /* ── helpers ── */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  async function safeJson(r) { try { return await r.json(); } catch { return null; } }

  /* path → human label lookup */
  function humanizePath(path) {
    if (!state.schema) return { label: path, section: '', isTechnical: true };
    const normalized = path.replace(/\[\d+\]/g, '[]');
    // Extract first array index para "ítem N"
    const idxMatch = path.match(/\[(\d+)\]/);
    const itemNum = idxMatch ? `ítem ${parseInt(idxMatch[1], 10) + 1}` : '';
    for (const sec of state.schema.sections || []) {
      for (const f of sec.fields || []) {
        const fNorm = f.path.replace(/\[\d+\]/g, '[]');
        if (fNorm === normalized) return { label: f.label, section: sec.label, icon: sec.icon };
        if (f.type === 'array' && normalized.startsWith(fNorm + '[]')) {
          // strip "fNorm[]." → "id" (bug previo: dejaba el "." adelante)
          const sub = normalized.slice(fNorm.length + 2).replace(/^\./, '');
          if (!sub) return { label: f.label + (itemNum ? ` · ${itemNum}` : ''), section: sec.label, icon: sec.icon };
          const subSchema = Array.isArray(f.itemSchema) ? f.itemSchema : [f.itemSchema];
          const match = subSchema.find(s => s && s.path === sub);
          if (match) {
            return { label: `${f.label}${itemNum ? ` (${itemNum})` : ''} — ${match.label}`, section: sec.label, icon: sec.icon };
          }
          // nested deeper (img.src, etc.)
          for (const s of subSchema) {
            if (s && s.path && sub.startsWith(s.path + '.')) {
              return { label: `${f.label}${itemNum ? ` (${itemNum})` : ''} — ${s.label}`, section: sec.label, icon: sec.icon };
            }
          }
          // fallback dentro del array: muestra al menos el label del array
          return { label: `${f.label}${itemNum ? ` (${itemNum})` : ''} — ${sub}`, section: sec.label, icon: sec.icon, isTechnical: true };
        }
      }
    }
    return { label: path, section: '', isTechnical: true };
  }

  function humanizeValue(v) {
    if (v == null || v === '') return '<i style="color:#9B9995">(vacío)</i>';
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    if (typeof v === 'string') {
      if (v.startsWith('pending:')) return '<i>📷 imagen nueva</i>';
      if (/\.(jpe?g|png|webp|svg|gif)(\?|$)/i.test(v) && !v.includes(' ')) {
        return `<img src="${escapeHtml(v)}" alt="" style="max-height:40px;vertical-align:middle;border-radius:2px;border:1px solid #e6e4de"> <code style="font-size:10px">${escapeHtml(v.length > 50 ? v.slice(0, 50) + '…' : v)}</code>`;
      }
      if (v.length > 100) return escapeHtml(v.slice(0, 100) + '…');
      return escapeHtml(v);
    }
    if (Array.isArray(v)) return `<code>[${v.length} ítem${v.length !== 1 ? 's' : ''}]</code>`;
    if (typeof v === 'object') return `<code>${escapeHtml(JSON.stringify(v).slice(0, 100))}…</code>`;
    return escapeHtml(String(v));
  }
})();
