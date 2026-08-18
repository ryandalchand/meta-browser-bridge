(function initMetaSelectors() {
  globalThis.EleanorBridge ??= {};

  globalThis.EleanorBridge.META_SELECTORS = {
    appRoots: ["[role='main']", "main", "body"],
    conversationPane: [
      "[aria-label*='Thread' i]",
      "[aria-label*='Conversation' i]",
      "[aria-label*='Messages' i]",
      "[aria-label*='Inbox' i]",
      "[role='main'] [role='grid']",
      "[role='main']",
      "main"
    ],
    conversationHeader: [
      "[role='main'] [role='heading']",
      "h1",
      "h2",
      "[aria-label*='Conversation information' i]"
    ],
    messageContainer: [
      "[role='article']",
      "[data-testid*='message' i]",
      "[aria-label*='message' i]",
      "[aria-label*='sent' i]",
      "[aria-label*='replied' i]"
    ],
    messageBubble: [
      "[dir='auto']",
      "[role='article']",
      "[data-testid*='message' i]",
      "span",
      "div"
    ],
    composeBox: [
      "[contenteditable='true']",
      "[role='textbox']",
      "textarea"
    ],
    sidebar: [
      "[aria-label*='Inbox list' i]",
      "[aria-label*='Conversation list' i]",
      "nav",
      "aside"
    ],
    channelIndicators: [
      "[aria-label*='Instagram' i]",
      "[aria-label*='WhatsApp' i]",
      "[aria-label*='Facebook' i]",
      "[aria-label*='Messenger' i]",
      "[title*='Instagram' i]",
      "[title*='WhatsApp' i]",
      "[title*='Facebook' i]",
      "[title*='Messenger' i]"
    ],
    timestamps: ["time", "abbr[title]", "[aria-label*='Sent' i]", "[aria-label*='Delivered' i]"],
    attachments: ["img", "video", "audio", "a[href]", "[aria-label*='attachment' i]", "[aria-label*='file' i]"]
  };

  console.log("[Eleanor Bridge] selectors loaded");
})();
