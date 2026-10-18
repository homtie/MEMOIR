// Tests for the searchMemories function (Phase 3 – Search v1)
// Run with: node --experimental-vm-modules extension/tests/search.test.js

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import the function under test.
import { searchMemories } from "../services/memoryService.js";

/** Helper: creates a minimal valid memory object */
function baseMemory(overrides = {}) {
  return {
    id: "test-memory",
    schemaVersion: 1,
    type: "capture",
    source: "capture",
    content: "",
    url: "",
    title: "",
    tags: [],
    category: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("searchMemories", () => {
  // 1. Empty or whitespace-only query returns a *new* array with same references
  it("returns a new array with all memories for empty/whitespace query", () => {
    const memories = [baseMemory({ content: "a" }), baseMemory({ content: "b" })];
    const result = searchMemories(memories, "   ");
    assert.notStrictEqual(result, memories, "Result should be a different array instance");
    assert.deepStrictEqual(result, memories, "Result should contain the same memory references");
    result.forEach((memory, index) => {
      assert.strictEqual(memory, memories[index]);
    });
  });

  // 2. Single‑word match in content
  it("matches a single word in the content field", () => {
    const mem = baseMemory({ content: "Important note about JavaScript" });
    const result = searchMemories([mem], "javascript");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0], mem);
  });

  // 3. Match in each optional searchable field individually
  const fieldTests = [
    { field: "title", value: "Page Title" },
    { field: "url", value: "https://example.com/article" },
    { field: "tags", value: ["AI", "Machine Learning"] },
    { field: "category", value: "Learning" },
    { field: "type", value: "page" },
    { field: "source", value: "manual" },
  ];
  for (const { field, value } of fieldTests) {
    it(`matches query word in ${field} field`, () => {
      const overrides = {};
      overrides[field] = value;
      const mem = baseMemory(overrides);
      const queryWord = typeof value === "string" ? value.split(/\s+/)[0] : value[0];
      const result = searchMemories([mem], queryWord);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0], mem);
    });
  }

  // 4. Case‑insensitive matching
  it("is case‑insensitive", () => {
    const mem = baseMemory({ content: "CaseSensitive" });
    const result = searchMemories([mem], "casesensitive");
    assert.strictEqual(result.length, 1);
  });

  // 5. All‑words‑required (AND) – all present
  it("requires all query words (AND) when all are present", () => {
    const mem = baseMemory({ content: "foo", title: "bar" });
    const result = searchMemories([mem], "foo bar");
    assert.strictEqual(result.length, 1);
  });

  // 6. All‑words‑required – missing one word
  it("does NOT match when any query word is missing", () => {
    const mem = baseMemory({ content: "foo" });
    const result = searchMemories([mem], "foo missing");
    assert.strictEqual(result.length, 0);
  });

  // 7. Words can match across different fields
  it("matches across different fields", () => {
    const mem = baseMemory({ content: "alpha", tags: ["beta"] });
    const result = searchMemories([mem], "alpha beta");
    assert.strictEqual(result.length, 1);
  });

  // 8. Multiple matches preserve original order
  it("returns every matching memory, preserving input order", () => {
    const mem1 = baseMemory({ content: "match" });
    const mem2 = baseMemory({ title: "unrelated" });
    const mem3 = baseMemory({ content: "match again" });
    const result = searchMemories([mem1, mem2, mem3], "match");
    assert.deepStrictEqual(result, [mem1, mem3]);
  });

  // 9. No matches → empty array
  it("returns empty array when no memory matches", () => {
    const mem = baseMemory({ content: "hello" });
    const result = searchMemories([mem], "goodbye");
    assert.deepStrictEqual(result, []);
  });

  // 10. Missing optional fields are handled safely
  it("handles missing optional fields without throwing", () => {
    const mem = {
      id: "1",
      schemaVersion: 1,
      type: "capture",
      source: "capture",
      content: "only content",
      // url, title, tags, category omitted completely
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = searchMemories([mem], "content");
    assert.strictEqual(result.length, 1);

    const absentResult = searchMemories([mem], "not-present");
    assert.deepStrictEqual(absentResult, []);
  });

  // 11. Input immutability
  it("does not mutate the input array or its memory objects", () => {
    const original = baseMemory({ content: "immutable" });
    const memories = [original];
    const originalBefore = { ...original, tags: [...original.tags] };
    const memoriesBefore = [...memories];
    const result = searchMemories(memories, "immutable");
    // input array unchanged
    assert.deepStrictEqual(memories, memoriesBefore);
    // objects unchanged
    assert.strictEqual(memories[0], original);
    assert.deepStrictEqual(original, originalBefore);
    // result is a new array
    assert.notStrictEqual(result, memories);
  });

  // 12. Query whitespace normalisation
  it("trims and splits whitespace correctly", () => {
    const mem = baseMemory({ content: "foo bar" });
    const result = searchMemories([mem], "  foo   bar   ");
    assert.strictEqual(result.length, 1);
  });

  // 13. Partial‑tag substring matching (case‑insensitive)
  it("matches a substring of a tag (case‑insensitive)", () => {
    const mem = baseMemory({ tags: ["Machine Learning", "AI"] });
    const result = searchMemories([mem], "learn");
    assert.strictEqual(result.length, 1);
  });

  // 14. Substring matching in content field
  it("matches a substring in the content field (case-insensitive)", () => {
    const mem = baseMemory({ content: "Machine Learning" });
    const result = searchMemories([mem], "learn");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0], mem);
  });
});
