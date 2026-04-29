/* ── Admin upload pipeline: validate, resize, base64, POST to worker ────── */
(function () {
  'use strict';
  const { hashBlob, blobToBase64, sluggify } = window.adminUtils;

  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
  const MAX_BYTES = 15 * 1024 * 1024;
  const MAX_WIDTH = 2400;

  function validateImage(file) {
    if (!ALLOWED.includes(file.type)) return 'Formato no soportado (jpg, png, webp, svg)';
    if (file.size > MAX_BYTES && file.type !== 'image/svg+xml') return 'Máximo 15MB';
    return null;
  }

  async function maybeResize(file) {
    if (file.type === 'image/svg+xml') return file;
    try {
      const bmp = await createImageBitmap(file);
      if (bmp.width <= MAX_WIDTH) { bmp.close?.(); return file; }
      const scale = MAX_WIDTH / bmp.width;
      const w = MAX_WIDTH, h = Math.round(bmp.height * scale);
      const canvas = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
      bmp.close?.();
      const blob = canvas.convertToBlob
        ? await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 })
        : await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.85));
      return new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' });
    } catch (e) {
      console.warn('resize fallback:', e);
      return file;
    }
  }

  async function uploadImage({ workerUrl, token, site, file, hashCache }) {
    const err = validateImage(file);
    if (err) throw new Error(err);
    const blob = await maybeResize(file);
    const hash = await hashBlob(blob);
    if (hashCache && hashCache[hash]) return hashCache[hash];
    const contentBase64 = await blobToBase64(blob);
    const res = await fetch(`${workerUrl}/api/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        site,
        filename: sluggify(file.name) + '.' + (blob.type === 'image/webp' ? 'webp' : (file.name.split('.').pop() || 'bin')),
        mime: blob.type,
        contentBase64,
      }),
    });
    if (res.status === 401) {
      const err401 = new Error('TOKEN_EXPIRED');
      err401.status = 401;
      throw err401;
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.error?.code || ''; } catch {}
      throw new Error(`Upload falló (${res.status} ${detail})`);
    }
    const { path, url } = await res.json();
    const result = { path, url };
    if (hashCache) hashCache[hash] = result;
    return result;
  }

  window.adminUpload = { uploadImage, validateImage, maybeResize };
})();
