(function () {
  'use strict';

  function buildSlider(card, item) {
    var existingImg = card.querySelector('img');
    if (!existingImg) return;

    var coverSrc = existingImg.src || existingImg.getAttribute('src') || '';
    var coverAlt = existingImg.alt || existingImg.getAttribute('alt') || '';

    // Build swiper-wrapper slides HTML
    var slidesHtml = '<div class="swiper-slide"><img loading="lazy" src="' +
      escAttr(coverSrc) + '" alt="' + escAttr(coverAlt) + '"></div>';

    for (var i = 0; i < item.gallery.length; i++) {
      var g = item.gallery[i];
      var captionAttr = g.caption ? ' data-caption="' + escAttr(g.caption) + '"' : '';
      slidesHtml += '<div class="swiper-slide"' + captionAttr + '>' +
        '<img loading="lazy" src="' + escAttr(g.src || '') + '" alt="' + escAttr(g.alt || '') + '"></div>';
    }

    var swiperHtml =
      '<div class="swiper mf-material-swiper">' +
        '<div class="swiper-wrapper">' + slidesHtml + '</div>' +
        '<button class="mf-material-swiper-prev" aria-label="Foto anterior" type="button"></button>' +
        '<button class="mf-material-swiper-next" aria-label="Foto siguiente" type="button"></button>' +
        '<div class="mf-material-swiper-pagination"></div>' +
      '</div>';

    // Replace existing img with swiper structure
    existingImg.insertAdjacentHTML('afterend', swiperHtml);
    existingImg.parentNode.removeChild(existingImg);

    // Inject caption tag at top-left of card (own background)
    var captionEl = document.createElement('div');
    captionEl.className = 'mf-material-caption';
    captionEl.setAttribute('aria-live', 'polite');
    card.appendChild(captionEl);

    function updateCaption(swiper) {
      var slide = swiper.slides[swiper.activeIndex];
      var caption = (slide && slide.dataset.caption) ? slide.dataset.caption : '';
      var captionEl = card.querySelector('.mf-material-caption');
      if (captionEl) {
        captionEl.textContent = caption;
        captionEl.style.opacity = caption ? '1' : '0';
      }
    }

    // Init Swiper passing element directly
    var swiperEl = card.querySelector('.mf-material-swiper');
    new Swiper(swiperEl, {
      loop: true,
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
        init: updateCaption,
        slideChange: updateCaption
      }
    });

    // Block card navigation when interacting with slider controls
    swiperEl.addEventListener('click', function (e) {
      if (e.target.closest('.mf-material-swiper-prev, .mf-material-swiper-next, .swiper-pagination-bullet')) {
        e.stopPropagation();
        e.preventDefault();
      }
    });
  }

  function escAttr(str) {
    return String(str)
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
      var item = items[idx];
      if (!item || !item.gallery || !item.gallery.length) return;
      try {
        buildSlider(card, item);
        built++;
      } catch (err) {
        console.error('[material-gallery] error en card idx=' + idx, err);
      }
    });
    console.log('[material-gallery] cards detectadas=' + cards.length + ' sliders montados=' + built);
  }

  document.addEventListener('site-data-ready', function (e) {
    initGalleries(e.detail || {});
  });

})();
