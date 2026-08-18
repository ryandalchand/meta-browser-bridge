(function initEleanorBridgeBootstrap() {
  globalThis.EleanorBridge ??= {};

  const extensionApi =
    typeof browser !== "undefined"
      ? browser
      : typeof chrome !== "undefined"
        ? chrome
        : null;

  globalThis.EleanorBridge.extensionApi = extensionApi;

  console.log("[Eleanor Bridge] content script loaded", location.href);
  console.log("[Eleanor Bridge] browser API", Boolean(extensionApi));
  console.log("[Eleanor Bridge] namespace", Boolean(globalThis.EleanorBridge));

  if (!extensionApi) {
    console.error("[Eleanor Bridge] WebExtension API unavailable");
  }
})();
