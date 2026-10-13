/**
 * Validation utilities for MEMOIR memories.
 *
 * Validation determines whether data is acceptable.
 * It does NOT mutate or sanitize user content — that is the responsibility
 * of the rendering layer (using textContent / safe DOM APIs).
 */

/** Maximum content length in characters. 50,000 chars is generous for text snippets. */
const MAX_CONTENT_LENGTH = 50_000;

/** Maximum length for title field. */
const MAX_TITLE_LENGTH = 1_000;

/** Maximum length for a single tag. */
const MAX_TAG_LENGTH = 100;

/** Maximum number of tags per memory. */
const MAX_TAGS_COUNT = 50;

/** Maximum length for category field. */
const MAX_CATEGORY_LENGTH = 100;

/** Allowed memory types. */
const VALID_TYPES = new Set(["capture", "page", "manual"]);

/** URL schemes considered safe for user-facing links. */
const SAFE_URL_SCHEMES = new Set(["http:", "https:"]);

/**
 * Validate a URL string.
 *
 * Rejects malformed URLs and dangerous schemes (javascript:, data:, etc.).
 * Only allows http: and https: schemes.
 *
 * @param {string} url - The URL to validate
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
export function validateUrl(url) {
  if (typeof url !== "string") {
    return { valid: false, error: "URL must be a string" };
  }

  // Empty URL is acceptable (e.g., manual memories have no URL)
  if (url === "") {
    return { valid: true };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (!SAFE_URL_SCHEMES.has(parsed.protocol)) {
    return { valid: false, error: `Unsafe URL scheme: ${parsed.protocol}` };
  }

  return { valid: true };
}

/**
 * Validate the content field of a memory.
 *
 * Content must be a non-empty string within length limits.
 * Whitespace-only content is rejected, but content is NOT mutated here —
 * trimming is done at the service layer before validation.
 *
 * @param {string} content - The content to validate
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
export function validateContent(content) {
  if (typeof content !== "string") {
    return { valid: false, error: "Content must be a string" };
  }

  if (content.length === 0) {
    return { valid: false, error: "Content cannot be empty" };
  }

  if (content.trim().length === 0) {
    return { valid: false, error: "Content cannot be only whitespace" };
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return { valid: false, error: `Content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters` };
  }

  return { valid: true };
}

/**
 * Validate the tags array of a memory.
 *
 * @param {Array} tags - The tags array to validate
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
export function validateTags(tags) {
  if (!Array.isArray(tags)) {
    return { valid: false, error: "Tags must be an array" };
  }

  if (tags.length > MAX_TAGS_COUNT) {
    return { valid: false, error: `Too many tags (max ${MAX_TAGS_COUNT})` };
  }

  for (let i = 0; i < tags.length; i++) {
    if (typeof tags[i] !== "string") {
      return { valid: false, error: `Tag at index ${i} must be a string` };
    }
    if (tags[i].length === 0 || tags[i].trim().length === 0) {
      return { valid: false, error: `Tag at index ${i} cannot be empty` };
    }
    if (tags[i].length > MAX_TAG_LENGTH) {
      return { valid: false, error: `Tag at index ${i} exceeds maximum length of ${MAX_TAG_LENGTH}` };
    }
  }

  return { valid: true };
}

/**
 * Validate a complete memory object for creation.
 *
 * Checks that all required fields are present and have acceptable values.
 * Does NOT check id, timestamps, or schemaVersion — those are set by the service layer.
 *
 * @param {object} input - The memory input to validate
 * @param {string} input.content - Memory content (required)
 * @param {string} input.type - Memory type (required, one of VALID_TYPES)
 * @param {string} [input.url] - Source URL (optional)
 * @param {string} [input.title] - Source page title (optional)
 * @param {Array<string>} [input.tags] - Tags (optional)
 * @param {string} [input.category] - Category (optional)
 * @returns {{ valid: boolean, errors: string[] }} Validation result with all errors
 */
export function validateMemoryInput(input) {
  const errors = [];

  if (input === null || typeof input !== "object") {
    return { valid: false, errors: ["Input must be an object"] };
  }

  // Content — required
  const contentResult = validateContent(input.content);
  if (!contentResult.valid) {
    errors.push(contentResult.error);
  }

  // Type — required, must be one of the allowed types
  if (typeof input.type !== "string" || !VALID_TYPES.has(input.type)) {
    errors.push(`Type must be one of: ${[...VALID_TYPES].join(", ")}`);
  }

  // URL — optional, but must be valid if provided
  if (input.url !== undefined && input.url !== "") {
    const urlResult = validateUrl(input.url);
    if (!urlResult.valid) {
      errors.push(urlResult.error);
    }
  }

  // Title — optional, but must be a string within limits if provided
  if (input.title !== undefined && input.title !== "") {
    if (typeof input.title !== "string") {
      errors.push("Title must be a string");
    } else if (input.title.length > MAX_TITLE_LENGTH) {
      errors.push(`Title exceeds maximum length of ${MAX_TITLE_LENGTH}`);
    }
  }

  // Tags — optional, validated if provided
  if (input.tags !== undefined) {
    const tagsResult = validateTags(input.tags);
    if (!tagsResult.valid) {
      errors.push(tagsResult.error);
    }
  }

  // Category — optional, must be a string within limits
  if (input.category !== undefined && input.category !== "") {
    if (typeof input.category !== "string") {
      errors.push("Category must be a string");
    } else if (input.category.length > MAX_CATEGORY_LENGTH) {
      errors.push(`Category exceeds maximum length of ${MAX_CATEGORY_LENGTH}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a stored memory object when reading from storage.
 *
 * More lenient than creation validation — tolerates missing optional fields
 * and old schema versions. Returns whether the memory is usable.
 *
 * A memory is considered usable if it has at minimum an id and content.
 *
 * @param {*} memory - The stored memory to validate
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
export function validateStoredMemory(memory) {
  if (memory === null || typeof memory !== "object") {
    return { valid: false, error: "Memory must be an object" };
  }

  // id is required — without it we can't reference the memory
  if (memory.id === undefined || memory.id === null || memory.id === "") {
    return { valid: false, error: "Memory is missing an ID" };
  }

  // content is required — a memory without content is meaningless
  if (typeof memory.content !== "string" || memory.content.trim().length === 0) {
    return { valid: false, error: "Memory has missing or empty content" };
  }

  return { valid: true };
}

// Export constants for testing
export { MAX_CONTENT_LENGTH, MAX_TITLE_LENGTH, MAX_TAG_LENGTH, MAX_TAGS_COUNT, VALID_TYPES, SAFE_URL_SCHEMES };
