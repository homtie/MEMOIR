/**
 * MEMOIR — Background service worker.
 *
 * Handles the context menu for capturing selected text.
 * Delegates memory creation to the memoryService layer
 * rather than accessing chrome.storage.local directly.
 */

import { createMemory } from "./services/memoryService.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-memoir",
    title: "Save to MEMOIR",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-to-memoir") {
    return;
  }

  const selectedText = info.selectionText;

  if (!selectedText || selectedText.trim().length === 0) {
    return;
  }

  try {
    await createMemory({
      type: "capture",
      content: selectedText,
      url: tab?.url || "",
      title: tab?.title || "",
    });
  } catch (error) {
    console.error("MEMOIR: Failed to save memory:", error.message);
  }
});