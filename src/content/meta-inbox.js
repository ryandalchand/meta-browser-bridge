(function initMetaInbox() {
  globalThis.EleanorBridge ??= {};
  const Bridge = globalThis.EleanorBridge;
  const extensionApi =
    typeof browser !== "undefined"
      ? browser
      : typeof chrome !== "undefined"
        ? chrome
        : null;
  Bridge.extensionApi = extensionApi;
  let observer;
  let lastHref = location.href;
  let reinjectTimer;
  let hasLoggedInboxDetected = false;

  function scheduleUiRefresh() {
    clearTimeout(reinjectTimer);
    reinjectTimer = setTimeout(() => {
      if (Bridge.MetaParser.isMetaBusinessInbox()) {
        Bridge.MetaUI.bindWidget();
        if (!hasLoggedInboxDetected) {
          hasLoggedInboxDetected = true;
          console.info("[Eleanor Bridge] Meta Business Suite Inbox detected. Local extraction only.");
        }
      } else {
        Bridge.MetaUI.ensureTestButton();
      }
    }, 250);
  }

  function start() {
    console.log("[Eleanor Bridge] MetaUI exists", Boolean(Bridge.MetaUI));
    console.log("[Eleanor Bridge] META_SELECTORS exists", Boolean(Bridge.META_SELECTORS));
    Bridge.MetaUI.ensureTestButton();
    scheduleUiRefresh();
    observer = new MutationObserver(() => {
      if (lastHref !== location.href) {
        lastHref = location.href;
        globalThis.__ELEANOR_BRIDGE_LAST_RESULT__ = undefined;
        hasLoggedInboxDetected = false;
      }
      scheduleUiRefresh();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (extensionApi && extensionApi.runtime) {
    extensionApi.runtime.onMessage.addListener((message) => {
      if (message && message.type === "ELEANOR_BRIDGE_INSPECT_CURRENT") {
        return Bridge.MetaUI.inspectCurrentConversation();
      }
      return undefined;
    });
  } else {
    console.error("[Eleanor Bridge] WebExtension API unavailable");
  }

  try {
    start();
  } catch (error) {
    console.error("[Eleanor Bridge] startup failed", error);
    try {
      if (Bridge.MetaUI) Bridge.MetaUI.ensureTestButton();
    } catch (buttonError) {
      console.error("[Eleanor Bridge] test button injection failed", buttonError);
    }
  }
  console.log("[Eleanor Bridge] inbox loaded");
})();
