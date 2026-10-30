/**
 * MEMOIR — Background service worker.
 *
 * Handles the context menu for capturing selected text.
 * Delegates memory creation to the memoryService layer
 * rather than accessing chrome.storage.local directly.
 */

import { createMemory } from "./services/memoryService.js";

/**
 * Extract capture metadata from the context menu click event and originating tab.
 *
 * Prioritizes info.pageUrl because Chrome provides it on contextMenus events
 * without requiring the 'tabs' permission. Falls back to tab.url if present.
 *
 * Takes metadata strictly from the originating event parameters, ensuring
 * source URLs are never accidentally grabbed from an unrelated active tab.
 *
 * @param {object} info - Chrome context menu OnClickData
 * @param {object} [tab] - Originating Tab object
 * @returns {{ url: string, title: string }}
 */
export function extractCaptureMetadata(info, tab) {
  const pageUrl = typeof info?.pageUrl === "string" ? info.pageUrl.trim() : "";
  const frameUrl = typeof info?.frameUrl === "string" ? info.frameUrl.trim() : "";
  const tabUrl = typeof tab?.url === "string" ? tab.url.trim() : "";

  // info.pageUrl is the URL where the context menu click actually occurred.
  // It is provided by Chrome without requiring the sensitive "tabs" permission.
  const url = pageUrl || tabUrl || frameUrl;

  const title = typeof tab?.title === "string" ? tab.title.trim() : "";

  return { url, title };
}

/**
 * Handle context menu clicks for saving selections.
 *
 * @param {object} info - Chrome context menu OnClickData
 * @param {object} [tab] - Originating Tab object
 * @returns {Promise<object|null>} The created memory, or null
 */
export async function handleContextMenuClick(info, tab) {
  if (info?.menuItemId !== "save-to-memoir") {
    return null;
  }

  const selectedText = info.selectionText;

  if (!selectedText || selectedText.trim().length === 0) {
    return null;
  }

  const { url, title } = extractCaptureMetadata(info, tab);

  try {
    return await createMemory({
      type: "capture",
      content: selectedText,
      url,
      title,
    });
  } catch (error) {
    console.error("MEMOIR: Failed to save memory:", error.message);
    return null;
  }
}

// Register listeners only in Chrome extension environment
if (typeof chrome !== "undefined" && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "save-to-memoir",
      title: "Save to MEMOIR",
      contexts: ["selection"]
    });
  });
}

if (typeof chrome !== "undefined" && chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
}
