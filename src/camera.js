import * as dom from "./dom.js";
import * as state from "./state.js";
import { runLiveView } from "./rendering.js";

// --- Camera Constraints ---
const cameraConstraints = {
  user: { video: { facingMode: "user" } },
  environment: { video: { facingMode: "environment" } },
};

export async function startCameraWithConstraints(constraints) {
  try {
    if (dom.video.srcObject) {
      dom.video.srcObject.getTracks().forEach((track) => track.stop());
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    dom.video.srcObject = stream;
    await dom.video.play();
    state.setLive(true);
    runLiveView();
  } catch (err) {
    alert("Could not access the camera. Please grant permission.");
    console.error("Camera access error:", err);
  }
}

export function getCameraConstraints(mode) {
  return cameraConstraints[mode];
}
