(function initPopup(globalScope) {
  const extensionApi =
    typeof browser !== "undefined"
      ? browser
      : typeof chrome !== "undefined"
        ? chrome
        : null;
  const metaStatus = document.getElementById("meta-status");
  const conversationStatus = document.getElementById("conversation-status");
  const inspectButton = document.getElementById("inspect");
  const baseUrlInput = document.getElementById("base-url");
  const tokenInput = document.getElementById("bridge-token");
  const tokenStatus = document.getElementById("token-status");
  const saveSettingsButton = document.getElementById("save-settings");
  const testConnectionButton = document.getElementById("test-connection");
  const error = document.getElementById("error");

  function isMetaBusinessSuite(tab) {
    try {
      const url = new URL(tab.url || "");
      return url.hostname === "business.facebook.com";
    } catch (_) {
      return false;
    }
  }

  function summarize(result) {
    if (!result || !result.ok) return "Unable to read conversation";
    const payload = result.payload;
    const customer = payload.customer.displayName || payload.customer.username || "Unknown customer";
    return `${payload.channel}\n${customer}\n${payload.messages.length} messages detected`;
  }

  async function activeTab() {
    if (!extensionApi) throw new Error("WebExtension API unavailable");
    const tabs = await extensionApi.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  async function refreshStatus() {
    const tab = await activeTab();
    const connected = tab && isMetaBusinessSuite(tab);
    metaStatus.textContent = connected ? "Connected" : "Not detected";
    inspectButton.disabled = !connected;
  }

  async function loadSettings() {
    if (!extensionApi) return;
    const settings = await extensionApi.runtime.sendMessage({ type: "ELEANOR_BRIDGE_GET_SETTINGS" });
    baseUrlInput.value = settings && settings.baseUrl ? settings.baseUrl : "";
    tokenInput.value = "";
    tokenInput.placeholder = settings && settings.hasToken ? settings.maskedToken : "Not saved";
    tokenStatus.textContent = settings && settings.hasToken ? `Saved token: ${settings.maskedToken}` : "No token saved";
  }

  async function saveSettings() {
    error.textContent = "";
    saveSettingsButton.disabled = true;
    try {
      const settings = {
        baseUrl: baseUrlInput.value,
        token: tokenInput.value
      };
      const saved = await extensionApi.runtime.sendMessage({ type: "ELEANOR_BRIDGE_SAVE_SETTINGS", settings });
      tokenInput.value = "";
      tokenInput.placeholder = saved.hasToken ? saved.maskedToken : "Not saved";
      tokenStatus.textContent = saved.hasToken ? `Saved token: ${saved.maskedToken}` : "No token saved";
      error.textContent = "Settings saved.";
    } catch (err) {
      error.textContent = err && err.message ? err.message : "Unable to save settings.";
    } finally {
      saveSettingsButton.disabled = false;
    }
  }

  async function testConnection() {
    error.textContent = "";
    testConnectionButton.disabled = true;
    try {
      const result = await extensionApi.runtime.sendMessage({ type: "ELEANOR_BRIDGE_TEST_CONNECTION" });
      error.textContent = result && result.ok ? "Connection OK." : result && result.message ? result.message : "Connection test failed.";
    } catch (err) {
      error.textContent = err && err.message ? err.message : "Connection test failed.";
    } finally {
      testConnectionButton.disabled = false;
    }
  }

  inspectButton.addEventListener("click", async () => {
    error.textContent = "";
    inspectButton.disabled = true;
    inspectButton.textContent = "Inspecting...";
    try {
      const tab = await activeTab();
      const result = await extensionApi.tabs.sendMessage(tab.id, { type: "ELEANOR_BRIDGE_INSPECT_CURRENT" });
      conversationStatus.textContent = summarize(result);
      if (!result || !result.ok) error.textContent = result && result.error ? result.error : "No conversation payload returned.";
    } catch (err) {
      error.textContent = "Open Meta Business Suite Inbox and reload the page if the bridge is not detected.";
    } finally {
      inspectButton.textContent = "Inspect Current Conversation";
      await refreshStatus();
    }
  });
  saveSettingsButton.addEventListener("click", saveSettings);
  testConnectionButton.addEventListener("click", testConnection);

  refreshStatus();
  loadSettings();
})(window);
