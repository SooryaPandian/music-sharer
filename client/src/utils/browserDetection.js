/**
 * Browser capability detection utilities
 */

/**
 * Check if the browser supports getDisplayMedia (screenshare/tab audio capture)
 * @returns {boolean} True if supported, false otherwise
 */
export function supportsScreenCapture() {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getDisplayMedia
  );
}

/**
 * Detect if the user is on a mobile device
 * @returns {boolean} True if mobile, false otherwise
 */
export function isMobileDevice() {
  // Check for touch support and screen size
  const hasTouchScreen = (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  );

  // Check user agent for mobile patterns
  const mobilePattern = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const isMobileUA = mobilePattern.test(navigator.userAgent);

  // Check screen size (mobile devices typically have smaller screens)
  const isSmallScreen = window.innerWidth <= 768;

  // Consider it mobile if it matches UA pattern or (has touch AND small screen)
  return isMobileUA || (hasTouchScreen && isSmallScreen);
}

/**
 * Get browser capabilities and user-friendly messages
 * @returns {Object} Capabilities object with canBroadcast flag and message
 */
export function getBrowserCapabilities() {
  const isMobile = isMobileDevice();
  const hasScreenCapture = supportsScreenCapture();

  if (isMobile) {
    return {
      canBroadcast: false,
      reason: 'mobile',
      message: '📱 Use desktop to share audio. You can still join and listen!',
    };
  }

  if (!hasScreenCapture) {
    return {
      canBroadcast: false,
      reason: 'no-screenshare',
      message: '🚫 Your browser doesn\'t support audio sharing. You can still join and listen!',
    };
  }

  return {
    canBroadcast: true,
    reason: null,
    message: null,
  };
}
