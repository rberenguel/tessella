/**
 * Pure JavaScript Haptic Feedback (ES6 Module)
 * MIT Licensed
 *
 * This module is adapted from the MIT-licensed React hook `use-haptic`.
 * It provides a simple way to trigger haptic feedback on mobile devices.
 * Original repository: https://github.com/posaune0423/use-haptic
 *
 * How to use:
 * 1. Save this code as a .js file (e.g., `haptic.js`).
 * 2. In your main script, import the functions:
 * import { initHaptic, triggerHaptic } from './haptic.js';
 * 3. Call `initHaptic()` once your application has loaded.
 * 4. Call `triggerHaptic()` to generate the haptic effect.
 */

let hapticLabel = null;

/**
 * Detects if the current device is running iOS.
 * @returns {boolean}
 */
const detectiOS = () => {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
};

/**
 * Initializes the haptic feedback elements.
 * Call this function once when your application loads.
 */
export function initHaptic() {
  if (hapticLabel || typeof document === "undefined") return;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = "es6-haptic-switch";
  input.setAttribute("switch", "");
  input.style.display = "none";
  document.body.appendChild(input);

  const label = document.createElement("label");
  label.htmlFor = "es6-haptic-switch";
  label.style.display = "none";
  document.body.appendChild(label);

  hapticLabel = label;
}

/**
 * Triggers haptic feedback.
 * @param {number} [duration=5] - Vibration duration in ms for non-iOS devices.
 */
export function triggerHaptic(duration = 5) {
  if (!hapticLabel) {
    console.warn("Haptic feedback not initialized. Call initHaptic() first.");
    return;
  }

  if (detectiOS()) {
    hapticLabel.click();
  } else if (navigator?.vibrate) {
    window?.navigator?.vibrate(duration) || navigator.vibrate(duration);
  } else {
    hapticLabel.click(); // Fallback
  }
}

export function triggerHapticError() {
  if (navigator.vibrate) {
    navigator.vibrate([5, 20, 5]);
  } else {
    triggerHaptic();
    setTimeout(() => triggerHaptic(), 120);
    setTimeout(() => triggerHaptic(), 240);
  }
}
