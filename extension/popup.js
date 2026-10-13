/**
 * MEMOIR — Popup script.
 *
 * Loads and displays saved memories using safe DOM APIs.
 * All user-controlled content is rendered via textContent to prevent XSS.
 * Uses memoryService instead of direct chrome.storage.local access.
 */

import { getAllMemories } from "./services/memoryService.js";
import { validateUrl } from "./utils/validation.js";

const saveButton = document.getElementById("saveButton");
const memoryList = document.getElementById("memoryList");

saveButton.addEventListener("click", () => {
  alert("MEMOIR is alive");
});

/**
 * Render the memory list using safe DOM APIs.
 *
 * SECURITY: All user-controlled content (content, title, URL) is set via
 * textContent or safe attribute assignment — never innerHTML with interpolation.
 * This ensures that stored content like <img src=x onerror=alert(1)>
 * renders as harmless text.
 */
async function loadMemories() {
  try {
    const memories = await getAllMemories();

    if (memories.length === 0) {
      // Static HTML with no user data — safe to use textContent
      memoryList.textContent = "";
      const emptyMsg = document.createElement("p");
      emptyMsg.textContent = "No memories yet.";
      memoryList.appendChild(emptyMsg);
      return;
    }

    memoryList.textContent = "";

    for (const memory of memories) {
      const item = document.createElement("div");

      // Content — user-controlled, must use textContent
      const contentEl = document.createElement("p");
      contentEl.textContent = memory.content || "";
      item.appendChild(contentEl);

      // Title — user-controlled, must use textContent
      const titleEl = document.createElement("small");
      titleEl.textContent = memory.title || "";
      item.appendChild(titleEl);

      // Source link — only create a clickable link if URL is valid and safe
      if (memory.url) {
        const urlCheck = validateUrl(memory.url);
        if (urlCheck.valid && memory.url.length > 0) {
          const linkEl = document.createElement("a");
          linkEl.href = memory.url;
          linkEl.textContent = memory.url;
          linkEl.target = "_blank";
          linkEl.rel = "noopener noreferrer";

          const linkWrapper = document.createElement("div");
          linkWrapper.appendChild(linkEl);
          item.appendChild(linkWrapper);
        }
      }

      const separator = document.createElement("hr");
      item.appendChild(separator);

      memoryList.appendChild(item);
    }
  } catch (error) {
    console.error("MEMOIR: Failed to load memories:", error.message);

    memoryList.textContent = "";
    const errorMsg = document.createElement("p");
    errorMsg.textContent = "Failed to load memories. Please try again.";
    memoryList.appendChild(errorMsg);
  }
}

loadMemories();