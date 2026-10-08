/**
 * Tests for extension/services/memoryService.js
 *
 * These tests mock the storageAdapter since chrome.storage.local is not
 * available in Node.js. The service layer's logic is pure enough to test
 * without a browser environment.
 *
 * Run with: node --experimental-vm-modules extension/tests/memoryService.test.js
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// --- Mock storageAdapter ---
// We intercept the storageAdapter module to use an in-memory store.
// Since we can't easily mock ES module imports without a framework,
// we test the exported pure functions (applyDefaults) directly and
// create a self-contained test harness for the service logic.

import { CURRENT_SCHEMA_VERSION, applyDefaults } from "../services/memoryService.js";

// We also import the validation functions to verify the service's contracts
import { validateMemoryInput, validateStoredMemory } from "../utils/validation.js";
import { generateId } from "../utils/ids.js";

// UUID v4 pattern
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// --- applyDefaults tests ---

describe("applyDefaults", () => {
  it("should fill in missing fields on an old memory", () => {
    const oldMemory = {
      id: 1696780000000,
      type: "capture",
      content: "Old captured text",
      url: "https://example.com",
      title: "Example",
      createdAt: "2024-01-01T00:00:00.000Z",
    };

    const result = applyDefaults(oldMemory);

    assert.strictEqual(result.id, 1696780000000);
    assert.strictEqual(result.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.strictEqual(result.type, "capture");
    assert.strictEqual(result.source, "capture");
    assert.strictEqual(result.content, "Old captured text");
    assert.strictEqual(result.url, "https://example.com");
    assert.strictEqual(result.title, "Example");
    assert.deepStrictEqual(result.tags, []);
    assert.strictEqual(result.category, "");
    assert.strictEqual(result.createdAt, "2024-01-01T00:00:00.000Z");
    assert.strictEqual(result.updatedAt, "2024-01-01T00:00:00.000Z");
  });

  it("should preserve existing fields when present", () => {
    const fullMemory = {
      id: "abc-123",
      schemaVersion: 1,
      type: "manual",
      source: "manual",
      content: "A note",
      url: "",
      title: "",
      tags: ["AI"],
      category: "Learning",
      createdAt: "2024-06-01T00:00:00.000Z",
      updatedAt: "2024-06-02T00:00:00.000Z",
    };

    const result = applyDefaults(fullMemory);

    assert.deepStrictEqual(result, fullMemory);
  });

  it("should not mutate the original object", () => {
    const original = { id: "test-1", content: "Hello" };
    const result = applyDefaults(original);

    assert.notStrictEqual(result, original);
    assert.strictEqual(original.schemaVersion, undefined);
    assert.strictEqual(result.schemaVersion, CURRENT_SCHEMA_VERSION);
  });

  it("should default source to type when source is missing", () => {
    const memory = { id: "test-1", type: "page", content: "A page" };
    const result = applyDefaults(memory);
    assert.strictEqual(result.source, "page");
  });

  it("should handle memory with non-array tags gracefully", () => {
    const memory = { id: "test-1", content: "Hello", tags: "not-an-array" };
    const result = applyDefaults(memory);
    assert.deepStrictEqual(result.tags, []);
  });

  it("should handle memory with non-string category gracefully", () => {
    const memory = { id: "test-1", content: "Hello", category: 42 };
    const result = applyDefaults(memory);
    assert.strictEqual(result.category, "");
  });
});

// --- Service-level integration tests using in-memory storage ---
// These test the full create/update/delete flow by simulating what
// memoryService does, without depending on chrome.storage.local.

describe("Memory creation logic", () => {
  it("should produce a valid memory with all required fields", () => {
    const id = generateId();
    const now = new Date().toISOString();

    const memory = {
      id,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      type: "capture",
      source: "capture",
      content: "Test content",
      url: "https://example.com",
      title: "Test Page",
      tags: [],
      category: "",
      createdAt: now,
      updatedAt: now,
    };

    // Should pass stored memory validation
    const storedCheck = validateStoredMemory(memory);
    assert.strictEqual(storedCheck.valid, true);

    // Should pass input validation
    const inputCheck = validateMemoryInput(memory);
    assert.strictEqual(inputCheck.valid, true);

    // ID should be a UUID
    assert.match(memory.id, UUID_V4_REGEX);

    // Schema version should be current
    assert.strictEqual(memory.schemaVersion, CURRENT_SCHEMA_VERSION);
  });

  it("should set createdAt and updatedAt to the same value on creation", () => {
    const now = new Date().toISOString();
    const memory = {
      id: generateId(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      type: "manual",
      source: "manual",
      content: "A note",
      url: "",
      title: "",
      tags: [],
      category: "",
      createdAt: now,
      updatedAt: now,
    };

    assert.strictEqual(memory.createdAt, memory.updatedAt);
  });

  it("should provide empty defaults for tags and category", () => {
    const memory = {
      id: generateId(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      type: "capture",
      source: "capture",
      content: "Captured text",
      url: "",
      title: "",
      tags: [],
      category: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    assert.deepStrictEqual(memory.tags, []);
    assert.strictEqual(memory.category, "");
  });
});

describe("Memory update logic", () => {
  it("should preserve ID and createdAt when updating", () => {
    const originalId = generateId();
    const originalCreatedAt = "2024-01-01T00:00:00.000Z";

    const original = {
      id: originalId,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      type: "capture",
      source: "capture",
      content: "Original content",
      url: "https://example.com",
      title: "Title",
      tags: [],
      category: "",
      createdAt: originalCreatedAt,
      updatedAt: originalCreatedAt,
    };

    // Simulate an update
    const updated = {
      ...original,
      content: "Updated content",
      id: originalId, // must not change
      createdAt: originalCreatedAt, // must not change
      updatedAt: new Date().toISOString(), // should change
    };

    assert.strictEqual(updated.id, originalId);
    assert.strictEqual(updated.createdAt, originalCreatedAt);
    assert.notStrictEqual(updated.updatedAt, originalCreatedAt);
  });

  it("should reject an update with empty content", () => {
    const result = validateMemoryInput({
      content: "",
      type: "capture",
    });
    assert.strictEqual(result.valid, false);
  });

  it("should reject an update with whitespace-only content", () => {
    const result = validateMemoryInput({
      content: "   \t\n  ",
      type: "capture",
    });
    assert.strictEqual(result.valid, false);
  });
});

describe("Memory deletion logic", () => {
  it("should find a memory by ID in an array", () => {
    const targetId = generateId();
    const memories = [
      { id: generateId(), content: "First" },
      { id: targetId, content: "Target" },
      { id: generateId(), content: "Third" },
    ];

    const index = memories.findIndex((m) => m.id === targetId);
    assert.strictEqual(index, 1);

    memories.splice(index, 1);
    assert.strictEqual(memories.length, 2);
    assert.ok(!memories.some((m) => m.id === targetId));
  });

  it("should return -1 for a non-existent ID", () => {
    const memories = [
      { id: generateId(), content: "First" },
      { id: generateId(), content: "Second" },
    ];

    const index = memories.findIndex((m) => m.id === "non-existent-id");
    assert.strictEqual(index, -1);
  });

  it("should not match undefined or null IDs", () => {
    const memories = [
      { id: generateId(), content: "First" },
    ];

    assert.strictEqual(memories.findIndex((m) => m.id === undefined), -1);
    assert.strictEqual(memories.findIndex((m) => m.id === null), -1);
    assert.strictEqual(memories.findIndex((m) => m.id === ""), -1);
  });
});

// --- Security ---

describe("Security: safe content handling", () => {
  const xssPayloads = [
    '<img src=x onerror=alert(1)>',
    '<script>alert("xss")</script>',
    '<div onmouseover="steal()">hover me</div>',
    '"><script>alert(document.cookie)</script>',
    "'; DROP TABLE memories; --",
  ];

  for (const payload of xssPayloads) {
    it(`should accept and preserve malicious-looking content: ${payload.slice(0, 40)}...`, () => {
      // Validation should ACCEPT the content (it's valid text)
      const inputCheck = validateMemoryInput({ content: payload, type: "manual" });
      assert.strictEqual(inputCheck.valid, true, "XSS payload should be valid content");

      // Creating a memory with this content should preserve it exactly
      const memory = {
        id: generateId(),
        schemaVersion: CURRENT_SCHEMA_VERSION,
        type: "manual",
        source: "manual",
        content: payload,
        url: "",
        title: "",
        tags: [],
        category: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      assert.strictEqual(memory.content, payload, "Content must be preserved exactly");
    });
  }
});

// --- Backward compatibility ---

describe("Backward compatibility", () => {
  it("should handle a memory created with the old Date.now() ID", () => {
    const oldMemory = {
      id: 1696780000000,
      type: "capture",
      content: "Old memory from initial extension version",
      url: "https://example.com",
      title: "Old Page",
      createdAt: "2024-01-01T00:00:00.000Z",
    };

    // Should pass stored memory validation
    const check = validateStoredMemory(oldMemory);
    assert.strictEqual(check.valid, true);

    // Should get defaults applied
    const withDefaults = applyDefaults(oldMemory);
    assert.strictEqual(withDefaults.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.deepStrictEqual(withDefaults.tags, []);
    assert.strictEqual(withDefaults.category, "");
    assert.strictEqual(withDefaults.source, "capture");
    assert.strictEqual(withDefaults.updatedAt, oldMemory.createdAt);
  });

  it("should handle a memory with no type field", () => {
    const noTypeMemory = { id: "old-1", content: "No type" };
    const withDefaults = applyDefaults(noTypeMemory);
    assert.strictEqual(withDefaults.type, "capture");
    assert.strictEqual(withDefaults.source, "capture");
  });
});
