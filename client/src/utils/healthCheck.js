import { HTTP_SERVER_URL } from '../config';

const HEALTH_CHECK_INTERVAL = 3000; // 3 seconds
const HEALTH_CHECK_TIMEOUT = 60000; // 60 seconds (allows for 50s cold start)

/**
 * Check server health by calling /health endpoint
 * @returns {Promise<{available: boolean, starting?: boolean}>}
 */
export async function checkServerHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout per request

    const response = await fetch(`${HTTP_SERVER_URL}/health`, {
      signal: controller.signal,
      method: 'GET',
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      console.log('[HealthCheck] ✅ Server is available:', data);
      return { available: true };
    } else if (response.status === 503) {
      // Service unavailable - server is starting
      console.log('[HealthCheck] 🔄 Server is starting (503)');
      return { available: false, starting: true };
    } else {
      console.log('[HealthCheck] ⚠️ Server responded with status:', response.status);
      return { available: false, starting: false };
    }
  } catch (error) {
    // Network errors, CORS issues, or timeouts usually indicate cold start
    if (error.name === 'AbortError') {
      console.log('[HealthCheck] ⏱️ Request timeout - server may be starting');
      return { available: false, starting: true };
    } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      console.log('[HealthCheck] 🌐 Network error - server may be starting');
      return { available: false, starting: true };
    } else {
      console.error('[HealthCheck] ❌ Unexpected error:', error);
      return { available: false, starting: false };
    }
  }
}

/**
 * Wait for server to be ready by polling health endpoint
 * @param {Function} onProgress - Callback for progress updates (elapsed time)
 * @returns {Promise<void>} - Resolves when server is ready, rejects on timeout
 */
export async function waitForServerReady(onProgress) {
  const startTime = Date.now();
  let attempt = 0;

  console.log('[HealthCheck] 🔍 Starting health check polling...');
  console.log('[HealthCheck] Target URL:', HTTP_SERVER_URL);
  console.log('[HealthCheck] Timeout:', HEALTH_CHECK_TIMEOUT / 1000, 'seconds');

  while (true) {
    attempt++;
    const elapsed = Date.now() - startTime;

    // Report progress
    if (onProgress) {
      onProgress(Math.floor(elapsed / 1000));
    }

    // Check if timeout exceeded
    if (elapsed >= HEALTH_CHECK_TIMEOUT) {
      console.error('[HealthCheck] ❌ Timeout reached after', elapsed / 1000, 'seconds');
      throw new Error('SERVER_TIMEOUT');
    }

    console.log(`[HealthCheck] Attempt ${attempt} (${Math.floor(elapsed / 1000)}s elapsed)`);

    // Check server health
    const result = await checkServerHealth();

    if (result.available) {
      console.log('[HealthCheck] ✅ Server is ready!');
      return;
    }

    if (result.starting) {
      console.log('[HealthCheck] 🔄 Server is starting, will retry...');
    } else {
      console.warn('[HealthCheck] ⚠️ Server check failed, will retry...');
    }

    // Wait before next attempt
    await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
  }
}
