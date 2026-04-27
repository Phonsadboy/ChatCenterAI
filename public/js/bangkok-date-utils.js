/* Shared Bangkok date helpers for admin filters. */
(function () {
  "use strict";

  const TIME_ZONE = "Asia/Bangkok";
  const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatUtcDate(date) {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }

  function getBangkokDateString(value) {
    if (typeof value === "string" && DATE_ONLY_PATTERN.test(value.trim())) {
      return value.trim();
    }
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return "";
    const parts = formatter.formatToParts(date).reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function addDays(dateString, days) {
    const source = getBangkokDateString(dateString) || getBangkokDateString();
    const [year, month, day] = source.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return formatUtcDate(date);
  }

  function quickRange(range) {
    const endDate = getBangkokDateString();
    let offset = 0;
    if (range === "7days") offset = -6;
    if (range === "30days") offset = -29;
    return {
      startDate: addDays(endDate, offset),
      endDate,
    };
  }

  window.BangkokDateUtils = {
    timeZone: TIME_ZONE,
    todayDateString: getBangkokDateString,
    formatDateInput: getBangkokDateString,
    addDays,
    quickRange,
  };
})();
