/**
 * MEMOIR — Popup script.
 *
 * Loads and displays saved memories using safe DOM APIs.
 * All user-controlled content is rendered via textContent to prevent XSS.
 * Uses memoryService instead of direct chrome.storage.local access.
 */

import { getAllMemories, searchMemories, createMemory, isDuplicatePage, deleteMemory } from "./services/memoryService.js";
import { validateUrl } from "./utils/validation.js";

const saveButton = typeof document !== "undefined" ? document.getElementById("saveButton") : null;
const newNoteButton = typeof document !== "undefined" ? document.getElementById("newNoteButton") : null;
const noteComposer = typeof document !== "undefined" ? document.getElementById("noteComposer") : null;
const noteTitle = typeof document !== "undefined" ? document.getElementById("noteTitle") : null;
const noteContent = typeof document !== "undefined" ? document.getElementById("noteContent") : null;
const saveNoteButton = typeof document !== "undefined" ? document.getElementById("saveNoteButton") : null;
const cancelNoteButton = typeof document !== "undefined" ? document.getElementById("cancelNoteButton") : null;
const statusMessage = typeof document !== "undefined" ? document.getElementById("statusMessage") : null;
const memoryList = typeof document !== "undefined" ? document.getElementById("memoryList") : null;
const memorySearch = typeof document !== "undefined" ? document.getElementById("memorySearch") : null;
let allMemories = null;
let statusTimeout = null;

/**
 * Display a user-facing feedback banner.
 *
 * @param {string} message - Message text
 * @param {"success"|"notice"|"error"} [type="success"] - Status style modifier
 * @param {HTMLElement} [bannerEl=statusMessage] - Target banner element
 * @param {number} [autoDismissMs=4000] - Duration in ms before auto-clearing (0 to disable)
 */
export function showStatus(message, type = "success", bannerEl = statusMessage, autoDismissMs = 4000) {
  if (!bannerEl) return;
  if (statusTimeout) {
    clearTimeout(statusTimeout);
    statusTimeout = null;
  }
  bannerEl.textContent = message;
  bannerEl.className = `status-banner status-banner--${type}`;

  if (autoDismissMs > 0 && typeof setTimeout !== "undefined") {
    statusTimeout = setTimeout(() => {
      clearStatus(bannerEl);
    }, autoDismissMs);
  }
}

/**
 * Clear and hide the feedback banner.
 *
 * @param {HTMLElement} [bannerEl=statusMessage] - Target banner element
 */
export function clearStatus(bannerEl = statusMessage) {
  if (!bannerEl) return;
  if (statusTimeout) {
    clearTimeout(statusTimeout);
    statusTimeout = null;
  }
  bannerEl.textContent = "";
  bannerEl.className = "status-banner visually-hidden";
}

/**
 * Check if a URL belongs to a restricted internal page or unsupported scheme.
 *
 * @param {string} url - Target URL
 * @returns {boolean} True if the page cannot be saved as a web resource
 */
export function isRestrictedUrl(url) {
  if (!url || typeof url !== "string") return true;
  const trimmed = url.trim().toLowerCase();

  if (
    trimmed.startsWith("chrome://") ||
    trimmed.startsWith("chrome-extension://") ||
    trimmed.startsWith("edge://") ||
    trimmed.startsWith("about:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("view-source:") ||
    trimmed.startsWith("devtools://") ||
    trimmed.startsWith("javascript:")
  ) {
    return true;
  }

  const check = validateUrl(trimmed);
  return !check.valid;
}

/**
 * Extract a concise text excerpt from the active webpage DOM.
 * Designed to run inside the tab context via chrome.scripting.executeScript.
 * Capped at 300 characters.
 *
 * Priority:
 * 1. Active window text selection
 * 2. Meta description (name="description", property="og:description", name="twitter:description")
 * 3. First readable paragraph (>= 20 chars)
 * 4. Empty string fallback
 *
 * @returns {string} Clean excerpt, max 300 characters
 */
export function extractPageExcerpt() {
  const MAX_EXCERPT_LENGTH = 300;

  // 1. Active selection
  try {
    const selection = window.getSelection()?.toString()?.trim();
    if (selection && selection.length > 0) {
      return selection.slice(0, MAX_EXCERPT_LENGTH);
    }
  } catch {}

  // 2. Meta description
  try {
    const metaSelectors = [
      'meta[name="description" i]',
      'meta[property="og:description" i]',
      'meta[name="twitter:description" i]',
    ];
    for (const selector of metaSelectors) {
      const metaEl = document.querySelector(selector);
      const content = metaEl?.getAttribute("content")?.trim();
      if (content && content.length > 0) {
        return content.slice(0, MAX_EXCERPT_LENGTH);
      }
    }
  } catch {}

  // 3. First substantive paragraph
  try {
    const paragraphs = document.querySelectorAll("p");
    for (const p of paragraphs) {
      const text = p.innerText?.trim() || p.textContent?.trim();
      if (text && text.length >= 20) {
        return text.slice(0, MAX_EXCERPT_LENGTH);
      }
    }
  } catch {}

  return "";
}

/**
 * Handle user clicking "Save Something" to save the active webpage as a resource.
 *
 * @param {object} [deps={}] - Injectable dependencies for unit testing
 * @returns {Promise<object|null>} The created memory, or null
 */
export async function handleSavePage({
  tabQueryFn = (typeof chrome !== "undefined" && chrome.tabs?.query) ? chrome.tabs.query.bind(chrome.tabs) : null,
  scriptExecuteFn = (typeof chrome !== "undefined" && chrome.scripting?.executeScript) ? chrome.scripting.executeScript.bind(chrome.scripting) : null,
  buttonEl = saveButton,
  statusEl = statusMessage,
  targetList = memoryList,
  searchInput = memorySearch,
  doc = (typeof document !== "undefined" ? document : null),
} = {}) {
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.setAttribute("aria-busy", "true");
  }

  try {
    if (!tabQueryFn) {
      showStatus("Tab access is unavailable.", "error", statusEl);
      return null;
    }

    const tabs = await tabQueryFn({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];

    if (!tab || !tab.url) {
      showStatus("Unable to access current tab.", "error", statusEl);
      return null;
    }

    if (isRestrictedUrl(tab.url)) {
      showStatus("Cannot save restricted browser pages.", "notice", statusEl);
      return null;
    }

    // Check for duplicate page-resource
    const existingMemories = await getAllMemories();
    if (isDuplicatePage(tab.url, existingMemories)) {
      showStatus("This page is already saved in MEMOIR.", "notice", statusEl);
      return null;
    }

    // Extract concise excerpt (max 300 characters)
    let excerpt = "";
    if (scriptExecuteFn && tab.id) {
      try {
        const results = await scriptExecuteFn({
          target: { tabId: tab.id },
          func: extractPageExcerpt,
        });
        if (results && results[0]?.result) {
          excerpt = String(results[0].result).trim().slice(0, 300);
        }
      } catch (scriptErr) {
        console.warn("MEMOIR: Script excerpt extraction failed, falling back to title:", scriptErr.message);
      }
    }

    const title = typeof tab.title === "string" ? tab.title.trim() : "";
    const content = (excerpt && excerpt.length > 0)
      ? excerpt
      : (title || tab.url || "Saved webpage");

    const memory = await createMemory({
      type: "page",
      content,
      url: tab.url,
      title,
    });

    // Refresh memory list while preserving current search query
    await loadMemories(targetList, searchInput, doc);

    showStatus("Page saved to MEMOIR.", "success", statusEl);
    return memory;
  } catch (error) {
    console.error("MEMOIR: Failed to save page:", error.message);
    showStatus(`Failed to save: ${error.message}`, "error", statusEl);
    return null;
  } finally {
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.removeAttribute("aria-busy");
    }
  }
}

if (saveButton) {
  saveButton.addEventListener("click", () => {
    handleSavePage();
  });
}

/**
 * Open and reveal the manual note composer in the popup.
 *
 * @param {object} [deps={}] - Injectable DOM elements for unit testing
 */
export function openNoteComposer({
  composerEl = noteComposer,
  toggleBtn = newNoteButton,
  titleInput = noteTitle,
  contentInput = noteContent,
} = {}) {
  if (composerEl) {
    if (typeof composerEl.classList?.remove === "function") {
      composerEl.classList.remove("hidden");
    } else if (typeof composerEl.className === "string") {
      composerEl.className = composerEl.className.replace(/\bhidden\b/g, "").trim();
    }
  }
  if (toggleBtn && typeof toggleBtn.setAttribute === "function") {
    toggleBtn.setAttribute("aria-expanded", "true");
  }
  if (titleInput && typeof titleInput.focus === "function") {
    titleInput.focus();
  } else if (contentInput && typeof contentInput.focus === "function") {
    contentInput.focus();
  }
}

/**
 * Close the manual note composer and clear its inputs.
 *
 * @param {object} [deps={}] - Injectable DOM elements for unit testing
 * @param {boolean} [deps.restoreFocus=false] - Whether to return focus to the toggle button
 */
export function closeNoteComposer({
  composerEl = noteComposer,
  toggleBtn = newNoteButton,
  titleInput = noteTitle,
  contentInput = noteContent,
  restoreFocus = false,
} = {}) {
  if (composerEl) {
    if (typeof composerEl.classList?.add === "function") {
      composerEl.classList.add("hidden");
    } else if (typeof composerEl.className === "string" && !composerEl.className.includes("hidden")) {
      composerEl.className = `${composerEl.className} hidden`.trim();
    }
  }
  if (toggleBtn && typeof toggleBtn.setAttribute === "function") {
    toggleBtn.setAttribute("aria-expanded", "false");
  }
  if (titleInput) {
    titleInput.value = "";
  }
  if (contentInput) {
    contentInput.value = "";
  }
  if (restoreFocus && toggleBtn && typeof toggleBtn.focus === "function") {
    toggleBtn.focus();
  }
}

/**
 * Toggle the manual note composer open or closed.
 *
 * @param {object} [deps={}] - Injectable DOM elements for unit testing
 */
export function toggleNoteComposer({
  composerEl = noteComposer,
  toggleBtn = newNoteButton,
  titleInput = noteTitle,
  contentInput = noteContent,
} = {}) {
  const isHidden = composerEl
    ? (typeof composerEl.classList?.contains === "function"
        ? composerEl.classList.contains("hidden")
        : (composerEl.className || "").includes("hidden"))
    : true;

  if (isHidden) {
    openNoteComposer({ composerEl, toggleBtn, titleInput, contentInput });
  } else {
    closeNoteComposer({ composerEl, toggleBtn, titleInput, contentInput, restoreFocus: true });
  }
}

/**
 * Handle saving a manual note memory.
 *
 * @param {object} [deps={}] - Injectable dependencies for unit testing
 * @returns {Promise<object|null>} The created memory, or null on failure
 */
export async function handleSaveManualNote({
  createMemoryFn = createMemory,
  loadMemoriesFn = loadMemories,
  composerEl = noteComposer,
  toggleBtn = newNoteButton,
  titleInput = noteTitle,
  contentInput = noteContent,
  saveBtn = saveNoteButton,
  statusEl = statusMessage,
  targetList = memoryList,
  searchInput = memorySearch,
  doc = (typeof document !== "undefined" ? document : null),
  restoreFocus = true,
} = {}) {
  if (saveBtn) {
    if (saveBtn.disabled) return null; // Prevent duplicate in-flight submissions
    saveBtn.disabled = true;
    if (typeof saveBtn.setAttribute === "function") {
      saveBtn.setAttribute("aria-busy", "true");
    }
  }

  const rawContent = contentInput ? contentInput.value : "";
  const trimmedContent = typeof rawContent === "string" ? rawContent.trim() : "";
  const rawTitle = titleInput ? titleInput.value : "";
  const trimmedTitle = typeof rawTitle === "string" ? rawTitle.trim() : "";

  // 1. Validation: content is required and cannot be whitespace-only
  if (trimmedContent.length === 0) {
    showStatus("Note content cannot be empty.", "error", statusEl);
    if (contentInput && typeof contentInput.focus === "function") {
      contentInput.focus();
    }
    if (saveBtn) {
      saveBtn.disabled = false;
      if (typeof saveBtn.removeAttribute === "function") {
        saveBtn.removeAttribute("aria-busy");
      }
    }
    return null;
  }

  if (trimmedContent.length > 50_000) {
    showStatus("Content exceeds maximum length of 50,000 characters.", "error", statusEl);
    if (saveBtn) {
      saveBtn.disabled = false;
      if (typeof saveBtn.removeAttribute === "function") {
        saveBtn.removeAttribute("aria-busy");
      }
    }
    return null;
  }

  if (trimmedTitle.length > 1_000) {
    showStatus("Title exceeds maximum length of 1,000 characters.", "error", statusEl);
    if (saveBtn) {
      saveBtn.disabled = false;
      if (typeof saveBtn.removeAttribute === "function") {
        saveBtn.removeAttribute("aria-busy");
      }
    }
    return null;
  }

  // 2. Persist to storage via createMemory
  let memory = null;
  try {
    memory = await createMemoryFn({
      type: "manual",
      content: trimmedContent,
      title: trimmedTitle,
    });
  } catch (error) {
    console.error("MEMOIR: Failed to save manual note:", error?.message || error);
    showStatus(`Failed to save: ${error?.message || "Storage write error"}`, "error", statusEl);
    // Keep composer open and preserve user input on failure
    return null;
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      if (typeof saveBtn.removeAttribute === "function") {
        saveBtn.removeAttribute("aria-busy");
      }
    }
  }

  // On confirmed storage success, close composer, clear inputs, and restore focus
  closeNoteComposer({ composerEl, toggleBtn, titleInput, contentInput, restoreFocus });

  // 3. Refresh list (persistence already succeeded)
  try {
    const refreshResult = await loadMemoriesFn(targetList, searchInput, doc);
    if (refreshResult === false) {
      showStatus("Note saved, but failed to refresh list.", "notice", statusEl);
    } else {
      showStatus("Note saved to MEMOIR.", "success", statusEl);
    }
  } catch (refreshError) {
    console.error("MEMOIR: Note saved but list refresh failed:", refreshError?.message || refreshError);
    showStatus("Note saved, but failed to refresh list.", "notice", statusEl);
  }

  return memory;
}

if (newNoteButton) {
  newNoteButton.addEventListener("click", () => {
    toggleNoteComposer();
  });
}

if (cancelNoteButton) {
  cancelNoteButton.addEventListener("click", () => {
    closeNoteComposer({ restoreFocus: true });
  });
}

if (saveNoteButton) {
  saveNoteButton.addEventListener("click", () => {
    handleSaveManualNote();
  });
}

if (memorySearch) {
  memorySearch.addEventListener("input", () => {
    if (allMemories !== null) {
      renderMemories(searchMemories(allMemories, memorySearch.value));
    }
  });
}

/**
 * Create a DOM card element for a single memory.
 *
 * Safe DOM rendering: user content (content, title, URL) is set strictly
 * via textContent and safe attributes (href, title, target, rel).
 *
 * Source link behavior:
 * - If memory has a valid, safe http(s) URL: renders a clickable <a> link opening the page in a new tab.
 * - If memory has no URL or an invalid/unsafe URL: renders a neutral "Source unavailable" label.
 *
 * Safe Deletion behavior:
 * - Includes an accessible delete button.
 * - Requires explicit two-step confirmation before deletion, with a cancel option.
 * - Disables action controls during in-flight deletion to prevent repeated operations.
 * - On success, refreshes the memory list while preserving the active search query.
 *
 * @param {object} memory - The memory object to render
 * @param {Document} [doc=document] - Document context
 * @param {object} [options={}] - Optional dependency overrides for testing & customization
 * @returns {HTMLElement|null} The memory card element
 */
export function createMemoryItem(
  memory,
  doc = (typeof document !== "undefined" ? document : null),
  {
    deleteFn = deleteMemory,
    onDeleted = null,
    statusEl = statusMessage,
    targetList = memoryList,
    searchInput = memorySearch,
  } = {}
) {
  if (!doc) return null;
  const item = doc.createElement("div");

  // Content — user-controlled, must use textContent
  const contentEl = doc.createElement("p");
  contentEl.textContent = memory?.content || "";
  item.appendChild(contentEl);

  // Title — user-controlled, must use textContent
  const titleEl = doc.createElement("small");
  titleEl.textContent = memory?.title || "";
  item.appendChild(titleEl);

  // Card footer: wraps source link and card action controls
  const footerEl = doc.createElement("div");
  footerEl.className = "card-footer";

  // Source link wrapper
  const linkWrapper = doc.createElement("div");
  linkWrapper.className = "card-source";
  const rawUrl = typeof memory?.url === "string" ? memory.url.trim() : "";

  if (rawUrl.length > 0) {
    const urlCheck = validateUrl(rawUrl);
    if (urlCheck.valid) {
      const linkEl = doc.createElement("a");
      linkEl.href = rawUrl;
      linkEl.textContent = rawUrl;
      linkEl.title = rawUrl;
      linkEl.target = "_blank";
      linkEl.rel = "noopener noreferrer";
      linkWrapper.appendChild(linkEl);
    } else {
      const unavailableEl = doc.createElement("span");
      unavailableEl.className = "source-unavailable";
      unavailableEl.textContent = "Source unavailable";
      linkWrapper.appendChild(unavailableEl);
    }
  } else {
    const unavailableEl = doc.createElement("span");
    unavailableEl.className = "source-unavailable";
    unavailableEl.textContent = "Source unavailable";
    linkWrapper.appendChild(unavailableEl);
  }

  footerEl.appendChild(linkWrapper);

  // Card actions: safe delete action with explicit confirmation
  const actionsWrapper = doc.createElement("div");
  actionsWrapper.className = "card-actions";

  let confirmTimeout = null;
  let isDeleting = false;

  const resetToDeleteButton = () => {
    if (confirmTimeout) {
      clearTimeout(confirmTimeout);
      confirmTimeout = null;
    }
    actionsWrapper.textContent = "";

    const deleteBtn = doc.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-card-delete";
    deleteBtn.textContent = "Delete";
    if (typeof deleteBtn.setAttribute === "function") {
      deleteBtn.setAttribute("aria-label", "Delete this memory");
      deleteBtn.setAttribute("title", "Delete memory");
    }

    if (typeof deleteBtn.addEventListener === "function") {
      deleteBtn.addEventListener("click", (e) => {
        if (e && typeof e.stopPropagation === "function") e.stopPropagation();
        showConfirmation();
      });
    }

    actionsWrapper.appendChild(deleteBtn);
  };

  const showConfirmation = () => {
    actionsWrapper.textContent = "";

    const promptSpan = doc.createElement("span");
    promptSpan.className = "delete-prompt";
    promptSpan.textContent = "Delete?";
    actionsWrapper.appendChild(promptSpan);

    const confirmBtn = doc.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "btn-confirm-delete";
    confirmBtn.textContent = "Confirm";
    if (typeof confirmBtn.setAttribute === "function") {
      confirmBtn.setAttribute("aria-label", "Confirm delete memory");
    }

    const cancelBtn = doc.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn-cancel-delete";
    cancelBtn.textContent = "Cancel";
    if (typeof cancelBtn.setAttribute === "function") {
      cancelBtn.setAttribute("aria-label", "Cancel deletion");
    }

    if (typeof cancelBtn.addEventListener === "function") {
      cancelBtn.addEventListener("click", (e) => {
        if (e && typeof e.stopPropagation === "function") e.stopPropagation();
        resetToDeleteButton();
      });
    }

    if (typeof confirmBtn.addEventListener === "function") {
      confirmBtn.addEventListener("click", async (e) => {
        if (e && typeof e.stopPropagation === "function") e.stopPropagation();
        if (isDeleting) return;
        isDeleting = true;

        if (confirmTimeout) {
          clearTimeout(confirmTimeout);
          confirmTimeout = null;
        }

        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        if (typeof confirmBtn.setAttribute === "function") {
          confirmBtn.setAttribute("aria-busy", "true");
        }
        confirmBtn.textContent = "Deleting…";

        try {
          if (!memory?.id) {
            throw new Error("Memory has no ID");
          }

          const result = await deleteFn(memory.id);
          if (result) {
            if (typeof onDeleted === "function") {
              await onDeleted();
            } else {
              await loadMemories(targetList, searchInput, doc);
            }
            showStatus("Memory deleted.", "notice", statusEl);
          } else {
            showStatus("Failed to delete memory: not found.", "error", statusEl);
            isDeleting = false;
            resetToDeleteButton();
          }
        } catch (err) {
          console.error("MEMOIR: Error deleting memory:", err?.message || err);
          showStatus(`Failed to delete: ${err?.message || "Storage error"}`, "error", statusEl);
          isDeleting = false;
          resetToDeleteButton();
        }
      });
    }

    actionsWrapper.appendChild(confirmBtn);
    actionsWrapper.appendChild(cancelBtn);

    // Auto-reset confirmation after 5 seconds of inactivity
    if (typeof setTimeout !== "undefined") {
      confirmTimeout = setTimeout(() => {
        if (!isDeleting) {
          resetToDeleteButton();
        }
      }, 5000);
    }
  };

  resetToDeleteButton();
  footerEl.appendChild(actionsWrapper);
  item.appendChild(footerEl);

  const separator = doc.createElement("hr");
  item.appendChild(separator);

  return item;
}

/**
 * Render the memory list using safe DOM APIs.
 *
 * @param {Array<object>} memories - Array of memories to display
 * @param {HTMLElement} [targetList=memoryList] - Target container element
 * @param {Document} [doc=document] - Document context
 * @param {object} [options={}] - Forwarded dependency overrides
 */
export function renderMemories(
  memories,
  targetList = memoryList,
  doc = (typeof document !== "undefined" ? document : null),
  options = {}
) {
  if (!targetList || !doc) return;
  targetList.textContent = "";

  const totalCount = allMemories ? allMemories.length : memories.length;

  if (totalCount === 0 || memories.length === 0) {
    const emptyMsg = doc.createElement("p");
    emptyMsg.textContent = totalCount === 0
      ? "No memories yet."
      : "No matching memories.";
    targetList.appendChild(emptyMsg);
    return;
  }

  for (const memory of memories) {
    const item = createMemoryItem(memory, doc, {
      targetList,
      doc,
      ...options,
    });
    if (item) {
      targetList.appendChild(item);
    }
  }
}

export async function loadMemories(
  targetList = memoryList,
  searchInput = memorySearch,
  doc = (typeof document !== "undefined" ? document : null),
  options = {}
) {
  try {
    allMemories = await getAllMemories();
    const query = searchInput ? searchInput.value : "";
    renderMemories(searchMemories(allMemories, query), targetList, doc, {
      targetList,
      searchInput,
      doc,
      ...options,
    });
    return true;
  } catch (error) {
    console.error("MEMOIR: Failed to load memories:", error.message);

    if (targetList && doc) {
      targetList.textContent = "";
      const errorMsg = doc.createElement("p");
      if (errorMsg) {
        errorMsg.textContent = "Failed to load memories. Please try again.";
        targetList.appendChild(errorMsg);
      }
    }
    return false;
  }
}

if (typeof document !== "undefined" && memoryList) {
  loadMemories();
}
