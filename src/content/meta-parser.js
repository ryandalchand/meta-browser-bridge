(function initMetaParser() {
  globalThis.EleanorBridge ??= {};
  const Bridge = globalThis.EleanorBridge;
  const META_SELECTORS = Bridge.META_SELECTORS || {};

  function firstMatch(root, selectors) {
    for (const selector of selectors) {
      const match = root.querySelector(selector);
      if (match) return match;
    }
    return null;
  }

  function isVisible(node) {
    if (!node || !(node instanceof Element)) return false;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  }

  function selectorCounts(root, selectors) {
    return selectors.reduce((counts, selector) => {
      try {
        counts[selector] = root.querySelectorAll(selector).length;
      } catch (error) {
        counts[selector] = `error: ${error.message}`;
      }
      return counts;
    }, {});
  }

  function allMatches(root, selectors) {
    const found = new Set();
    selectors.forEach((selector) => {
      root.querySelectorAll(selector).forEach((node) => found.add(node));
    });
    return Array.from(found);
  }

  function isMetaBusinessInbox() {
    if (location.hostname !== "business.facebook.com") return false;
    if (/inbox|latest\/inbox|messages/i.test(location.href)) return true;
    return Boolean(document.querySelector("[aria-label*='Inbox' i], [href*='inbox' i]"));
  }

  function detectChannel(root) {
    const threadType = new URL(location.href).searchParams.get("thread_type") || "";
    if (/IG|INSTAGRAM/i.test(threadType)) return { channel: "INSTAGRAM", confidence: "HIGH", evidence: `URL thread_type=${threadType}` };
    if (/WHATSAPP|WA/i.test(threadType)) return { channel: "WHATSAPP", confidence: "HIGH", evidence: `URL thread_type=${threadType}` };
    if (/FB|FACEBOOK|MESSENGER/i.test(threadType)) return { channel: "FACEBOOK", confidence: "HIGH", evidence: `URL thread_type=${threadType}` };

    const scopedText = Bridge.normalizeWhitespace(root.innerText || "").slice(0, 8000);
    const indicators = allMatches(root, META_SELECTORS.channelIndicators)
      .map((node) => `${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""} ${node.textContent || ""}`)
      .join(" ");
    const evidence = `${indicators} ${scopedText}`;

    if (/\bWhatsApp\b/i.test(evidence)) return { channel: "WHATSAPP", confidence: "MEDIUM", evidence: "visible WhatsApp indicator" };
    if (/\bInstagram\b/i.test(evidence)) return { channel: "INSTAGRAM", confidence: "MEDIUM", evidence: "visible Instagram indicator" };
    if (/\b(Facebook|Messenger)\b/i.test(evidence)) return { channel: "FACEBOOK", confidence: "MEDIUM", evidence: "visible Facebook/Messenger indicator" };
    return { channel: "UNKNOWN", confidence: "LOW", evidence: "no visible channel indicator" };
  }

  function sidebarNoiseScore(text) {
    const markers = [
      "All messages",
      "Messenger",
      "Instagram comments",
      "Facebook comments",
      "Availability status",
      "Automations",
      "Labels",
      "Assigned",
      "Unread"
    ];
    return markers.reduce((score, marker) => score + (text.includes(marker) ? 1 : 0), 0);
  }

  function appChromeNoiseScore(text) {
    const markers = [
      "Links\nHome",
      "Ads Manager",
      "Leads Center",
      "Creator marketplace",
      "Monetization",
      "Settings\nSettings",
      "Help\nHelp",
      "Collapse contact details",
      "Lead stage",
      "Order status",
      "Suggested labels",
      "Add note"
    ];
    return markers.reduce((score, marker) => score + (text.includes(marker) ? 1 : 0), 0);
  }

  function candidatePaneScore(candidate) {
    const box = candidate.getBoundingClientRect();
    const text = Bridge.normalizeWhitespace(candidate.innerText || candidate.textContent);
    const messageCount = allMatches(candidate, META_SELECTORS.messageContainer).length;
    const attachmentCount = allMatches(candidate, META_SELECTORS.attachments).length;
    const composeCount = allMatches(candidate, META_SELECTORS.composeBox).length;
    const rightSideBonus = box.left > window.innerWidth * 0.25 ? 18 : 0;
    const usableSizeBonus = box.width > 360 && box.height > 260 ? 14 : 0;
    return (messageCount * 16) +
      (attachmentCount * 4) +
      (composeCount * 45) +
      rightSideBonus +
      usableSizeBonus +
      Math.min(text.length / 160, 20) -
      (sidebarNoiseScore(text) * 35);
  }

  function findConversationPane() {
    const candidates = allMatches(document, META_SELECTORS.conversationPane)
      .filter(isVisible);
    allMatches(document, META_SELECTORS.composeBox)
      .filter(isVisible)
      .forEach((composeBox) => {
        let current = composeBox.parentElement;
        let depth = 0;
        while (current && depth < 8) {
          if (isVisible(current)) candidates.push(current);
          current = current.parentElement;
          depth += 1;
        }
      });
    const fallback = document.querySelector("[role='main']") || document.querySelector("main") || document.body;
    if (fallback) candidates.push(fallback);

    let best = null;
    let bestScore = -Infinity;
    candidates.forEach((candidate) => {
      const score = candidatePaneScore(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    });

    return best || fallback;
  }

  function extractCustomer(root) {
    const header = firstMatch(root, META_SELECTORS.conversationHeader) || firstMatch(document, META_SELECTORS.conversationHeader);
    const candidates = customerNameCandidates(root, header);
    const displayName = candidates.length ? candidates[0].name : "";
    const usernameMatch = (root.innerText || "").match(/@[A-Za-z0-9._]+/);
    const phoneMatch = (root.innerText || "").match(/\+?\d[\d\s().-]{7,}\d/);
    return {
      displayName: displayName || undefined,
      username: usernameMatch ? usernameMatch[0] : undefined,
      externalUserId: undefined,
      phone: phoneMatch ? phoneMatch[0] : undefined
    };
  }

  function customerNameCandidates(root, header) {
    const candidates = [];

    function addCandidate(name, source, score, node) {
      const normalized = Bridge.normalizeWhitespace(name);
      if (!isPlausibleCustomerName(normalized)) return;
      const box = node && node.getBoundingClientRect ? node.getBoundingClientRect() : null;
      candidates.push({
        name: normalized,
        source,
        score: score + (box && box.left > window.innerWidth * 0.25 ? 6 : 0)
      });
    }

    if (header) addCandidate(header.textContent, "header", 35, header);

    allMatches(root, ["img[alt]"]).forEach((img) => {
      const src = img.currentSrc || img.src || "";
      let score = 18;
      if (/cdninstagram\.com|t51\.2885-19|profile_pic/i.test(src)) score += 25;
      if (/static\.xx\.fbcdn\.net\/images\/emoji\.php/i.test(src)) score -= 50;
      addCandidate(img.getAttribute("alt"), "image-alt", score, img);
    });

    fallbackMessageCandidates(root).slice(0, 80).forEach((node) => {
      addCandidate(node.innerText || node.textContent, "visible-text", 8, node);
    });

    assignmentHeaderCandidates(root).forEach((node) => {
      addCandidate(node.innerText || node.textContent, "assignment-header", 55, node);
    });

    const bestByName = new Map();
    candidates.forEach((candidate) => {
      const key = candidate.name.toLowerCase();
      const existing = bestByName.get(key);
      if (!existing || candidate.score > existing.score) bestByName.set(key, candidate);
    });

    return Array.from(bestByName.values()).sort((a, b) => b.score - a.score);
  }

  function isPlausibleCustomerName(text) {
    if (!text || text.length < 2 || text.length > 80) return false;
    if (isLikelyNonMessageText(text) || isPlatformLabel(text) || isTimestampOnly(text)) return false;
    if (/^[\p{Emoji}\s]+$/u.test(text)) return false;
    if (/[@:]|https?:|www\.|\.com\b/i.test(text)) return false;
    if (/\d/.test(text)) return false;
    if (/[.!?]{1,}$/.test(text)) return false;
    if (text.split(/\s+/).length > 8) return false;
    return /[\p{L}\p{M}]/u.test(text) && /^[\p{L}\p{M}\p{Emoji_Presentation}\p{Emoji}\u200d\ufe0f' .-]+$/u.test(text);
  }

  function extractConversationIdentity(customer) {
    const url = new URL(location.href);
    const params = ["thread_id", "selected_item_id", "mailbox_id", "conversation_id", "id"];
    for (const key of params) {
      const value = url.searchParams.get(key);
      if (value) {
        return {
          externalConversationId: value,
          identityKey: `${key}:${value}`,
          identityConfidence: "HIGH"
        };
      }
    }

    const pathIdentity = Bridge.normalizeWhitespace(`${url.pathname}${url.search}`);
    if (pathIdentity && pathIdentity !== "/") {
      return {
        threadUrl: url.href,
        identityKey: `url:${pathIdentity}`,
        identityConfidence: "MEDIUM"
      };
    }

    const fallback = Bridge.normalizeWhitespace([customer.username, customer.externalUserId, customer.phone].filter(Boolean).join("|"));
    return {
      threadUrl: url.href,
      identityKey: fallback ? `customer:${fallback}` : `fallback:${url.hostname}`,
      identityConfidence: "LOW"
    };
  }

  function isInsideIgnoredUi(node) {
    if (node.closest("#eleanor-bridge-widget")) return true;
    return META_SELECTORS.composeBox.some((selector) => node.closest(selector)) ||
      META_SELECTORS.sidebar.some((selector) => node.closest(selector)) ||
      Boolean(node.closest("[role='button'],button,[aria-label*='emoji' i],[aria-label*='reaction' i]"));
  }

  function conversationColumnRange(pane) {
    const compose = allMatches(pane, META_SELECTORS.composeBox).filter(isVisible)[0] ||
      allMatches(document, META_SELECTORS.composeBox).filter(isVisible)[0];
    if (!compose) return null;
    const box = compose.getBoundingClientRect();
    if (!box.width) return null;
    return {
      left: Math.max(0, box.left - 80),
      right: Math.min(window.innerWidth, box.right + 80)
    };
  }

  function isInConversationColumn(node, range) {
    if (!range) return true;
    const box = node.getBoundingClientRect();
    const center = box.left + box.width / 2;
    return center >= range.left && center <= range.right;
  }

  function messageTextFrom(node) {
    const directText = Bridge.normalizeWhitespace(node.innerText || node.textContent);
    if ((node.matches("[dir='auto'],span") || node.children.length === 0) && directText && !isLikelyNonMessageText(directText)) {
      return directText;
    }

    const pieces = [];
    allMatches(node, ["[dir='auto']", "span"]).forEach((candidate) => {
      if (candidate !== node && hasTextBearingChild(candidate)) return;
      const text = Bridge.normalizeWhitespace(candidate.innerText || candidate.textContent);
      if (text && !isLikelyNonMessageText(text) && !isPlatformLabel(text) && !isTimestampOnly(text)) pieces.push(text);
    });
    const text = Bridge.normalizeWhitespace(pieces.join("\n"));
    return text || emojiTextFromNode(node);
  }

  function emojiTextFromNode(node) {
    const values = [];
    allMatches(node, ["img[alt]", "[aria-label]", "[title]"]).forEach((candidate) => {
      if (isInsideIgnoredUi(candidate)) return;
      const raw = candidate.getAttribute("alt") ||
        candidate.getAttribute("aria-label") ||
        candidate.getAttribute("title") ||
        "";
      const text = Bridge.normalizeWhitespace(raw);
      if (isEmojiOnlyText(text)) values.push(text);
    });
    return Bridge.normalizeWhitespace(Array.from(new Set(values)).join(" "));
  }

  function isEmojiOnlyText(text) {
    return Boolean(text) &&
      text.length <= 24 &&
      /^[\p{Emoji_Presentation}\p{Emoji}\u200d\ufe0f\s]+$/u.test(text) &&
      !/^[\d\s#*]+$/.test(text);
  }

  function isLikelyNonMessageText(text) {
    if (/^(Like|Reply|React|Forward|More|Send|Search|Inbox|All|Unread|Done|Assign|Move|Mark as|Sync to Eleanor|Copy Debug JSON|Today|Yesterday|Sent|label|Facebook comments|Instagram comments|Assign this conversation)$/i.test(text)) {
      return true;
    }
    if (/All messages.*Messenger.*Instagram.*WhatsApp/s.test(text)) return true;
    if (/Availability status.*All messages/s.test(text)) return true;
    if (/Assign this conversation/s.test(text)) return true;
    if (appChromeNoiseScore(text) > 0) return true;
    return false;
  }

  function isPlatformLabel(text) {
    return /^(Facebook|Instagram|WhatsApp|Messenger|Meta Business Suite)$/i.test(text);
  }

  function isTimestampOnly(text) {
    return /^(Today|Yesterday|\d{1,2}:\d{2}\s?(AM|PM)|\d{1,2}:\d{2}|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?\s+\d{1,2}:\d{2}\s?(?:AM|PM)?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2},?\s+\d{1,2}:\d{2}\s?(?:AM|PM)?)$/i.test(text);
  }

  function hasTextBearingChild(node) {
    return Array.from(node.children).some((child) => {
      const text = Bridge.normalizeWhitespace(child.innerText || child.textContent);
      return text && text.length >= 2 && !isLikelyNonMessageText(text);
    });
  }

  function fallbackMessageCandidates(pane) {
    const columnRange = conversationColumnRange(pane);
    const nodes = allMatches(pane, META_SELECTORS.fallbackMessageText || ["[dir='auto']", "span", "img[alt]"])
      .filter((node) => {
        if (!isVisible(node) || isInsideIgnoredUi(node)) return false;
        if (!isInConversationColumn(node, columnRange)) return false;
        const text = Bridge.normalizeWhitespace(node.innerText || node.textContent);
        const emojiText = emojiTextFromNode(node);
        const attachments = extractAttachments(node);
        if (!text && !emojiText && attachments.length === 0) return false;
        if (text.length > 1200 || isLikelyNonMessageText(text) || isPlatformLabel(text) || isTimestampOnly(text)) return false;
        if (/^\d+$/.test(text)) return false;
        if (hasTextBearingChild(node) && attachments.length === 0 && !emojiText) return false;
        return true;
      });
    return nodes;
  }

  function primaryMessageCandidates(pane, columnRange) {
    const primaryCandidates = allMatches(pane, META_SELECTORS.messageContainer)
      .filter((node) => {
        if (!isVisible(node) || isInsideIgnoredUi(node)) return false;
        if (!isInConversationColumn(node, columnRange)) return false;
        const text = Bridge.normalizeWhitespace(node.innerText || node.textContent);
        const emojiText = emojiTextFromNode(node);
        if (!text && !emojiText && extractAttachments(node).length === 0) return false;
        return !isLikelyNonMessageText(text) && !isPlatformLabel(text) && !isTimestampOnly(text);
      });
    const primaryHasWrapperText = primaryCandidates.some((node) => {
      const text = Bridge.normalizeWhitespace(node.innerText || node.textContent);
      return text.length > 1200 || sidebarNoiseScore(text) > 0 || appChromeNoiseScore(text) > 0;
    });

    return primaryHasWrapperText
      ? []
      : primaryCandidates.filter((node) => {
        const text = Bridge.normalizeWhitespace(node.innerText || node.textContent);
        return text.length <= 1100;
      });
  }

  function discoverCanonicalMessageElements(pane) {
    const columnRange = conversationColumnRange(pane);
    const primary = primaryMessageCandidates(pane, columnRange)
      .map((element) => ({ element, source: "primary-selector" }));
    const fallback = fallbackMessageCandidates(pane)
      .map((element) => ({ element, source: "fallback-selector" }));
    const groupedFallback = uniqueEntriesByElement(fallback
      .map((entry) => ({ element: bubbleAncestorFor(entry.element, pane), source: "grouped-fallback" })));

    const primaryLooksBroad = primary.some((entry) => {
      const text = Bridge.normalizeWhitespace(entry.element.innerText || entry.element.textContent);
      return messageLeafCount(entry.element) > 8 || groupedFallback.filter((grouped) => entry.element.contains(grouped.element)).length > 1 || text.split("\n").length > 12;
    });

    const entries = primary.length && !primaryLooksBroad && groupedFallback.length <= primary.length
      ? primary.concat(groupedFallback)
      : groupedFallback.length
        ? groupedFallback
        : fallback;

    return Bridge.canonicalizeMessageCandidates(entries);
  }

  function uniqueEntriesByElement(entries) {
    const seen = new Set();
    return entries.filter((entry) => {
      if (!entry.element || seen.has(entry.element)) return false;
      seen.add(entry.element);
      return true;
    });
  }

  function bubbleAncestorFor(node, pane) {
    let current = node;
    let best = node;
    let depth = 0;
    while (current && current !== pane && depth < 6) {
      const text = Bridge.normalizeWhitespace(current.innerText || current.textContent);
      const box = current.getBoundingClientRect();
      const leafCount = messageLeafCount(current);
      if (
        text &&
        text.length <= 1100 &&
        box.width >= 40 &&
        box.width <= Math.max(760, window.innerWidth * 0.65) &&
        leafCount <= 8 &&
        sidebarNoiseScore(text) === 0 &&
        appChromeNoiseScore(text) === 0
      ) {
        best = current;
      }
      current = current.parentElement;
      depth += 1;
    }
    return best;
  }

  function messageLeafCount(node) {
    return allMatches(node, ["[dir='auto']", "span", "img[alt]"])
      .filter((candidate) => {
        if (candidate !== node && hasTextBearingChild(candidate)) return false;
        const text = Bridge.normalizeWhitespace(candidate.innerText || candidate.textContent);
        const emojiText = emojiTextFromNode(candidate);
        if (!text && !emojiText) return false;
        if (isLikelyNonMessageText(text) || isPlatformLabel(text) || isTimestampOnly(text)) return false;
        return true;
      }).length;
  }

  function cleanMessageText(text) {
    const lines = Bridge.normalizeWhitespace(text)
      .split("\n")
      .map((line) => Bridge.normalizeWhitespace(line))
      .filter(Boolean)
      .filter((line) => !isTimestampOnly(line))
      .filter((line) => !isLikelyNonMessageText(line))
      .filter((line) => !isPlatformLabel(line));
    const collapsed = dedupeRepeatedSequence(lines);
    return Bridge.normalizeWhitespace(collapsed.join("\n"));
  }

  function dedupeRepeatedSequence(lines) {
    const compressedRuns = [];
    lines.forEach((line) => {
      if (compressedRuns[compressedRuns.length - 1] !== line) compressedRuns.push(line);
    });

    if (compressedRuns.length !== lines.length) {
      return dedupeRepeatedSequence(compressedRuns);
    }

    if (lines.length % 2 === 0) {
      const midpoint = lines.length / 2;
      const firstHalf = lines.slice(0, midpoint);
      const secondHalf = lines.slice(midpoint);
      if (firstHalf.every((line, index) => line === secondHalf[index])) {
        return firstHalf;
      }
    }

    return lines;
  }

  function hasRepeatedThreadPattern(text) {
    const lines = Bridge.normalizeWhitespace(text).split("\n").filter(Boolean);
    if (lines.length < 8) return false;
    const counts = new Map();
    lines.forEach((line) => counts.set(line, (counts.get(line) || 0) + 1));
    const repeatedLines = Array.from(counts.values()).filter((count) => count >= 3).length;
    return repeatedLines >= 2;
  }

  function isMessageChromeText(text, customer) {
    if (!text) return true;
    if (isLikelyNonMessageText(text) || isPlatformLabel(text) || isTimestampOnly(text)) return true;
    if (customer.displayName && text === customer.displayName) return true;
    if (/Assign this conversation|View profile|More Items|Collapse contact details|Lead stage|Order status|Suggested labels|Manage labels|Add note/s.test(text)) return true;
    return false;
  }

  function assignmentHeaderCandidates(root) {
    return fallbackMessageCandidates(root)
      .map((node) => bubbleAncestorFor(node, root))
      .filter((node, index, list) => list.indexOf(node) === index)
      .filter((node) => hasAssignmentLink(node));
  }

  function hasAssignmentLink(node) {
    return extractAttachments(node).some((attachment) =>
      attachment.type === "LINK" &&
      /assign this conversation/i.test(attachment.name || "")
    );
  }

  function extractTimestamp(node) {
    const candidates = timestampCandidatesFor(node);
    const exact = candidates.find((candidate) => candidate.normalized.timestamp);
    if (exact) {
      return {
        rawTimestamp: exact.raw,
        timestamp: exact.normalized.timestamp,
        timestampConfidence: exact.confidence
      };
    }

    const visible = candidates.find((candidate) => candidate.raw);
    if (visible) {
      return {
        rawTimestamp: visible.raw,
        timestamp: undefined,
        timestampConfidence: visible.confidence
      };
    }

    return { rawTimestamp: undefined, timestamp: undefined, timestampConfidence: "LOW" };
  }

  function extractTimestampForMessage(node, pane, timelineMarkers) {
    const direct = extractTimestamp(node);
    if (direct.rawTimestamp || direct.timestamp) return direct;

    const nearest = nearestTimelineMarker(node, timelineMarkers || collectTimelineTimestampMarkers(pane));
    if (!nearest) return direct;

    const normalized = normalizeTimestampEvidence(nearest.raw, nearest.confidence);
    return {
      rawTimestamp: nearest.raw,
      timestamp: normalized.timestamp,
      timestampConfidence: normalized.timestamp ? normalized.timestampConfidence : nearest.confidence
    };
  }

  function timestampCandidatesFor(node) {
    const candidates = [];
    const seen = new Set();

    function addRaw(raw, source, confidence) {
      const cleaned = cleanRawTimestamp(raw);
      if (!cleaned || seen.has(`${source}:${cleaned}`)) return;
      seen.add(`${source}:${cleaned}`);
      const normalized = normalizeTimestampEvidence(cleaned, confidence);
      candidates.push({ raw: cleaned, source, confidence: normalized.timestamp ? normalized.timestampConfidence : confidence, normalized });
    }

    function collectFrom(candidate, sourcePrefix) {
      if (!candidate || !(candidate instanceof Element)) return;
      [
        "datetime",
        "title",
        "aria-label",
        "data-tooltip-content",
        "data-tooltip-text",
        "data-hovercard",
        "data-testid"
      ].forEach((attribute) => addRaw(candidate.getAttribute(attribute), `${sourcePrefix}.${attribute}`, "HIGH"));
      if (candidate.matches("time,abbr,[aria-label*='Sent' i],[aria-label*='Delivered' i]")) {
        addRaw(candidate.textContent, `${sourcePrefix}.text`, "LOW");
      }
    }

    collectFrom(node, "message");
    allMatches(node, META_SELECTORS.timestamps).forEach((candidate) => collectFrom(candidate, "descendant"));

    let current = node.parentElement;
    let depth = 0;
    while (current && depth < 5) {
      collectFrom(current, `ancestor${depth}`);
      allMatches(current, META_SELECTORS.timestamps).slice(0, 6).forEach((candidate) => collectFrom(candidate, `ancestor${depth}.descendant`));
      current = current.parentElement;
      depth += 1;
    }

    nearbyTextNodes(node).forEach((entry) => addRaw(entry.text, entry.source, entry.confidence));
    return candidates.filter((candidate) => looksLikeTimestampEvidence(candidate.raw));
  }

  function cleanRawTimestamp(raw) {
    return Bridge.normalizeWhitespace(String(raw || "")
      .replace(/\u202f/g, " ")
      .replace(/\u00a0/g, " "));
  }

  function splitTimestampEvidence(raw) {
    const cleaned = cleanRawTimestamp(raw);
    if (!cleaned) return [];
    const lines = cleaned.split("\n").map(cleanRawTimestamp).filter(Boolean);
    const sourceLines = lines.length > 1 ? lines : [cleaned];
    return sourceLines.flatMap((line) => {
      const fullDateTime = line.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2},?\s+\d{1,2}:\d{2}\s?(?:AM|PM)?)/i);
      if (fullDateTime) return [fullDateTime[1]];
      const weekdayTime = line.match(/((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?\s+\d{1,2}:\d{2}\s?(?:AM|PM)?)/i);
      if (weekdayTime) return [weekdayTime[1]];
      const timeOnly = line.match(/^(\d{1,2}:\d{2}\s?(?:AM|PM)?)$/i);
      if (timeOnly) return [timeOnly[1]];
      return [line];
    });
  }

  function looksLikeTimestampEvidence(raw) {
    const cleaned = cleanRawTimestamp(raw);
    if (!cleaned || cleaned.length > 80) return false;
    if (cleaned.includes("\n")) return false;
    return /\b(\d{1,2}:\d{2}|AM|PM|Today|Yesterday|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|20\d{2})\b/i.test(cleaned);
  }

  function normalizeTimestampEvidence(raw, fallbackConfidence) {
    const direct = Bridge.normalizeTimestamp(raw);
    if (direct.timestamp) return direct;

    const cleaned = cleanRawTimestamp(raw)
      .replace(/\b(sent|delivered|seen|message sent|you sent|replied)\b/ig, " ")
      .replace(/\bat\b/ig, " ")
      .replace(/\s+/g, " ")
      .trim();
    const cleanedResult = Bridge.normalizeTimestamp(cleaned);
    if (cleanedResult.timestamp) return cleanedResult;

    const dateTimeMatch = cleaned.match(/\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2}).*?(\d{1,2}:\d{2}\s?(?:AM|PM)?)\b/i);
    if (dateTimeMatch) {
      const parsed = Bridge.normalizeTimestamp(`${dateTimeMatch[1]} ${dateTimeMatch[2]}`);
      if (parsed.timestamp) return { timestamp: parsed.timestamp, timestampConfidence: "HIGH" };
    }

    const relative = normalizeRelativeTimestamp(cleaned);
    if (relative.timestamp) return relative;

    return { timestamp: undefined, timestampConfidence: fallbackConfidence || "LOW" };
  }

  function normalizeRelativeTimestamp(raw) {
    const cleaned = cleanRawTimestamp(raw);
    const todayTime = cleaned.match(/^Today\s+(\d{1,2}:\d{2}\s?(?:AM|PM)?)$/i);
    if (todayTime) return localDateTimeFromRelativeDay(0, todayTime[1], "MEDIUM");

    const yesterdayTime = cleaned.match(/^Yesterday\s+(\d{1,2}:\d{2}\s?(?:AM|PM)?)$/i);
    if (yesterdayTime) return localDateTimeFromRelativeDay(1, yesterdayTime[1], "MEDIUM");

    const weekdayTime = cleaned.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?\s+(\d{1,2}:\d{2}\s?(?:AM|PM)?)$/i);
    if (weekdayTime) {
      const targetDay = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(weekdayTime[1].slice(0, 3).toLowerCase());
      const now = new Date();
      const delta = (now.getDay() - targetDay + 7) % 7;
      return localDateTimeFromRelativeDay(delta, weekdayTime[2], "MEDIUM");
    }

    return { timestamp: undefined, timestampConfidence: "LOW" };
  }

  function localDateTimeFromRelativeDay(daysAgo, timeText, confidence) {
    const time = parseTimeOfDay(timeText);
    if (!time) return { timestamp: undefined, timestampConfidence: "LOW" };
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(time.hours, time.minutes, 0, 0);
    return {
      timestamp: date.toISOString().replace(".000Z", "Z"),
      timestampConfidence: confidence
    };
  }

  function parseTimeOfDay(timeText) {
    const match = cleanRawTimestamp(timeText).match(/^(\d{1,2}):(\d{2})\s?(AM|PM)?$/i);
    if (!match) return null;
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const meridiem = match[3] && match[3].toUpperCase();
    if (minutes > 59 || hours > 23 || (meridiem && hours > 12)) return null;
    if (meridiem === "PM" && hours !== 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
    return { hours, minutes };
  }

  function nearbyTextNodes(node) {
    const entries = [];
    function addFrom(element, source, confidence) {
      if (!element || !(element instanceof Element) || !isVisible(element)) return;
      const text = cleanRawTimestamp(element.innerText || element.textContent);
      if (text && looksLikeTimestampEvidence(text) && text.length <= 120) {
        entries.push({ text, source, confidence });
      }
    }

    let previous = node.previousElementSibling;
    let previousCount = 0;
    while (previous && previousCount < 4) {
      addFrom(previous, `previousSibling${previousCount}`, isTimestampOnly(cleanRawTimestamp(previous.innerText || previous.textContent)) ? "LOW" : "MEDIUM");
      previous = previous.previousElementSibling;
      previousCount += 1;
    }

    let next = node.nextElementSibling;
    let nextCount = 0;
    while (next && nextCount < 3) {
      addFrom(next, `nextSibling${nextCount}`, isTimestampOnly(cleanRawTimestamp(next.innerText || next.textContent)) ? "LOW" : "MEDIUM");
      next = next.nextElementSibling;
      nextCount += 1;
    }

    let current = node.parentElement;
    let depth = 0;
    while (current && depth < 4) {
      Array.from(current.children).forEach((child) => {
        const text = cleanRawTimestamp(child.innerText || child.textContent);
        if (isTimestampOnly(text)) entries.push({ text, source: `ancestor${depth}.child`, confidence: "LOW" });
      });
      current = current.parentElement;
      depth += 1;
    }

    return entries;
  }

  function collectTimelineTimestampMarkers(pane) {
    const columnRange = conversationColumnRange(pane);
    const markers = [];
    const seen = new Set();
    const selectors = ["[dir='auto']", "span", "time", "abbr[title]", "[aria-label]", "[title]"];

    allMatches(pane, selectors).forEach((node) => {
      if (!isVisible(node) || isInsideIgnoredUi(node)) return;
      if (!isInConversationColumn(node, columnRange)) return;

      const rawValues = [
        node.getAttribute("datetime"),
        node.getAttribute("title"),
        node.getAttribute("aria-label"),
        node.innerText || node.textContent
      ].flatMap(splitTimestampEvidence).map(cleanRawTimestamp).filter(Boolean);

      rawValues.forEach((raw) => {
        if (!looksLikeTimestampEvidence(raw)) return;
        if (raw.length > 120) return;
        const key = `${raw}:${Math.round(node.getBoundingClientRect().top)}`;
        if (seen.has(key)) return;
        seen.add(key);
        const normalized = normalizeTimestampEvidence(raw, isTimestampOnly(raw) ? "LOW" : "MEDIUM");
        markers.push({
          raw,
          confidence: normalized.timestamp ? normalized.timestampConfidence : (isTimestampOnly(raw) ? "LOW" : "MEDIUM"),
          rect: node.getBoundingClientRect()
        });
      });
    });

    return markers.sort((a, b) => a.rect.top - b.rect.top);
  }

  function nearestTimelineMarker(node, markers) {
    if (!markers || !markers.length) return null;
    const box = node.getBoundingClientRect();
    const centerY = box.top + box.height / 2;
    const candidates = markers
      .map((marker) => {
        const markerY = marker.rect.top + marker.rect.height / 2;
        const distance = centerY - markerY;
        return { marker, distance };
      })
      .filter((entry) => entry.distance >= -96 && entry.distance < 520)
      .sort((a, b) => {
        const aPenalty = a.distance < 0 ? 80 : 0;
        const bPenalty = b.distance < 0 ? 80 : 0;
        return Math.abs(a.distance) + aPenalty - (Math.abs(b.distance) + bPenalty);
      });

    return candidates.length ? candidates[0].marker : null;
  }

  function detectDirection(node, pane) {
    const aria = `${node.getAttribute("aria-label") || ""} ${node.textContent || ""}`;
    if (/\b(you sent|sent by you|your message|from you)\b/i.test(aria)) return "OUTBOUND";
    if (/\b(sent by|from)\b/i.test(aria) && !/\byou\b/i.test(aria)) return "INBOUND";

    const paneBox = pane.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    if (box.width && paneBox.width) {
      const center = box.left + box.width / 2;
      if (center > paneBox.left + paneBox.width * 0.62) return "OUTBOUND";
      if (center < paneBox.left + paneBox.width * 0.52) return "INBOUND";
    }

    return "UNKNOWN";
  }

  function extractAttachments(node) {
    return allMatches(node, META_SELECTORS.attachments).map((attachmentNode) => {
      const tag = attachmentNode.tagName.toLowerCase();
      const href = attachmentNode.getAttribute("href");
      const src = attachmentNode.currentSrc || attachmentNode.src;
      const label = Bridge.normalizeWhitespace(
        attachmentNode.getAttribute("aria-label") ||
        attachmentNode.getAttribute("alt") ||
        attachmentNode.getAttribute("title") ||
        attachmentNode.textContent
      );
      let type = "UNKNOWN";
      if (tag === "img") type = "IMAGE";
      if (tag === "video") type = "VIDEO";
      if (tag === "audio") type = "AUDIO";
      if (tag === "a") type = /\.(pdf|docx?|xlsx?|csv|zip|txt)(\?|$)/i.test(href || "") ? "FILE" : "LINK";
      if (tag === "img" && isDecorativeImage(attachmentNode, src, label)) return null;
      return Bridge.normalizeAttachment({ type, url: href || src || undefined, name: label || undefined });
    }).filter((attachment) => attachment && (attachment.url || attachment.name));
  }

  function isDecorativeImage(image, src, label) {
    if (/static\.xx\.fbcdn\.net\/images\/emoji\.php/i.test(src || "")) return true;
    if (/profile_pic|t51\.2885-19|s150x150/i.test(src || "")) return true;
    const box = image.getBoundingClientRect();
    const naturalWidth = image.naturalWidth || 0;
    const naturalHeight = image.naturalHeight || 0;
    const width = Math.max(box.width, naturalWidth);
    const height = Math.max(box.height, naturalHeight);
    if (width > 0 && height > 0 && width <= 64 && height <= 64) return true;
    if (label && /^[\p{Emoji}\s]+$/u.test(label)) return true;
    return false;
  }

  async function extractMessages(pane, channel, identityKey) {
    const customer = extractCustomer(pane);
    const timelineMarkers = collectTimelineTimestampMarkers(pane);
    const discovery = discoverCanonicalMessageElements(pane);
    const candidates = discovery.elements;
    const uniqueByPreFingerprint = new Set();
    const messages = [];

    for (const candidate of candidates) {
      const node = candidate.element;
      const text = cleanMessageText(messageTextFrom(node));
      const attachments = extractAttachments(node);
      if (!text && attachments.length === 0) continue;
      if (hasAssignmentLink(node)) continue;
      if (isMessageChromeText(text, customer)) continue;
      if (hasRepeatedThreadPattern(text)) continue;
      if (appChromeNoiseScore(text) > 0 || sidebarNoiseScore(text) > 0) continue;

      let timestampInfo = extractTimestampForMessage(node, pane, timelineMarkers);
      if (!timestampInfo.rawTimestamp && timelineMarkers.length === 1) {
        const marker = timelineMarkers[0];
        const normalized = normalizeTimestampEvidence(marker.raw, marker.confidence);
        timestampInfo = {
          rawTimestamp: marker.raw,
          timestamp: normalized.timestamp,
          timestampConfidence: normalized.timestamp ? normalized.timestampConfidence : marker.confidence
        };
      }
      const direction = detectDirection(node, pane);
      const externalMessageId = node.getAttribute("data-message-id") || node.id || undefined;
      const dedupeKey = [
        direction,
        Bridge.normalizeWhitespace(text),
        timestampInfo.timestamp || timestampInfo.rawTimestamp || "",
        attachmentSignature(attachments),
        candidate.canonicalIndex
      ].join("|");
      if (uniqueByPreFingerprint.has(dedupeKey)) continue;
      uniqueByPreFingerprint.add(dedupeKey);

      const message = {
        externalMessageId,
        direction,
        senderName: undefined,
        text: text || undefined,
        rawTimestamp: timestampInfo.rawTimestamp,
        timestamp: timestampInfo.timestamp,
        timestampConfidence: timestampInfo.timestampConfidence,
        attachments,
        fingerprint: ""
      };
      message.fingerprint = await Bridge.fingerprintMessage({ channel, conversationIdentity: identityKey, message });
      messages.push(message);
    }

    return messages;
  }

  function attachmentSignature(attachments) {
    return (attachments || [])
      .map((attachment) => [attachment.type || "", attachment.url || "", attachment.name || ""].join(":"))
      .sort()
      .join("|");
  }

  function buildExtractionSummary(messages) {
    return messages.reduce((summary, message) => {
      summary.messagesDetected += 1;
      if (message.direction === "INBOUND") summary.inboundCount += 1;
      if (message.direction === "OUTBOUND") summary.outboundCount += 1;
      if (message.timestamp) summary.messagesWithTimestamp += 1;
      if (!message.timestamp) summary.messagesWithoutTimestamp += 1;
      summary.attachmentCount += (message.attachments || []).length;
      return summary;
    }, {
      messagesDetected: 0,
      inboundCount: 0,
      outboundCount: 0,
      messagesWithTimestamp: 0,
      messagesWithoutTimestamp: 0,
      attachmentCount: 0
    });
  }

  function buildDiagnostics(pane, channelInfo, messages) {
    const fallbackCandidates = pane
      ? fallbackMessageCandidates(pane)
      : [];
    const groupedFallbackCandidates = pane
      ? fallbackCandidates.map((node) => bubbleAncestorFor(node, pane)).filter((node, index, list) => list.indexOf(node) === index)
      : [];
    const candidateDiscovery = pane
      ? discoverCanonicalMessageElements(pane).diagnostics
      : { rawCandidates: 0, canonicalMessageElements: 0, duplicatesRemoved: 0, candidateSources: [] };
    const timelineMarkers = pane ? collectTimelineTimestampMarkers(pane) : [];
    const textSample = fallbackCandidates.slice(0, 12).map((node) => Bridge.normalizeWhitespace(node.innerText || node.textContent).slice(0, 120));
    const groupedMessageSample = groupedFallbackCandidates.slice(0, 8).map((node) => cleanMessageText(messageTextFrom(node)).slice(0, 180));
    const timestampEvidenceSample = groupedFallbackCandidates.slice(0, 8).map((node) => ({
      text: cleanMessageText(messageTextFrom(node)).slice(0, 80),
      evidence: timestampCandidatesFor(node).slice(0, 6).map((candidate) => ({
        raw: candidate.raw,
        source: candidate.source,
        confidence: candidate.confidence,
        timestamp: candidate.normalized.timestamp
      })),
      nearestTimelineMarker: nearestTimelineMarker(node, timelineMarkers)
        ? {
          raw: nearestTimelineMarker(node, timelineMarkers).raw,
          confidence: nearestTimelineMarker(node, timelineMarkers).confidence
        }
        : undefined
    }));
    const customerCandidates = pane
      ? customerNameCandidates(pane, firstMatch(pane, META_SELECTORS.conversationHeader)).slice(0, 8)
      : [];
    return {
      url: location.href,
      isSupportedPage: isMetaBusinessInbox(),
      channelEvidence: channelInfo.evidence,
      selectors: {
        conversationPane: Boolean(pane),
        messageCandidates: pane ? allMatches(pane, META_SELECTORS.messageContainer).length : 0,
        fallbackMessageCandidates: fallbackCandidates.length,
        groupedFallbackCandidates: groupedFallbackCandidates.length,
        rawCandidates: candidateDiscovery.rawCandidates,
        canonicalMessageElements: candidateDiscovery.canonicalMessageElements,
        duplicatesRemoved: candidateDiscovery.duplicatesRemoved,
        candidateSources: candidateDiscovery.candidateSources,
        timelineTimestampMarkers: timelineMarkers.slice(0, 12).map((marker) => ({
          raw: marker.raw,
          confidence: marker.confidence
        })),
        selectorCounts: pane ? selectorCounts(pane, META_SELECTORS.messageContainer) : {},
        textSample,
        groupedMessageSample,
        timestampEvidenceSample,
        customerCandidates,
        messagesExtracted: messages.length
      }
    };
  }

  async function extractCurrentConversation() {
    const pane = findConversationPane();
    if (!pane || !isMetaBusinessInbox()) {
      return {
        ok: false,
        error: "Meta Business Suite Inbox conversation pane was not detected.",
        diagnostics: buildDiagnostics(pane, { evidence: "unsupported page or no pane" }, [])
      };
    }

    const channelInfo = detectChannel(pane);
    const customer = extractCustomer(pane);
    const identity = extractConversationIdentity(customer);
    const messages = await extractMessages(pane, channelInfo.channel, identity.identityKey);
    const payload = {
      source: "META_BUSINESS_SUITE",
      channel: channelInfo.channel,
      channelConfidence: channelInfo.confidence,
      externalConversationId: identity.externalConversationId,
      threadUrl: identity.threadUrl || location.href,
      identityKey: identity.identityKey,
      identityConfidence: identity.identityConfidence,
      customer,
      messages,
      summary: buildExtractionSummary(messages),
      extractedAt: new Date().toISOString()
    };

    return {
      ok: true,
      payload,
      diagnostics: buildDiagnostics(pane, channelInfo, messages)
    };
  }

  Bridge.MetaParser = {
    isMetaBusinessInbox,
    detectChannel,
    extractCurrentConversation,
    __test: {
      cleanMessageText,
      hasRepeatedThreadPattern,
      uniqueEntriesByElement
    }
  };
  console.log("[Eleanor Bridge] parser loaded");
})();
