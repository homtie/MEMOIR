/**
 * Storage adapter — the ONLY layer that directly accesses chrome.storage.local.
 *
 * All other code communicates with storage through this module.
 * This isolation makes the storage backend replaceable in the future
 * and keeps Chrome API details out of business logic.
 */

const STORAGE_KEY = "memories";

/**
 * Retrieve all stored memories.
 *
 * @returns {Promise<Array<object>>} Array of memory objects (may be empty)
 * @throws {Error} If the storage read fails
 */
export async function getMemories() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const memories = result[STORAGE_KEY];

    // Handle missing or non-array stored data gracefully
    if (!Array.isArray(memories)) {
      return [];
    }

    return memories;
  } catch (error) {
    throw new Error(`Failed to read memories from storage: ${error.message}`);
  }
}

/**
 * Save the full memories array to storage.
 *
 * Replaces the entire stored array. The caller (memoryService) is responsible
 * for maintaining array integrity — this layer just persists.
 *
 * @param {Array<object>} memories - The complete memories array to store
 * @throws {Error} If the storage write fails or input is invalid
 */
export async function setMemories(memories) {
  if (!Array.isArray(memories)) {
    throw new Error("setMemories requires an array");
  }

  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: memories });
  } catch (error) {
    throw new Error(`Failed to write memories to storage: ${error.message}`);
  }
}
