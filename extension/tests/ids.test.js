/**
 * Tests for extension/utils/ids.js
 *
 * Run with: node --experimental-vm-modules extension/tests/ids.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateId } from "../utils/ids.js";

// UUID v4 pattern: 8-4-4-4-12 hex digits, version nibble is 4
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("generateId", () => {
  it("should return a valid UUID v4 string", () => {
    const id = generateId();
    assert.match(id, UUID_V4_REGEX, `Expected UUID v4 format, got: ${id}`);
  });

  it("should return a string", () => {
    const id = generateId();
    assert.strictEqual(typeof id, "string");
  });

  it("should generate unique IDs on successive calls", () => {
    const id1 = generateId();
    const id2 = generateId();
    assert.notStrictEqual(id1, id2, "Two generated IDs must be different");
  });

  it("should generate 100 unique IDs without collision", () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    assert.strictEqual(ids.size, 100, "All 100 IDs should be unique");
  });
});
