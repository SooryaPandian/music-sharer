/**
 * Generate a shareable URL for a room
 * @param {string} roomCode - Room code
 * @returns {string} - Shareable URL
 */
export function generateShareUrl(roomCode) {
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?room=${roomCode}`;
}

/**
 * Check URL for room code
 * @returns {string|null} - Room code from URL or null
 */
export function getRoomFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get("room");
  return roomParam ? roomParam.toUpperCase() : null;
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} - Whether copy was successful
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
