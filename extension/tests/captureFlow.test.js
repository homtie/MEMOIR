/**
 * Tests for context menu capture flow and source URL rendering.
 *
 * Verifies:
 * 1. Selected text saves with the correct source URL and title.
 * 2. Existing memories remain compatible.
 * 3. Memories without URLs render safely.
 * 4. Valid source URLs render as clickable links.
 * 5. Invalid URLs cannot become unsafe clickable links.
 * 6. The source URL is not accidentally taken from the wrong tab.
 *
 * Run with: node --test extension/tests/captureFlow.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { extractCaptureMetadata } from "../background.js";
import { applyDefaults, CURRENT_SCHEMA_VERSION } from "../services/memoryService.js";
import { createMemoryItem } from "../popup.js";

// Helper: Lightweight mock DOM environment for isolated popup component testing
function createMockDocument() {
  function createElement(tag) {
    return {
      tagName: tag.toUpperCase(),
      textContent: "",
      className: "",
      href: "",
      title: "",
      target: "",
      rel: "",
      children: [],
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      querySelector(selector) {
        return findInTree(this, selector);
      },
      querySelectorAll(selector) {
        const results = [];
        findAllInTree(this, selector, results);
        return results;
      },
    };
  }

  function matchesSelector(el, selector) {
    if (!el || typeof el !== "object") return false;
    if (selector.startsWith(".")) {
      const cls = selector.slice(1);
      return el.className && el.className.split(/\s+/).includes(cls);
    }
    return el.tagName === selector.toUpperCase();
  }

  function findInTree(root, selector) {
    for (const child of root.children || []) {
      if (matchesSelector(child, selector)) return child;
      const found = findInTree(child, selector);
      if (found) return found;
    }
    return null;
  }

  function findAllInTree(root, selector, acc) {
    for (const child of root.children || []) {
      if (matchesSelector(child, selector)) acc.push(child);
      findAllInTree(child, selector, acc);
    }
  }

  return { createElement };
}

describe("Capture Flow & Source URL Metadata", () => {
  // Test 1: Selected text saves with the correct source URL and title
  it("should extract correct source URL and title from context menu event data", () => {
    const info = {
      menuItemId: "save-to-memoir",
      selectionText: "An essential quote on personal knowledge management.",
      pageUrl: "https://en.wikipedia.org/wiki/Personal_knowledge_management",
    };
    const tab = {
      id: 101,
      title: "Personal knowledge management - Wikipedia",
      url: "https://en.wikipedia.org/wiki/Personal_knowledge_management",
    };

    const metadata = extractCaptureMetadata(info, tab);

    assert.strictEqual(
      metadata.url,
      "https://en.wikipedia.org/wiki/Personal_knowledge_management",
      "Should extract page URL"
    );
    assert.strictEqual(
      metadata.title,
      "Personal knowledge management - Wikipedia",
      "Should extract page title"
    );
  });

  it("should extract source URL from info.pageUrl even when tab.url is undefined (Chrome MV3 without tabs permission)", () => {
    // In Chrome Extensions without the "tabs" permission, tab.url and tab.title are undefined
    const info = {
      menuItemId: "save-to-memoir",
      selectionText: "Selected passage without tabs permission.",
      pageUrl: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
    };
    const tab = {
      id: 202,
      // url and title omitted because Chrome hides them without permissions
    };

    const metadata = extractCaptureMetadata(info, tab);

    assert.strictEqual(
      metadata.url,
      "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
      "info.pageUrl must be used when tab.url is unavailable"
    );
    assert.strictEqual(metadata.title, "", "title should default to empty string");
  });

  // Test 2: Existing memories remain compatible
  it("should maintain backward compatibility for existing memories without URLs", () => {
    const legacyMemory = {
      id: "legacy-1",
      type: "capture",
      content: "Old note captured before URL metadata was added",
    };

    const defaulted = applyDefaults(legacyMemory);

    assert.strictEqual(defaulted.id, "legacy-1");
    assert.strictEqual(defaulted.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.strictEqual(defaulted.content, "Old note captured before URL metadata was added");
    assert.strictEqual(defaulted.url, "", "Missing url should default to empty string");
    assert.strictEqual(defaulted.title, "", "Missing title should default to empty string");
  });

  it("should preserve existing memories with valid URLs unchanged", () => {
    const existingMemory = {
      id: "existing-1",
      type: "capture",
      content: "Existing note with valid URL",
      url: "https://example.com/article",
      title: "Example Article",
    };

    const defaulted = applyDefaults(existingMemory);

    assert.strictEqual(defaulted.url, "https://example.com/article");
    assert.strictEqual(defaulted.title, "Example Article");
  });

  // Test 3: Memories without URLs render safely
  it("should render 'Source unavailable' when memory has an empty URL", () => {
    const mockDoc = createMockDocument();
    const memory = {
      id: "mem-no-url",
      content: "Note with empty URL",
      url: "",
      title: "Some Title",
    };

    const card = createMemoryItem(memory, mockDoc);

    const link = card.querySelector("a");
    assert.strictEqual(link, null, "Should not render an <a> tag when URL is empty");

    const unavailableLabel = card.querySelector(".source-unavailable");
    assert.notStrictEqual(unavailableLabel, null, "Should render .source-unavailable label");
    assert.strictEqual(unavailableLabel.textContent, "Source unavailable");
  });

  it("should render 'Source unavailable' when memory URL is missing or null", () => {
    const mockDoc = createMockDocument();
    const memoryNullUrl = {
      id: "mem-null-url",
      content: "Note with null URL",
      url: null,
    };

    const card = createMemoryItem(memoryNullUrl, mockDoc);

    const link = card.querySelector("a");
    assert.strictEqual(link, null, "Should not render an <a> tag when URL is null");

    const unavailableLabel = card.querySelector(".source-unavailable");
    assert.notStrictEqual(unavailableLabel, null, "Should render .source-unavailable label");
    assert.strictEqual(unavailableLabel.textContent, "Source unavailable");
  });

  // Test 4: Valid source URLs render as clickable links
  it("should render a clickable <a> link for valid https source URLs", () => {
    const mockDoc = createMockDocument();
    const memory = {
      id: "mem-valid-url",
      content: "Quote from web documentation",
      url: "https://developer.mozilla.org/en-US/docs/Web/API",
      title: "Web APIs | MDN",
    };

    const card = createMemoryItem(memory, mockDoc);

    const link = card.querySelector("a");
    assert.notStrictEqual(link, null, "Should render an <a> tag for a valid URL");
    assert.strictEqual(link.href, "https://developer.mozilla.org/en-US/docs/Web/API");
    assert.strictEqual(link.textContent, "https://developer.mozilla.org/en-US/docs/Web/API");
    assert.strictEqual(link.title, "https://developer.mozilla.org/en-US/docs/Web/API");
    assert.strictEqual(link.target, "_blank", "Link must open in a new tab");
    assert.strictEqual(link.rel, "noopener noreferrer", "Link must have secure rel attributes");

    const unavailableLabel = card.querySelector(".source-unavailable");
    assert.strictEqual(unavailableLabel, null, "Should not render .source-unavailable when valid link exists");
  });

  // Test 5: Invalid URLs cannot become unsafe clickable links
  it("should never render clickable links for javascript: pseudo-protocol URLs", () => {
    const mockDoc = createMockDocument();
    const maliciousMemory = {
      id: "mem-xss-js",
      content: "Potentially malicious note",
      url: "javascript:alert(document.cookie)",
      title: "Malicious Script",
    };

    const card = createMemoryItem(maliciousMemory, mockDoc);

    const link = card.querySelector("a");
    assert.strictEqual(link, null, "Must NOT render <a> for javascript: URLs");

    const unavailableLabel = card.querySelector(".source-unavailable");
    assert.notStrictEqual(unavailableLabel, null, "Must render .source-unavailable fallback");
    assert.strictEqual(unavailableLabel.textContent, "Source unavailable");
  });

  it("should never render clickable links for data: URLs or malformed URLs", () => {
    const mockDoc = createMockDocument();

    const dataUrlMemory = {
      id: "mem-xss-data",
      content: "Data URL attack test",
      url: "data:text/html,<script>alert(1)</script>",
    };
    const cardData = createMemoryItem(dataUrlMemory, mockDoc);
    assert.strictEqual(cardData.querySelector("a"), null, "Must NOT render <a> for data: URLs");
    assert.strictEqual(cardData.querySelector(".source-unavailable")?.textContent, "Source unavailable");

    const malformedUrlMemory = {
      id: "mem-malformed",
      content: "Malformed URL test",
      url: "not-a-valid-url-format",
    };
    const cardMalformed = createMemoryItem(malformedUrlMemory, mockDoc);
    assert.strictEqual(cardMalformed.querySelector("a"), null, "Must NOT render <a> for malformed URLs");
    assert.strictEqual(cardMalformed.querySelector(".source-unavailable")?.textContent, "Source unavailable");
  });

  // Test 6: The source URL is not accidentally taken from the wrong tab
  it("should strictly use the originating context menu click URL and not an unrelated active tab", () => {
    const originatingInfo = {
      menuItemId: "save-to-memoir",
      selectionText: "Text selected on tab A",
      pageUrl: "https://tab-a.example.org/page-1",
    };
    const originatingTab = {
      id: 111,
      title: "Tab A Originating",
      url: "https://tab-a.example.org/page-1",
    };

    const unrelatedActiveTab = {
      id: 999,
      title: "Unrelated Active Tab B",
      url: "https://tab-b.example.org/completely-different-page",
    };

    // Metadata extraction must strictly consume the originating event data (info, originatingTab)
    const metadata = extractCaptureMetadata(originatingInfo, originatingTab);

    assert.strictEqual(metadata.url, "https://tab-a.example.org/page-1");
    assert.notStrictEqual(metadata.url, unrelatedActiveTab.url, "Must not match unrelated tab URL");
    assert.strictEqual(metadata.title, "Tab A Originating");
    assert.notStrictEqual(metadata.title, unrelatedActiveTab.title, "Must not match unrelated tab title");
  });

  // Regression test: reproduces failure when neither info.pageUrl nor tab.url are provided
  it("should reproduce failure when browser withholds pageUrl and tab.url (missing activeTab permission)", () => {
    // When activeTab is not present, Chrome leaves both pageUrl and tab.url undefined
    const infoWithoutUrl = {
      menuItemId: "save-to-memoir",
      selectionText: "Text selected on webpage",
    };
    const tabWithoutUrl = {
      id: 303,
    };

    const metadata = extractCaptureMetadata(infoWithoutUrl, tabWithoutUrl);
    assert.strictEqual(metadata.url, "", "URL evaluates to empty string");
    assert.strictEqual(metadata.title, "", "Title evaluates to empty string");

    // Rendering this record in popup produces 'Source unavailable'
    const mockDoc = createMockDocument();
    const memory = {
      id: "reproduced-bug-memory",
      content: "Text selected on webpage",
      url: metadata.url,
      title: metadata.title,
    };
    const card = createMemoryItem(memory, mockDoc);
    const label = card.querySelector(".source-unavailable");
    assert.notStrictEqual(label, null, "Should render 'Source unavailable'");
    assert.strictEqual(label.textContent, "Source unavailable");
    assert.strictEqual(card.querySelector("a"), null, "Must not render a clickable link");
  });

  // Verification test: with activeTab enabled, tab.url and info.pageUrl are provided
  it("should successfully capture and render link when activeTab enables tab.url and info.pageUrl", () => {
    const infoWithActiveTab = {
      menuItemId: "save-to-memoir",
      selectionText: "Captured text with activeTab enabled",
      pageUrl: "https://example.com/research-paper",
    };
    const tabWithActiveTab = {
      id: 404,
      title: "Research Paper Title",
      url: "https://example.com/research-paper",
    };

    const metadata = extractCaptureMetadata(infoWithActiveTab, tabWithActiveTab);
    assert.strictEqual(metadata.url, "https://example.com/research-paper");
    assert.strictEqual(metadata.title, "Research Paper Title");

    const mockDoc = createMockDocument();
    const memory = {
      id: "fixed-memory",
      content: "Captured text with activeTab enabled",
      url: metadata.url,
      title: metadata.title,
    };
    const card = createMemoryItem(memory, mockDoc);
    const link = card.querySelector("a");
    assert.notStrictEqual(link, null, "Clickable link must be rendered");
    assert.strictEqual(link.href, "https://example.com/research-paper");
    assert.strictEqual(link.textContent, "https://example.com/research-paper");
    assert.strictEqual(card.querySelector(".source-unavailable"), null);
  });
});
