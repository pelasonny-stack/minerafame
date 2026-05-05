(function () {
  'use strict';

  let currentData = null;
  let currentIdx = -1;
  let modalSwiper = null;
  let lockedScrollY = 0;
  let isLocked = false;

  function lockBodyScroll() {
    if (isLocked) return;
    lockedScrollY = window.scrollY || window.pageYOffset || 0;
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    if (sbw > 0) document.body.style.paddingRight = `${sbw}px`;
    document.documentElement.style.overflow = 'hidden';
    isLocked = true;
  }

  function unlockBodyScroll() {
    if (!isLocked) return;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    document.documentElement.style.overflow = '';
    window.scrollTo(0, lockedScrollY);
    isLocked = false;
  }

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getItems() {
    return (currentData && currentData.materials && currentData.materials.items) || [];
  }

  function isExternalFeatured(item) {
    return item && typeof item.href === 'string' && /^https?:\/\//.test(item.href);
  }

  function findIdxById(items, matId) {
    if (!matId) return -1;
    return items.findIndex(it => it && it.id === matId);
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
    lockBodyScroll();
    document.getElementById('mf-mat-modal-close')?.focus();
    triggerZoomHint(modal);
  }

  function triggerZoomHint(modal) {
    const hint = modal.querySelector('.mf-mat-modal-zoom-hint');
    if (!hint) return;
    hint.classList.remove('is-shown');
    void hint.offsetWidth;
    hint.classList.add('is-shown');
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
      unlockBodyScroll();
    }, 280);
  }

  function renderModal(item) {
    const modal = document.getElementById('mf-mat-modal');
    if (!modal) return;

    const slides = [];
    if (item.img && item.img.src) {
      slides.push({
        src: item.img.src,
        alt: item.img.alt || item.name || '',
        caption: item.name || ''
      });
    }
    if (Array.isArray(item.gallery)) {
      item.gallery.forEach(g => {
        if (g && g.src) slides.push({
          src: g.src,
          alt: g.alt || g.caption || item.name || '',
          caption: g.caption || g.alt || item.name || ''
        });
      });
    }

    const wrapper = modal.querySelector('.mf-mat-modal-swiper .swiper-wrapper');
    if (wrapper) {
      wrapper.innerHTML = slides.map(s => `
        <div class="swiper-slide" data-caption="${escAttr(s.caption)}">
          <div class="swiper-zoom-container">
            <img loading="lazy" src="${escAttr(s.src)}" alt="${escAttr(s.alt)}"
                 onload="this.closest('.swiper-slide').classList.add('has-loaded')">
          </div>
        </div>
      `).join('');
    }

    const counter = modal.querySelector('.mf-mat-modal-counter');
    if (counter) {
      counter.textContent = slides.length > 1 ? '1/' + slides.length : '';
      counter.style.display = slides.length > 1 ? '' : 'none';
    }

    modal.querySelector('.mf-mat-modal-eyebrow').textContent = (item.materialAttr || item.name || '').toUpperCase();
    modal.querySelector('.mf-mat-modal-title').textContent = item.name || '';
    modal.querySelector('.mf-mat-modal-tag').textContent = item.tag || '';
    modal.querySelector('.mf-mat-modal-tag').style.display = item.tag ? '' : 'none';

    const desc = item.desc || item.description || '';
    modal.querySelector('.mf-mat-modal-desc').textContent = desc;
    modal.querySelector('.mf-mat-modal-desc').style.display = desc ? '' : 'none';

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
        const onHome = /\/(index\.html)?$/.test(location.pathname) || location.pathname === '/';
        cta.setAttribute('href', onHome ? '#contacto' : '/#contacto');
        cta.removeAttribute('target');
        cta.removeAttribute('rel');
        cta.setAttribute('data-material', item.materialAttr || item.name || '');
        if (ctaLabel) ctaLabel.textContent = 'Consultar este material';
      }
    }

    if (modalSwiper) {
      modalSwiper.destroy(true, true);
      modalSwiper = null;
    }

    function updateUI(swiper) {
      const slide = swiper.slides[swiper.activeIndex];
      const cap = (slide && slide.dataset.caption) ? slide.dataset.caption : '';
      const capEl = modal.querySelector('.mf-mat-modal-caption');
      if (capEl) {
        capEl.textContent = cap;
        capEl.classList.toggle('is-empty', !cap);
      }
      if (counter && swiper.slides.length > 1) {
        counter.textContent = (swiper.realIndex + 1) + '/' + swiper.slides.length;
      }
    }

    const swEl = modal.querySelector('.mf-mat-modal-swiper');
    modalSwiper = new Swiper(swEl, {
      loop: slides.length > 2,
      speed: 400,
      zoom: {
        maxRatio: 3,
        minRatio: 1,
        toggle: true
      },
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
        init: updateUI,
        slideChange: updateUI,
      },
    });

  }

  function init(data) {
    currentData = data;

    document.querySelectorAll('.mf-materials-grid .mf-material-card').forEach((card, idx) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.mf-material-cta-link')) return;
        if (e.target.closest('.mf-material-swiper-prev, .mf-material-swiper-next, .swiper-pagination-bullet')) return;

        const items = getItems();
        const matId = card.dataset.matId;
        let resolvedIdx = matId ? findIdxById(items, matId) : -1;
        if (resolvedIdx < 0) resolvedIdx = idx;
        const item = items[resolvedIdx];
        if (!item) return;

        e.preventDefault();
        openModal(resolvedIdx);
      });
    });

    document.getElementById('mf-mat-modal-close')?.addEventListener('click', closeModal);
    document.querySelector('.mf-mat-modal-backdrop')?.addEventListener('click', closeModal);

    document.querySelector('.mf-mat-modal-cta')?.addEventListener('click', (e) => {
      const cta = e.currentTarget;
      const href = cta.getAttribute('href') || '';
      const linkTarget = cta.getAttribute('target');
      const mat = cta.getAttribute('data-material');

      if (mat) {
        const sel = document.getElementById('mf-material');
        const msg = document.getElementById('mf-msg');
        if (sel) {
          const opt = Array.from(sel.options).find(o => o.value === mat || o.text === mat);
          if (opt) sel.value = opt.value || opt.text;
        }
        if (msg && !msg.value) {
          msg.value = `Hola, quiero más información sobre ${mat}.`;
        }
      }

      if (linkTarget === '_blank') {
        closeModal();
        return;
      }

      e.preventDefault();
      const onHome = /\/(index\.html)?$/.test(location.pathname) || location.pathname === '/';
      const anchorMatch = href.match(/#([^#?]+)/);
      const anchorId = anchorMatch ? anchorMatch[1] : '';
      const isCrossPage = href.startsWith('/') && !onHome;

      if (isCrossPage) {
        unlockBodyScroll();
        window.location.href = href;
        return;
      }

      closeModal();
      if (anchorId) {
        setTimeout(() => {
          const t = document.getElementById(anchorId);
          if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
      }
    });

    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('mf-mat-modal');
      if (!modal || !modal.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeModal();
    });
  }

  document.addEventListener('site-data-ready', function (e) {
    init(e.detail || {});
  });
})();
