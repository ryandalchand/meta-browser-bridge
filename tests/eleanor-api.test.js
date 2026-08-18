const assert = require("assert");
const {
  syncMetaConversation,
  summarizeSyncResponse,
  testConnection,
  maskToken
} = require("../src/shared/eleanor-api");

const settings = {
  baseUrl: "https://eleanor-sourcing-os.vercel.app",
  token: "secret-bridge-token"
};

const basePayload = Object.freeze({
  source: "META_BUSINESS_SUITE",
  channel: "INSTAGRAM",
  externalConversationId: "340282366841710301244259266888617553370",
  threadUrl: "https://business.facebook.com/latest/inbox/all/?selected_item_id=340282366841710301244259266888617553370&thread_type=IG_MESSAGE",
  identityKey: "selected_item_id:340282366841710301244259266888617553370",
  identityConfidence: "HIGH",
  customer: { displayName: "Akhil Salimon" },
  messages: [
    {
      direction: "INBOUND",
      text: "Hi",
      rawTimestamp: "10:00 PM",
      timestampConfidence: "LOW",
      attachments: [],
      fingerprint: "26a3325f35a26b2c635a6f08ce1a70c4cfd2315893eac2163cc3e201c9f6a462"
    }
  ],
  summary: {
    messagesDetected: 1,
    inboundCount: 1,
    outboundCount: 0,
    messagesWithTimestamp: 0,
    messagesWithoutTimestamp: 1,
    attachmentCount: 0
  },
  extractedAt: "2026-08-15T03:56:58.442Z"
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function response(ok, body, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body)
  };
}

function textResponse(ok, text, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    text: async () => text
  };
}

function fetchReturning(body, ok = true) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return response(ok, body, ok ? 200 : 401);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

async function run() {
  {
    const payload = clone(basePayload);
    const fetchImpl = fetchReturning({ conversationCreated: true, insertedMessages: 1, alreadySyncedMessages: 0 });
    const result = await syncMetaConversation({ settings, payload, fetchImpl });
    const summary = summarizeSyncResponse(result, payload);
    assert.strictEqual(result.ok, true, "successful new conversation sync should pass");
    assert.strictEqual(summary.created, true);
    assert.strictEqual(summary.insertedMessages, 1);
    assert.strictEqual(fetchImpl.calls[0].url, `${settings.baseUrl}/api/browser-bridge/meta/sync`);
    assert.strictEqual(fetchImpl.calls[0].options.headers.Authorization, `Bearer ${settings.token}`);
    assert.deepStrictEqual(payload, clone(basePayload), "FB/IG extraction payload remains unchanged");
  }

  {
    const payload = clone(basePayload);
    const result = await syncMetaConversation({
      settings,
      payload,
      fetchImpl: fetchReturning({ insertedMessages: 0, alreadySyncedMessages: 1 })
    });
    const summary = summarizeSyncResponse(result, payload);
    assert.strictEqual(summary.status, "already-up-to-date", "repeated sync returns zero inserted");
    assert.strictEqual(summary.insertedMessages, 0);
  }

  {
    const payload = clone(basePayload);
    payload.messages.push({ direction: "OUTBOUND", text: "Thanks", attachments: [], fingerprint: "outbound-fingerprint" });
    payload.summary.messagesDetected = 2;
    const result = await syncMetaConversation({
      settings,
      payload,
      fetchImpl: fetchReturning({ insertedMessages: 1, alreadySyncedMessages: 1 })
    });
    const summary = summarizeSyncResponse(result, payload);
    assert.strictEqual(summary.status, "synced", "incremental sync imports new messages");
    assert.strictEqual(summary.insertedMessages, 1);
    assert.strictEqual(summary.alreadySyncedMessages, 1);
  }

  {
    const result = await syncMetaConversation({
      settings,
      payload: clone(basePayload),
      fetchImpl: fetchReturning({ code: "bridge-unauthorized" }, false)
    });
    assert.strictEqual(result.ok, false, "unauthorized token should fail safely");
    assert.strictEqual(result.code, "bridge-unauthorized");
    assert(!JSON.stringify(result).includes(settings.token), "token must not appear in unauthorized result");
  }

  {
    const result = await syncMetaConversation({
      settings,
      payload: clone(basePayload),
      fetchImpl: async () => {
        throw new Error("network down");
      }
    });
    assert.strictEqual(result.ok, false, "API unavailable should fail safely");
    assert.strictEqual(result.code, "api-unavailable");
  }

  {
    const result = await syncMetaConversation({
      settings,
      payload: clone(basePayload),
      fetchImpl: fetchReturning({ code: "analysis-failed", insertedMessages: 2, alreadySyncedMessages: 0 })
    });
    const summary = summarizeSyncResponse(result, basePayload);
    assert.strictEqual(result.ok, true, "analysis failed after import should not mark sync failed");
    assert.strictEqual(summary.status, "analysis-failed");
  }

  {
    const payload = clone(basePayload);
    payload.channel = "UNKNOWN";
    const fetchImpl = fetchReturning({});
    const result = await syncMetaConversation({ settings, payload, fetchImpl });
    assert.strictEqual(result.ok, false, "unsupported/unknown channel should not send");
    assert.strictEqual(result.code, "unsupported-channel");
    assert.strictEqual(fetchImpl.calls.length, 0);
  }

  {
    const result = await syncMetaConversation({ settings: { baseUrl: "", token: "" }, payload: clone(basePayload), fetchImpl: fetchReturning({}) });
    assert.strictEqual(result.ok, false, "missing settings should fail before fetch");
    assert.strictEqual(result.code, "missing-settings");
  }

  {
    const logs = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args) => logs.push(args.join(" "));
    console.error = (...args) => logs.push(args.join(" "));
    try {
      await syncMetaConversation({ settings, payload: clone(basePayload), fetchImpl: fetchReturning({ insertedMessages: 0 }) });
      assert.strictEqual(maskToken(settings.token), "••••oken");
      assert(!logs.join("\n").includes(settings.token), "token never appears in logs");
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  }

  {
    const result = await testConnection({ settings, fetchImpl: fetchReturning({ ok: true }) });
    assert.strictEqual(result.ok, true, "test connection should use health endpoint");
  }

  {
    const result = await testConnection({
      settings,
      fetchImpl: async () => textResponse(false, "<!DOCTYPE html><html><title>404</title></html>", 404)
    });
    assert.strictEqual(result.ok, false, "missing health endpoint should fail cleanly");
    assert.strictEqual(result.code, "health-endpoint-not-found");
    assert(!result.message.includes("<!DOCTYPE html>"), "HTML 404 page should not be shown to the user");
  }
}

run()
  .then(() => {
    console.log("eleanor api tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
