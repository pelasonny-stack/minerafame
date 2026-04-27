/* ── Admin schema-driven form renderer ────────────────────────────────────── */
(function () {
  'use strict';
  const U = window.adminUtils;
  const { $, $$, getAtPath, setAtPath, deepClone, fmtSize } = U;

  /* state ref del core (set por admin-core.js) */
  let stateRef = null;
  let onChangeCb = null;

  function init({ state, onChange }) {
    stateRef = state;
    onChangeCb = onChange;
  }

  function markDirty(path, el) {
    stateRef.dirtyPaths.add(path);
    if (el) {
      const wrap = el.closest('.field') || el.closest('.array-item') || el;
      wrap.classList.add('is-dirty');
    }
    onChangeCb?.();
  }

  /* setFieldLabel — pone texto del label + tooltip opcional desde schema.description */
  function setFieldLabel(rootEl, schema) {
    const lbl = rootEl.querySelector('.field-label');
    if (!lbl) return;
    lbl.textContent = schema.label || '';
    if (schema.description) {
      const help = document.createElement('button');
      help.type = 'button';
      help.className = 'field-help';
      help.setAttribute('aria-label', 'Ayuda');
      help.title = schema.description;
      help.textContent = '?';
      lbl.appendChild(document.createTextNode(' '));
      lbl.appendChild(help);
    }
  }

  function emptyItemFromSchema(itemSchema) {
    if (!itemSchema) return '';
    if (!Array.isArray(itemSchema) && typeof itemSchema === 'object') {
      // primitivo
      if (itemSchema.type === 'number') return 0;
      if (itemSchema.type === 'boolean') return false;
      return '';
    }
    const out = {};
    itemSchema.forEach(f => {
      if (f.type === 'array') out[f.path] = [];
      else if (f.type === 'number') out[f.path] = 0;
      else if (f.type === 'boolean') out[f.path] = false;
      else out[f.path] = '';
    });
    return out;
  }

  /* ── Renderers por tipo ── */

  function renderText(schema, value, fullPath) {
    const f = document.createElement('label');
    f.className = 'field field-text';
    f.dataset.path = fullPath;
    f.innerHTML = `
      <span class="field-label"></span>
      <input type="text">
      <span class="field-meta"><span class="char-count"></span></span>
    `;
    setFieldLabel(f, schema);
    const input = f.querySelector('input');
    input.value = value ?? '';
    if (schema.maxLength) input.maxLength = schema.maxLength;
    if (schema.placeholder) input.placeholder = schema.placeholder;
    const charCount = f.querySelector('.char-count');
    const updateCount = () => {
      if (!schema.maxLength) { charCount.textContent = ''; return; }
      const n = input.value.length;
      charCount.textContent = `${n} / ${schema.maxLength}`;
      charCount.classList.toggle('is-near-limit', n > schema.maxLength * 0.9);
      charCount.classList.toggle('is-over-limit', n > schema.maxLength);
    };
    input.addEventListener('input', () => {
      setAtPath(stateRef.currentContent, fullPath, input.value);
      markDirty(fullPath, f);
      updateCount();
    });
    updateCount();
    return f;
  }

  function renderTextarea(schema, value, fullPath) {
    const f = document.createElement('label');
    f.className = 'field field-textarea';
    f.dataset.path = fullPath;
    f.innerHTML = `
      <span class="field-label"></span>
      <textarea rows="3"></textarea>
      <span class="field-meta"><span class="char-count"></span></span>
    `;
    setFieldLabel(f, schema);
    const ta = f.querySelector('textarea');
    ta.value = value ?? '';
    if (schema.maxLength) ta.maxLength = schema.maxLength;
    const charCount = f.querySelector('.char-count');
    const updateCount = () => {
      if (!schema.maxLength) { charCount.textContent = ''; return; }
      const n = ta.value.length;
      charCount.textContent = `${n} / ${schema.maxLength}`;
    };
    const autoResize = () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 400) + 'px';
    };
    ta.addEventListener('input', () => {
      setAtPath(stateRef.currentContent, fullPath, ta.value);
      markDirty(fullPath, f);
      updateCount();
      autoResize();
    });
    updateCount();
    setTimeout(autoResize, 0);
    return f;
  }

  /* HTML whitelist: <br>, <strong>, <em>, <a href> */
  function sanitizeHtml(str) {
    if (typeof str !== 'string') return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = str;
    const allowed = new Set(['BR', 'STRONG', 'EM', 'A']);
    const tagAlias = { B: 'STRONG', I: 'EM' };
    const walk = (n) => {
      Array.from(n.childNodes).forEach(c => {
        if (c.nodeType === 1) {
          let tag = c.tagName;
          // <div>, <p> en contentEditable: convertir a <br> separator
          if (tag === 'DIV' || tag === 'P') {
            const frag = document.createDocumentFragment();
            if (n.firstChild !== c) frag.appendChild(document.createElement('br'));
            walk(c);
            while (c.firstChild) frag.appendChild(c.firstChild);
            c.replaceWith(frag);
            return;
          }
          if (tagAlias[tag]) {
            const newEl = document.createElement(tagAlias[tag].toLowerCase());
            while (c.firstChild) newEl.appendChild(c.firstChild);
            c.replaceWith(newEl);
            walk(newEl);
            return;
          }
          if (!allowed.has(tag)) {
            const frag = document.createDocumentFragment();
            walk(c);
            while (c.firstChild) frag.appendChild(c.firstChild);
            c.replaceWith(frag);
            return;
          }
          // strip atributos peligrosos, mantener href en <a> si es seguro
          if (tag === 'A') {
            const href = c.getAttribute('href') || '';
            Array.from(c.attributes).forEach(a => c.removeAttribute(a.name));
            if (/^(https?:\/\/|mailto:|tel:|\/|#)/.test(href)) c.setAttribute('href', href);
            c.setAttribute('rel', 'noopener');
            if (/^https?:/.test(href)) c.setAttribute('target', '_blank');
          } else {
            Array.from(c.attributes).forEach(a => c.removeAttribute(a.name));
          }
          walk(c);
        }
      });
    };
    walk(tmp);
    return tmp.innerHTML;
  }

  function renderTextHtml(schema, value, fullPath) {
    const f = document.createElement('div');
    f.className = 'field field-text-html';
    f.dataset.path = fullPath;
    f.innerHTML = `
      <span class="field-label"></span>
      <div class="rte-toolbar" role="toolbar" aria-label="Formato de texto">
        <button type="button" class="rte-btn" data-cmd="bold" title="Negrita (Cmd+B)" aria-label="Negrita"><b>B</b></button>
        <button type="button" class="rte-btn" data-cmd="italic" title="Cursiva (Cmd+I)" aria-label="Cursiva"><i>I</i></button>
        <button type="button" class="rte-btn" data-cmd="link" title="Link" aria-label="Insertar link">🔗</button>
        <button type="button" class="rte-btn" data-cmd="br" title="Salto de línea" aria-label="Salto de línea">↵</button>
        <span class="rte-sep"></span>
        <button type="button" class="rte-btn rte-btn-toggle" data-cmd="source" title="Ver código HTML" aria-label="Ver código HTML">&lt;/&gt;</button>
      </div>
      <div class="rte-editor" contenteditable="true" data-placeholder="Escribí acá…"></div>
      <textarea class="rte-source" rows="3" hidden></textarea>
    `;
    setFieldLabel(f, schema);
    const editor = f.querySelector('.rte-editor');
    const source = f.querySelector('.rte-source');
    const toolbar = f.querySelector('.rte-toolbar');
    const initial = sanitizeHtml(value ?? '');
    editor.innerHTML = initial;
    source.value = initial;

    const sync = (fromSource) => {
      let html;
      if (fromSource) {
        html = sanitizeHtml(source.value);
        editor.innerHTML = html;
      } else {
        html = sanitizeHtml(editor.innerHTML);
        source.value = html;
      }
      setAtPath(stateRef.currentContent, fullPath, html);
      markDirty(fullPath, f);
    };

    editor.addEventListener('input', () => sync(false));
    editor.addEventListener('blur', () => {
      // re-sanitize y restaurar al editor para dar feedback visual de qué quedó
      const html = sanitizeHtml(editor.innerHTML);
      if (html !== editor.innerHTML) editor.innerHTML = html;
    });
    editor.addEventListener('keydown', (e) => {
      // Enter solo = <br>; Shift+Enter también
      if (e.key === 'Enter') {
        e.preventDefault();
        document.execCommand('insertLineBreak');
        sync(false);
      }
    });
    source.addEventListener('input', () => sync(true));

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.rte-btn');
      if (!btn) return;
      const cmd = btn.dataset.cmd;
      editor.focus();
      if (cmd === 'bold') document.execCommand('bold');
      else if (cmd === 'italic') document.execCommand('italic');
      else if (cmd === 'br') document.execCommand('insertLineBreak');
      else if (cmd === 'link') {
        const url = prompt('URL del link (empezá con https://)');
        if (url && /^(https?:\/\/|mailto:|tel:|\/|#)/.test(url)) {
          document.execCommand('createLink', false, url);
        }
      } else if (cmd === 'source') {
        const showSrc = source.hidden;
        source.hidden = !showSrc;
        editor.hidden = showSrc;
        toolbar.querySelector('[data-cmd="source"]').classList.toggle('is-active', showSrc);
      }
      sync(false);
    });

    return f;
  }

  function renderNumber(schema, value, fullPath) {
    const f = document.createElement('label');
    f.className = 'field field-number';
    f.dataset.path = fullPath;
    f.innerHTML = `
      <span class="field-label"></span>
      <input type="number">
    `;
    setFieldLabel(f, schema);
    const input = f.querySelector('input');
    input.value = value ?? '';
    if (schema.min != null) input.min = schema.min;
    if (schema.max != null) input.max = schema.max;
    input.addEventListener('input', () => {
      const v = input.value === '' ? null : Number(input.value);
      setAtPath(stateRef.currentContent, fullPath, v);
      markDirty(fullPath, f);
    });
    return f;
  }

  /* Select dropdown */
  function renderSelect(schema, value, fullPath) {
    const f = document.createElement('label');
    f.className = 'field field-select';
    f.dataset.path = fullPath;
    f.innerHTML = `<span class="field-label"></span><select></select>`;
    setFieldLabel(f, schema);
    const sel = f.querySelector('select');
    const opts = Array.isArray(schema.options) ? schema.options : [];
    opts.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      if (opt === value) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      setAtPath(stateRef.currentContent, fullPath, sel.value);
      markDirty(fullPath, f);
    });
    return f;
  }

  /* Toggle checkbox */
  function renderToggle(schema, value, fullPath) {
    const f = document.createElement('label');
    f.className = 'field field-toggle';
    f.dataset.path = fullPath;
    f.innerHTML = `
      <span class="field-toggle-row">
        <input type="checkbox">
        <span class="field-label"></span>
      </span>
    `;
    setFieldLabel(f, schema);
    const cb = f.querySelector('input');
    cb.checked = !!value;
    cb.addEventListener('change', () => {
      setAtPath(stateRef.currentContent, fullPath, cb.checked);
      markDirty(fullPath, f);
    });
    return f;
  }

  /* Email/Tel/URL — text con type específico + validación HTML5 nativa */
  function renderTypedText(htmlType) {
    return function (schema, value, fullPath) {
      const f = document.createElement('label');
      f.className = `field field-${htmlType}`;
      f.dataset.path = fullPath;
      f.innerHTML = `<span class="field-label"></span><input type="${htmlType}"><span class="field-error" hidden></span>`;
      setFieldLabel(f, schema);
      const input = f.querySelector('input');
      input.value = value ?? '';
      if (schema.placeholder) input.placeholder = schema.placeholder;
      input.addEventListener('input', () => {
        setAtPath(stateRef.currentContent, fullPath, input.value);
        markDirty(fullPath, f);
      });
      return f;
    };
  }

  function renderHref(schema, value, fullPath) {
    const f = document.createElement('label');
    f.className = 'field field-href';
    f.dataset.path = fullPath;
    f.innerHTML = `
      <span class="field-label"></span>
      <input type="text" placeholder="/ruta o https://..." />
      <span class="field-error" hidden></span>
    `;
    setFieldLabel(f, schema);
    const input = f.querySelector('input');
    const err = f.querySelector('.field-error');
    input.value = value ?? '';
    const validate = () => {
      const v = input.value.trim();
      if (!v) { err.hidden = true; return true; }
      if (/^(https?:\/\/|mailto:|tel:|\/|#)/.test(v)) { err.hidden = true; return true; }
      err.textContent = 'URL inválida — debe empezar con http(s)://, mailto:, tel:, / o #';
      err.hidden = false;
      return false;
    };
    input.addEventListener('input', () => {
      setAtPath(stateRef.currentContent, fullPath, input.value);
      markDirty(fullPath, f);
      validate();
    });
    return f;
  }

  /* Heurística: hint de tamaño recomendado a partir del path */
  function suggestImageHint(path) {
    if (/heroImg|hero\.|posterImg|main\.img|featured/.test(path)) return '≥ 1920×1080 (foto grande)';
    if (/logo/.test(path)) return 'Logo en PNG transparente recomendado';
    if (/\.img\.|thumb|labelImg|productos\[|panels\[/.test(path)) return '≥ 800×600 (foto media)';
    return '';
  }

  function renderImage(schema, value, fullPath) {
    const f = document.createElement('div');
    f.className = 'field field-image';
    f.dataset.path = fullPath;
    const hint = schema.imageHint || suggestImageHint(fullPath);
    f.innerHTML = `
      <span class="field-label"></span>
      <div class="image-grid">
        <figure class="thumb-big">
          <img alt="" loading="lazy">
          <figcaption class="thumb-meta"></figcaption>
        </figure>
        <div class="image-controls">
          <div class="dropzone" tabindex="0" role="button" aria-label="Arrastrá una imagen acá o hacé click">
            <svg width="28" height="28" aria-hidden="true"><use href="#arrow-up-right"/></svg>
            <p class="dz-headline">Arrastrá una imagen acá</p>
            <p class="dz-sub">o <button type="button" class="dz-link btn-change">elegí del finder</button> · pegá con Cmd+V · o pegá una URL abajo</p>
            <p class="dz-hint">${hint ? 'Recomendado: ' + U.escapeHtml(hint) : ''}</p>
          </div>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" hidden>
          <div class="image-url-row">
            <input type="text" class="image-url-input" placeholder="…o pegá URL https://… (Enter para usar)">
          </div>
          <div class="new-preview" hidden>
            <img alt="" loading="lazy">
            <div class="new-info"></div>
            <div class="new-actions">
              <button type="button" class="btn-ghost btn-cancel">Cancelar</button>
              <button type="button" class="btn-primary btn-apply">Aplicar</button>
            </div>
          </div>
        </div>
      </div>
    `;
    setFieldLabel(f, schema);
    const thumb = f.querySelector('.thumb-big img');
    const thumbMeta = f.querySelector('.thumb-meta');
    const dropzone = f.querySelector('.dropzone');
    const fileInput = f.querySelector('input[type=file]');
    const changeBtn = f.querySelector('.btn-change');
    const urlInput = f.querySelector('.image-url-input');
    const newPrev = f.querySelector('.new-preview');
    const newImg = newPrev.querySelector('img');
    const newInfo = newPrev.querySelector('.new-info');
    const cancelBtn = newPrev.querySelector('.btn-cancel');
    const applyBtn = newPrev.querySelector('.btn-apply');

    const renderThumb = (src, label) => {
      thumb.src = src || '';
      thumb.alt = label || '';
      thumbMeta.textContent = label || '(sin imagen)';
    };
    renderThumb(value || '', value || '');

    const blobs = new Set();
    const trackBlob = (url) => { blobs.add(url); return url; };
    const revokeAll = () => { blobs.forEach(u => URL.revokeObjectURL(u)); blobs.clear(); };

    /* show preview de file/url candidato */
    const showCandidate = async (file, originalName) => {
      const err = window.adminUpload.validateImage(file);
      if (err) { U.toast('error', err); return; }
      revokeAll();
      const url = trackBlob(URL.createObjectURL(file));
      newImg.src = url;
      let dims = '';
      try {
        const bmp = await createImageBitmap(file);
        dims = ` · ${bmp.width}×${bmp.height}px`;
        bmp.close?.();
      } catch {}
      newInfo.textContent = `${originalName || file.name} · ${fmtSize(file.size)}${dims}`;
      newPrev.hidden = false;
      // store the candidate file on the field
      f._candidateFile = file;
    };

    changeBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file) showCandidate(file);
    });

    /* Drag and drop */
    ['dragenter', 'dragover'].forEach(ev => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation();
        dropzone.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach(ev => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation();
        dropzone.classList.remove('is-dragover');
      });
    });
    dropzone.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files?.[0];
      if (file) showCandidate(file);
    });

    /* Paste from clipboard (active when this field has focus) */
    const pasteHandler = (e) => {
      if (!f.contains(document.activeElement) && document.activeElement !== dropzone) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) {
            e.preventDefault();
            showCandidate(file, `clipboard-${Date.now()}.${file.type.split('/')[1] || 'png'}`);
            return;
          }
        }
      }
    };
    f.addEventListener('paste', pasteHandler);

    /* URL paste/enter */
    const handleUrl = async (rawUrl) => {
      const url = rawUrl.trim();
      if (!url || !/^https?:\/\//.test(url)) return;
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const blob = await resp.blob();
        if (!blob.type.startsWith('image/')) {
          U.toast('error', 'La URL no es una imagen');
          return;
        }
        const filename = url.split('/').pop().split('?')[0] || 'image';
        const file = new File([blob], filename, { type: blob.type });
        showCandidate(file, filename);
        urlInput.value = '';
      } catch (e) {
        U.toast('error', 'No pude descargar esa URL: ' + e.message);
      }
    };
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleUrl(urlInput.value); }
    });

    cancelBtn.addEventListener('click', () => {
      fileInput.value = '';
      f._candidateFile = null;
      newPrev.hidden = true;
      revokeAll();
    });

    applyBtn.addEventListener('click', () => {
      const file = f._candidateFile;
      if (!file) return;
      const uploadId = crypto.randomUUID();
      setAtPath(stateRef.currentContent, fullPath, `pending:${uploadId}`);
      stateRef.pendingUploads.push({ uploadId, file, path: fullPath });
      renderThumb(trackBlob(URL.createObjectURL(file)), `(pendiente) ${file.name}`);
      newPrev.hidden = true;
      f._candidateFile = null;
      markDirty(fullPath, f);
    });

    return f;
  }

  function renderArray(schema, value, fullPath) {
    const arr = Array.isArray(value) ? value : [];
    if (!Array.isArray(getAtPath(stateRef.currentContent, fullPath))) {
      setAtPath(stateRef.currentContent, fullPath, arr);
    }

    const f = document.createElement('div');
    f.className = 'field field-array';
    f.dataset.path = fullPath;
    f.innerHTML = `
      <div class="array-head">
        <span class="array-label"></span>
        <span class="array-count"></span>
      </div>
      <div class="array-list"></div>
      <button type="button" class="btn-add-item">+ Agregar</button>
    `;
    const labelEl = f.querySelector('.array-label');
    const countEl = f.querySelector('.array-count');
    const list = f.querySelector('.array-list');
    const addBtn = f.querySelector('.btn-add-item');

    const rebuild = () => {
      list.innerHTML = '';
      const cur = getAtPath(stateRef.currentContent, fullPath) || [];
      labelEl.textContent = schema.label;
      countEl.textContent = `(${cur.length})`;
      cur.forEach((item, i) => {
        list.appendChild(renderArrayItem(schema, item, `${fullPath}[${i}]`, i, cur.length, rebuild));
      });
    };

    addBtn.addEventListener('click', () => {
      const cur = getAtPath(stateRef.currentContent, fullPath) || [];
      if (schema.maxItems && cur.length >= schema.maxItems) {
        U.toast('warn', `Máximo ${schema.maxItems} items`);
        return;
      }
      cur.push(emptyItemFromSchema(schema.itemSchema || []));
      setAtPath(stateRef.currentContent, fullPath, cur);
      markDirty(fullPath, f);
      rebuild();
    });

    rebuild();
    return f;
  }

  /* Detecta primer img field en itemSchema para mostrar thumbnail */
  function findItemImageSrc(item, itemSchema) {
    if (!Array.isArray(itemSchema) || !item || typeof item !== 'object') return null;
    for (const f of itemSchema) {
      if (f.type === 'imageSrc') {
        const v = item[f.path];
        if (typeof v === 'string' && v && !v.startsWith('pending:')) return v;
      }
      if (f.type === 'array') continue;
      // nested obj like img.src
      if (f.path?.includes('.')) {
        const [k1, k2] = f.path.split('.');
        if (k2 === 'src' && item[k1]?.src) return item[k1].src;
      }
    }
    return null;
  }

  function renderArrayItem(parentSchema, item, itemPath, idx, total, rebuild) {
    const el = document.createElement('div');
    el.className = 'array-item';
    el.draggable = true;
    el.dataset.idx = String(idx);
    el.innerHTML = `
      <div class="array-item-head">
        <span class="drag-handle" aria-hidden="true">⋮⋮</span>
        <img class="array-item-thumb" alt="" hidden>
        <span class="array-item-summary"></span>
        <div class="array-item-actions">
          <button type="button" class="btn-up" title="Subir" aria-label="Subir item">↑</button>
          <button type="button" class="btn-down" title="Bajar" aria-label="Bajar item">↓</button>
          <button type="button" class="btn-dup" title="Duplicar" aria-label="Duplicar item">⎘</button>
          <button type="button" class="btn-delete" title="Borrar" aria-label="Borrar item">🗑</button>
        </div>
      </div>
      <div class="array-item-body"></div>
    `;
    const summaryEl = el.querySelector('.array-item-summary');
    const thumbEl = el.querySelector('.array-item-thumb');
    const summaryKey = parentSchema.summary || (parentSchema.itemSchema?.[0]?.path);
    const summary = summaryKey ? (item?.[summaryKey] ?? item) : item;
    summaryEl.textContent = `${parentSchema.itemLabel || 'Item'} ${idx + 1} — ${String(summary || '(sin título)').slice(0, 60)}`;

    const imgSrc = findItemImageSrc(item, parentSchema.itemSchema);
    if (imgSrc) {
      thumbEl.src = imgSrc;
      thumbEl.hidden = false;
    }

    const head = el.querySelector('.array-item-head');
    head.addEventListener('click', (e) => {
      if (e.target.closest('.array-item-actions') || e.target.closest('.drag-handle')) return;
      el.classList.toggle('is-expanded');
    });

    const body = el.querySelector('.array-item-body');
    if (Array.isArray(parentSchema.itemSchema)) {
      // Item es un objeto con sub-fields
      parentSchema.itemSchema.forEach(f => {
        const subPath = `${itemPath}.${f.path}`;
        body.appendChild(renderField(f, getAtPath(stateRef.currentContent, subPath), subPath));
      });
    } else if (parentSchema.itemSchema && typeof parentSchema.itemSchema === 'object') {
      // Item es un primitivo (string/number) — el path del field ES el itemPath
      body.appendChild(renderField(parentSchema.itemSchema, getAtPath(stateRef.currentContent, itemPath), itemPath));
    }

    const upBtn = el.querySelector('.btn-up');
    const downBtn = el.querySelector('.btn-down');
    const delBtn = el.querySelector('.btn-delete');
    upBtn.disabled = idx === 0;
    downBtn.disabled = idx === total - 1;

    const parentPath = itemPath.replace(/\[\d+\]$/, '');
    const arr = getAtPath(stateRef.currentContent, parentPath);

    const dupBtn = el.querySelector('.btn-dup');

    upBtn.addEventListener('click', () => {
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      markDirty(parentPath, el);
      rebuild();
    });
    downBtn.addEventListener('click', () => {
      [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
      markDirty(parentPath, el);
      rebuild();
    });
    dupBtn.addEventListener('click', () => {
      if (parentSchema.maxItems && arr.length >= parentSchema.maxItems) {
        U.toast('warn', `Máximo ${parentSchema.maxItems} items`);
        return;
      }
      const clone = U.deepClone(arr[idx]);
      // si es objeto con id, sufijar con "-copia" para evitar duplicado
      if (clone && typeof clone === 'object' && 'id' in clone && typeof clone.id === 'string') {
        clone.id = clone.id + '-copia';
      }
      arr.splice(idx + 1, 0, clone);
      markDirty(parentPath, el);
      rebuild();
    });

    /* Drag and drop reorder */
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
      el.classList.add('is-dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('is-dragging');
      el.parentElement?.querySelectorAll('.array-item').forEach(x => x.classList.remove('drop-above', 'drop-below'));
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = el.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      el.classList.toggle('drop-above', before);
      el.classList.toggle('drop-below', !before);
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drop-above', 'drop-below');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (isNaN(fromIdx) || fromIdx === idx) return;
      const rect = el.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      let toIdx = before ? idx : idx + 1;
      if (fromIdx < toIdx) toIdx -= 1;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      markDirty(parentPath, el);
      rebuild();
    });

    delBtn.addEventListener('click', async () => {
      if (parentSchema.minItems && arr.length <= parentSchema.minItems) {
        U.toast('warn', `Mínimo ${parentSchema.minItems} items`);
        return;
      }
      const msg = parentSchema.warnOnDelete || `¿Borrar item ${idx + 1}?`;
      const ok = await U.confirmModal(msg);
      if (!ok) return;
      arr.splice(idx, 1);
      markDirty(parentPath, el);
      rebuild();
    });

    return el;
  }

  /* ── Dispatcher ── */
  const RENDERERS = {
    'text':           renderText,
    'text-multiline': renderTextarea,
    'text-html':      renderTextHtml,
    'number':         renderNumber,
    'imageSrc':       renderImage,
    'href':           renderHref,
    'array':          renderArray,
    'select':         renderSelect,
    'toggle':         renderToggle,
    'email':          renderTypedText('email'),
    'tel':            renderTypedText('tel'),
    'url':            renderTypedText('url'),
  };

  function renderField(fieldSchema, value, fullPath) {
    const fn = RENDERERS[fieldSchema.type];
    if (!fn) {
      const div = document.createElement('div');
      div.className = 'field';
      div.textContent = `[unsupported type: ${fieldSchema.type}]`;
      return div;
    }
    return fn(fieldSchema, value, fullPath);
  }

  function renderSection(sectionSchema, content) {
    const sec = document.createElement('section');
    sec.id = `sec-${sectionSchema.id}`;
    sec.className = 'editor-section is-collapsed';
    const icon = sectionSchema.icon || '';
    sec.innerHTML = `
      <header class="editor-section-head">
        <h2><span class="section-icon" aria-hidden="true">${U.escapeHtml(icon)}</span> <span class="section-title-text"></span></h2>
        <div class="section-head-actions">
          <a class="section-view-live" target="_blank" rel="noopener" title="Ver esta sección en el sitio" aria-label="Ver esta sección en el sitio">↗</a>
          <button class="collapse-toggle" aria-expanded="false">+</button>
        </div>
      </header>
      <div class="editor-section-body"></div>
    `;
    sec.querySelector('.section-title-text').textContent = sectionSchema.label;
    const head = sec.querySelector('.editor-section-head');
    const toggle = sec.querySelector('.collapse-toggle');
    head.addEventListener('click', (e) => {
      if (e.target.closest('.section-view-live')) return;
      sec.classList.toggle('is-collapsed');
      toggle.textContent = sec.classList.contains('is-collapsed') ? '+' : '−';
      toggle.setAttribute('aria-expanded', String(!sec.classList.contains('is-collapsed')));
    });
    // "Ver en sitio" link — usa anchor del id de sección (en sitio público)
    const liveLink = sec.querySelector('.section-view-live');
    const siteFile = (window.ADMIN_CONFIG?.SITE === 'mf') ? 'minera-fame.html' : 'index.html';
    const anchorMap = {
      header: '', hero: '#hero', trust: '', collection: '#coleccion',
      imageParagraph: '#aplicaciones', applications: '#aplicaciones',
      stats: '', about: '#acerca', partner: '', contact: '#contacto',
      footer: '#footer', wafab: '', modal: '#coleccion',
      // MF
      ribbon: '', empresa: '#empresa', materials: '#materiales',
      fachada: '#fachada', csBanner: '', services: '#servicios'
    };
    const anchor = anchorMap[sectionSchema.id] || '';
    liveLink.href = siteFile + anchor;
    const body = sec.querySelector('.editor-section-body');
    (sectionSchema.fields || []).forEach(f => {
      body.appendChild(renderField(f, getAtPath(content, f.path), f.path));
    });
    return sec;
  }

  function renderEditor(schema, content) {
    const main = document.getElementById('editor-main');
    const nav = document.getElementById('section-nav');
    main.innerHTML = '';
    nav.innerHTML = '';
    const sectionsById = new Map((schema.sections || []).map(s => [s.id, s]));
    const groups = Array.isArray(schema.groups) && schema.groups.length
      ? schema.groups
      : [{ id: '_all', label: '', sections: (schema.sections || []).map(s => s.id) }];

    groups.forEach((g, gi) => {
      // Sidebar group header
      if (g.label) {
        const groupHeader = document.createElement('div');
        groupHeader.className = 'sidebar-group-header';
        groupHeader.textContent = g.label;
        nav.appendChild(groupHeader);
      }
      // Main: separator title
      if (g.label) {
        const groupTitle = document.createElement('h2');
        groupTitle.className = 'editor-group-title';
        groupTitle.textContent = g.label;
        main.appendChild(groupTitle);
      }
      g.sections.forEach((sid, si) => {
        const s = sectionsById.get(sid);
        if (!s) return;
        const sec = renderSection(s, content);
        main.appendChild(sec);
        const a = document.createElement('a');
        a.href = `#sec-${s.id}`;
        a.className = 'sidebar-link' + (gi === 0 && si === 0 ? ' is-active' : '');
        a.innerHTML = `<span class="sidebar-link-icon">${U.escapeHtml(s.icon || '·')}</span><span class="sidebar-link-label"></span>`;
        a.querySelector('.sidebar-link-label').textContent = s.label;
        nav.appendChild(a);
      });
    });
    initScrollSpy();
  }

  function initScrollSpy() {
    const main = document.getElementById('editor-main');
    const links = $$('.sidebar-link');
    if (!links.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        links.forEach(l => l.classList.remove('is-active'));
        const id = e.target.id;
        const a = document.querySelector(`.sidebar-link[href="#${id}"]`);
        a?.classList.add('is-active');
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    $$('.editor-section', main).forEach(s => io.observe(s));
  }

  window.adminRender = { init, renderEditor, sanitizeHtml };
})();
