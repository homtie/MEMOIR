/**
 * Memory service — owns all memory-related business logic.
 *
 * This layer sits between the UI/background script and the storage adapter.
 * It handles validation, ID generation, timestamps, defaults, and schema
 * compatibility.
 *
 * It does NOT directly call chrome.storage.local.
 */

import { generateId } from "../utils/ids.js";
import { validateMemoryInput, validateStoredMemory } from "../utils/validation.js";
import { getMemories as storageGetMemories, setMemories as storageSetMemories } from "../storage/storageAdapter.js";

/** Current schema version for new memories. */
const CURRENT_SCHEMA_VERSION = 1;

/**
 * Apply safe defaults to a stored memory that may be missing newer fields.
 *
 * This handles backward compatibility with memories created before
 * schemaVersion, tags, category, updatedAt, or source were added.
 * It does NOT mutate the original object — returns a new one.
 *
 * @param {object} memory - A stored memory object (potentially old schema)
 * @returns {object} Memory with all expected fields populated
 */
function applyDefaults(memory) {
  return {
    id: memory.id,
    schemaVersion: memory.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    type: memory.type ?? "capture",
    source: memory.source ?? memory.type ?? "capture",
    content: memory.content ?? "",
    url: typeof memory.url === "string" ? memory.url.trim() : (memory.url ?? ""),
    title: memory.title ?? "",
    tags: Array.isArray(memory.tags) ? memory.tags : [],
    category: typeof memory.category === "string" ? memory.category : "",
    createdAt: memory.createdAt ?? new Date().toISOString(),
    updatedAt: memory.updatedAt ?? memory.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Create a new memory.
 *
 * Validates input, generates a UUID, sets timestamps, and persists to storage.
 *
 * @param {object} input - Memory creation input
 * @param {string} input.content - The memory content (required, will be trimmed)
 * @param {string} input.type - Memory type: "capture", "page", or "manual"
 * @param {string} [input.url] - Source URL
 * @param {string} [input.title] - Source page title
 * @param {Array<string>} [input.tags] - Tags
 * @param {string} [input.category] - Category
 * @returns {Promise<object>} The created memory object
 * @throws {Error} If validation fails or storage write fails
 */
export async function createMemory(input) {
  // Trim content and url before validation — whitespace-only content will be rejected
  const trimmedInput = {
    ...input,
    content: typeof input.content === "string" ? input.content.trim() : input.content,
    url: typeof input.url === "string" ? input.url.trim() : (input.url ?? ""),
  };

  const validation = validateMemoryInput(trimmedInput);
  if (!validation.valid) {
    throw new Error(`Invalid memory: ${validation.errors.join("; ")}`);
  }

  const now = new Date().toISOString();

  const memory = {
    id: generateId(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    type: trimmedInput.type,
    source: trimmedInput.type,
    content: trimmedInput.content,
    url: trimmedInput.url ?? "",
    title: typeof trimmedInput.title === "string" ? trimmedInput.title.trim() : "",
    tags: trimmedInput.tags ?? [],
    category: trimmedInput.category ?? "",
    createdAt: now,
    updatedAt: now,
  };

  const memories = await storageGetMemories();
  memories.push(memory);
  await storageSetMemories(memories);

  return memory;
}

/**
 * Retrieve all memories from storage.
 *
 * Applies safe defaults to each memory for backward compatibility.
 * Skips memories that fail basic structural validation (missing id/content)
 * rather than crashing the entire library — but logs a warning.
 *
 * @returns {Promise<Array<object>>} Array of memory objects with defaults applied
 */
export async function getAllMemories() {
  const rawMemories = await storageGetMemories();
  const memories = [];

  for (const raw of rawMemories) {
    const check = validateStoredMemory(raw);
    if (!check.valid) {
      console.warn("Skipping invalid stored memory:", check.error);
      continue;
    }
    memories.push(applyDefaults(raw));
  }

  return memories;
}

/**
 * Update an existing memory by ID.
 *
 * Preserves the original ID and createdAt timestamp.
 * Updates the updatedAt timestamp.
 * Validates the modified content.
 *
 * @param {string} id - The ID of the memory to update
 * @param {object} updates - Fields to update (content, title, url, tags, category, type)
 * @returns {Promise<object>} The updated memory object
 * @throws {Error} If the memory is not found, validation fails, or storage write fails
 */
export async function updateMemory(id, updates) {
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Update requires a valid memory ID");
  }

  const memories = await storageGetMemories();
  const index = memories.findIndex((m) => m.id === id);

  if (index === -1) {
    throw new Error(`Memory not found: ${id}`);
  }

  const existing = applyDefaults(memories[index]);

  // Build the updated memory, preserving id and createdAt
  const updated = {
    ...existing,
    ...updates,
    id: existing.id, // never change the ID
    createdAt: existing.createdAt, // never change creation time
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };

  // Trim content if it was updated
  if (typeof updated.content === "string") {
    updated.content = updated.content.trim();
  }

  // Validate the final object
  const validation = validateMemoryInput(updated);
  if (!validation.valid) {
    throw new Error(`Invalid memory update: ${validation.errors.join("; ")}`);
  }

  memories[index] = updated;
  await storageSetMemories(memories);

  return updated;
}

/**
 * Delete a memory by ID.
 *
 * @param {string} id - The ID of the memory to delete
 * @returns {Promise<boolean>} true if a memory was deleted
 * @throws {Error} If the ID is invalid or storage write fails
 */
export async function deleteMemory(id) {
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Delete requires a valid memory ID");
  }

  const memories = await storageGetMemories();
  const index = memories.findIndex((m) => m.id === id);

  if (index === -1) {
    return false;
  }

  memories.splice(index, 1);
  await storageSetMemories(memories);

  return true;
}

export function searchMemories(memories, query) {
  // Defensive: ensure we work with an array (tests always provide one)
  if (!Array.isArray(memories)) {
    throw new TypeError('memories must be an array');
  }

  // Normalise query: trim and split on whitespace, discard empty parts
  const words = String(query || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());

  // Empty query => return a shallow copy preserving original order & references
  if (words.length === 0) {
    return [...memories];
  }

  const searchableFields = [
    'content',
    'title',
    'url',
    'tags',
    'category',
    'type',
    'source',
  ];

  // Helper to test if a word matches a memory in any searchable field
  const memoryMatches = (memory) => {
    // Every query word must match at least one searchable field
    return words.every((word) => {
      return searchableFields.some((field) => {
        const value = memory[field];

        if (value == null) return false;

        if (Array.isArray(value)) {
          // Allow substring matching within each tag
          return value.some(
            (tag) =>
              typeof tag === 'string' && tag.toLowerCase().includes(word)
          );
        }

        if (typeof value !== 'string') return false;

        // Case-insensitive substring matching
        return value.toLowerCase().includes(word);
      });
    });
  };
  // Preserve order and avoid mutation by building a new array
  const result = [];
  for (const mem of memories) {
    if (memoryMatches(mem)) {
      result.push(mem);
    }
  }
  return result;
}

/**
 * Normalize a URL for duplicate detection.
 *
 * Lowercases scheme and hostname, removes hash fragment,
 * removes trailing slash from pathname (if length > 1),
 * and standardizes default ports.
 *
 * @param {string} rawUrl - The raw URL string
 * @returns {string} Normalized URL string
 */
export function normalizeUrl(rawUrl) {
  if (typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = "";

    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return trimmed;
  }
}

/**
 * Check whether a page-resource memory already exists for a given URL.
 *
 * Only matches memories where type === "page".
 * Memories with type === "capture" (from context menu) are NOT considered page duplicates.
 *
 * @param {string} url - Target URL
 * @param {Array<object>} memories - Existing memories array
 * @returns {boolean} True if a page memory already exists for this normalized URL
 */
export function isDuplicatePage(url, memories) {
  if (!url || !Array.isArray(memories)) return false;
  const targetNorm = normalizeUrl(url);
  if (!targetNorm) return false;

  return memories.some(
    (m) => m?.type === "page" && normalizeUrl(m?.url) === targetNorm
  );
}

/**
 * Save a webpage as a page resource memory.
 * Checks for duplicates before creating.
 *
 * @param {object} input - Page save input
 * @param {string} input.url - The page URL
 * @param {string} [input.title] - The page title
 * @param {string} input.content - Page excerpt or title
 * @returns {Promise<{ duplicate: boolean, memory?: object }>}
 */
export async function savePageMemory({ url, title, content }) {
  const existingMemories = await getAllMemories();
  if (isDuplicatePage(url, existingMemories)) {
    return { duplicate: true };
  }

  const memory = await createMemory({
    type: "page",
    content,
    url,
    title,
  });

  return { duplicate: false, memory };
}

// Export for testing
export { CURRENT_SCHEMA_VERSION, applyDefaults };
