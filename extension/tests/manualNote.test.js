/**
 * Tests for manual note creation inside the MEMOIR Chrome extension popup.
 *
 * Verifies:
 * 1. Composer is initially hidden.
 * 2. New Note opens the composer and sets aria-expanded="true".
 * 3. Cancel closes the composer, clears inputs, and does not create a memory.
 * 4. Empty content is rejected with an accessible error message.
 * 5. Whitespace-only content is rejected with an accessible error message.
 * 6. Valid note creates a memory with type: "manual" via createMemory().
 * 7. Missing title is accepted (optional field).
 * 8. Successful save refreshes the list.
 * 9. Active search query is preserved after saving.
 * 10. Save button is disabled and aria-busy during submission.
 * 11. Duplicate submission is prevented while an operation is in-flight.
 * 12. Storage failure displays an error and preserves user input in composer.
 * 13. Persistence success is separated from list refresh failure (notice banner, composer closed, inputs cleared, query preserved, duplicate prevented).
 * 14. Keyboard focus restoration (Cancel and successful Save return focus to newNoteButton; unrelated close does not steal focus).
 *
 * Run with: node --test extension/tests/manualNote.test.js
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  openNoteComposer,
  closeNoteComposer,
  toggleNoteComposer,
  handleSaveManualNote,
  loadMemories,
} from "../popup.js";

let mockStorage = [];

beforeEach(() => {
  mockStorage = [];
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({ memories: [...mockStorage] }),
        set: async (obj) => {
          mockStorage = [...(obj.memories || [])];
        },
      },
    },
  };
});

// Helper: Lightweight mock DOM element with attribute, classList, and focus support
function createMockElement(tag = "div", initialClasses = []) {
  const listeners = {};
  const attributes = {};
  const children = [];
  const classSet = new Set(initialClasses);
  let _textContent = "";
  let _value = "";
  let _focused = false;

  const el = {
    tagName: tag.toUpperCase(),
    disabled: false,
    children,
    attributes,
    get className() {
      return Array.from(classSet).join(" ");
    },
    set className(val) {
      classSet.clear();
      if (typeof val === "string") {
        val.split(/\s+/).filter(Boolean).forEach((c) => classSet.add(c));
      }
    },
    classList: {
      add(cls) {
        classSet.add(cls);
      },
      remove(cls) {
        classSet.delete(cls);
      },
      contains(cls) {
        return classSet.has(cls);
      },
      toggle(cls) {
        if (classSet.has(cls)) {
          classSet.delete(cls);
        } else {
          classSet.add(cls);
        }
      },
    },
    get value() {
      return _value;
    },
    set value(val) {
      _value = String(val ?? "");
    },
    get textContent() {
      return _textContent;
    },
    set textContent(val) {
      _textContent = String(val ?? "");
      if (_textContent === "") {
        this.children.length = 0;
      }
    },
    focus() {
      _focused = true;
    },
    blur() {
      _focused = false;
    },
    isFocused() {
      return _focused;
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
    return el.classList && el.classList.contains(cls);
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

describe("Manual Note: Composer Visibility & State Transitions", () => {
  it("should have composer initially hidden with aria-expanded='false'", () => {
    const composerEl = createMockElement("div", ["note-composer", "hidden"]);
    const toggleBtn = createMockElement("button");
    toggleBtn.setAttribute("aria-expanded", "false");

    assert.strictEqual(composerEl.classList.contains("hidden"), true, "Composer must have hidden class initially");
    assert.strictEqual(toggleBtn.getAttribute("aria-expanded"), "false", "Toggle must have aria-expanded='false'");
  });

  it("should open composer, set aria-expanded='true', and focus input on open", () => {
    const composerEl = createMockElement("div", ["note-composer", "hidden"]);
    const toggleBtn = createMockElement("button");
    toggleBtn.setAttribute("aria-expanded", "false");
    const titleInput = createMockElement("input");
    const contentInput = createMockElement("textarea");

    openNoteComposer({ composerEl, toggleBtn, titleInput, contentInput });

    assert.strictEqual(composerEl.classList.contains("hidden"), false, "hidden class must be removed on open");
    assert.strictEqual(toggleBtn.getAttribute("aria-expanded"), "true", "Toggle must have aria-expanded='true'");
    assert.strictEqual(titleInput.isFocused(), true, "Focus must move to the title input");
  });

  it("should toggle composer between open and closed states", () => {
    const composerEl = createMockElement("div", ["note-composer", "hidden"]);
    const toggleBtn = createMockElement("button");
    toggleBtn.setAttribute("aria-expanded", "false");
    const titleInput = createMockElement("input");
    const contentInput = createMockElement("textarea");

    // Toggle 1: open
    toggleNoteComposer({ composerEl, toggleBtn, titleInput, contentInput });
    assert.strictEqual(composerEl.classList.contains("hidden"), false);
    assert.strictEqual(toggleBtn.getAttribute("aria-expanded"), "true");

    // Toggle 2: close
    toggleNoteComposer({ composerEl, toggleBtn, titleInput, contentInput });
    assert.strictEqual(composerEl.classList.contains("hidden"), true);
    assert.strictEqual(toggleBtn.getAttribute("aria-expanded"), "false");
  });

  it("should close composer and clear inputs when Cancel is clicked", () => {
    const composerEl = createMockElement("div", ["note-composer"]);
    const toggleBtn = createMockElement("button");
    toggleBtn.setAttribute("aria-expanded", "true");
    const titleInput = createMockElement("input");
    titleInput.value = "Unsaved draft title";
    const contentInput = createMockElement("textarea");
    contentInput.value = "Unsaved draft thoughts that user decides to abandon.";

    closeNoteComposer({ composerEl, toggleBtn, titleInput, contentInput });

    assert.strictEqual(composerEl.classList.contains("hidden"), true, "Composer must be hidden on cancel");
    assert.strictEqual(toggleBtn.getAttribute("aria-expanded"), "false");
    assert.strictEqual(titleInput.value, "", "Title input must be cleared");
    assert.strictEqual(contentInput.value, "", "Content input must be cleared");
  });
});

describe("Manual Note: Keyboard Focus Restoration", () => {
  it("should restore focus to newNoteButton when composer is closed via Cancel", async () => {
    const composerEl = createMockElement("div", ["note-composer"]);
    const toggleBtn = createMockElement("button");
    toggleBtn.setAttribute("aria-expanded", "true");
    const titleInput = createMockElement("input");
    const contentInput = createMockElement("textarea");
    const cancelBtn = createMockElement("button");

    cancelBtn.addEventListener("click", () => {
      closeNoteComposer({
        composerEl,
        toggleBtn,
        titleInput,
        contentInput,
        restoreFocus: true,
      });
    });

    assert.strictEqual(toggleBtn.isFocused(), false);
    await cancelBtn.click();
    assert.strictEqual(toggleBtn.isFocused(), true, "Focus must be returned to newNoteButton on Cancel");
    assert.strictEqual(composerEl.classList.contains("hidden"), true);
  });

  it("should restore focus to newNoteButton after a successful save", async () => {
    const composerEl = createMockElement("div", ["note-composer"]);
    const toggleBtn = createMockElement("button");
    toggleBtn.setAttribute("aria-expanded", "true");
    const titleInput = createMockElement("input");
    titleInput.value = "Architecture Principles";
    const contentInput = createMockElement("textarea");
    contentInput.value = "Test focus restoration after saving.";
    const saveBtn = createMockElement("button");
    const statusEl = createMockElement("div");

    assert.strictEqual(toggleBtn.isFocused(), false);

    const result = await handleSaveManualNote({
      createMemoryFn: async (payload) => ({ id: "mock-focus-1", ...payload }),
      loadMemoriesFn: async () => true,
      composerEl,
      toggleBtn,
      titleInput,
      contentInput,
      saveBtn,
      statusEl,
      restoreFocus: true,
    });

    assert.notStrictEqual(result, null);
    assert.strictEqual(toggleBtn.isFocused(), true, "Focus must be restored to newNoteButton after successful save");
    assert.strictEqual(composerEl.classList.contains("hidden"), true);
  });

  it("should NOT steal focus when composer is closed programmatically without restoreFocus", () => {
    const composerEl = createMockElement("div", ["note-composer"]);
    const toggleBtn = createMockElement("button");
    toggleBtn.setAttribute("aria-expanded", "true");
    const titleInput = createMockElement("input");
    const contentInput = createMockElement("textarea");

    // Close without restoreFocus (defaults to false)
    closeNoteComposer({
      composerEl,
      toggleBtn,
      titleInput,
      contentInput,
    });

    assert.strictEqual(toggleBtn.isFocused(), false, "Focus must not be stolen when restoreFocus is false");
    assert.strictEqual(composerEl.classList.contains("hidden"), true);
  });
});

describe("Manual Note: Input Validation", () => {
  it("should reject empty content with an error message and keep composer open", async () => {
    const composerEl = createMockElement("div", ["note-composer"]);
    const titleInput = createMockElement("input");
    titleInput.value = "Some title";
    const contentInput = createMockElement("textarea");
    contentInput.value = ""; // Empty
    const saveBtn = createMockElement("button");
    const statusEl = createMockElement("div");

    let createCalled = false;
    const mockCreate = async () => {
      createCalled = true;
      return {};
    };

    const result = await handleSaveManualNote({
      createMemoryFn: mockCreate,
      composerEl,
      titleInput,
      contentInput,
      saveBtn,
      statusEl,
    });

    assert.strictEqual(result, null, "Should return null on empty content");
    assert.strictEqual(createCalled, false, "createMemory must not be called");
    assert.strictEqual(statusEl.className, "status-banner status-banner--error");
    assert.strictEqual(statusEl.textContent, "Note content cannot be empty.");
    assert.strictEqual(composerEl.classList.contains("hidden"), false, "Composer must remain open");
    assert.strictEqual(saveBtn.disabled, false, "Save button must remain enabled");
    assert.strictEqual(contentInput.isFocused(), true, "Focus must be moved to content input");
  });

  it("should reject whitespace-only content with an error message and keep composer open", async () => {
    const composerEl = createMockElement("div", ["note-composer"]);
    const contentInput = createMockElement("textarea");
    contentInput.value = "   \n\t   "; // Whitespace only
    const saveBtn = createMockElement("button");
    const statusEl = createMockElement("div");

    let createCalled = false;
    const result = await handleSaveManualNote({
      createMemoryFn: async () => {
        createCalled = true;
      },
      composerEl,
      contentInput,
      saveBtn,
      statusEl,
    });

    assert.strictEqual(result, null);
    assert.strictEqual(createCalled, false);
    assert.strictEqual(statusEl.className, "status-banner status-banner--error");
    assert.strictEqual(statusEl.textContent, "Note content cannot be empty.");
    assert.strictEqual(saveBtn.disabled, false);
  });

  it("should reject content exceeding 50,000 characters", async () => {
    const composerEl = createMockElement("div", ["note-composer"]);
    const contentInput = createMockElement("textarea");
    contentInput.value = "A".repeat(50_001);
    const saveBtn = createMockElement("button");
    const statusEl = createMockElement("div");

    const result = await handleSaveManualNote({
      composerEl,
      contentInput,
      saveBtn,
      statusEl,
    });

    assert.strictEqual(result, null);
    assert.strictEqual(statusEl.className, "status-banner status-banner--error");
    assert.strictEqual(statusEl.textContent, "Content exceeds maximum length of 50,000 characters.");
    assert.strictEqual(saveBtn.disabled, false);
  });
});

describe("Manual Note: Save Workflow & Lifecycle", () => {
  it("should successfully save manual note with type: 'manual' and close composer", async () => {
    const composerEl = createMockElement("div", ["note-composer"]);
    const toggleBtn = createMockElement("button");
    toggleBtn.setAttribute("aria-expanded", "true");
    const titleInput = createMockElement("input");
    titleInput.value = "  Architecture Principles  ";
    const contentInput = createMockElement("textarea");
    contentInput.value = "  Keep business logic isolated in service modules.  ";
    const saveBtn = createMockElement("button");
    const statusEl = createMockElement("div");

    let savedPayload = null;
    const mockCreate = async (payload) => {
      savedPayload = payload;
      return {
        id: "mock-manual-1",
        ...payload,
        createdAt: new Date().toISOString(),
      };
    };

    const result = await handleSaveManualNote({
      createMemoryFn: mockCreate,
      composerEl,
      toggleBtn,
      titleInput,
      contentInput,
      saveBtn,
      statusEl,
      targetList: createMockElement("div"),
      searchInput: createMockElement("input"),
      doc: createMockDocument(),
    });

    assert.notStrictEqual(result, null);
    assert.strictEqual(savedPayload.type, "manual", "Must save with type: 'manual'");
    assert.strictEqual(savedPayload.content, "Keep business logic isolated in service modules.", "Content must be trimmed");
    assert.strictEqual(savedPayload.title, "Architecture Principles", "Title must be trimmed");

    // Composer must be closed and cleared
    assert.strictEqual(composerEl.classList.contains("hidden"), true, "Composer must be closed");
    assert.strictEqual(toggleBtn.getAttribute("aria-expanded"), "false");
    assert.strictEqual(titleInput.value, "", "Title input must be cleared");
    assert.strictEqual(contentInput.value, "", "Content input must be cleared");

    // Status message
    assert.strictEqual(statusEl.className, "status-banner status-banner--success");
    assert.strictEqual(statusEl.textContent, "Note saved to MEMOIR.");
    assert.strictEqual(saveBtn.disabled, false, "Save button must be re-enabled");
  });

  it("should accept valid note without title (optional title field)", async () => {
    const composerEl = createMockElement("div", ["note-composer"]);
    const titleInput = createMockElement("input");
    titleInput.value = ""; // Empty title
    const contentInput = createMockElement("textarea");
    contentInput.value = "Quick thought with no title.";
    const saveBtn = createMockElement("button");
    const statusEl = createMockElement("div");

    let savedPayload = null;
    const mockCreate = async (payload) => {
      savedPayload = payload;
      return { id: "mock-manual-2", ...payload };
    };

    const result = await handleSaveManualNote({
      createMemoryFn: mockCreate,
      composerEl,
      titleInput,
      contentInput,
      saveBtn,
      statusEl,
      targetList: createMockElement("div"),
      searchInput: createMockElement("input"),
      doc: createMockDocument(),
    });

    assert.notStrictEqual(result, null);
    assert.strictEqual(savedPayload.title, "", "Empty title must be accepted as empty string");
    assert.strictEqual(savedPayload.content, "Quick thought with no title.");
  });

  it("should prevent duplicate submission while an operation is in-flight", async () => {
    const composerEl = createMockElement("div", ["note-composer"]);
    const contentInput = createMockElement("textarea");
    contentInput.value = "Testing in-flight lock";
    const saveBtn = createMockElement("button");
    const statusEl = createMockElement("div");

    let callCount = 0;
    let resolveSave;
    const pendingPromise = new Promise((resolve) => {
      resolveSave = resolve;
    });

    const mockCreate = async () => {
      callCount++;
      return pendingPromise;
    };

    // First save initiation
    const firstSavePromise = handleSaveManualNote({
      createMemoryFn: mockCreate,
      composerEl,
      contentInput,
      saveBtn,
      statusEl,
      targetList: createMockElement("div"),
      searchInput: createMockElement("input"),
      doc: createMockDocument(),
    });

    assert.strictEqual(callCount, 1);
    assert.strictEqual(saveBtn.disabled, true, "Save button must be disabled in-flight");
    assert.strictEqual(saveBtn.getAttribute("aria-busy"), "true");

    // Second save invocation while first is in-flight must be ignored
    const secondResult = await handleSaveManualNote({
      createMemoryFn: mockCreate,
      composerEl,
      contentInput,
      saveBtn,
      statusEl,
    });

    assert.strictEqual(secondResult, null, "Second invocation must return null immediately");
    assert.strictEqual(callCount, 1, "createMemory must not be invoked a second time");

    // Complete the first operation
    resolveSave({ id: "mock-1", type: "manual", content: "Testing in-flight lock" });
    await firstSavePromise;
    assert.strictEqual(saveBtn.disabled, false, "Save button must be restored");
  });

  it("should handle storage failure, displaying error and preserving user input in composer", async () => {
    const composerEl = createMockElement("div", ["note-composer"]);
    const titleInput = createMockElement("input");
    titleInput.value = "Valuable Title";
    const contentInput = createMockElement("textarea");
    contentInput.value = "Valuable thoughts that should not be lost when storage fails.";
    const saveBtn = createMockElement("button");
    const statusEl = createMockElement("div");

    const mockCreate = async () => {
      throw new Error("QuotaExceededError: chrome.storage.local write failed");
    };

    const result = await handleSaveManualNote({
      createMemoryFn: mockCreate,
      composerEl,
      titleInput,
      contentInput,
      saveBtn,
      statusEl,
    });

    assert.strictEqual(result, null, "Result should be null on error");
    assert.strictEqual(statusEl.className, "status-banner status-banner--error");
    assert.strictEqual(
      statusEl.textContent,
      "Failed to save: QuotaExceededError: chrome.storage.local write failed"
    );

    // Critical: user input must be preserved and composer must stay open
    assert.strictEqual(composerEl.classList.contains("hidden"), false, "Composer must remain open on error");
    assert.strictEqual(titleInput.value, "Valuable Title", "Title must be preserved");
    assert.strictEqual(
      contentInput.value,
      "Valuable thoughts that should not be lost when storage fails.",
      "Content must be preserved"
    );
    assert.strictEqual(saveBtn.disabled, false, "Save button must be re-enabled");
  });
});

describe("Manual Note: Persistence Success vs. List Refresh Failure", () => {
  it("should treat note as saved when createMemory succeeds but loadMemories throws", async () => {
    const composerEl = createMockElement("div", ["note-composer"]);
    const toggleBtn = createMockElement("button");
    toggleBtn.setAttribute("aria-expanded", "true");
    const titleInput = createMockElement("input");
    titleInput.value = "Saved Note Title";
    const contentInput = createMockElement("textarea");
    contentInput.value = "Valuable notes successfully written to persistence layer.";
    const saveBtn = createMockElement("button");
    const statusEl = createMockElement("div");
    const searchInput = createMockElement("input");
    searchInput.value = "active-query";
    const targetList = createMockElement("div");
    const doc = createMockDocument();

    let storageCreated = null;
    const mockCreate = async (payload) => {
      storageCreated = { id: "persisted-id-1", ...payload };
      return storageCreated;
    };

    // Simulate loadMemories failure (e.g. storage read exception)
    const mockFailingLoad = async () => {
      throw new Error("Failed to read memories from storage");
    };

    const result = await handleSaveManualNote({
      createMemoryFn: mockCreate,
      loadMemoriesFn: mockFailingLoad,
      composerEl,
      toggleBtn,
      titleInput,
      contentInput,
      saveBtn,
      statusEl,
      targetList,
      searchInput,
      doc,
      restoreFocus: true,
    });

    // 1. Result must be the created memory (treated as saved)
    assert.notStrictEqual(result, null, "Must return the created memory");
    assert.strictEqual(result.id, "persisted-id-1");
    assert.strictEqual(storageCreated.content, "Valuable notes successfully written to persistence layer.");

    // 2. Status banner must NOT say "Failed to save" - must show notice
    assert.strictEqual(statusEl.className, "status-banner status-banner--notice");
    assert.strictEqual(statusEl.textContent, "Note saved, but failed to refresh list.");

    // 3. Composer must be closed and cleared (not left open as if storage failed)
    assert.strictEqual(composerEl.classList.contains("hidden"), true, "Composer must be closed");
    assert.strictEqual(toggleBtn.getAttribute("aria-expanded"), "false");
    assert.strictEqual(titleInput.value, "", "Title input must be cleared");
    assert.strictEqual(contentInput.value, "", "Content input must be cleared");

    // 4. Search query must be preserved
    assert.strictEqual(searchInput.value, "active-query", "Search input query must remain intact");

    // 5. Button re-enabled and not busy
    assert.strictEqual(saveBtn.disabled, false);
    assert.strictEqual(saveBtn.getAttribute("aria-busy"), null);

    // 6. Keyboard focus returned to toggle button
    assert.strictEqual(toggleBtn.isFocused(), true, "Focus must be restored to newNoteButton");

    // 7. Prevent accidental duplicate submission if user attempts to save again
    const retryResult = await handleSaveManualNote({
      createMemoryFn: mockCreate,
      composerEl,
      titleInput,
      contentInput,
      saveBtn,
      statusEl,
    });
    assert.strictEqual(retryResult, null, "Immediate retry must fail validation because inputs were cleared");
    assert.strictEqual(statusEl.textContent, "Note content cannot be empty.");
  });

  it("should treat note as saved when createMemory succeeds but loadMemories returns false", async () => {
    const composerEl = createMockElement("div", ["note-composer"]);
    const toggleBtn = createMockElement("button");
    toggleBtn.setAttribute("aria-expanded", "true");
    const contentInput = createMockElement("textarea");
    contentInput.value = "Stored content with non-throwing refresh failure.";
    const saveBtn = createMockElement("button");
    const statusEl = createMockElement("div");
    const searchInput = createMockElement("input");
    searchInput.value = "my-filter";

    const result = await handleSaveManualNote({
      createMemoryFn: async (payload) => ({ id: "persisted-id-2", ...payload }),
      loadMemoriesFn: async () => false, // simulates loadMemories returning false on internally caught error
      composerEl,
      toggleBtn,
      contentInput,
      saveBtn,
      statusEl,
      searchInput,
    });

    assert.notStrictEqual(result, null);
    assert.strictEqual(result.id, "persisted-id-2");
    assert.strictEqual(statusEl.className, "status-banner status-banner--notice");
    assert.strictEqual(statusEl.textContent, "Note saved, but failed to refresh list.");
    assert.strictEqual(composerEl.classList.contains("hidden"), true);
    assert.strictEqual(searchInput.value, "my-filter");
  });
});

describe("Manual Note: List Refresh & Search Preservation", () => {
  beforeEach(() => {
    mockStorage = [
      {
        id: "mem-1",
        type: "page",
        content: "Existing saved webpage on reactive programming",
        title: "Reactive Programming",
        url: "https://example.com/reactive",
      },
    ];
  });

  it("should preserve active search query when refreshing the memory list after saving note", async () => {
    const doc = createMockDocument();
    const listEl = createMockElement("div");
    const searchInput = createMockElement("input");
    const statusEl = createMockElement("div");
    const composerEl = createMockElement("div", ["note-composer"]);
    const titleInput = createMockElement("input");
    titleInput.value = "Reactive Note";
    const contentInput = createMockElement("textarea");
    contentInput.value = "Notes on reactive data pipelines in JavaScript";
    const saveBtn = createMockElement("button");

    // User is searching for "reactive"
    searchInput.value = "reactive";

    // Initial load: 1 matching memory
    await loadMemories(listEl, searchInput, doc, { statusEl });
    assert.strictEqual(listEl.children.length, 1);

    // Save a new note matching "reactive"
    await handleSaveManualNote({
      composerEl,
      titleInput,
      contentInput,
      saveBtn,
      statusEl,
      targetList: listEl,
      searchInput,
      doc,
    });

    // Verify storage has both memories
    assert.strictEqual(mockStorage.length, 2);

    // Verify list refreshed and preserved search filter (both match "reactive")
    assert.strictEqual(searchInput.value, "reactive", "Search query must remain intact");
    assert.strictEqual(listEl.children.length, 2, "List must display 2 matching memories");
    assert.strictEqual(statusEl.textContent, "Note saved to MEMOIR.");
  });

  it("should correctly filter out newly saved note if it does not match active search query", async () => {
    const doc = createMockDocument();
    const listEl = createMockElement("div");
    const searchInput = createMockElement("input");
    const statusEl = createMockElement("div");
    const composerEl = createMockElement("div", ["note-composer"]);
    const titleInput = createMockElement("input");
    titleInput.value = "Cooking Recipe";
    const contentInput = createMockElement("textarea");
    contentInput.value = "Baking artisan sourdough bread with whole wheat flour";
    const saveBtn = createMockElement("button");

    // User is searching for "reactive"
    searchInput.value = "reactive";

    // Initial load: 1 match
    await loadMemories(listEl, searchInput, doc, { statusEl });
    assert.strictEqual(listEl.children.length, 1);

    // Save cooking note (does not match "reactive")
    await handleSaveManualNote({
      composerEl,
      titleInput,
      contentInput,
      saveBtn,
      statusEl,
      targetList: listEl,
      searchInput,
      doc,
    });

    // Verify storage has both memories
    assert.strictEqual(mockStorage.length, 2);

    // List must still show only 1 memory matching "reactive"
    assert.strictEqual(searchInput.value, "reactive");
    assert.strictEqual(listEl.children.length, 1);
    assert.strictEqual(
      listEl.children[0].querySelector("p")?.textContent,
      "Existing saved webpage on reactive programming"
    );
  });
});
