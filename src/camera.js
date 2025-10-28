import { get, set } from "../libs/idb-keyval.js";
import * as dom from "./dom.js";
import * as state from "./state.js";
import { runLiveView } from "./rendering.js";

// --- Camera Constraints ---
const cameraConstraints = {
  user: { video: { facingMode: { ideal: "user" } } },
  environment: { video: { facingMode: { ideal: "environment" } } },
};

export async function startCameraWithConstraints(constraints) {
  console.log("=== startCameraWithConstraints called ===");
  console.log("Constraints:", constraints);
  console.log("Is secure context:", window.isSecureContext);
  console.log("Protocol:", window.location.protocol);
  console.log("Hostname:", window.location.hostname);
  console.log(
    "Display mode:",
    window.matchMedia("(display-mode: standalone)").matches
      ? "standalone"
      : "browser",
  );
  console.log("navigator.mediaDevices available:", !!navigator.mediaDevices);
  console.log(
    "getUserMedia available:",
    !!navigator.mediaDevices?.getUserMedia,
  );

  // CRITICAL FOR iOS: Request camera access IMMEDIATELY before any awaits
  // iOS Safari requires getUserMedia to be called synchronously in user gesture
  let streamPromise;
  try {
    console.log("Creating getUserMedia promise NOW (synchronously)");
    streamPromise = navigator.mediaDevices.getUserMedia(constraints);
    console.log("getUserMedia promise created successfully");
  } catch (err) {
    console.error("Failed to create getUserMedia promise synchronously:", err);
    throw err;
  }

  try {
    // Now we can do cleanup while the permission prompt is showing
    if (dom.video.srcObject) {
      console.log("Stopping existing video tracks");
      dom.video.srcObject.getTracks().forEach((track) => track.stop());
    }

    // Wait for the stream (permission prompt happens here)
    console.log("Waiting for getUserMedia to resolve...");
    const stream = await streamPromise;
    console.log("getUserMedia resolved successfully, got stream:", stream);

    dom.video.srcObject = stream;
    dom.video.muted = true;
    dom.video.autoplay = true;
    dom.video.setAttribute("playsinline", "true");
    try {
      await dom.video.play();
    } catch (playErr) {
      console.error("Video play error:", playErr);
      alert("Could not play the video stream.");
    }
    // Permission granted successfully
    await set("cameraPermissionGranted", true);
    state.setLive(true);
    runLiveView();
  } catch (err) {
    // Permission denied or other error - always mark as false
    await set("cameraPermissionGranted", false);

    if (err.name === "NotAllowedError") {
      // User denied permission or permission was revoked
      console.error("Camera permission denied:", err.message);
      console.error("This could mean:");
      console.error("1. User explicitly denied permission in the prompt");
      console.error("2. Camera permission is blocked in Safari Settings");
      console.error("3. Camera permission is blocked in iOS Settings");
      console.error("4. Self-signed certificate is not trusted");
      console.error(
        "5. Running as standalone PWA without prior Safari permission",
      );

      // Check if running as standalone PWA
      const isStandalone = window.matchMedia(
        "(display-mode: standalone)",
      ).matches;
      const isSecure = window.isSecureContext;

      let message = "Camera access denied.\n\n";

      if (isStandalone) {
        // Standalone PWA - most likely cause
        message +=
          "⚠️ STANDALONE PWA DETECTED\n\n" +
          "iOS requires camera permission to be granted in Safari BEFORE using the PWA.\n\n" +
          "FIX:\n" +
          "1. Open this site in Safari (not the PWA)\n" +
          "2. Grant camera permission when prompted\n" +
          "3. Return to this PWA and try again\n\n" +
          "OR:\n" +
          "iOS Settings → Safari → Camera → Allow";
      } else if (!isSecure) {
        message +=
          "⚠️ INSECURE CONTEXT\n\n" +
          "Camera requires HTTPS with trusted certificate.\n\n" +
          "FIX:\n" +
          "iOS Settings → General → About → Certificate Trust Settings\n" +
          "Enable trust for your certificate";
      } else {
        message +=
          "Please check:\n" +
          "1. iOS Settings → Safari → Camera → Allow\n" +
          "2. Clear site data: Safari → Aa → Website Settings\n" +
          "3. Ensure certificate is trusted";
      }

      alert(message);
      throw err; // Re-throw to let caller handle UI state
    } else {
      alert("Could not access the camera. Please grant permission.");
      console.error("Camera access error:", err.name, err.message);
      console.error(err);
    }
  }
}

export function getCameraConstraints(mode) {
  return cameraConstraints[mode];
}
