const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function loadParserTestApi() {
  const context = {
    globalThis: {},
    window: {},
    location: { hostname: "business.facebook.com", href: "https://business.facebook.com/latest/inbox/all/" },
    console,
    URL,
    Element: function Element() {},
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" })
  };
  context.globalThis = context;
  context.window = context;
  context.EleanorBridge = {
    META_SELECTORS: {},
    normalizeWhitespace(value) {
      return String(value || "")
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t\f\v]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("src/content/meta-parser.js", "utf8"), context);
  return context.EleanorBridge.MetaParser.__test;
}

function run() {
  const api = loadParserTestApi();

  assert.strictEqual(
    api.cleanMessageText("Hii\nHii\nHii\nHii"),
    "Hii",
    "adjacent duplicate lines from nested DOM should collapse"
  );

  assert.strictEqual(
    api.cleanMessageText("Mayank sancheti\nShankysancheti@gmail.com\n+918094240070\nWooden cutlery\nMoq quantity"),
    "Mayank sancheti\nShankysancheti@gmail.com\n+918094240070\nWooden cutlery\nMoq quantity",
    "meaningful multiline customer message should remain intact"
  );

  assert.strictEqual(
    api.hasRepeatedThreadPattern([
      "Hii",
      "Hii",
      "Hii",
      "Hello ,",
      "Hello ,",
      "Hello ,",
      "Mayank sancheti",
      "Mayank sancheti",
      "Mayank sancheti"
    ].join("\n")),
    true,
    "whole-thread repeated wrapper should be rejected"
  );

  assert.strictEqual(
    api.hasRepeatedThreadPattern("Hi\nHi"),
    false,
    "two legitimate repeated short messages must not be classified as a whole-thread wrapper"
  );

  const element = { id: "same" };
  assert.deepStrictEqual(
    api.uniqueEntriesByElement([
      { element, source: "fallback-selector" },
      { element, source: "grouped-fallback" },
      { element: { id: "other" }, source: "grouped-fallback" }
    ]).map((entry) => entry.element.id),
    ["same", "other"],
    "grouped fallback entries should be unique before canonicalization"
  );
}

try {
  run();
  console.log("parser text regression tests passed");
} catch (error) {
  console.error(error);
  process.exit(1);
}
