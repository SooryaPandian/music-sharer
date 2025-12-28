import { HTTP_SERVER_URL } from '../config';

const HEALTH_CHECK_TIMEOUT = 60000; // 60 seconds
const RETRY_INTERVAL = 1000; // 1 second

/**
 * Check if the server is available
 * @returns {Promise<boolean>} True if server is available, false otherwise
 */
async function checkServerHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`${HTTP_SERVER_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return data.status === 'ok';
    }

    return response.status === 503; // Server starting
  } catch (error) {
    if (error.name === 'AbortError') {
      return false; // Timeout
    }
    return false; // Network or other error
  }
}

/**
 * Wait for the server to be ready with a timeout
 * @param {Function} onProgress - Callback for progress updates (elapsed time)
 * @returns {Promise<boolean>} True if server is ready, false if timeout
 */
export async function waitForServerReady(onProgress) {
  const startTime = Date.now();

  while (true) {
    const elapsed = Date.now() - startTime;

    if (elapsed >= HEALTH_CHECK_TIMEOUT) {
      throw new Error('Server health check timeout');
    }

    const attempt = Math.floor(elapsed / RETRY_INTERVAL) + 1;

    if (onProgress) {
      onProgress(elapsed);
    }

    const isHealthy = await checkServerHealth();

    if (isHealthy) {
      return true;
    }

    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL));
  }
}
