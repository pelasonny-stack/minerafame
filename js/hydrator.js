/* ── CMS hydrator ──────────────────────────────────────────────────────────────
   Lee `data/{site}.json` y reemplaza textContent / atributos / templates en
   elementos con [data-edit].  Si el fetch falla, el sitio queda con el
   contenido hardcoded del HTML — no rompe nada.

   API:
     window.hydrate(data)         → aplica data al DOM
     window.fetchSiteData(siteId) → fetch + parse, retorna data o null

   Atributos soportados:
     data-edit="path.to.field"             default: textContent = value
     data-edit-html                        innerHTML = value (whitelist via data)
     data-edit-attr="src"                  setAttribute(attr, value)
     data-edit-bind-<attr>="path"          atajo: setAttribute(attr, resolve(path))
     data-edit-bind='[{...}]'              JSON multi-bind para casos raros
     data-edit-show="path"                 hidden = !truthy(value)
     data-edit-template="path"             clona el <template> N veces (N = array.length)
                                           hijos usan path "item.<sub>"
────────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const EXPECTED_SCHEMA_VERSION = 1;

  function resolvePath(obj, path, ctx) {
    if (obj == null) return undefined;
    // soporte item.<sub> dentro de templates
    if (ctx && path.startsWith('item.')) {
      return resolvePath(ctx, path.slice(5));
    }
    if (path === 'item') return ctx;
    const tokens = path.split(/\.|\[(\d+)\]/).filter(Boolean);
    let cur = obj;
    for (const t of tokens) {
      if (cur == null) return undefined;
      const idx = /^\d+$/.test(t) ? parseInt(t, 10) : t;
      cur = cur[idx];
    }
    return cur;
  }

  function applyValue(el, value) {
    if (value == null) return;
    const useHtml = el.hasAttribute('data-edit-html');
    const targetAttr = el.getAttribute('data-edit-attr');
    if (targetAttr) {
      el.setAttribute(targetAttr, String(value));
    } else if (useHtml) {
      el.innerHTML = String(value);
    } else {
      el.textContent = String(value);
    }
  }

  function applyBinds(el, ctx, root) {
    // data-edit-bind-<attr>="path" — atajo
    Array.from(el.attributes)
      .filter(a => a.name.startsWith('data-edit-bind-'))
      .forEach(a => {
        const attr = a.name.slice('data-edit-bind-'.length);
        const v = resolvePath(root, a.value, ctx);
        if (v != null) el.setAttribute(attr, String(v));
      });
    // data-edit-bind='[{path,attr}]' — JSON multi-bind
    const json = el.getAttribute('data-edit-bind');
    if (json) {
      try {
        const arr = JSON.parse(json);
        if (Array.isArray(arr)) {
          arr.forEach(b => {
            const v = resolvePath(root, b.path, ctx);
            if (v == null) return;
            if (b.attr === 'textContent') el.textContent = String(v);
            else if (b.attr === 'innerHTML') el.innerHTML = String(v);
            else el.setAttribute(b.attr, String(v));
          });
        }
      } catch (e) { console.warn('[hydrator] bad data-edit-bind', json); }
    }
  }

  function applyShow(el, root, ctx) {
    const path = el.getAttribute('data-edit-show');
    if (!path) return;
    const v = resolvePath(root, path, ctx);
    el.hidden = !v;
  }

  function applyShowLenGt(el, root, ctx) {
    // data-edit-show-len-gt="path:N" — show si Array(path).length > N
    const v = el.getAttribute('data-edit-show-len-gt');
    if (!v) return;
    const idx = v.lastIndexOf(':');
    if (idx === -1) return;
    const path = v.slice(0, idx).trim();
    const n = parseInt(v.slice(idx + 1).trim(), 10);
    const val = resolvePath(root, path, ctx);
    el.hidden = !(Array.isArray(val) && val.length > n);
  }

  function applyClassToggles(el, root, ctx) {
    // data-edit-class-toggle="className:path[, className2:path2]" — toggle class si path truthy
    const v = el.getAttribute('data-edit-class-toggle');
    if (!v) return;
    v.split(',').map(s => s.trim()).filter(Boolean).forEach(pair => {
      const [className, path] = pair.split(':').map(s => s.trim());
      if (!className || !path) return;
      const truthy = !!resolvePath(root, path, ctx);
      el.classList.toggle(className, truthy);
    });
  }

  function processElement(el, root, ctx) {
    if (el.hasAttribute('data-edit-show')) applyShow(el, root, ctx);
    if (el.hasAttribute('data-edit-show-len-gt')) applyShowLenGt(el, root, ctx);
    if (el.hasAttribute('data-edit-class-toggle')) applyClassToggles(el, root, ctx);
    applyBinds(el, ctx, root);
    if (el.hasAttribute('data-edit')) {
      const path = el.getAttribute('data-edit');
      const v = resolvePath(root, path, ctx);
      applyValue(el, v);
    }
  }

  function processTemplates(scope, data, ctx) {
    const tpls = scope.querySelectorAll('template[data-edit-template]');
    tpls.forEach(tpl => {
      const path = tpl.getAttribute('data-edit-template');
      const arr = resolvePath(data, path, ctx);
      if (!Array.isArray(arr)) return;
      const target = tpl.getAttribute('data-edit-target');
      const targetEl = target ? document.querySelector(target) : tpl.parentNode;
      const mode = tpl.getAttribute('data-edit-mode') || 'replace-template';
      if (mode === 'replace' && targetEl) targetEl.innerHTML = '';
      // data-edit-template-limit="N" → solo hidrata primeros N items
      const limit = parseInt(tpl.getAttribute('data-edit-template-limit') || '0', 10);
      const items = limit > 0 ? arr.slice(0, limit) : arr;
      items.forEach(item => {
        const clone = tpl.content.cloneNode(true);
        processTemplates(clone, data, item);
        clone.querySelectorAll('[data-edit], [data-edit-show], [data-edit-show-len-gt], [data-edit-class-toggle]').forEach(el => processElement(el, data, item));
        Array.from(clone.querySelectorAll('*'))
          .filter(el => Array.from(el.attributes).some(a => a.name.startsWith('data-edit-bind')))
          .forEach(el => processElement(el, data, item));
        if (mode === 'replace' && targetEl) {
          targetEl.appendChild(clone);
        } else {
          tpl.parentNode.insertBefore(clone, tpl);
        }
      });
    });
  }

  function hydrate(data) {
    if (!data) return;
    if (data._schemaVersion !== EXPECTED_SCHEMA_VERSION) {
      console.warn('[hydrator] schema mismatch — expected', EXPECTED_SCHEMA_VERSION, 'got', data._schemaVersion);
    }
    if (data.documentTitle) document.title = data.documentTitle;
    processTemplates(document, data, null);
    document.querySelectorAll('[data-edit], [data-edit-show], [data-edit-show-len-gt], [data-edit-class-toggle]').forEach(el => processElement(el, data, null));
    Array.from(document.querySelectorAll('*'))
      .filter(el => Array.from(el.attributes).some(a => a.name.startsWith('data-edit-bind')))
      .forEach(el => processElement(el, data, null));
    document.dispatchEvent(new CustomEvent('site-data-ready', { detail: data }));
  }

  async function fetchSiteData(siteId) {
    const v = document.documentElement.dataset.contentVersion || '';
    const url = `data/${siteId}.json${v ? '?v=' + encodeURIComponent(v) : ''}`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const resp = await fetch(url, { signal: ctrl.signal, cache: 'default' });
      clearTimeout(timer);
      if (!resp.ok) throw new Error('http ' + resp.status);
      return await resp.json();
    } catch (err) {
      console.warn('[hydrator] no se pudo cargar', siteId, err);
      return null;
    }
  }

  window.hydrate = hydrate;
  window.fetchSiteData = fetchSiteData;
})();
