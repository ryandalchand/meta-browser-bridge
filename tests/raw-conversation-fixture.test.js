const assert = require("assert");
const { fingerprintMessage } = require("../src/shared/fingerprint");

async function withFingerprints(payload) {
  const copy = JSON.parse(JSON.stringify(payload));
  for (const message of copy.messages) {
    message.fingerprint = await fingerprintMessage({
      channel: copy.channel,
      conversationIdentity: copy.identityKey,
      message
    });
  }
  return copy;
}

async function run() {
  const payload = await withFingerprints({
    source: "META_BUSINESS_SUITE",
    channel: "INSTAGRAM",
    channelConfidence: "HIGH",
    externalConversationId: "340282366841710301244259266888617553370",
    threadUrl: "https://business.facebook.com/latest/inbox/all/?selected_item_id=340282366841710301244259266888617553370&thread_type=IG_MESSAGE",
    identityKey: "selected_item_id:340282366841710301244259266888617553370",
    identityConfidence: "HIGH",
    customer: {
      displayName: "Shanky Sancheti"
    },
    messages: [
      {
        direction: "INBOUND",
        text: "Mayank sancheti\nShankysancheti@gmail.com\n+918094240070\nWooden cutlery\nMoq quantity",
        rawTimestamp: "10:00 PM",
        timestampConfidence: "LOW",
        attachments: []
      },
      {
        direction: "INBOUND",
        text: "Quantity 200 boxes indian quality india location ask factory for full catalogue",
        rawTimestamp: "10:01 PM",
        timestampConfidence: "LOW",
        attachments: []
      },
      {
        direction: "OUTBOUND",
        text: "Thank you for contacting Eleanor Sourcing, your reliable sourcing agent in China. You send it, I source it.",
        rawTimestamp: "10:02 PM",
        timestampConfidence: "LOW",
        attachments: []
      }
    ]
  });

  assert.strictEqual(payload.customer.displayName, "Shanky Sancheti");
  assert.strictEqual(payload.channel, "INSTAGRAM");
  assert.strictEqual(payload.messages.length, 3, "each Meta bubble should remain one message");
  assert.strictEqual(payload.messages[0].direction, "INBOUND");
  assert.strictEqual(payload.messages[1].direction, "INBOUND");
  assert.strictEqual(payload.messages[2].direction, "OUTBOUND");
  assert.strictEqual(
    payload.messages[0].text,
    "Mayank sancheti\nShankysancheti@gmail.com\n+918094240070\nWooden cutlery\nMoq quantity",
    "meaningful line breaks must be preserved"
  );
  assert.strictEqual(
    payload.messages[1].text,
    "Quantity 200 boxes indian quality india location ask factory for full catalogue"
  );

  const repeat = await withFingerprints(payload);
  assert.deepStrictEqual(
    repeat.messages.map((message) => message.fingerprint),
    payload.messages.map((message) => message.fingerprint),
    "fingerprints must be deterministic for repeated sync"
  );

  const serialized = JSON.stringify(payload);
  assert(!/"product"\s*:/.test(serialized), "extension must not extract product fields");
  assert(!/"quantity"\s*:/.test(serialized), "extension must not extract quantity fields");
  assert(!/"country"\s*:/.test(serialized), "extension must not extract country fields");
  assert(!/"customization"\s*:/.test(serialized), "extension must not extract customization fields");
}

run()
  .then(() => {
    console.log("raw conversation fixture tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
