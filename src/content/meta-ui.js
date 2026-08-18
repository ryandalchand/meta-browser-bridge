(function initMetaUi() {
  globalThis.EleanorBridge ??= {};
  const Bridge = globalThis.EleanorBridge;
  const UI_ID = "eleanor-bridge-widget";
  const extensionApi =
    typeof browser !== "undefined"
      ? browser
      : typeof chrome !== "undefined"
        ? chrome
        : null;
  let syncInProgress = false;

  function countDirections(messages) {
    return messages.reduce((counts, message) => {
      counts[message.direction] = (counts[message.direction] || 0) + 1;
      return counts;
    }, { INBOUND: 0, OUTBOUND: 0, UNKNOWN: 0 });
  }

  function ensureWidget() {
    let widget = document.getElementById(UI_ID);
    if (widget) return widget;

    widget = document.createElement("section");
    widget.id = UI_ID;
    widget.innerHTML = `
      <button type="button" class="ebb-button">Sync to Eleanor</button>
      <div class="ebb-panel" hidden>
        <strong>Eleanor Browser Bridge</strong>
        <dl></dl>
        <pre class="ebb-messages" hidden></pre>
        <button type="button" class="ebb-settings">Open Settings</button>
        <button type="button" class="ebb-copy">Copy Debug JSON</button>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #${UI_ID} { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #14213d; }
      #${UI_ID}.ebb-test-position { top: 80px; right: 20px; bottom: auto; }
      #${UI_ID} .ebb-button, #${UI_ID} .ebb-copy, #${UI_ID} .ebb-settings { border: 0; border-radius: 6px; background: #113f67; color: white; padding: 9px 12px; box-shadow: 0 3px 12px rgba(0,0,0,.18); cursor: pointer; font-weight: 650; }
      #${UI_ID} .ebb-settings, #${UI_ID} .ebb-copy { width: 100%; margin-top: 6px; box-shadow: none; }
      #${UI_ID} .ebb-button[disabled] { opacity: .7; cursor: default; }
      #${UI_ID} .ebb-panel { width: 260px; margin-top: 8px; padding: 12px; border: 1px solid #d6d9df; border-radius: 8px; background: #fff; box-shadow: 0 8px 30px rgba(0,0,0,.2); }
      #${UI_ID} dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; margin: 10px 0; }
      #${UI_ID} dt { color: #5f6b7a; }
      #${UI_ID} dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
      #${UI_ID} .ebb-result { margin-top: 10px; padding-top: 10px; border-top: 1px solid #d6d9df; display: grid; gap: 3px; }
      #${UI_ID} .ebb-messages { max-height: 220px; overflow: auto; margin: 10px 0 0; padding: 8px; border: 1px solid #d6d9df; border-radius: 6px; background: #f7f8fa; color: #172033; white-space: pre-wrap; font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    `;
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(widget);
    return widget;
  }

  function ensureTestButton() {
    const widget = ensureWidget();
    widget.classList.add("ebb-test-position");
    return widget;
  }

  function removeWidget() {
    const widget = document.getElementById(UI_ID);
    if (widget) widget.remove();
  }

  function setButtonState(widget, text, disabled) {
    const button = widget.querySelector(".ebb-button");
    button.textContent = text;
    button.disabled = Boolean(disabled);
  }

  function setPreviewRows(dl, rows) {
    dl.textContent = "";
    rows.forEach(([term, description]) => {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = description;
      dl.append(dt, dd);
    });
  }

  function renderPreview(widget, result) {
    const panel = widget.querySelector(".ebb-panel");
    const dl = widget.querySelector("dl");
    if (!result.ok) {
      setPreviewRows(dl, [
        ["Status", "Unable to read conversation"],
        ["Reason", result.error || "Unknown"]
      ]);
      panel.hidden = false;
      return;
    }
    const payload = result.payload;
    const counts = countDirections(payload.messages);
    setPreviewRows(dl, [
      ["Channel", payload.channel],
      ["Customer", payload.customer.displayName || payload.customer.username || "Unknown"],
      ["Messages detected", String(payload.summary ? payload.summary.messagesDetected : payload.messages.length)],
      ["Inbound", String(payload.summary ? payload.summary.inboundCount : counts.INBOUND)],
      ["Outbound", String(payload.summary ? payload.summary.outboundCount : counts.OUTBOUND)],
      ["With timestamp", String(payload.summary ? payload.summary.messagesWithTimestamp : payload.messages.filter((message) => message.timestamp).length)],
      ["Without timestamp", String(payload.summary ? payload.summary.messagesWithoutTimestamp : payload.messages.filter((message) => !message.timestamp).length)],
      ["Attachments", String(payload.summary ? payload.summary.attachmentCount : payload.messages.reduce((total, message) => total + (message.attachments || []).length, 0))],
      ["Unknown", String(counts.UNKNOWN)]
    ]);
    renderRawMessages(widget, payload.messages);
    panel.hidden = false;
  }

  function renderRawMessages(widget, messages) {
    const preview = widget.querySelector(".ebb-messages");
    if (!preview) return;
    const blocks = (messages || []).map((message) => {
      const body = message.text || (message.attachments && message.attachments.length ? "[attachment-only message]" : "");
      return `${message.direction || "UNKNOWN"}\n${body}`;
    }).filter(Boolean);
    preview.textContent = blocks.join("\n\n");
    preview.hidden = blocks.length === 0;
  }

  function appendResultBlock(widget, title, lines) {
    const panel = widget.querySelector(".ebb-panel");
    const existing = widget.querySelector(".ebb-result");
    if (existing) existing.remove();
    const block = document.createElement("div");
    block.className = "ebb-result";
    const heading = document.createElement("strong");
    heading.textContent = title;
    block.appendChild(heading);
    lines.filter((line) => line !== undefined && line !== null && line !== "").forEach((line) => {
      const item = document.createElement("div");
      item.textContent = String(line);
      block.appendChild(item);
    });
    panel.appendChild(block);
    panel.hidden = false;
  }

  function renderSyncResult(widget, extractionResult, syncResult) {
    if (!syncResult || !syncResult.ok) {
      appendResultBlock(widget, "Sync failed", [syncResult && syncResult.message ? syncResult.message : "Sync failed."]);
      return;
    }

    const summary = syncResult.summary || {};
    const title = summary.status === "already-up-to-date"
      ? "✓ Already up to date"
      : summary.created
        ? "✓ New Eleanor conversation created"
        : summary.status === "analysis-failed"
          ? "✓ Messages synced"
          : "✓ Synced to Eleanor";
    const lines = [
      summary.channel,
      summary.customerName,
      `${summary.messagesDetected || 0} messages detected`,
      `${summary.insertedMessages || 0} new messages imported`,
      `${summary.alreadySyncedMessages || 0} already synced`
    ];

    if (summary.newlyCompleted && summary.newlyCompleted.length) {
      lines.push("Newly completed:");
      summary.newlyCompleted.forEach((field) => lines.push(`✓ ${field}`));
    }

    if (summary.stillMissing && summary.stillMissing.length) {
      lines.push("Still missing:");
      summary.stillMissing.forEach((field) => lines.push(`• ${field}`));
    }

    if (summary.completeness !== undefined) {
      lines.push(`Completeness: ${summary.completeness}%`);
    }

    if (summary.status === "analysis-failed") {
      lines.push("Analysis needs retry in Eleanor.");
    }

    appendResultBlock(widget, title, lines);
  }

  async function inspectCurrentConversation() {
    const widget = ensureWidget();
    setButtonState(widget, "Reading conversation...", true);
    if (!Bridge.MetaParser) {
      const missingParserResult = {
        ok: false,
        error: "Parser module is not available.",
        diagnostics: {
          namespace: Boolean(globalThis.EleanorBridge),
          metaUI: Boolean(Bridge.MetaUI),
          metaSelectors: Boolean(Bridge.META_SELECTORS),
          metaParser: Boolean(Bridge.MetaParser)
        }
      };
      globalThis.__ELEANOR_BRIDGE_LAST_RESULT__ = missingParserResult;
      console.error("[Eleanor Bridge] Parser module is not available", missingParserResult.diagnostics);
      setButtonState(widget, "Unable to read conversation", false);
      renderPreview(widget, missingParserResult);
      return missingParserResult;
    }

    let result;
    try {
      result = await Bridge.MetaParser.extractCurrentConversation();
    } catch (error) {
      result = {
        ok: false,
        error: error && error.message ? error.message : "Conversation extraction failed.",
        diagnostics: { error }
      };
      console.error("[Eleanor Bridge] Conversation extraction failed", error);
    }
    globalThis.__ELEANOR_BRIDGE_LAST_RESULT__ = result;

    if (!result.ok) {
      console.warn("[Eleanor Bridge] Unable to read conversation", result);
      setButtonState(widget, "Unable to read conversation", false);
      renderPreview(widget, result);
      return result;
    }

    const counts = countDirections(result.payload.messages);
    console.group("[Eleanor Bridge] Conversation detected");
    console.log("channel", result.payload.channel, result.payload.channelConfidence);
    console.log("customer", result.payload.customer);
    console.log("conversation identity", {
      externalConversationId: result.payload.externalConversationId,
      identityKey: result.payload.identityKey,
      identityConfidence: result.payload.identityConfidence,
      threadUrl: result.payload.threadUrl
    });
    console.log("message count", result.payload.messages.length);
    console.log("inbound count", counts.INBOUND);
    console.log("outbound count", counts.OUTBOUND);
    console.log("messages with fingerprints", result.payload.messages);
    console.log("extraction summary", result.payload.summary);
    console.log("selector diagnostics", result.diagnostics);
    console.log("normalized payload", result.payload);
    console.groupEnd();

    setButtonState(widget, `Ready: ${result.payload.messages.length} messages`, false);
    renderPreview(widget, result);
    return result;
  }

  async function syncCurrentConversation() {
    const widget = ensureWidget();
    if (syncInProgress) return globalThis.__ELEANOR_BRIDGE_LAST_SYNC_RESULT__;
    syncInProgress = true;

    try {
      setButtonState(widget, "Reading conversation...", true);
      const extractionResult = await inspectCurrentConversation();
      if (!extractionResult.ok) {
        setButtonState(widget, "Sync failed", false);
        return extractionResult;
      }

      if (!["FACEBOOK", "INSTAGRAM"].includes(extractionResult.payload.channel)) {
        const unsupported = { ok: false, code: "unsupported-channel", message: "Unable to determine Meta channel." };
        appendResultBlock(widget, "Sync failed", [unsupported.message]);
        setButtonState(widget, "Sync failed", false);
        return unsupported;
      }

      if (!extensionApi || !extensionApi.runtime) {
        const unavailable = { ok: false, code: "extension-api-unavailable", message: "Extension background API is unavailable." };
        appendResultBlock(widget, "Sync failed", [unavailable.message]);
        setButtonState(widget, "Sync failed", false);
        return unavailable;
      }

      setButtonState(widget, "Syncing...", true);
      const syncResult = await extensionApi.runtime.sendMessage({
        type: "ELEANOR_BRIDGE_META_SYNC",
        payload: extractionResult.payload
      });
      globalThis.__ELEANOR_BRIDGE_LAST_SYNC_RESULT__ = syncResult;
      renderSyncResult(widget, extractionResult, syncResult);

      if (syncResult && syncResult.ok && syncResult.summary && syncResult.summary.status === "already-up-to-date") {
        setButtonState(widget, "Already up to date", false);
      } else if (syncResult && syncResult.ok) {
        setButtonState(widget, "Synced", false);
      } else {
        setButtonState(widget, "Sync failed", false);
      }
      return syncResult;
    } catch (error) {
      const failed = { ok: false, code: "sync-failed", message: error && error.message ? error.message : "Sync failed." };
      appendResultBlock(widget, "Sync failed", [failed.message]);
      setButtonState(widget, "Sync failed", false);
      return failed;
    } finally {
      syncInProgress = false;
    }
  }

  function bindWidget() {
    const widget = ensureWidget();
    if (widget.dataset.bound === "true") return widget;
    widget.dataset.bound = "true";
    widget.querySelector(".ebb-button").addEventListener("click", async () => {
      await syncCurrentConversation();
    });
    widget.querySelector(".ebb-copy").addEventListener("click", async () => {
      const last = globalThis.__ELEANOR_BRIDGE_LAST_RESULT__;
      if (!last) return;
      await navigator.clipboard.writeText(JSON.stringify(last, null, 2));
    });
    widget.querySelector(".ebb-settings").addEventListener("click", async () => {
      if (!extensionApi || !extensionApi.runtime) return;
      await extensionApi.runtime.sendMessage({ type: "ELEANOR_BRIDGE_OPEN_SETTINGS" });
    });
    return widget;
  }

  Bridge.MetaUI = {
    ensureWidget,
    ensureTestButton,
    removeWidget,
    inspectCurrentConversation,
    syncCurrentConversation,
    bindWidget
  };
  Bridge.MetaUi = Bridge.MetaUI;
  console.log("[Eleanor Bridge] ui loaded");
})();
