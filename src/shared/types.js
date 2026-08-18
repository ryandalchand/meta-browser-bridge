(function initTypes(globalScope) {
  globalScope.EleanorBridge ??= {};
  const BridgeConstants = {
    SOURCE: "META_BUSINESS_SUITE",
    CHANNELS: ["FACEBOOK", "INSTAGRAM", "WHATSAPP", "UNKNOWN"],
    DIRECTIONS: ["INBOUND", "OUTBOUND", "UNKNOWN"],
    ATTACHMENT_TYPES: ["IMAGE", "VIDEO", "AUDIO", "FILE", "LINK", "UNKNOWN"],
    CONFIDENCE: ["HIGH", "MEDIUM", "LOW"]
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { BridgeConstants };
  } else {
    globalScope.EleanorBridge.BridgeConstants = BridgeConstants;
  }
  console.log("[Eleanor Bridge] types loaded");
})(globalThis);
