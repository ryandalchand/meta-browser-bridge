(function initFingerprint(globalScope) {
  globalScope.EleanorBridge ??= {};
  const nodeCrypto = typeof require === "function" ? require("crypto") : null;
  const normalizeApi = typeof require === "function" ? require("./normalize") : globalScope.EleanorBridge;

  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }

  async function sha256Hex(value) {
    if (globalScope.crypto && globalScope.crypto.subtle) {
      const bytes = new TextEncoder().encode(value);
      const hash = await globalScope.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return nodeCrypto.createHash("sha256").update(value).digest("hex");
  }

  function buildFingerprintInput({ channel, conversationIdentity, message }) {
    const normalized = normalizeApi.normalizeMessageForFingerprint(message);
    return {
      channel: normalizeApi.normalizeChannel(channel),
      conversationIdentity: conversationIdentity || "",
      direction: normalized.direction,
      text: normalized.text,
      timestamp: normalized.timestamp,
      attachments: normalized.attachments,
      externalMessageId: normalized.externalMessageId
    };
  }

  async function fingerprintMessage({ channel, conversationIdentity, message }) {
    return sha256Hex(stableStringify(buildFingerprintInput({ channel, conversationIdentity, message })));
  }

  const api = { stableStringify, sha256Hex, buildFingerprintInput, fingerprintMessage };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    Object.assign(globalScope.EleanorBridge, api);
  }
  console.log("[Eleanor Bridge] fingerprint loaded");
})(globalThis);
