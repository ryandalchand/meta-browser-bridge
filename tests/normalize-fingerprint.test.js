const assert = require("assert");
const {
  normalizeChannel,
  normalizeTimestamp,
  normalizeWhitespace
} = require("../src/shared/normalize");
const {
  fingerprintMessage
} = require("../src/shared/fingerprint");

async function run() {
  const baseMessage = {
    direction: "INBOUND",
    text: "Need 1000 pieces",
    timestamp: "2026-08-14T21:32:00Z",
    attachments: []
  };

  const first = await fingerprintMessage({
    channel: "Instagram",
    conversationIdentity: "thread:abc123",
    message: baseMessage
  });
  const second = await fingerprintMessage({
    channel: "Instagram",
    conversationIdentity: "thread:abc123",
    message: { ...baseMessage }
  });
  assert.strictEqual(first, second, "same message should produce same fingerprint");

  const correction = await fingerprintMessage({
    channel: "Instagram",
    conversationIdentity: "thread:abc123",
    message: { ...baseMessage, text: "Actually make it 1500 pieces" }
  });
  assert.notStrictEqual(first, correction, "explicit corrections should produce different fingerprints");

  assert.strictEqual(normalizeChannel("Facebook"), "FACEBOOK");
  assert.strictEqual(normalizeChannel("Instagram"), "INSTAGRAM");
  assert.notStrictEqual(normalizeChannel("Facebook"), normalizeChannel("Instagram"));

  const imageOnlyA = await fingerprintMessage({
    channel: "Instagram",
    conversationIdentity: "thread:image-only",
    message: {
      direction: "INBOUND",
      attachments: [{ type: "IMAGE", url: "visible-thumbnail-123.jpg", name: "preview" }]
    }
  });
  const imageOnlyB = await fingerprintMessage({
    channel: "Instagram",
    conversationIdentity: "thread:image-only",
    message: {
      direction: "INBOUND",
      text: "",
      attachments: [{ name: "preview", url: "visible-thumbnail-123.jpg", type: "IMAGE" }]
    }
  });
  assert.strictEqual(imageOnlyA, imageOnlyB, "attachment-only messages should have stable fingerprints");

  assert.deepStrictEqual(
    normalizeTimestamp("2026-08-14T21:32:00Z"),
    { timestamp: "2026-08-14T21:32:00Z", timestampConfidence: "HIGH" }
  );
  assert.deepStrictEqual(
    normalizeTimestamp("August 14, 2026 10:00 PM"),
    { timestamp: localIso(2026, 7, 14, 22, 0), timestampConfidence: "HIGH" }
  );
  assert.deepStrictEqual(
    normalizeTimestamp("Aug 7, 2026, 5:30 PM"),
    { timestamp: localIso(2026, 7, 7, 17, 30), timestampConfidence: "HIGH" }
  );
  assert.deepStrictEqual(
    normalizeTimestamp("10:00 PM"),
    { timestamp: undefined, timestampConfidence: "LOW" }
  );
  assert.deepStrictEqual(
    normalizeTimestamp("Thu 10:53 AM"),
    { timestamp: undefined, timestampConfidence: "LOW" }
  );
  assert.deepStrictEqual(
    normalizeTimestamp("this is not a timestamp"),
    { timestamp: undefined, timestampConfidence: "LOW" }
  );
  assert.deepStrictEqual(
    normalizeTimestamp("0"),
    { timestamp: undefined, timestampConfidence: "LOW" },
    "malformed timestamps must not silently become 1970 dates"
  );

  assert.strictEqual(
    normalizeWhitespace("  Need\r\n  1000   pieces  "),
    "Need\n 1000 pieces"
  );

  const fbMessage = {
    direction: "OUTBOUND",
    text: "Hello Salif,\nThank you for contacting Eleanor Sourcing, your reliable sourcing agent in China. You send it, I source it. Reply here to get started:\nName:\nEmail:\nPhone:\nProduct:\nQuantity:\nTarget Price (if known):",
    rawTimestamp: "Aug 7, 2026, 5:30 PM",
    timestamp: localIso(2026, 7, 7, 17, 30),
    attachments: []
  };
  const fbFingerprintA = await fingerprintMessage({
    channel: "FACEBOOK",
    conversationIdentity: "selected_item_id:61579743596633",
    message: fbMessage
  });
  const fbFingerprintB = await fingerprintMessage({
    channel: "FACEBOOK",
    conversationIdentity: "selected_item_id:61579743596633",
    message: { ...fbMessage, rawTimestamp: "Seen by Salif at Aug 7, 2026, 5:30 PM" }
  });
  assert.strictEqual(fbFingerprintA, fbFingerprintB, "same FB extraction should keep identical fingerprints");

  const igInbound = {
    direction: "INBOUND",
    text: "Hi",
    rawTimestamp: "10:00 PM",
    timestamp: undefined,
    attachments: []
  };
  const igFingerprintA = await fingerprintMessage({
    channel: "INSTAGRAM",
    conversationIdentity: "selected_item_id:340282366841710301244259266888617553370",
    message: igInbound
  });
  const igFingerprintB = await fingerprintMessage({
    channel: "INSTAGRAM",
    conversationIdentity: "selected_item_id:340282366841710301244259266888617553370",
    message: { ...igInbound }
  });
  assert.strictEqual(igFingerprintA, igFingerprintB, "same IG extraction should keep identical fingerprints");

  const emojiOnlyA = await fingerprintMessage({
    channel: "FACEBOOK",
    conversationIdentity: "selected_item_id:emoji-thread",
    message: {
      direction: "INBOUND",
      text: "👍",
      rawTimestamp: "1:00 AM",
      attachments: []
    }
  });
  const emojiOnlyB = await fingerprintMessage({
    channel: "FACEBOOK",
    conversationIdentity: "selected_item_id:emoji-thread",
    message: {
      direction: "INBOUND",
      text: "👍",
      rawTimestamp: "1:00 AM",
      attachments: []
    }
  });
  assert.strictEqual(emojiOnlyA, emojiOnlyB, "emoji-only messages should have stable fingerprints");
}

function localIso(year, monthIndex, day, hours, minutes) {
  return new Date(year, monthIndex, day, hours, minutes, 0, 0).toISOString().replace(".000Z", "Z");
}

run()
  .then(() => {
    console.log("normalize/fingerprint tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
