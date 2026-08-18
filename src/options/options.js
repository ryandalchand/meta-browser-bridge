(function initOptions() {
  const extensionApi =
    typeof browser !== "undefined"
      ? browser
      : typeof chrome !== "undefined"
        ? chrome
        : null;

  const baseUrlInput = document.getElementById("base-url");
  const tokenInput = document.getElementById("bridge-token");
  const tokenStatus = document.getElementById("token-status");
  const status = document.getElementById("status");
  const saveButton = document.getElementById("save-settings");
  const testButton = document.getElementById("test-connection");

  async function loadSettings() {
    const settings = await extensionApi.runtime.sendMessage({ type: "ELEANOR_BRIDGE_GET_SETTINGS" });
    baseUrlInput.value = settings && settings.baseUrl ? settings.baseUrl : "";
    tokenInput.value = "";
    tokenInput.placeholder = settings && settings.hasToken ? settings.maskedToken : "Not saved";
    tokenStatus.textContent = settings && settings.hasToken ? `Saved token: ${settings.maskedToken}` : "No token saved";
  }

  async function saveSettings() {
    status.textContent = "";
    saveButton.disabled = true;
    try {
      const saved = await extensionApi.runtime.sendMessage({
        type: "ELEANOR_BRIDGE_SAVE_SETTINGS",
        settings: {
          baseUrl: baseUrlInput.value,
          token: tokenInput.value
        }
      });
      tokenInput.value = "";
      tokenInput.placeholder = saved && saved.hasToken ? saved.maskedToken : "Not saved";
      tokenStatus.textContent = saved && saved.hasToken ? `Saved token: ${saved.maskedToken}` : "No token saved";
      status.textContent = "Settings saved.";
    } catch (error) {
      status.textContent = error && error.message ? error.message : "Unable to save settings.";
    } finally {
      saveButton.disabled = false;
    }
  }

  async function testConnection() {
    status.textContent = "";
    testButton.disabled = true;
    try {
      const result = await extensionApi.runtime.sendMessage({ type: "ELEANOR_BRIDGE_TEST_CONNECTION" });
      status.textContent = result && result.ok ? "Connection OK." : result && result.message ? result.message : "Connection test failed.";
    } catch (error) {
      status.textContent = error && error.message ? error.message : "Connection test failed.";
    } finally {
      testButton.disabled = false;
    }
  }

  saveButton.addEventListener("click", saveSettings);
  testButton.addEventListener("click", testConnection);
  loadSettings();
})();
