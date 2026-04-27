/* ── Minera Fame — minera-fame.js ── */

/* Smart anchor scroll: mide header real + offset preciso */
function initSmartAnchorScroll() {
  const headerEl = document.getElementById('mf-header') || document.querySelector('.mf-header');
  const measure = () => {
    if (!headerEl) return 88;
    const h = headerEl.offsetHeight;
    document.documentElement.style.setProperty('--mf-header-h-real', h + 'px');
    return h;
  };
  measure();
  window.addEventListener('resize', measure);
  let scrollT;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollT);
    scrollT = setTimeout(measure, 150);
  });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"], a[href*=".html#"]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    const hashIdx = href.indexOf('#');
    if (hashIdx === -1) return;
    const id = href.slice(hashIdx + 1);
    if (!id) return;
    const samePagePart = href.slice(0, hashIdx);
    if (samePagePart && samePagePart !== window.location.pathname.split('/').pop()) return;
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    const offset = measure() + 12;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
    history.replaceState(null, '', '#' + id);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initHeader();
  initMobileNav();
  initSmartAnchorScroll();
  initGSAP();
  initContactForm();
  initMaterialCardPrefill();

  /* CMS hydration: si data/mf.json carga, aplica al DOM */
  if (window.fetchSiteData && window.hydrate) {
    const data = await window.fetchSiteData('mf');
    if (data) window.hydrate(data);
  }

  /* Hero + projects + stats post-fetch (cuentan items renderizados) */
  initHeroSwiper();
  initProjectsSwiper();
  initStatCounters();
});

/* ── Hero Swiper ─────────────────────────────────────────────────────────── */
function initHeroSwiper() {
  const el = document.querySelector('.mf-hero-swiper');
  if (!el || typeof Swiper === 'undefined') return;

  const counterEl = document.querySelector('.mf-hero-counter-current');
  const totalEl   = document.querySelector('.mf-hero-counter-total');
  const fillEl    = document.querySelector('.mf-hero-counter-fill');

  new Swiper(el, {
    effect: 'fade',
    fadeEffect: { crossFade: true },
    loop: true,
    speed: 1400,
    autoplay: {
      delay: 9000,
      disableOnInteraction: false,
      pauseOnMouseEnter: false,
    },
    on: {
      init: function () {
        if (totalEl) totalEl.textContent = String(this.slides.length).padStart(2, '0');
      },
      slideChange: function () {
        if (counterEl) counterEl.textContent = String(this.realIndex + 1).padStart(2, '0');
        if (fillEl) {
          fillEl.style.animation = 'none';
          // force reflow para restart
          void fillEl.offsetWidth;
          fillEl.style.animation = '';
        }
      },
    },
    pagination: {
      el: '.mf-pagination',
      clickable: true,
    },
    navigation: {
      nextEl: '.mf-btn-next',
      prevEl: '.mf-btn-prev',
    },
    keyboard: { enabled: true },
    a11y: {
      prevSlideMessage: 'Slide anterior',
      nextSlideMessage: 'Slide siguiente',
    },
  });
}

/* ── Projects Swiper ─────────────────────────────────────────────────────── */
function initProjectsSwiper() {
  const el = document.querySelector('.mf-projects-swiper');
  if (!el || typeof Swiper === 'undefined') return;

  new Swiper(el, {
    slidesPerView: 1.15,
    spaceBetween: 12,
    grabCursor: true,
    loop: true,
    autoplay: {
      delay: 4500,
      disableOnInteraction: false,
      pauseOnMouseEnter: true,
    },
    breakpoints: {
      480:  { slidesPerView: 2,    spaceBetween: 12 },
      768:  { slidesPerView: 2.5,  spaceBetween: 14 },
      1024: { slidesPerView: 3,    spaceBetween: 16 },
      1280: { slidesPerView: 4,    spaceBetween: 16 },
    },
    navigation: {
      nextEl: '.mf-projects-btn-next',
      prevEl: '.mf-projects-btn-prev',
    },
    pagination: {
      el: '.mf-projects-pagination',
      clickable: true,
      dynamicBullets: true,
    },
    keyboard: { enabled: true },
    a11y: {
      prevSlideMessage: 'Proyecto anterior',
      nextSlideMessage: 'Proyecto siguiente',
    },
  });
}

/* ── Header ──────────────────────────────────────────────────────────────── */
function initHeader() {
  const header = document.getElementById('mf-header');
  if (!header) return;

  let lastScroll = window.scrollY, ticking = false;

  header.classList.toggle('scrolled', window.scrollY > 20);

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const current = window.scrollY;
      header.classList.toggle('scrolled', current > 20);
      header.classList.toggle('hidden', current > lastScroll && current > 150);
      lastScroll = Math.max(0, current);
      ticking = false;
    });
  }, { passive: true });
}

/* ── Mobile nav ──────────────────────────────────────────────────────────── */
function initMobileNav() {
  const toggle = document.getElementById('mf-mobile-toggle');
  const nav    = document.getElementById('mf-nav');
  if (!toggle || !nav) return;

  const openIcon  = `<svg width="24" height="24"><use href="#x"/></svg>`;
  const closeIcon = `<svg width="24" height="24"><use href="#menu"/></svg>`;

  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
    toggle.innerHTML = open ? openIcon : closeIcon;
  });

  nav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = closeIcon;
    });
  });
}

/* ── Stat counters ───────────────────────────────────────────────────────── */
function initStatCounters() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el     = entry.target;
      const target = parseInt(el.dataset.count, 10);
      const suffix = el.dataset.suffix || '';
      const dur    = 1200;
      const start  = performance.now();

      const tick = now => {
        const p = Math.min((now - start) / dur, 1);
        el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-count]').forEach(c => observer.observe(c));
}

/* ── GSAP animations ─────────────────────────────────────────────────────── */
function initGSAP() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  gsap.registerPlugin(ScrollTrigger);

  /* Hero slide content entrance */
  gsap.from('.mf-slide-logo', { y: -20, opacity: 0, duration: 0.7, ease: 'expo.out', delay: 0.3 });
  gsap.from('.mf-slide-eyebrow', { y: 16, opacity: 0, duration: 0.6, ease: 'expo.out', delay: 0.5 });
  gsap.from('.mf-slide-title', { y: 40, opacity: 0, duration: 0.9, ease: 'expo.out', delay: 0.65 });
  gsap.from('.mf-slide-sub, .mf-slide-actions', {
    y: 20, opacity: 0, duration: 0.7, ease: 'expo.out', stagger: 0.12, delay: 0.9,
  });

  /* Stagger reveal for [data-reveal] groups */
  gsap.utils.toArray('[data-reveal]').forEach(group => {
    const children = Array.from(group.children);
    if (!children.length) return;
    gsap.from(children, {
      y: 36, opacity: 0, duration: 0.8, ease: 'expo.out', stagger: 0.07,
      scrollTrigger: { trigger: group, start: 'top 82%', invalidateOnRefresh: true },
    });
  });

  /* Differential items */
  gsap.utils.toArray('.mf-diff-item').forEach((item, i) => {
    gsap.from(item, {
      x: -24, opacity: 0, duration: 0.65, ease: 'expo.out',
      scrollTrigger: { trigger: item, start: 'top 88%' },
      delay: i * 0.04,
    });
  });

  /* Material cards */
  gsap.utils.toArray('.mf-material-card').forEach((card, i) => {
    gsap.from(card, {
      y: 28, opacity: 0, scale: 0.97, duration: 0.65, ease: 'expo.out',
      scrollTrigger: { trigger: card, start: 'top 90%' },
      delay: i * 0.06,
    });
  });

/* Fachada section */
  gsap.from('.mf-fachada-visual img', {
    scale: 1.08, duration: 1.2, ease: 'expo.out',
    scrollTrigger: { trigger: '.mf-fachada-section', start: 'top 75%' },
  });

  /* Refresh after load */
  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
}

/* ── Material card prefill ─────────────────────────────────────────────────── */
function initMaterialCardPrefill() {
  document.querySelectorAll('.mf-material-card[data-material]').forEach(card => {
    card.addEventListener('click', () => {
      const mat = card.dataset.material;
      const sel = document.getElementById('mf-material');
      const msg = document.getElementById('mf-msg');
      if (sel) {
        const opt = Array.from(sel.options).find(o => o.value === mat || o.text === mat);
        if (opt) sel.value = opt.value || opt.text;
      }
      if (msg && !msg.value) {
        msg.value = `Hola, quiero más información sobre ${mat}.`;
      }
    });
  });
}

/* ── Contact form ─────────────────────────────────────────────────────────── */
function initContactForm() {
  const form = document.getElementById('mf-contact-form');
  if (!form) return;

  const btn      = form.querySelector('[type="submit"]');
  const status   = document.getElementById('mf-form-status');
  const fallback = form.dataset.fallbackEmail || 'info@minerafame.com';

  form.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', () => el.classList.remove('is-invalid'));
    el.addEventListener('change', () => el.classList.remove('is-invalid'));
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();

    if (form.elements._gotcha?.value) return;

    if (!form.checkValidity()) {
      form.querySelectorAll(':invalid').forEach(el => el.classList.add('is-invalid'));
      status.className = 'form-status error';
      status.innerHTML = `<svg width="16" height="16"><use href="#x"/></svg> Completá los campos obligatorios.`;
      form.querySelector(':invalid')?.focus();
      return;
    }

    const data = new FormData(form);

    btn.classList.add('is-loading');
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span> Enviando…`;
    status.className = 'form-status';
    status.innerHTML = '';

    if (form.action.includes('FORMSPREE_ID')) {
      const subject = encodeURIComponent('Consulta — Minera Fame');
      const body = encodeURIComponent(
        `Nombre: ${data.get('name') || ''}\nEmail: ${data.get('email') || ''}\n` +
        `Teléfono: ${data.get('phone') || ''}\nMaterial: ${data.get('material') || ''}\n\n` +
        `Mensaje:\n${data.get('message') || ''}`
      );
      window.location.href = `mailto:${fallback}?subject=${subject}&body=${body}`;
      status.className = 'form-status success';
      status.innerHTML = `<svg width="16" height="16"><use href="#check"/></svg> Abrimos tu cliente de email para enviar el mensaje.`;
      btn.innerHTML = 'Enviar consulta <svg width="16" height="16"><use href="#arrow-right"/></svg>';
      btn.disabled = false;
      btn.classList.remove('is-loading');
      return;
    }

    try {
      const resp = await fetch(form.action, {
        method: 'POST',
        body: data,
        headers: { Accept: 'application/json' },
      });

      if (resp.ok) {
        form.reset();
        form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
        status.className = 'form-status success';
        status.innerHTML = `<svg width="16" height="16"><use href="#check"/></svg> ¡Mensaje enviado! Nos pondremos en contacto a la brevedad.`;
      } else {
        throw new Error();
      }
    } catch {
      status.className = 'form-status error';
      status.innerHTML =
        `<svg width="16" height="16"><use href="#x"/></svg> ` +
        `No pudimos enviar el mensaje. Escribinos a ` +
        `<a href="mailto:${fallback}">${fallback}</a>.`;
    } finally {
      btn.innerHTML = 'Enviar consulta <svg width="16" height="16"><use href="#arrow-right"/></svg>';
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  });
}
