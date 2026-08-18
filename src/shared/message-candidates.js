(function initMessageCandidates(globalScope) {
  globalScope.EleanorBridge ??= {};

  const SOURCE_PRIORITY = {
    "primary-selector": 30,
    "grouped-fallback": 20,
    "fallback-selector": 10
  };

  function sourcePriority(source) {
    return SOURCE_PRIORITY[source] || 0;
  }

  function documentOrder(a, b) {
    if (a === b) return 0;
    if (a && typeof a.compareDocumentPosition === "function") {
      const position = a.compareDocumentPosition(b);
      if (position & 2) return 1;
      if (position & 4) return -1;
    }
    const aOrder = typeof a.__order === "number" ? a.__order : 0;
    const bOrder = typeof b.__order === "number" ? b.__order : 0;
    return aOrder - bOrder;
  }

  function containsElement(parent, child) {
    return Boolean(parent && child && parent !== child && typeof parent.contains === "function" && parent.contains(child));
  }

  function elementArea(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") return Number.POSITIVE_INFINITY;
    const box = element.getBoundingClientRect();
    return Math.max(1, box.width || 1) * Math.max(1, box.height || 1);
  }

  function chooseCanonicalEntry(existing, incoming) {
    const existingPriority = sourcePriority(existing.source);
    const incomingPriority = sourcePriority(incoming.source);
    if (incomingPriority !== existingPriority) {
      return incomingPriority > existingPriority ? incoming : existing;
    }

    const existingContainsIncoming = containsElement(existing.element, incoming.element);
    const incomingContainsExisting = containsElement(incoming.element, existing.element);
    if (existingContainsIncoming || incomingContainsExisting) {
      const existingArea = elementArea(existing.element);
      const incomingArea = elementArea(incoming.element);
      return incomingArea > existingArea ? incoming : existing;
    }

    return documentOrder(incoming.element, existing.element) < 0 ? incoming : existing;
  }

  function canonicalizeMessageCandidates(entries) {
    const diagnostics = [];
    const canonical = [];
    const rawEntries = entries.map((entry, index) => ({
      ...entry,
      rawIndex: index,
      priority: sourcePriority(entry.source)
    }));

    rawEntries
      .filter((entry) => entry && entry.element)
      .sort((a, b) => documentOrder(a.element, b.element) || b.priority - a.priority)
      .forEach((entry) => {
        const overlapIndex = canonical.findIndex((existing) =>
          existing.element === entry.element ||
          containsElement(existing.element, entry.element) ||
          containsElement(entry.element, existing.element)
        );

        if (overlapIndex === -1) {
          canonical.push(entry);
          diagnostics.push({ source: entry.source, rawIndex: entry.rawIndex, status: "kept" });
          return;
        }

        const existing = canonical[overlapIndex];
        const winner = chooseCanonicalEntry(existing, entry);
        const loser = winner === existing ? entry : existing;
        canonical[overlapIndex] = winner;
        diagnostics.push({
          source: entry.source,
          rawIndex: entry.rawIndex,
          status: winner === entry ? "replaced-overlap" : "discarded-duplicate",
          duplicateOfSource: winner.source,
          discardedSource: loser.source
        });
      });

    canonical.sort((a, b) => documentOrder(a.element, b.element));

    return {
      elements: canonical.map((entry, index) => ({
        ...entry,
        canonicalIndex: index
      })),
      diagnostics: {
        rawCandidates: rawEntries.length,
        canonicalMessageElements: canonical.length,
        duplicatesRemoved: rawEntries.length - canonical.length,
        candidateSources: diagnostics
      }
    };
  }

  const api = {
    SOURCE_PRIORITY,
    canonicalizeMessageCandidates,
    documentOrder,
    containsElement
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    Object.assign(globalScope.EleanorBridge, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : global);
