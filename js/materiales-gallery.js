(function () {
  'use strict';

  let allPhotos = [];
  let currentFiltered = [];
  let lightboxSwiper = null;

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildAllPhotos(items) {
    const photos = [];
    if (!Array.isArray(items)) return photos;
    items.forEach(item => {
      if (!item) return;
      const matName = item.name || '';
      const matId = (item.id || '').toLowerCase();
      const matAttr = (item.materialAttr || '').toLowerCase();
      // Portada
      if (item.img && item.img.src) {
        photos.push({
          src: item.img.src,
          alt: item.img.alt || matName,
          caption: matName,
          matName,
          matId,
          matAttr,
        });
      }
      // Gallery
      if (Array.isArray(item.gallery)) {
        item.gallery.forEach(g => {
          if (g && g.src) {
            photos.push({
              src: g.src,
              alt: g.alt || matName,
              caption: g.caption || matName,
              matName,
              matId,
              matAttr,
            });
          }
        });
      }
    });
    return photos;
  }

  function filterPhotos(filter) {
    if (!filter || filter === 'all') return allPhotos.slice();
    var f = filter.toLowerCase();
    return allPhotos.filter(function (p) {
      return p.matId.includes(f) || p.matAttr.includes(f) || p.matName.toLowerCase().includes(f);
    });
  }

  function renderGrid(photos) {
    var grid = document.getElementById('materiales-gallery-grid');
    var empty = document.getElementById('materiales-gallery-empty');
    if (!grid) return;

    if (!photos.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    grid.innerHTML = photos.map(function (p, i) {
      return '<button type="button" class="materiales-gallery-tile" data-idx="' + i + '" aria-label="Ampliar foto ' + escAttr(p.caption) + '">' +
        '<img loading="lazy" src="' + escAttr(p.src) + '" alt="' + escAttr(p.alt) + '">' +
        '<span class="materiales-gallery-tile-caption">' +
          '<span class="materiales-gallery-tile-mat">' + escAttr(p.matName) + '</span>' +
          '<span class="materiales-gallery-tile-text">' + escAttr(p.caption !== p.matName ? p.caption : '') + '</span>' +
        '</span>' +
        '</button>';
    }).join('');

    grid.querySelectorAll('.materiales-gallery-tile').forEach(function (tile) {
      tile.addEventListener('click', function () {
        var idx = parseInt(tile.dataset.idx, 10);
        openLightbox(idx);
      });
    });
  }

  function openLightbox(activeIdx) {
    var lb = document.getElementById('materiales-lightbox');
    var inner = lb && lb.querySelector('.materiales-lightbox-inner');
    if (!lb || !inner) return;

    if (lightboxSwiper) {
      lightboxSwiper.destroy(true, true);
      lightboxSwiper = null;
    }
    inner.innerHTML = '';

    var slidesHtml = currentFiltered.map(function (p) {
      return '<div class="swiper-slide" data-mat="' + escAttr(p.matName) + '" data-cap="' + escAttr(p.caption) + '">' +
        '<img src="' + escAttr(p.src) + '" alt="' + escAttr(p.alt) + '">' +
        '<div class="materiales-lightbox-caption">' +
          '<span class="materiales-lightbox-caption-mat">' + escAttr(p.matName) + '</span>' +
          '<span>' + escAttr(p.caption !== p.matName ? p.caption : '') + '</span>' +
        '</div>' +
        '</div>';
    }).join('');

    inner.innerHTML =
      '<div class="swiper materiales-lightbox-swiper">' +
        '<div class="swiper-wrapper">' + slidesHtml + '</div>' +
      '</div>' +
      '<button class="materiales-lightbox-swiper-prev" aria-label="Foto anterior" type="button"></button>' +
      '<button class="materiales-lightbox-swiper-next" aria-label="Foto siguiente" type="button"></button>';

    var swEl = inner.querySelector('.materiales-lightbox-swiper');
    lightboxSwiper = new Swiper(swEl, {
      initialSlide: activeIdx || 0,
      loop: currentFiltered.length > 2,
      speed: 350,
      navigation: {
        nextEl: inner.querySelector('.materiales-lightbox-swiper-next'),
        prevEl: inner.querySelector('.materiales-lightbox-swiper-prev'),
      },
      keyboard: { enabled: true },
      a11y: {
        prevSlideMessage: 'Foto anterior',
        nextSlideMessage: 'Foto siguiente',
      },
    });

    lb.hidden = false;
    requestAnimationFrame(function () { lb.classList.add('open'); });
    document.body.style.overflow = 'hidden';
    var closeBtn = document.getElementById('materiales-lightbox-close');
    if (closeBtn) closeBtn.focus();
  }

  function closeLightbox() {
    var lb = document.getElementById('materiales-lightbox');
    if (!lb) return;
    lb.classList.remove('open');
    setTimeout(function () {
      lb.hidden = true;
      if (lightboxSwiper) {
        lightboxSwiper.destroy(true, true);
        lightboxSwiper = null;
      }
      var inner = lb.querySelector('.materiales-lightbox-inner');
      if (inner) inner.innerHTML = '';
      document.body.style.overflow = '';
    }, 260);
  }

  function applyFilter(filter) {
    currentFiltered = filterPhotos(filter);
    renderGrid(currentFiltered);
  }

  function init(data) {
    allPhotos = buildAllPhotos(data && data.materials && data.materials.items);

    // Read active filter button if any
    var activeFilter = document.querySelector('.materiales-filter.is-active');
    var f = (activeFilter && activeFilter.dataset.filter) || 'all';
    applyFilter(f);

    // Hook into filter clicks
    document.querySelectorAll('.materiales-filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyFilter(btn.dataset.filter || 'all');
      });
    });

    // Lightbox close handlers
    var closeBtn = document.getElementById('materiales-lightbox-close');
    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);

    var lbEl = document.getElementById('materiales-lightbox');
    if (lbEl) {
      lbEl.addEventListener('click', function (e) {
        if (e.target.id === 'materiales-lightbox') closeLightbox();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var lb = document.getElementById('materiales-lightbox');
        if (lb && lb.classList.contains('open')) closeLightbox();
      }
    });
  }

  document.addEventListener('site-data-ready', function (e) {
    init(e.detail || {});
  });
})();
