/**
 * Tests for extension/utils/validation.js
 *
 * Run with: node --experimental-vm-modules extension/tests/validation.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateUrl,
  validateContent,
  validateTags,
  validateMemoryInput,
  validateStoredMemory,
  MAX_CONTENT_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TAGS_COUNT,
} from "../utils/validation.js";

// --- validateUrl ---

describe("validateUrl", () => {
  it("should accept a valid https URL", () => {
    const result = validateUrl("https://example.com/article?q=test");
    assert.strictEqual(result.valid, true);
  });

  it("should accept a valid http URL", () => {
    const result = validateUrl("http://example.com");
    assert.strictEqual(result.valid, true);
  });

  it("should accept an empty URL (optional field)", () => {
    const result = validateUrl("");
    assert.strictEqual(result.valid, true);
  });

  it("should reject a javascript: URL", () => {
    const result = validateUrl("javascript:alert(1)");
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("Unsafe URL scheme"));
  });

  it("should reject a data: URL", () => {
    const result = validateUrl("data:text/html,<h1>hello</h1>");
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("Unsafe URL scheme"));
  });

  it("should reject a malformed URL", () => {
    const result = validateUrl("not a url at all");
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("Invalid URL"));
  });

  it("should reject non-string input", () => {
    const result = validateUrl(42);
    assert.strictEqual(result.valid, false);
  });

  it("should reject a file: URL", () => {
    const result = validateUrl("file:///etc/passwd");
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("Unsafe URL scheme"));
  });

  it("should reject a vbscript: URL", () => {
    const result = validateUrl("vbscript:msgbox('hi')");
    assert.strictEqual(result.valid, false);
  });
});

// --- validateContent ---

describe("validateContent", () => {
  it("should accept valid content", () => {
    const result = validateContent("This is a valid note.");
    assert.strictEqual(result.valid, true);
  });

  it("should reject empty string", () => {
    const result = validateContent("");
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("empty"));
  });

  it("should reject whitespace-only string", () => {
    const result = validateContent("   \n\t  ");
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("whitespace"));
  });

  it("should reject non-string input", () => {
    const result = validateContent(123);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("string"));
  });

  it("should reject content exceeding max length", () => {
    const longContent = "a".repeat(MAX_CONTENT_LENGTH + 1);
    const result = validateContent(longContent);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("maximum length"));
  });

  it("should accept content at exactly max length", () => {
    const maxContent = "a".repeat(MAX_CONTENT_LENGTH);
    const result = validateContent(maxContent);
    assert.strictEqual(result.valid, true);
  });

  it("should accept content containing HTML-like strings (not mutate it)", () => {
    const xss = '<img src=x onerror=alert(1)>';
    const result = validateContent(xss);
    assert.strictEqual(result.valid, true);
    // Validation should NOT strip or modify the content
  });

  it("should accept content containing script tags", () => {
    const script = '<script>alert("xss")</script>';
    const result = validateContent(script);
    assert.strictEqual(result.valid, true);
  });

  it("should reject null", () => {
    const result = validateContent(null);
    assert.strictEqual(result.valid, false);
  });

  it("should reject undefined", () => {
    const result = validateContent(undefined);
    assert.strictEqual(result.valid, false);
  });
});

// --- validateTags ---

describe("validateTags", () => {
  it("should accept a valid tags array", () => {
    const result = validateTags(["AI", "Machine Learning"]);
    assert.strictEqual(result.valid, true);
  });

  it("should accept an empty tags array", () => {
    const result = validateTags([]);
    assert.strictEqual(result.valid, true);
  });

  it("should reject non-array input", () => {
    const result = validateTags("not an array");
    assert.strictEqual(result.valid, false);
  });

  it("should reject too many tags", () => {
    const tags = Array.from({ length: MAX_TAGS_COUNT + 1 }, (_, i) => `tag${i}`);
    const result = validateTags(tags);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("Too many tags"));
  });

  it("should reject non-string tag elements", () => {
    const result = validateTags(["valid", 42, "also valid"]);
    assert.strictEqual(result.valid, false);
  });

  it("should reject empty string tags", () => {
    const result = validateTags(["valid", ""]);
    assert.strictEqual(result.valid, false);
  });

  it("should reject whitespace-only tags", () => {
    const result = validateTags(["valid", "   "]);
    assert.strictEqual(result.valid, false);
  });

  it("should reject tags exceeding max length", () => {
    const longTag = "a".repeat(MAX_TAG_LENGTH + 1);
    const result = validateTags([longTag]);
    assert.strictEqual(result.valid, false);
  });
});

// --- validateMemoryInput ---

describe("validateMemoryInput", () => {
  const validInput = {
    content: "Some important note",
    type: "capture",
    url: "https://example.com",
    title: "Example Page",
  };

  it("should accept a valid memory input", () => {
    const result = validateMemoryInput(validInput);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it("should accept a minimal valid input (content + type)", () => {
    const result = validateMemoryInput({ content: "Note", type: "manual" });
    assert.strictEqual(result.valid, true);
  });

  it("should reject null input", () => {
    const result = validateMemoryInput(null);
    assert.strictEqual(result.valid, false);
  });

  it("should reject missing content", () => {
    const result = validateMemoryInput({ type: "capture" });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Content")));
  });

  it("should reject empty content", () => {
    const result = validateMemoryInput({ content: "", type: "capture" });
    assert.strictEqual(result.valid, false);
  });

  it("should reject whitespace-only content", () => {
    const result = validateMemoryInput({ content: "   ", type: "capture" });
    assert.strictEqual(result.valid, false);
  });

  it("should reject invalid type", () => {
    const result = validateMemoryInput({ content: "Note", type: "invalid" });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Type")));
  });

  it("should reject missing type", () => {
    const result = validateMemoryInput({ content: "Note" });
    assert.strictEqual(result.valid, false);
  });

  it("should reject a dangerous URL", () => {
    const result = validateMemoryInput({ ...validInput, url: "javascript:alert(1)" });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Unsafe URL")));
  });

  it("should reject a malformed URL", () => {
    const result = validateMemoryInput({ ...validInput, url: "not-a-url" });
    assert.strictEqual(result.valid, false);
  });

  it("should accept empty URL", () => {
    const result = validateMemoryInput({ ...validInput, url: "" });
    assert.strictEqual(result.valid, true);
  });

  it("should accept missing URL", () => {
    const result = validateMemoryInput({ content: "Note", type: "manual" });
    assert.strictEqual(result.valid, true);
  });

  it("should reject excessively long title", () => {
    const result = validateMemoryInput({
      ...validInput,
      title: "t".repeat(MAX_TITLE_LENGTH + 1),
    });
    assert.strictEqual(result.valid, false);
  });

  it("should accept valid tags", () => {
    const result = validateMemoryInput({ ...validInput, tags: ["AI", "ML"] });
    assert.strictEqual(result.valid, true);
  });

  it("should reject invalid tags", () => {
    const result = validateMemoryInput({ ...validInput, tags: [123] });
    assert.strictEqual(result.valid, false);
  });

  it("should accept valid category", () => {
    const result = validateMemoryInput({ ...validInput, category: "Learning" });
    assert.strictEqual(result.valid, true);
  });

  it("should collect multiple errors", () => {
    const result = validateMemoryInput({
      content: "",
      type: "bogus",
      url: "javascript:alert(1)",
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length >= 3, `Expected at least 3 errors, got ${result.errors.length}`);
  });

  it("should accept all valid memory types", () => {
    for (const type of ["capture", "page", "manual"]) {
      const result = validateMemoryInput({ content: "Note", type });
      assert.strictEqual(result.valid, true, `Type '${type}' should be valid`);
    }
  });
});

// --- validateStoredMemory ---

describe("validateStoredMemory", () => {
  it("should accept a memory with id and content", () => {
    const result = validateStoredMemory({ id: "abc-123", content: "Hello" });
    assert.strictEqual(result.valid, true);
  });

  it("should reject null", () => {
    const result = validateStoredMemory(null);
    assert.strictEqual(result.valid, false);
  });

  it("should reject a non-object", () => {
    const result = validateStoredMemory("not an object");
    assert.strictEqual(result.valid, false);
  });

  it("should reject a memory with missing ID", () => {
    const result = validateStoredMemory({ content: "Hello" });
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("ID"));
  });

  it("should reject a memory with empty ID", () => {
    const result = validateStoredMemory({ id: "", content: "Hello" });
    assert.strictEqual(result.valid, false);
  });

  it("should reject a memory with null ID", () => {
    const result = validateStoredMemory({ id: null, content: "Hello" });
    assert.strictEqual(result.valid, false);
  });

  it("should reject a memory with missing content", () => {
    const result = validateStoredMemory({ id: "abc-123" });
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("content"));
  });

  it("should reject a memory with empty content", () => {
    const result = validateStoredMemory({ id: "abc-123", content: "" });
    assert.strictEqual(result.valid, false);
  });

  it("should reject a memory with whitespace-only content", () => {
    const result = validateStoredMemory({ id: "abc-123", content: "   " });
    assert.strictEqual(result.valid, false);
  });

  it("should accept a memory with numeric ID (old schema)", () => {
    // Old memories used Date.now() which produced numbers
    const result = validateStoredMemory({ id: 1696780000000, content: "Hello" });
    assert.strictEqual(result.valid, true);
  });

  it("should accept a memory with extra/missing optional fields", () => {
    // Old schema memories won't have tags, category, etc.
    const result = validateStoredMemory({ id: "abc", content: "Hello", type: "capture" });
    assert.strictEqual(result.valid, true);
  });
});

// --- Security: content preservation ---

describe("Security: content preservation", () => {
  it("should NOT strip HTML from content during validation", () => {
    const xssPayload = '<img src=x onerror=alert(1)>';
    const result = validateContent(xssPayload);
    assert.strictEqual(result.valid, true);
    // The content is preserved — safe rendering is the UI layer's responsibility
  });

  it("should NOT strip script tags from content during validation", () => {
    const scriptPayload = '<script>document.cookie</script>';
    const result = validateContent(scriptPayload);
    assert.strictEqual(result.valid, true);
  });

  it("should accept content with event handlers as valid text", () => {
    const eventPayload = '<div onmouseover="steal()">';
    const result = validateContent(eventPayload);
    assert.strictEqual(result.valid, true);
  });

  it("should reject javascript: URLs even with mixed case", () => {
    const result = validateUrl("JavaScript:alert(1)");
    assert.strictEqual(result.valid, false);
  });

  it("should reject data: URLs with HTML content", () => {
    const result = validateUrl("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==");
    assert.strictEqual(result.valid, false);
  });
});
