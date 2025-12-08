// User name management module

import { nameModal, nameInput, userNameDisplay, roomCodeInput } from "./dom.js";
import { setUserName, getUserName } from "./state.js";

// Store callback for after name is saved
let pendingAction = null;

/**
 * Load user name from localStorage
 */
export function loadUserName() {
  const savedName = localStorage.getItem("musicSharerUserName");
  if (savedName) {
    setUserName(savedName);
    userNameDisplay.textContent = savedName;
  }
}

/**
 * Show the name input modal
 * @param {string} context - Context: 'create', 'join', or 'edit'
 * @param {Function} callback - Callback to execute after name is saved
 */
export function showNameModal(context, callback) {
  nameInput.value = getUserName() || "";
  nameModal.classList.remove("hidden");
  nameInput.focus();
  nameModal.dataset.context = context;
  pendingAction = callback;
}

/**
 * Save name from input and execute pending action
 */
export function saveName() {
  const name = nameInput.value.trim();
  if (!name) {
    alert("Please enter a name");
    return;
  }

  setUserName(name);
  localStorage.setItem("musicSharerUserName", name);
  userNameDisplay.textContent = name;
  nameModal.classList.add("hidden");

  // Execute pending action if exists
  if (pendingAction) {
    const context = nameModal.dataset.context;
    pendingAction(context);
    pendingAction = null;
  }
}

/**
 * Check URL for room code and auto-fill
 * @returns {boolean} - Whether a room code was found
 */
export function checkUrlForRoom() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get("room");

  if (roomParam) {
    roomCodeInput.value = roomParam.toUpperCase();
    return true;
  }
  return false;
}
