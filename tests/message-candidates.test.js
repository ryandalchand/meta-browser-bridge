const assert = require("assert");
const { canonicalizeMessageCandidates } = require("../src/shared/message-candidates");

class FakeElement {
  constructor(name, order, width = 100, height = 40) {
    this.name = name;
    this.__order = order;
    this.children = [];
    this.parent = null;
    this.width = width;
    this.height = height;
  }

  append(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  contains(other) {
    let current = other;
    while (current) {
      if (current === this) return true;
      current = current.parent;
    }
    return false;
  }

  compareDocumentPosition(other) {
    if (this.__order < other.__order) return 4;
    if (this.__order > other.__order) return 2;
    return 0;
  }

  getBoundingClientRect() {
    return { width: this.width, height: this.height };
  }
}

function names(result) {
  return result.elements.map((entry) => entry.element.name);
}

function run() {
  {
    const wrapper = new FakeElement("wrapper", 1, 220, 80);
    const ariaChild = wrapper.append(new FakeElement("aria-child", 2, 180, 50));
    const textChild = ariaChild.append(new FakeElement("text-child", 3, 150, 30));
    const result = canonicalizeMessageCandidates([
      { element: wrapper, source: "grouped-fallback" },
      { element: ariaChild, source: "grouped-fallback" },
      { element: textChild, source: "fallback-selector" }
    ]);
    assert.strictEqual(result.elements.length, 1, "nested duplicate nodes should become one message");
    assert.deepStrictEqual(names(result), ["wrapper"]);
    assert.strictEqual(result.diagnostics.duplicatesRemoved, 2);
  }

  {
    const bubble = new FakeElement("bubble", 1, 200, 70);
    const text = bubble.append(new FakeElement("text", 2, 120, 30));
    const result = canonicalizeMessageCandidates([
      { element: bubble, source: "primary-selector" },
      { element: text, source: "grouped-fallback" }
    ]);
    assert.strictEqual(result.elements.length, 1, "primary + fallback overlap should become one message");
    assert.deepStrictEqual(names(result), ["bubble"]);
  }

  {
    const hiA = new FakeElement("hi-a", 1);
    const hiB = new FakeElement("hi-b", 2);
    const result = canonicalizeMessageCandidates([
      { element: hiA, source: "grouped-fallback" },
      { element: hiB, source: "grouped-fallback" }
    ]);
    assert.strictEqual(result.elements.length, 2, "legitimately repeated text in separate bubbles should remain two messages");
    assert.deepStrictEqual(names(result), ["hi-a", "hi-b"]);
  }

  {
    const multiline = new FakeElement("multiline-bubble", 1, 240, 120);
    multiline.append(new FakeElement("line-1", 2));
    multiline.append(new FakeElement("line-2", 3));
    multiline.append(new FakeElement("line-3", 4));
    const result = canonicalizeMessageCandidates([
      { element: multiline, source: "grouped-fallback" },
      ...multiline.children.map((element) => ({ element, source: "fallback-selector" }))
    ]);
    assert.strictEqual(result.elements.length, 1, "multiline bubble should remain one message");
    assert.deepStrictEqual(names(result), ["multiline-bubble"]);
  }

  {
    const outbound = new FakeElement("outbound-template", 1, 260, 160);
    outbound.append(new FakeElement("hello", 2));
    outbound.append(new FakeElement("name", 3));
    outbound.append(new FakeElement("email", 4));
    const result = canonicalizeMessageCandidates([
      { element: outbound, source: "grouped-fallback" },
      ...outbound.children.map((element) => ({ element, source: "fallback-selector" }))
    ]);
    assert.strictEqual(result.elements.length, 1, "outbound multiline template should remain one message");
    assert.deepStrictEqual(names(result), ["outbound-template"]);
  }
}

try {
  run();
  console.log("message candidate tests passed");
} catch (error) {
  console.error(error);
  process.exit(1);
}
