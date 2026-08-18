(function initBackground(globalScope) {
  globalScope.EleanorBridge ??= {};
  const Bridge = globalScope.EleanorBridge;
  const extensionApi =
    typeof browser !== "undefined"
      ? browser
      : typeof chrome !== "undefined"
        ? chrome
        : null;

  const SETTINGS_KEYS = {
    baseUrl: "eleanorBaseUrl",
    token: "eleanorBridgeToken"
  };

  async function getSettings() {
    const values = await extensionApi.storage.local.get(Object.values(SETTINGS_KEYS));
    return {
      baseUrl: values[SETTINGS_KEYS.baseUrl] || "",
      token: values[SETTINGS_KEYS.token] || ""
    };
  }

  async function getPublicSettings() {
    const settings = await getSettings();
    return {
      baseUrl: settings.baseUrl,
      hasToken: Boolean(settings.token),
      maskedToken: Bridge.maskToken(settings.token)
    };
  }

  async function saveSettings(settings) {
    const updates = {};
    if (settings.baseUrl !== undefined) {
      updates[SETTINGS_KEYS.baseUrl] = Bridge.normalizeBaseUrl(settings.baseUrl);
    }
    if (settings.token !== undefined && String(settings.token).trim()) {
      updates[SETTINGS_KEYS.token] = String(settings.token).trim();
    }
    await extensionApi.storage.local.set(updates);
    return getPublicSettings();
  }

  if (!extensionApi) {
    console.error("[Eleanor Bridge] WebExtension API unavailable in background");
    return;
  }

  extensionApi.runtime.onInstalled.addListener(() => {
    console.info("[Eleanor Bridge] Installed. Facebook/Instagram sync enabled after settings are configured.");
  });

  extensionApi.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) return undefined;

    if (message.type === "ELEANOR_BRIDGE_GET_SETTINGS") {
      return getPublicSettings();
    }

    if (message.type === "ELEANOR_BRIDGE_SAVE_SETTINGS") {
      return saveSettings(message.settings || {});
    }

    if (message.type === "ELEANOR_BRIDGE_TEST_CONNECTION") {
      return getSettings().then((settings) => Bridge.testConnection({ settings }));
    }

    if (message.type === "ELEANOR_BRIDGE_OPEN_SETTINGS") {
      return extensionApi.runtime.openOptionsPage().then(() => ({ ok: true }));
    }

    if (message.type === "ELEANOR_BRIDGE_META_SYNC") {
      return getSettings()
        .then((settings) => Bridge.syncMetaConversation({ settings, payload: message.payload }))
        .then((result) => ({
          ...result,
          summary: Bridge.summarizeSyncResponse(result, message.payload)
        }));
    }

    return undefined;
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
