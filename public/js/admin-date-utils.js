/* ================================================================
   Admin Bangkok Date Utilities
   ================================================================ */

(function () {
  'use strict';

  const TIMEZONE = 'Asia/Bangkok';
  const dayMs = 24 * 60 * 60 * 1000;

  const datePartsFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  function getBangkokDateParts(value) {
    const hasValue = value !== null && typeof value !== 'undefined' && value !== '';
    const date = value instanceof Date ? value : new Date(hasValue ? value : Date.now());
    if (Number.isNaN(date.getTime())) return null;
    const parts = datePartsFormatter.formatToParts(date);
    const byType = {};
    parts.forEach(part => {
      if (part.type !== 'literal') byType[part.type] = part.value;
    });
    return {
      year: byType.year,
      month: byType.month,
      day: byType.day
    };
  }

  function todayKey() {
    const parts = getBangkokDateParts(new Date());
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function parseDateKey(dateKey) {
    const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    if (
      utcDate.getUTCFullYear() !== year ||
      utcDate.getUTCMonth() !== month - 1 ||
      utcDate.getUTCDate() !== day
    ) {
      return null;
    }
    return utcDate;
  }

  function addDays(dateKey, days) {
    const parsed = parseDateKey(dateKey);
    if (!parsed) return todayKey();
    const shifted = new Date(parsed.getTime() + (Number(days) || 0) * dayMs);
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function rangeForPreset(range) {
    const endDate = todayKey();
    if (range === 'today') {
      return { startDate: endDate, endDate };
    }
    if (range === '7days') {
      return { startDate: addDays(endDate, -6), endDate };
    }
    if (range === '30days') {
      return { startDate: addDays(endDate, -29), endDate };
    }
    if (range === 'all') {
      return { startDate: '1970-01-01', endDate };
    }
    return { startDate: '', endDate };
  }

  function formatInputDate(value) {
    if (!value) return '';
    const inputDateKey = typeof value === 'string' && parseDateKey(value) ? value : '';
    if (inputDateKey) return inputDateKey;
    const parts = getBangkokDateParts(value);
    if (!parts) return '';
    const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
    return parseDateKey(dateKey) ? dateKey : '';
  }

  function formatDate(value, options = {}) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: TIMEZONE,
      day: options.day || '2-digit',
      month: options.month || '2-digit',
      year: options.year,
      hour: options.hour,
      minute: options.minute,
      hour12: false
    }).format(date);
  }

  window.AdminBangkokDate = {
    TIMEZONE,
    addDays,
    formatDate,
    formatInputDate,
    rangeForPreset,
    todayKey
  };
})();
