/* ADB Pro — Shared site logic: theme toggle + mobile menu */

(function () {
  'use strict';

  /* ── Theme Toggle ─────────────────────────────── */
  var THEME_KEY = 'adbpro-theme';
  var root = document.documentElement;

  function getStoredTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (_) { return null; }
  }
  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme(theme, persist) {
    root.setAttribute('data-theme', theme);
    if (persist) {
      try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    }
  }

  // Init theme on load
  applyTheme(getStoredTheme() || getSystemTheme(), false);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    if (!getStoredTheme()) applyTheme(e.matches ? 'dark' : 'light');
  });

  // Expose toggle for onclick
  window.toggleTheme = function () {
    var current = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(current, true);
  };

  /* ── Mobile Menu ──────────────────────────────── */
  window.toggleMobileMenu = function () {
    var menu = document.getElementById('mobile-menu');
    if (menu) menu.classList.toggle('open');
  };

  /* Language preference */
  var LANGUAGE_KEY = 'adbpro-language-choice';

  document.addEventListener('click', function (e) {
    var languageLink = e.target.closest('[data-language-switch]');
    if (!languageLink) return;

    var targetLanguage = languageLink.getAttribute('data-language-target');
    if (!targetLanguage) return;

    try {
      localStorage.setItem(LANGUAGE_KEY, targetLanguage);
    } catch (_) {}
  });

  // Close mobile menu when clicking a link
  document.addEventListener('click', function (e) {
    if (e.target.closest('#mobile-menu a')) {
      var menu = document.getElementById('mobile-menu');
      if (menu) menu.classList.remove('open');
    }
  });

  /* ── Active nav link highlighting ─────────────── */
  var siteNav = document.querySelector('.site-nav');
  var backToTop = document.querySelector('.back-to-top');

  function updateScrollUi() {
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    if (siteNav) siteNav.classList.toggle('is-scrolled', y > 8);
    if (backToTop) backToTop.classList.toggle('is-visible', y > 420);
  }

  updateScrollUi();
  window.addEventListener('scroll', updateScrollUi, { passive: true });

  if (backToTop) {
    backToTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  var currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(function (link) {
    var href = link.getAttribute('href');
    if (!href) return;
    // Normalize: strip leading ./ and trailing /
    var normalized = href.replace(/^\.\//, '').replace(/\/$/, '');
    var currentNorm = currentPath.replace(/^.*\/web\//, '').replace(/^\//, '');
    if (normalized === currentNorm || (currentNorm === '' && normalized === 'index.html')) {
      link.classList.add('active');
    }
  });

  /* Click tracking */
  function slugifyEventLabel(value) {
    return (value || 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown';
  }

  function trackEvent(path, title) {
    if (!window.goatcounter || typeof window.goatcounter.count !== 'function') return;
    try {
      window.goatcounter.count({
        path: path,
        title: title || path,
        event: true
      });
    } catch (_) {}
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest('a');
    if (!link) return;

    var track = link.getAttribute('data-track');
    var label = link.getAttribute('data-track-label') || link.textContent.trim() || link.href;
    if (track) {
      trackEvent('/event/' + track + '/' + slugifyEventLabel(label), track + ': ' + label);
      return;
    }

    if (link.hostname && link.hostname !== window.location.hostname) {
      trackEvent('/event/outbound/' + slugifyEventLabel(link.hostname), 'Outbound: ' + link.href);
    }
  });

  /* Product screenshot lightbox */
  function ensureImageLightbox() {
    var existing = document.getElementById('image-lightbox');
    if (existing) return existing;

    var lightbox = document.createElement('div');
    lightbox.id = 'image-lightbox';
    lightbox.className = 'image-lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', 'Product screenshot preview');
    lightbox.innerHTML = [
      '<button class="image-lightbox-close" type="button" aria-label="Close image preview">&times;</button>',
      '<img alt="">'
    ].join('');
    document.body.appendChild(lightbox);

    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox || e.target.closest('.image-lightbox-close')) closeImageLightbox();
    });

    return lightbox;
  }

  function openImageLightbox(image) {
    var lightbox = ensureImageLightbox();
    var preview = lightbox.querySelector('img');
    preview.src = image.currentSrc || image.src;
    preview.alt = image.alt || 'Product screenshot preview';
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
    var closeButton = lightbox.querySelector('.image-lightbox-close');
    if (closeButton) closeButton.focus();
  }

  function closeImageLightbox() {
    var lightbox = document.getElementById('image-lightbox');
    if (!lightbox) return;
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.product-shot img').forEach(function (image) {
    image.setAttribute('tabindex', '0');
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', 'Open larger screenshot preview');
    image.addEventListener('click', function () { openImageLightbox(image); });
    image.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openImageLightbox(image);
      }
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeImageLightbox();
  });

  /* Features page interactive explorer */
  document.querySelectorAll('[data-feature-explorer]').forEach(function (explorer) {
    var title = explorer.querySelector('[data-feature-title]');
    var image = explorer.querySelector('[data-feature-image]');
    var description = explorer.querySelector('[data-feature-description]');
    var link = explorer.querySelector('[data-feature-link]');
    var buttons = explorer.querySelectorAll('.feature-explorer-menu button');

    function syncFeatureLink(button) {
      if (!link || !button) return;
      var detailUrl = button.getAttribute('data-detail') || '';
      if (detailUrl) {
        link.href = detailUrl;
        link.hidden = false;
        link.setAttribute('aria-hidden', 'false');
        link.tabIndex = 0;
      } else {
        link.removeAttribute('href');
        link.hidden = true;
        link.setAttribute('aria-hidden', 'true');
        link.tabIndex = -1;
      }
    }

    syncFeatureLink(explorer.querySelector('.feature-explorer-menu button.active'));

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        buttons.forEach(function (item) { item.classList.remove('active'); });
        button.classList.add('active');

        if (title) title.textContent = button.getAttribute('data-title') || button.textContent.trim();
        if (image) {
          image.src = button.getAttribute('data-image') || image.src;
          image.alt = button.getAttribute('data-alt') || image.alt;
        }
        if (description) {
          description.textContent = button.getAttribute('data-description') || '';
        }
        syncFeatureLink(button);
      });
    });
  });

  /* Resource navigator stack selector */
  document.querySelectorAll('[data-stack-navigator]').forEach(function (navigator) {
    var tabs = navigator.querySelectorAll('[data-stack-target]');
    var panels = navigator.querySelectorAll('[data-stack-panel]');

    function activateStack(target) {
      tabs.forEach(function (tab) {
        var isActive = tab.getAttribute('data-stack-target') === target;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      panels.forEach(function (panel) {
        panel.classList.toggle('active', panel.getAttribute('data-stack-panel') === target);
      });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        activateStack(tab.getAttribute('data-stack-target'));
      });
    });
  });

  /* Resource logos */
  function faviconUrl(url, size) {
    try {
      var parsed = new URL(url, window.location.href);
      return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(parsed.hostname) + '&sz=' + (size || 64);
    } catch (_) {
      return '';
    }
  }

  document.querySelectorAll('.resource-card[href^="http"]').forEach(function (card) {
    if (card.querySelector('.resource-card-logo')) return;
    var src = faviconUrl(card.href, 64);
    if (!src) return;

    var logo = document.createElement('img');
    logo.className = 'resource-card-logo';
    logo.src = src;
    logo.alt = '';
    logo.loading = 'lazy';
    logo.setAttribute('aria-hidden', 'true');
    card.insertBefore(logo, card.firstChild);
    card.classList.add('has-logo');
  });

  document.querySelectorAll('.stack-link-grid a[href^="http"]').forEach(function (link) {
    if (link.querySelector('.stack-link-logo')) return;
    var src = faviconUrl(link.href, 32);
    if (!src) return;

    var logo = document.createElement('img');
    logo.className = 'stack-link-logo';
    logo.src = src;
    logo.alt = '';
    logo.loading = 'lazy';
    logo.setAttribute('aria-hidden', 'true');
    link.insertBefore(logo, link.firstChild);
  });
})();
