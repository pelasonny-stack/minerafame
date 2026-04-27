/* ── Admin utils: path resolve, deep clone, diff, hash, sluggify, toasts ───── */
(function () {
  'use strict';

  const utils = {};

  utils.$ = (sel, root = document) => root.querySelector(sel);
  utils.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  utils.tpl = (id) => {
    const t = document.getElementById(id);
    return t.content.firstElementChild.cloneNode(true);
  };

  utils.parsePath = (path) => {
    return path.split(/\.|\[(\d+)\]/).filter(Boolean).map(t => /^\d+$/.test(t) ? parseInt(t, 10) : t);
  };

  utils.getAtPath = (obj, path) => {
    if (obj == null) return undefined;
    if (path === '$self' || path === '') return obj;
    const tokens = utils.parsePath(path);
    let cur = obj;
    for (const t of tokens) {
      if (cur == null) return undefined;
      cur = cur[t];
    }
    return cur;
  };

  // setAtPath en root: para "$self" actualiza obj.parent[obj.key] — no soportado directo,
  // así que setAtPath con path "$self" se trata como reemplazar el valor en el path padre.
  utils.setAtPath = (obj, path, value) => {
    const tokens = utils.parsePath(path);
    if (tokens.length === 0) return; // no-op for "$self" o ""
    let cur = obj;
    for (let i = 0; i < tokens.length - 1; i++) {
      const t = tokens[i];
      if (cur[t] == null) cur[t] = (typeof tokens[i + 1] === 'number') ? [] : {};
      cur = cur[t];
    }
    cur[tokens[tokens.length - 1]] = value;
  };

  utils.deepClone = (obj) => {
    if (obj == null) return obj;
    if (typeof structuredClone === 'function') return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
  };

  utils.deepEqual = (a, b) => {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return a === b;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!utils.deepEqual(a[i], b[i])) return false;
      return true;
    }
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!utils.deepEqual(a[k], b[k])) return false;
    return true;
  };

  utils.sluggify = (s) => String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')  // strip diacritics (ñ, á, ü, etc.)
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'image';

  utils.fmtSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  utils.debounce = (fn, ms) => {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  };

  utils.hashBlob = async (blob) => {
    const buf = await blob.arrayBuffer();
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  utils.blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

  /* Toasts */
  const toastsRoot = () => document.getElementById('toasts');
  utils.toast = (kind, msg, ttl = 3500) => {
    const root = toastsRoot();
    if (!root) return;
    const el = document.createElement('div');
    el.className = `toast is-${kind}`;
    el.textContent = msg;
    root.appendChild(el);
    if (kind !== 'error') setTimeout(() => el.remove(), ttl);
    else el.addEventListener('click', () => el.remove());
  };

  /* Modal helpers */
  utils.modal = ({ title, bodyHtml, buttons = [{ label: 'OK', primary: true, value: true }] }) =>
    new Promise((resolve) => {
      const root = document.getElementById('modal-root');
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true">
          <div class="modal-head">
            <h3></h3>
            <button class="modal-close" aria-label="Cerrar">×</button>
          </div>
          <div class="modal-body"></div>
          <div class="modal-foot"></div>
        </div>
      `;
      overlay.querySelector('h3').textContent = title;
      overlay.querySelector('.modal-body').innerHTML = bodyHtml;
      const foot = overlay.querySelector('.modal-foot');
      buttons.forEach(b => {
        const btn = document.createElement('button');
        btn.className = b.primary ? 'btn-primary' : (b.danger ? 'btn-secondary' : 'btn-ghost');
        btn.textContent = b.label;
        btn.addEventListener('click', () => { close(b.value); });
        foot.appendChild(btn);
      });
      const close = (v) => {
        overlay.remove();
        resolve(v);
      };
      overlay.querySelector('.modal-close').addEventListener('click', () => close(false));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
      root.appendChild(overlay);
    });

  utils.escapeHtml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  utils.confirmModal = (msg) => utils.modal({
    title: 'Confirmar',
    bodyHtml: `<p>${utils.escapeHtml(msg)}</p>`,
    buttons: [
      { label: 'Cancelar', value: false },
      { label: 'Confirmar', primary: true, value: true },
    ],
  });

  window.adminUtils = utils;
})();
