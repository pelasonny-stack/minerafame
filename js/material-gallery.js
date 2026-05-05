(function () {
  'use strict';

  function buildSlider(card, item) {
    var existingImg = card.querySelector('img');
    if (!existingImg) return;

    var coverSrc = existingImg.src || existingImg.getAttribute('src') || '';
    var coverAlt = existingImg.alt || existingImg.getAttribute('alt') || item.name || '';
    var coverCaption = item.name || '';

    var slidesHtml = buildSlideHtml(coverSrc, coverAlt, coverCaption);

    for (var i = 0; i < item.gallery.length; i++) {
      var g = item.gallery[i];
      if (!g || !g.src) continue;
      var cap = g.caption || g.alt || item.name || '';
      var alt = g.alt || g.caption || item.name || '';
      slidesHtml += buildSlideHtml(g.src, alt, cap);
    }

    var totalSlides = (slidesHtml.match(/swiper-slide/g) || []).length;

    var swiperHtml =
      '<div class="swiper mf-material-swiper">' +
        '<div class="swiper-wrapper">' + slidesHtml + '</div>' +
        '<button class="mf-material-swiper-prev" aria-label="Foto anterior" type="button"></button>' +
        '<button class="mf-material-swiper-next" aria-label="Foto siguiente" type="button"></button>' +
        '<div class="mf-material-swiper-pagination"></div>' +
        (totalSlides > 1 ? '<div class="mf-material-counter" aria-live="polite">1/' + totalSlides + '</div>' : '') +
      '</div>';

    existingImg.insertAdjacentHTML('afterend', swiperHtml);
    existingImg.parentNode.removeChild(existingImg);

    var captionEl = document.createElement('div');
    captionEl.className = 'mf-material-caption';
    captionEl.setAttribute('aria-live', 'polite');
    card.appendChild(captionEl);

    var swiperEl = card.querySelector('.mf-material-swiper');
    var counterEl = card.querySelector('.mf-material-counter');

    function updateUI(swiper) {
      var slide = swiper.slides[swiper.activeIndex];
      var caption = (slide && slide.dataset.caption) ? slide.dataset.caption : '';
      var capEl = card.querySelector('.mf-material-caption');
      if (capEl) {
        capEl.textContent = caption;
        capEl.classList.toggle('is-empty', !caption);
      }
      if (counterEl && swiper.slides.length > 1) {
        counterEl.textContent = (swiper.realIndex + 1) + '/' + swiper.slides.length;
      }
    }

    new Swiper(swiperEl, {
      loop: totalSlides > 1,
      speed: 500,
      navigation: {
        nextEl: card.querySelector('.mf-material-swiper-next'),
        prevEl: card.querySelector('.mf-material-swiper-prev')
      },
      pagination: {
        el: card.querySelector('.mf-material-swiper-pagination'),
        clickable: true
      },
      keyboard: { enabled: true },
      a11y: {
        prevSlideMessage: 'Foto anterior',
        nextSlideMessage: 'Foto siguiente'
      },
      on: {
        init: updateUI,
        slideChange: updateUI
      }
    });

    swiperEl.addEventListener('click', function (e) {
      if (e.target.closest('.mf-material-swiper-prev, .mf-material-swiper-next, .swiper-pagination-bullet')) {
        e.stopPropagation();
        e.preventDefault();
      }
    });
  }

  function buildSlideHtml(src, alt, caption) {
    var capAttr = caption ? ' data-caption="' + escAttr(caption) + '"' : '';
    return '<div class="swiper-slide"' + capAttr + '>' +
      '<img loading="lazy" src="' + escAttr(src) + '" alt="' + escAttr(alt) +
        '" onload="this.closest(\'.swiper-slide\').classList.add(\'has-loaded\')">' +
    '</div>';
  }

  function escAttr(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function initGalleries(data) {
    var items = (data.materials && data.materials.items) || [];
    var cards = document.querySelectorAll('.mf-materials-grid .mf-material-card');
    var built = 0;
    cards.forEach(function (card, idx) {
      var item = lookupItem(card, items, idx);
      if (!item) return;
      var hasGallery = item.gallery && item.gallery.length > 0;
      if (!hasGallery) {
        // Sin gallery: igual aplicamos caption con el nombre del material para discoverability
        applyStaticCaption(card, item);
        return;
      }
      try {
        buildSlider(card, item);
        built++;
      } catch (err) {
        console.error('[material-gallery] error en card idx=' + idx, err);
      }
    });
    console.log('[material-gallery] cards=' + cards.length + ' sliders=' + built);
  }

  function lookupItem(card, items, fallbackIdx) {
    var matId = card.dataset.matId;
    if (matId) {
      var byId = items.find(function (it) { return it && it.id === matId; });
      if (byId) return byId;
    }
    return items[fallbackIdx];
  }

  function applyStaticCaption(card, item) {
    if (!item.name) return;
    if (card.querySelector('.mf-material-caption')) return;
    var capEl = document.createElement('div');
    capEl.className = 'mf-material-caption is-static';
    capEl.textContent = item.name;
    card.appendChild(capEl);
  }

  document.addEventListener('site-data-ready', function (e) {
    initGalleries(e.detail || {});
  });

})();
