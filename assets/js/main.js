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
  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
  }

  // Init theme on load
  applyTheme(getStoredTheme() || getSystemTheme());

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    if (!getStoredTheme()) applyTheme(e.matches ? 'dark' : 'light');
  });

  // Expose toggle for onclick
  window.toggleTheme = function () {
    var current = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(current);
  };

  /* ── Mobile Menu ──────────────────────────────── */
  window.toggleMobileMenu = function () {
    var menu = document.getElementById('mobile-menu');
    if (menu) menu.classList.toggle('open');
  };

  // Close mobile menu when clicking a link
  document.addEventListener('click', function (e) {
    if (e.target.closest('#mobile-menu a')) {
      var menu = document.getElementById('mobile-menu');
      if (menu) menu.classList.remove('open');
    }
  });

  /* ── Active nav link highlighting ─────────────── */
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
})();
