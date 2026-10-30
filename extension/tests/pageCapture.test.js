/**
 * Tests for page saving flow, URL normalization, duplicate detection,
 * excerpt extraction, and accessible status feedback.
 *
 * Run with: node --test extension/tests/pageCapture.test.js
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { normalizeUrl, isDuplicatePage } from "../services/memoryService.js";
import {
  isRestrictedUrl,
  extractPageExcerpt,
  showStatus,
  clearStatus,
  handleSavePage,
} from "../popup.js";
import { handleContextMenuClick } from "../background.js";

// Helper: Mock DOM element for tests
function createMockElement(tag = "div") {
  return {
    tagName: tag.toUpperCase(),
    textContent: "",
    className: "",
    disabled: false,
    attributes: {},
    setAttribute(name, val) {
      this.attributes[name] = String(val);
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
  };
}

describe("Page Capture: URL Normalization & Duplicate Detection", () => {
  it("should normalize URLs by lowercasing scheme/host, removing hash, and stripping trailing slash", () => {
    const raw = "HTTPS://EXAMPLE.COM:443/docs/guide/#section-1";
    const expected = "https://example.com/docs/guide";
    assert.strictEqual(normalizeUrl(raw), expected);
  });

  it("should preserve root path slash when normalising domain roots", () => {
    assert.strictEqual(normalizeUrl("https://example.com/"), "https://example.com/");
    assert.strictEqual(normalizeUrl("https://example.com"), "https://example.com/");
    assert.strictEqual(normalizeUrl("https://example.com"), normalizeUrl("https://example.com/"));
  });

  it("should treat URLs differing only by fragment or trailing slash as identical", () => {
    const urlA = "https://developer.mozilla.org/en-US/docs/Web/API/";
    const urlB = "https://developer.mozilla.org/en-US/docs/Web/API#methods";
    assert.strictEqual(normalizeUrl(urlA), normalizeUrl(urlB));
  });

  it("should detect duplicate when a page memory exists with same normalized URL", () => {
    const memories = [
      {
        id: "mem-1",
        type: "page",
        url: "https://example.com/resource/",
        content: "First page resource",
      },
    ];

    assert.strictEqual(
      isDuplicatePage("https://example.com/resource#subheading", memories),
      true,
      "Should match page with differing fragment or trailing slash"
    );
  });

  it("should NOT flag duplicate when matching URL has type: 'capture' (keeps captures unrestricted)", () => {
    const memories = [
      {
        id: "cap-1",
        type: "capture",
        url: "https://example.com/article",
        content: "A highlighted quote from the article",
      },
      {
        id: "cap-2",
        type: "capture",
        url: "https://example.com/article",
        content: "Another distinct highlight from the same article",
      },
    ];

    assert.strictEqual(
      isDuplicatePage("https://example.com/article", memories),
      false,
      "Existing captures should not block saving the page resource"
    );
  });

  it("should NOT flag duplicate when URL has not been saved before", () => {
    const memories = [
      {
        id: "mem-1",
        type: "page",
        url: "https://example.com/page-a",
        content: "Page A content",
      },
    ];

    assert.strictEqual(
      isDuplicatePage("https://example.com/page-b", memories),
      false
    );
  });
});

describe("Page Capture: Restricted URL Handling", () => {
  it("should identify chrome:// and browser internal pages as restricted", () => {
    assert.strictEqual(isRestrictedUrl("chrome://extensions/"), true);
    assert.strictEqual(isRestrictedUrl("chrome-extension://abc123xyz/popup.html"), true);
    assert.strictEqual(isRestrictedUrl("edge://settings"), true);
    assert.strictEqual(isRestrictedUrl("about:blank"), true);
    assert.strictEqual(isRestrictedUrl("devtools://devtools/bundled/inspector.html"), true);
    assert.strictEqual(isRestrictedUrl("view-source:https://example.com"), true);
    assert.strictEqual(isRestrictedUrl("javascript:alert(1)"), true);
  });

  it("should accept valid http: and https: pages as non-restricted", () => {
    assert.strictEqual(isRestrictedUrl("https://en.wikipedia.org/wiki/Main_Page"), false);
    assert.strictEqual(isRestrictedUrl("http://localhost:3000/dashboard"), false);
  });

  it("should reject empty, null, or invalid URLs as restricted", () => {
    assert.strictEqual(isRestrictedUrl(""), true);
    assert.strictEqual(isRestrictedUrl(null), true);
    assert.strictEqual(isRestrictedUrl("not-a-url"), true);
  });
});

describe("Page Capture: Status Feedback Banner", () => {
  it("should display message with correct modifier class and accessible textContent", () => {
    const banner = createMockElement("div");

    showStatus("Page saved to MEMOIR.", "success", banner, 0);
    assert.strictEqual(banner.textContent, "Page saved to MEMOIR.");
    assert.strictEqual(banner.className, "status-banner status-banner--success");

    showStatus("This page is already saved in MEMOIR.", "notice", banner, 0);
    assert.strictEqual(banner.textContent, "This page is already saved in MEMOIR.");
    assert.strictEqual(banner.className, "status-banner status-banner--notice");

    showStatus("Cannot save restricted browser pages.", "error", banner, 0);
    assert.strictEqual(banner.textContent, "Cannot save restricted browser pages.");
    assert.strictEqual(banner.className, "status-banner status-banner--error");
  });

  it("should clear message and restore visually-hidden class", () => {
    const banner = createMockElement("div");
    showStatus("Temporary status", "success", banner, 0);

    clearStatus(banner);
    assert.strictEqual(banner.textContent, "");
    assert.strictEqual(banner.className, "status-banner visually-hidden");
  });
});

describe("Page Capture: Excerpt Extraction Priority & Truncation", () => {
  it("should truncate extracted excerpts exceeding 300 characters", () => {
    const longString = "A".repeat(450);

    // Mock window.getSelection
    const originalWindow = globalThis.window;
    globalThis.window = {
      getSelection: () => ({
        toString: () => longString,
      }),
    };

    try {
      const excerpt = extractPageExcerpt();
      assert.strictEqual(excerpt.length, 300);
      assert.strictEqual(excerpt, "A".repeat(300));
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("should prioritize active text selection over meta description", () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    globalThis.window = {
      getSelection: () => ({
        toString: () => "User highlighted selection text",
      }),
    };
    globalThis.document = {
      querySelector: () => ({
        getAttribute: () => "Meta description that should be ignored when selection exists",
      }),
      querySelectorAll: () => [],
    };

    try {
      const excerpt = extractPageExcerpt();
      assert.strictEqual(excerpt, "User highlighted selection text");
    } finally {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
    }
  });

  it("should fall back to meta description when there is no text selection", () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    globalThis.window = {
      getSelection: () => null,
    };
    globalThis.document = {
      querySelector: (sel) => {
        if (sel.includes("meta[name=\"description\"")) {
          return {
            getAttribute: (attr) => (attr === "content" ? "A concise meta summary of this article." : null),
          };
        }
        return null;
      },
      querySelectorAll: () => [],
    };

    try {
      const excerpt = extractPageExcerpt();
      assert.strictEqual(excerpt, "A concise meta summary of this article.");
    } finally {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
    }
  });

  it("should fall back to first substantive paragraph when selection and meta are absent", () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    globalThis.window = {
      getSelection: () => null,
    };
    globalThis.document = {
      querySelector: () => null,
      querySelectorAll: () => [
        { innerText: "Too short" },
        { innerText: "This is the first substantive paragraph with enough length to be useful as an excerpt." },
      ],
    };

    try {
      const excerpt = extractPageExcerpt();
      assert.strictEqual(
        excerpt,
        "This is the first substantive paragraph with enough length to be useful as an excerpt."
      );
    } finally {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
    }
  });
});

describe("Page Capture: handleSavePage Flow & Controls", () => {
  // Mock in-memory storage for test isolation
  let mockStorage = [];

  beforeEach(() => {
    mockStorage = [];
    globalThis.chrome = {
      storage: {
        local: {
          get: async () => ({ memories: [...mockStorage] }),
          set: async (obj) => {
            mockStorage = [...obj.memories];
          },
        },
      },
    };
  });

  it("should reject saving on restricted pages and show notice", async () => {
    const button = createMockElement("button");
    const status = createMockElement("div");

    const mockTabQuery = async () => [
      { id: 1, url: "chrome://extensions", title: "Extensions" },
    ];

    const result = await handleSavePage({
      tabQueryFn: mockTabQuery,
      buttonEl: button,
      statusEl: status,
    });

    assert.strictEqual(result, null, "Should return null on restricted page");
    assert.strictEqual(status.className, "status-banner status-banner--notice");
    assert.strictEqual(status.textContent, "Cannot save restricted browser pages.");
    assert.strictEqual(button.disabled, false, "Button must be re-enabled");
  });

  it("should detect duplicate page resource and reject re-saving", async () => {
    mockStorage = [
      {
        id: "existing-page",
        type: "page",
        content: "Already saved content",
        url: "https://example.com/guide/",
        title: "User Guide",
      },
    ];

    const button = createMockElement("button");
    const status = createMockElement("div");

    const mockTabQuery = async () => [
      { id: 2, url: "https://example.com/guide#step-1", title: "User Guide" },
    ];

    const result = await handleSavePage({
      tabQueryFn: mockTabQuery,
      buttonEl: button,
      statusEl: status,
    });

    assert.strictEqual(result, null, "Should return null on duplicate");
    assert.strictEqual(status.className, "status-banner status-banner--notice");
    assert.strictEqual(status.textContent, "This page is already saved in MEMOIR.");
    assert.strictEqual(mockStorage.length, 1, "Storage must not have grown");
    assert.strictEqual(button.disabled, false, "Button must be re-enabled");
  });

  it("should successfully save webpage and extract excerpt", async () => {
    const button = createMockElement("button");
    const status = createMockElement("div");
    const list = createMockElement("div");
    const searchInput = createMockElement("input");

    const mockTabQuery = async () => [
      { id: 10, url: "https://example.com/research", title: "New Research Article" },
    ];
    const mockScriptExecute = async () => [
      { result: "Extracted summary excerpt from the webpage content." },
    ];

    const result = await handleSavePage({
      tabQueryFn: mockTabQuery,
      scriptExecuteFn: mockScriptExecute,
      buttonEl: button,
      statusEl: status,
      targetList: list,
      searchInput,
    });

    assert.notStrictEqual(result, null, "Result must not be null");
    assert.strictEqual(result.type, "page");
    assert.strictEqual(result.url, "https://example.com/research");
    assert.strictEqual(result.title, "New Research Article");
    assert.strictEqual(result.content, "Extracted summary excerpt from the webpage content.");

    assert.strictEqual(status.className, "status-banner status-banner--success");
    assert.strictEqual(status.textContent, "Page saved to MEMOIR.");
    assert.strictEqual(mockStorage.length, 1);
    assert.strictEqual(button.disabled, false, "Button must be re-enabled");
  });

  it("should fall back to tab title when script extraction yields empty string", async () => {
    const button = createMockElement("button");
    const status = createMockElement("div");

    const mockTabQuery = async () => [
      { id: 11, url: "https://example.com/minimal", title: "Minimal Page Title" },
    ];
    const mockScriptExecute = async () => [
      { result: "" },
    ];

    const result = await handleSavePage({
      tabQueryFn: mockTabQuery,
      scriptExecuteFn: mockScriptExecute,
      buttonEl: button,
      statusEl: status,
    });

    assert.notStrictEqual(result, null);
    assert.strictEqual(result.content, "Minimal Page Title", "Must fall back to tab title");
    assert.strictEqual(status.className, "status-banner status-banner--success");
  });

  it("should allow context menu captures on the same page after page is saved", async () => {
    // 1. Save page resource
    const button = createMockElement("button");
    const status = createMockElement("div");

    await handleSavePage({
      tabQueryFn: async () => [{ id: 15, url: "https://example.com/deep-dive", title: "Deep Dive" }],
      scriptExecuteFn: async () => [{ result: "Summary of deep dive." }],
      buttonEl: button,
      statusEl: status,
    });

    assert.strictEqual(mockStorage.length, 1);
    assert.strictEqual(mockStorage[0].type, "page");

    // 2. Perform context menu capture from same page
    const info = {
      menuItemId: "save-to-memoir",
      selectionText: "An interesting quote captured from the deep dive.",
      pageUrl: "https://example.com/deep-dive",
    };
    const tab = {
      id: 15,
      url: "https://example.com/deep-dive",
      title: "Deep Dive",
    };

    const capturedMemory = await handleContextMenuClick(info, tab);

    assert.notStrictEqual(capturedMemory, null, "Capture must succeed");
    assert.strictEqual(capturedMemory.type, "capture");
    assert.strictEqual(capturedMemory.content, "An interesting quote captured from the deep dive.");
    assert.strictEqual(mockStorage.length, 2, "Both page resource and capture must coexist");
  });
});
