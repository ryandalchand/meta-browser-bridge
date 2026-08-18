(function initEleanorApi(globalScope) {
  globalScope.EleanorBridge ??= {};

  const SYNC_PATH = "/api/browser-bridge/meta/sync";
  const HEALTH_PATH = "/api/browser-bridge/meta/health";
  const SUPPORTED_SYNC_CHANNELS = ["FACEBOOK", "INSTAGRAM"];
  const SAFE_ERROR_MESSAGES = {
    "bridge-unauthorized": "Bridge token is not authorized.",
    "invalid-payload": "Eleanor rejected the conversation payload.",
    "unsupported-channel": "This Meta channel is not supported for sync.",
    "conversation-upsert-failed": "Eleanor could not save the conversation.",
    "message-import-failed": "Eleanor could not import messages.",
    "analysis-failed": "Messages synced. Analysis needs retry in Eleanor."
  };

  function normalizeBaseUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) throw new Error("Eleanor Base URL must use http or https.");
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  }

  function maskToken(token) {
    const value = String(token || "");
    if (!value) return "";
    if (value.length <= 4) return "••••";
    return `••••${value.slice(-4)}`;
  }

  function validateSettings(settings) {
    const baseUrl = normalizeBaseUrl(settings && settings.baseUrl);
    const token = String(settings && settings.token || "").trim();
    if (!baseUrl || !token) {
      return { ok: false, code: "missing-settings", message: "Set Eleanor Base URL and Browser Bridge Token first." };
    }
    return { ok: true, baseUrl, token };
  }

  function validatePayload(payload) {
    if (!payload || payload.source !== "META_BUSINESS_SUITE") {
      return { ok: false, code: "invalid-payload", message: "No Meta conversation payload is available." };
    }
    if (!SUPPORTED_SYNC_CHANNELS.includes(payload.channel)) {
      return { ok: false, code: "unsupported-channel", message: payload.channel === "UNKNOWN" ? "Unable to determine Meta channel." : "This Meta channel is not supported for sync." };
    }
    return { ok: true };
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (!text) return {};
    if (/^\s*<!doctype html/i.test(text) || /^\s*<html[\s>]/i.test(text)) {
      return {
        code: response.status === 404 ? "endpoint-not-found" : "html-response",
        message: response.status === 404 ? "Endpoint not found." : "Eleanor returned an HTML page instead of JSON."
      };
    }
    try {
      return JSON.parse(text);
    } catch (_) {
      return { message: text.slice(0, 240) };
    }
  }

  function safeError(code, fallback) {
    return {
      ok: false,
      code: code || "sync-failed",
      message: SAFE_ERROR_MESSAGES[code] || fallback || "Sync failed."
    };
  }

  async function syncMetaConversation({ settings, payload, fetchImpl }) {
    const settingsResult = validateSettings(settings);
    if (!settingsResult.ok) return settingsResult;

    const payloadResult = validatePayload(payload);
    if (!payloadResult.ok) return payloadResult;

    const fetchFn = fetchImpl || globalScope.fetch;
    if (!fetchFn) return safeError("api-unavailable", "Eleanor API is unavailable.");

    let response;
    try {
      response = await fetchFn(`${settingsResult.baseUrl}${SYNC_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${settingsResult.token}`
        },
        body: JSON.stringify(payload)
      });
    } catch (_) {
      return safeError("api-unavailable", "Eleanor API is unavailable.");
    }

    const body = await parseResponse(response);
    if (!response.ok) {
      return safeError(body && body.code, body && body.message);
    }

    const analysisFailed = body && (body.code === "analysis-failed" || body.analysisStatus === "failed" || body.analysisFailed);
    return {
      ok: true,
      code: analysisFailed ? "analysis-failed" : body.code,
      message: analysisFailed ? SAFE_ERROR_MESSAGES["analysis-failed"] : undefined,
      data: body
    };
  }

  async function testConnection({ settings, fetchImpl }) {
    const settingsResult = validateSettings(settings);
    if (!settingsResult.ok) return settingsResult;

    const fetchFn = fetchImpl || globalScope.fetch;
    if (!fetchFn) return safeError("api-unavailable", "Eleanor API is unavailable.");

    try {
      const response = await fetchFn(`${settingsResult.baseUrl}${HEALTH_PATH}`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${settingsResult.token}` }
      });
      const body = await parseResponse(response);
      if (response.status === 404 || body.code === "endpoint-not-found") {
        return {
          ok: false,
          code: "health-endpoint-not-found",
          message: "No Eleanor health-check endpoint was found. Settings are saved; test by syncing a real Facebook or Instagram conversation."
        };
      }
      if (!response.ok) return safeError(body && body.code, body && body.message || "Connection test failed.");
      return { ok: true, data: body };
    } catch (_) {
      return safeError("api-unavailable", "Eleanor API is unavailable.");
    }
  }

  function summarizeSyncResponse(result, payload) {
    if (!result || !result.ok) return result || safeError("sync-failed", "Sync failed.");
    const data = result.data || {};
    const inserted = Number(data.insertedMessages ?? data.newMessagesImported ?? data.newMessages ?? data.messagesInserted ?? 0);
    const alreadySynced = Number(data.alreadySyncedMessages ?? data.alreadySynced ?? data.duplicateMessages ?? 0);
    const completeness = data.completenessPercent ?? data.completeness;
    const created = Boolean(data.created || data.newConversation || data.conversationCreated);
    return {
      ok: true,
      code: result.code,
      status: result.code === "analysis-failed" ? "analysis-failed" : inserted === 0 ? "already-up-to-date" : "synced",
      channel: payload && payload.channel,
      customerName: payload && payload.customer && (payload.customer.displayName || payload.customer.username),
      messagesDetected: payload && payload.summary ? payload.summary.messagesDetected : payload && payload.messages ? payload.messages.length : 0,
      insertedMessages: inserted,
      alreadySyncedMessages: alreadySynced,
      created,
      newlyCompleted: data.newlyCompleted || data.completedFields || [],
      stillMissing: data.stillMissing || data.missingFields || [],
      completeness,
      message: result.message
    };
  }

  const api = {
    SYNC_PATH,
    HEALTH_PATH,
    SUPPORTED_SYNC_CHANNELS,
    SAFE_ERROR_MESSAGES,
    normalizeBaseUrl,
    maskToken,
    validateSettings,
    validatePayload,
    syncMetaConversation,
    testConnection,
    summarizeSyncResponse
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    Object.assign(globalScope.EleanorBridge, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
