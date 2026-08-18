(function initNormalize(globalScope) {
  globalScope.EleanorBridge ??= {};
  const CHANNEL_ALIASES = {
    FB: "FACEBOOK",
    FACEBOOK: "FACEBOOK",
    MESSENGER: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    IG: "INSTAGRAM",
    WHATSAPP: "WHATSAPP",
    WA: "WHATSAPP"
  };

  function normalizeWhitespace(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t\f\v]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizeChannel(value) {
    const normalized = String(value || "").trim().toUpperCase();
    return CHANNEL_ALIASES[normalized] || "UNKNOWN";
  }

  function normalizeDirection(value) {
    const normalized = String(value || "").trim().toUpperCase();
    return ["INBOUND", "OUTBOUND", "UNKNOWN"].includes(normalized) ? normalized : "UNKNOWN";
  }

  function normalizeTimestamp(value) {
    if (!value) return { timestamp: undefined, timestampConfidence: "LOW" };
    const raw = String(value).trim();
    if (!raw) return { timestamp: undefined, timestampConfidence: "LOW" };
    if (/^\d+$/.test(raw)) return { timestamp: undefined, timestampConfidence: "LOW" };
    if (/^\d{1,2}:\d{2}\s?(AM|PM)?$/i.test(raw)) return { timestamp: undefined, timestampConfidence: "LOW" };
    if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(day)?\s+\d{1,2}:\d{2}\s?(AM|PM)?$/i.test(raw)) return { timestamp: undefined, timestampConfidence: "LOW" };

    const parsed = parseTimestampMillis(raw);
    if (!Number.isFinite(parsed)) {
      return { timestamp: undefined, timestampConfidence: "LOW" };
    }

    const date = new Date(parsed);
    if (date.getUTCFullYear() <= 1970 && !/\b1970\b/.test(raw)) {
      return { timestamp: undefined, timestampConfidence: "LOW" };
    }

    return { timestamp: date.toISOString().replace(".000Z", "Z"), timestampConfidence: "HIGH" };
  }

  function parseTimestampMillis(raw) {
    const isoWithZone = raw.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/i);
    if (isoWithZone) return Date.parse(raw);

    const monthDateTime = raw.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2}),?\s+(\d{1,2}):(\d{2})\s?(AM|PM)?$/i);
    if (monthDateTime) {
      const month = monthIndex(monthDateTime[1]);
      const day = Number(monthDateTime[2]);
      const year = Number(monthDateTime[3]);
      const time = parseTimeParts(monthDateTime[4], monthDateTime[5], monthDateTime[6]);
      if (month >= 0 && validDateParts(year, month, day) && time) {
        return new Date(year, month, day, time.hours, time.minutes, 0, 0).getTime();
      }
    }

    return NaN;
  }

  function monthIndex(value) {
    const key = String(value || "").slice(0, 3).toLowerCase();
    return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(key);
  }

  function parseTimeParts(hourValue, minuteValue, meridiemValue) {
    let hours = Number(hourValue);
    const minutes = Number(minuteValue);
    const meridiem = meridiemValue && String(meridiemValue).toUpperCase();
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes > 59) return null;
    if (meridiem && (hours < 1 || hours > 12)) return null;
    if (!meridiem && hours > 23) return null;
    if (meridiem === "PM" && hours !== 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
    return { hours, minutes };
  }

  function validDateParts(year, month, day) {
    const date = new Date(year, month, day);
    return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
  }

  function normalizeAttachment(attachment) {
    const type = String(attachment && attachment.type || "UNKNOWN").trim().toUpperCase();
    return {
      type: ["IMAGE", "VIDEO", "AUDIO", "FILE", "LINK", "UNKNOWN"].includes(type) ? type : "UNKNOWN",
      url: attachment && attachment.url ? String(attachment.url) : undefined,
      name: attachment && attachment.name ? normalizeWhitespace(attachment.name) : undefined
    };
  }

  function normalizeMessageForFingerprint(message) {
    const attachments = (message.attachments || [])
      .map(normalizeAttachment)
      .map((attachment) => [
        attachment.type,
        attachment.url || "",
        attachment.name || ""
      ].join(":"))
      .sort()
      .join("|");

    return {
      externalMessageId: message.externalMessageId || "",
      direction: normalizeDirection(message.direction),
      text: normalizeWhitespace(message.text),
      timestamp: normalizeTimestamp(message.timestamp).timestamp || "",
      attachments
    };
  }

  const api = {
    normalizeWhitespace,
    normalizeChannel,
    normalizeDirection,
    normalizeTimestamp,
    parseTimestampMillis,
    normalizeAttachment,
    normalizeMessageForFingerprint
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    Object.assign(globalScope.EleanorBridge, api);
  }
  console.log("[Eleanor Bridge] normalize loaded");
})(globalThis);
