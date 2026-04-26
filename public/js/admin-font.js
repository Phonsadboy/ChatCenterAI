(function () {
  'use strict';

  const STORAGE_KEY = 'adminFont';
  const FONT_VARS = [
    '--font-family-base',
    '--font-family-heading',
    '--bs-font-sans-serif',
    '--bs-body-font-family',
    '--ic-font',
    '--instruction-font',
    '--font',
  ];

  function apply(font) {
    if (!font) return;
    FONT_VARS.forEach((name) => {
      document.documentElement.style.setProperty(name, font);
    });
  }

  function getSavedFont() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  function saveFont(font) {
    try {
      localStorage.setItem(STORAGE_KEY, font);
    } catch (_) {
      // Ignore storage errors; the visible font still updates for this page.
    }
  }

  window.AdminFont = {
    apply,
    getSavedFont,
    saveFont,
  };

  apply(getSavedFont());
})();
