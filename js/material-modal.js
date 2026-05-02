(function () {
  'use strict';

  let currentData = null;
  let currentIdx = -1;
  let modalSwiper = null;

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getItems() {
    return (currentData && currentData.materials && currentData.materials.items) || [];
  }

  function isExternalFeatured(item) {
    // Featured Caesarstone tiene href externo (https://caesarstoneargentina...)
    return item && typeof item.href === 'string' && /^https?:\/\//.test(item.href);
  }

  function openModal(idx) {
    const items = getItems();
    const item = items[idx];
    if (!item) return;
    currentIdx = idx;
    renderModal(item);

    const modal = document.getElementById('mf-mat-modal');
    if (!modal) return;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-open'));
    document.body.style.overflow = 'hidden';
    document.getElementById('mf-mat-modal-close')?.focus();
  }

  function closeModal() {
    const modal = document.getElementById('mf-mat-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    setTimeout(() => {
      modal.hidden = true;
      if (modalSwiper) {
        modalSwiper.destroy(true, true);
        modalSwiper = null;
      }
      document.body.style.overflow = '';
    }, 280);
  }

  function renderModal(item) {
    const modal = document.getElementById('mf-mat-modal');
    if (!modal) return;

    // Build slides: portada + gallery
    const slides = [];
    if (item.img && item.img.src) {
      slides.push({ src: item.img.src, alt: item.img.alt || item.name || '', caption: '' });
    }
    if (Array.isArray(item.gallery)) {
      item.gallery.forEach(g => {
        if (g && g.src) slides.push({
          src: g.src,
          alt: g.alt || item.name || '',
          caption: g.caption || ''
        });
      });
    }

    const wrapper = modal.querySelector('.mf-mat-modal-swiper .swiper-wrapper');
    if (wrapper) {
      wrapper.innerHTML = slides.map(s => `
        <div class="swiper-slide" data-caption="${escAttr(s.caption)}">
          <img loading="lazy" src="${escAttr(s.src)}" alt="${escAttr(s.alt)}">
        </div>
      `).join('');
    }

    modal.querySelector('.mf-mat-modal-eyebrow').textContent = (item.materialAttr || item.name || '').toUpperCase();
    modal.querySelector('.mf-mat-modal-title').textContent = item.name || '';
    modal.querySelector('.mf-mat-modal-tag').textContent = item.tag || '';
    modal.querySelector('.mf-mat-modal-tag').style.display = item.tag ? '' : 'none';

    // Si el item tiene desc/description, usar
    const desc = item.desc || item.description || '';
    modal.querySelector('.mf-mat-modal-desc').textContent = desc;
    modal.querySelector('.mf-mat-modal-desc').style.display = desc ? '' : 'none';

    // CTA dinámico: si href external (Caesarstone), va al sitio. Si no, a #contacto con prefill.
    const cta = modal.querySelector('.mf-mat-modal-cta');
    const ctaLabel = cta?.querySelector('.mf-mat-modal-cta-label');
    if (cta) {
      if (isExternalFeatured(item)) {
        cta.setAttribute('href', item.href);
        cta.setAttribute('target', '_blank');
        cta.setAttribute('rel', 'noopener');
        cta.removeAttribute('data-material');
        if (ctaLabel) ctaLabel.textContent = `Ver sitio ${item.name}`;
      } else {
        cta.setAttribute('href', '#contacto');
        cta.removeAttribute('target');
        cta.removeAttribute('rel');
        cta.setAttribute('data-material', item.materialAttr || item.name || '');
        if (ctaLabel) ctaLabel.textContent = 'Consultar este material';
      }
    }

    // Init Swiper
    if (modalSwiper) {
      modalSwiper.destroy(true, true);
      modalSwiper = null;
    }

    function updateCaption(swiper) {
      const slide = swiper.slides[swiper.activeIndex];
      const cap = (slide && slide.dataset.caption) ? slide.dataset.caption : '';
      const capEl = modal.querySelector('.mf-mat-modal-caption');
      if (capEl) {
        capEl.textContent = cap;
        capEl.style.opacity = cap ? '1' : '0';
      }
    }

    const swEl = modal.querySelector('.mf-mat-modal-swiper');
    modalSwiper = new Swiper(swEl, {
      loop: slides.length > 2,
      speed: 400,
      navigation: {
        nextEl: modal.querySelector('.mf-mat-modal-swiper-next'),
        prevEl: modal.querySelector('.mf-mat-modal-swiper-prev'),
      },
      pagination: {
        el: modal.querySelector('.mf-mat-modal-swiper-pagination'),
        clickable: true,
      },
      keyboard: { enabled: true },
      a11y: {
        prevSlideMessage: 'Foto anterior',
        nextSlideMessage: 'Foto siguiente',
      },
      on: {
        init: updateCaption,
        slideChange: updateCaption,
      },
    });

    // Update prev/next material buttons disabled state
    const items = getItems();
    const prevBtn = document.getElementById('mf-mat-modal-prev-mat');
    const nextBtn = document.getElementById('mf-mat-modal-next-mat');
    if (prevBtn) prevBtn.disabled = !findAdjIdx(items, currentIdx, -1);
    if (nextBtn) nextBtn.disabled = !findAdjIdx(items, currentIdx, +1);
  }

  function findAdjIdx(items, fromIdx, dir) {
    const i = fromIdx + dir;
    return (i >= 0 && i < items.length) ? i : null;
  }

  function goAdj(dir) {
    const items = getItems();
    const next = findAdjIdx(items, currentIdx, dir);
    if (next == null) return;
    currentIdx = next;
    renderModal(items[next]);
  }

  function init(data) {
    currentData = data;

    // Hook clicks en cards
    document.querySelectorAll('.mf-materials-grid .mf-material-card').forEach((card, idx) => {
      // Get material idx from data-edit-bind-href if available (templates render fresh)
      // OR use array index from card position
      card.addEventListener('click', (e) => {
        // Don't open modal if clicked the explicit "Consultar" CTA inside card
        if (e.target.closest('.mf-material-cta-link')) return;
        // Don't open modal if clicked swiper controls (slider inline)
        if (e.target.closest('.mf-material-swiper-prev, .mf-material-swiper-next, .swiper-pagination-bullet')) return;

        const items = getItems();
        const item = items[idx];
        if (!item) return;

        e.preventDefault();
        openModal(idx);
      });
    });

    // Modal close handlers
    document.getElementById('mf-mat-modal-close')?.addEventListener('click', closeModal);
    document.querySelector('.mf-mat-modal-backdrop')?.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('mf-mat-modal');
      if (!modal || !modal.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeModal();
      if (e.key === 'ArrowLeft' && !modalSwiper?.params?.keyboard?.enabled) goAdj(-1);
      if (e.key === 'ArrowRight' && !modalSwiper?.params?.keyboard?.enabled) goAdj(+1);
    });

    // Prev/next entre materiales
    document.getElementById('mf-mat-modal-prev-mat')?.addEventListener('click', () => goAdj(-1));
    document.getElementById('mf-mat-modal-next-mat')?.addEventListener('click', () => goAdj(+1));
  }

  document.addEventListener('site-data-ready', function (e) {
    init(e.detail || {});
  });
})();
