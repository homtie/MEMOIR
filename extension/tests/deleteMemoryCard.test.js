/**
 * Tests for the safe per-memory delete action on Memory Library cards.
 *
 * Verifies:
 * 1. Initial rendering of accessible delete button on memory cards.
 * 2. Explicit two-step confirmation display (prompt, confirm button, cancel button).
 * 3. Cancellation restores the initial state without deleting.
 * 4. Inactivity timeout auto-resets the confirmation state.
 * 5. Successful deletion calls deleteMemory, refreshes list preserving search, and shows notice.
 * 6. Deletion failure (not found / returns false) displays error and does not report success.
 * 7. Storage failure (deleteMemory throws) displays error and does not report success.
 * 8. In-flight protection disables buttons to prevent accidental repeated clicks.
 *
 * Run with: node --test extension/tests/deleteMemoryCard.test.js
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { createMemoryItem, loadMemories } from "../popup.js";

// Helper: Mock DOM element with attribute and async event support
function createMockElement(tag = "div") {
  const listeners = {};
  const attributes = {};
  const children = [];
  let _textContent = "";

  const el = {
    tagName: tag.toUpperCase(),
    className: "",
    disabled: false,
    type: "",
    href: "",
    title: "",
    target: "",
    rel: "",
    value: "",
    children,
    attributes,
    get textContent() {
      return _textContent;
    },
    set textContent(val) {
      _textContent = String(val ?? "");
      if (_textContent === "") {
        this.children.length = 0;
      }
    },
    setAttribute(name, val) {
      attributes[name] = String(val);
    },
    removeAttribute(name) {
      delete attributes[name];
    },
    getAttribute(name) {
      return attributes[name] ?? null;
    },
    appendChild(child) {
      if (child) {
        children.push(child);
      }
      return child;
    },
    addEventListener(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    removeEventListener(event, fn) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((cb) => cb !== fn);
      }
    },
    async click() {
      if (this.disabled) return;
      const fns = listeners["click"] || [];
      const evt = { stopPropagation: () => {} };
      for (const fn of [...fns]) {
        await fn(evt);
      }
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

  return el;
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

function createMockDocument() {
  return {
    createElement: (tag) => createMockElement(tag),
  };
}

describe("Safe Memory Deletion: UI Card Rendering & Actions", () => {
  let mockMemories = [];

  beforeEach(() => {
    mockMemories = [];
    globalThis.chrome = {
      storage: {
        local: {
          get: async () => ({ memories: [...mockMemories] }),
          set: async (obj) => {
            mockMemories = [...(obj.memories || [])];
          },
        },
      },
    };
  });

  const sampleMemory = {
    id: "mem-test-1",
    type: "capture",
    content: "A memorable thought to be kept or removed.",
    title: "Article Thought",
    url: "https://example.com/article",
  };

  it("should render an accessible delete button on each card initially", () => {
    const doc = createMockDocument();
    const card = createMemoryItem(sampleMemory, doc);

    assert.notStrictEqual(card, null);
    const deleteBtn = card.querySelector(".btn-card-delete");
    assert.notStrictEqual(deleteBtn, null, "Card must contain a .btn-card-delete button");
    assert.strictEqual(deleteBtn.textContent, "Delete");
    assert.strictEqual(deleteBtn.getAttribute("aria-label"), "Delete this memory");

    // Confirmation controls must NOT be visible initially
    assert.strictEqual(card.querySelector(".btn-confirm-delete"), null);
    assert.strictEqual(card.querySelector(".btn-cancel-delete"), null);
    assert.strictEqual(card.querySelector(".delete-prompt"), null);
  });

  it("should require explicit second confirmation: clicking Delete reveals Confirm and Cancel", async () => {
    const doc = createMockDocument();
    const card = createMemoryItem(sampleMemory, doc);

    const deleteBtn = card.querySelector(".btn-card-delete");
    await deleteBtn.click();

    // Delete button should now be replaced by confirmation prompt and buttons
    assert.strictEqual(card.querySelector(".btn-card-delete"), null, "Original delete button must be replaced");

    const prompt = card.querySelector(".delete-prompt");
    assert.notStrictEqual(prompt, null, "Confirmation prompt must appear");
    assert.strictEqual(prompt.textContent, "Delete?");

    const confirmBtn = card.querySelector(".btn-confirm-delete");
    assert.notStrictEqual(confirmBtn, null, "Confirm button must appear");
    assert.strictEqual(confirmBtn.textContent, "Confirm");
    assert.strictEqual(confirmBtn.getAttribute("aria-label"), "Confirm delete memory");

    const cancelBtn = card.querySelector(".btn-cancel-delete");
    assert.notStrictEqual(cancelBtn, null, "Cancel button must appear");
    assert.strictEqual(cancelBtn.textContent, "Cancel");
    assert.strictEqual(cancelBtn.getAttribute("aria-label"), "Cancel deletion");
  });

  it("should cancel deletion when Cancel is clicked, restoring initial Delete button without calling deleteMemory", async () => {
    const doc = createMockDocument();
    let deleteCalled = false;
    const mockDelete = async () => {
      deleteCalled = true;
      return true;
    };

    const card = createMemoryItem(sampleMemory, doc, { deleteFn: mockDelete });

    // Step 1: Click delete to reveal confirmation
    await card.querySelector(".btn-card-delete").click();
    assert.notStrictEqual(card.querySelector(".btn-cancel-delete"), null);

    // Step 2: Click cancel
    await card.querySelector(".btn-cancel-delete").click();

    // Verify deletion was NOT called
    assert.strictEqual(deleteCalled, false, "deleteMemory must not be called upon cancellation");

    // Verify initial button is restored
    assert.notStrictEqual(card.querySelector(".btn-card-delete"), null, "Initial delete button must be restored");
    assert.strictEqual(card.querySelector(".btn-confirm-delete"), null, "Confirm button must be gone");
    assert.strictEqual(card.querySelector(".btn-cancel-delete"), null, "Cancel button must be gone");
  });

  it("should auto-reset confirmation back to Delete button after inactivity timeout", async () => {
    const doc = createMockDocument();
    let capturedTimeoutCb = null;
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (cb, ms) => {
      capturedTimeoutCb = cb;
      return 12345;
    };

    try {
      const card = createMemoryItem(sampleMemory, doc);
      await card.querySelector(".btn-card-delete").click();

      assert.notStrictEqual(card.querySelector(".btn-confirm-delete"), null);
      assert.notStrictEqual(capturedTimeoutCb, null);

      // Trigger the timeout callback
      capturedTimeoutCb();

      // Verify it reset back to initial delete button
      assert.notStrictEqual(card.querySelector(".btn-card-delete"), null);
      assert.strictEqual(card.querySelector(".btn-confirm-delete"), null);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it("should successfully delete memory on confirmation, call onDeleted, and show notice banner", async () => {
    const doc = createMockDocument();
    const statusEl = createMockElement("div");
    let deletedId = null;
    let onDeletedCalled = false;

    const mockDelete = async (id) => {
      deletedId = id;
      return true;
    };

    const card = createMemoryItem(sampleMemory, doc, {
      deleteFn: mockDelete,
      onDeleted: async () => {
        onDeletedCalled = true;
      },
      statusEl,
    });

    // Step 1: Open confirmation
    await card.querySelector(".btn-card-delete").click();

    // Step 2: Confirm deletion
    const confirmBtn = card.querySelector(".btn-confirm-delete");
    await confirmBtn.click();

    assert.strictEqual(deletedId, "mem-test-1", "Must call deleteFn with memory.id");
    assert.strictEqual(onDeletedCalled, true, "Must call onDeleted callback");
    assert.strictEqual(statusEl.textContent, "Memory deleted.");
    assert.strictEqual(statusEl.className, "status-banner status-banner--notice");
  });

  it("should prevent repeated deletion calls while in-flight", async () => {
    const doc = createMockDocument();
    const statusEl = createMockElement("div");
    let callCount = 0;

    let resolveDelete;
    const pendingPromise = new Promise((resolve) => {
      resolveDelete = resolve;
    });

    const mockDelete = async () => {
      callCount++;
      return pendingPromise;
    };

    const card = createMemoryItem(sampleMemory, doc, {
      deleteFn: mockDelete,
      statusEl,
    });

    await card.querySelector(".btn-card-delete").click();
    const confirmBtn = card.querySelector(".btn-confirm-delete");

    // First click initiates delete
    const firstClickPromise = confirmBtn.click();
    assert.strictEqual(callCount, 1);
    assert.strictEqual(confirmBtn.disabled, true, "Confirm button must be disabled in-flight");
    assert.strictEqual(confirmBtn.getAttribute("aria-busy"), "true");

    // Second click during in-flight operation must be ignored
    await confirmBtn.click();
    assert.strictEqual(callCount, 1, "Should not invoke deleteFn a second time while in flight");

    // Resolve in-flight promise
    resolveDelete(true);
    await firstClickPromise;
  });

  it("should handle failure when deleteMemory returns false, displaying error and not reporting success", async () => {
    const doc = createMockDocument();
    const statusEl = createMockElement("div");
    let onDeletedCalled = false;

    const mockDelete = async () => false; // Simulated not found

    const card = createMemoryItem(sampleMemory, doc, {
      deleteFn: mockDelete,
      onDeleted: async () => {
        onDeletedCalled = true;
      },
      statusEl,
    });

    await card.querySelector(".btn-card-delete").click();
    await card.querySelector(".btn-confirm-delete").click();

    assert.strictEqual(onDeletedCalled, false, "onDeleted should not be called on failure");
    assert.strictEqual(statusEl.textContent, "Failed to delete memory: not found.");
    assert.strictEqual(statusEl.className, "status-banner status-banner--error");

    // Button should be reset so user is not stuck
    assert.notStrictEqual(card.querySelector(".btn-card-delete"), null, "Must restore delete button on failure");
  });

  it("should handle storage exceptions gracefully, displaying error and not reporting success", async () => {
    const doc = createMockDocument();
    const statusEl = createMockElement("div");
    let onDeletedCalled = false;

    const mockDelete = async () => {
      throw new Error("QuotaExceededError: chrome.storage.local write failed");
    };

    const card = createMemoryItem(sampleMemory, doc, {
      deleteFn: mockDelete,
      onDeleted: async () => {
        onDeletedCalled = true;
      },
      statusEl,
    });

    await card.querySelector(".btn-card-delete").click();
    await card.querySelector(".btn-confirm-delete").click();

    assert.strictEqual(onDeletedCalled, false);
    assert.strictEqual(
      statusEl.textContent,
      "Failed to delete: QuotaExceededError: chrome.storage.local write failed"
    );
    assert.strictEqual(statusEl.className, "status-banner status-banner--error");
    assert.notStrictEqual(card.querySelector(".btn-card-delete"), null, "Must restore delete button on error");
  });
});

describe("Safe Memory Deletion: Search Query Preservation", () => {
  let mockMemories = [];

  beforeEach(() => {
    mockMemories = [
      {
        id: "mem-1",
        type: "capture",
        content: "Understanding JavaScript closures and memory leaks",
        title: "JS Memory Guide",
        url: "https://javascript.info/closure",
      },
      {
        id: "mem-2",
        type: "page",
        content: "Chrome DevTools Memory tab inspection guide",
        title: "DevTools Guide",
        url: "https://developer.chrome.com/docs/devtools/memory",
      },
      {
        id: "mem-3",
        type: "capture",
        content: "Recipes for baking rustic sourdough bread",
        title: "Sourdough Bread",
        url: "https://example.com/sourdough",
      },
    ];

    globalThis.chrome = {
      storage: {
        local: {
          get: async () => ({ memories: [...mockMemories] }),
          set: async (obj) => {
            mockMemories = [...obj.memories];
          },
        },
      },
    };
  });

  it("should preserve current search query when refreshing the list after deletion", async () => {
    const doc = createMockDocument();
    const listEl = createMockElement("div");
    const searchInput = createMockElement("input");
    const statusEl = createMockElement("div");

    // User has searched for "memory"
    searchInput.value = "memory";

    // Load memories with the search input active
    await loadMemories(listEl, searchInput, doc, { statusEl });

    // Both mem-1 and mem-2 match "memory"; mem-3 does not
    assert.strictEqual(listEl.children.length, 2, "List should show 2 matching memories");

    // First card corresponds to mem-1
    const firstCard = listEl.children[0];
    const deleteBtn = firstCard.querySelector(".btn-card-delete");
    assert.notStrictEqual(deleteBtn, null);

    // Delete mem-1
    await deleteBtn.click();
    const confirmBtn = firstCard.querySelector(".btn-confirm-delete");
    await confirmBtn.click();

    // Verify storage was updated: mem-1 is gone
    assert.strictEqual(mockMemories.length, 2);
    assert.strictEqual(mockMemories.find((m) => m.id === "mem-1"), undefined);

    // The list must still be filtered by searchInput.value ("memory")
    assert.strictEqual(searchInput.value, "memory", "Search input query must remain intact");
    assert.strictEqual(listEl.children.length, 1, "List must now show 1 matching memory");
    assert.strictEqual(
      listEl.children[0].querySelector("p")?.textContent,
      "Chrome DevTools Memory tab inspection guide"
    );
    assert.strictEqual(statusEl.textContent, "Memory deleted.");
  });
});
