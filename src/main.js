import { get, set, del } from "../libs/idb-keyval.js";
import { initHaptic } from "./haptic.js";
import * as dom from "./dom.js";
import * as state from "./state.js";
import * as config from "./config.js";
import { loadPalette, getColorsFromSource } from "./palette.js";
import {
  setupEventListeners,
  setPermissionNeededUI,
  clearPermissionNeededUI,
} from "./ui.js";
import { startCameraWithConstraints, getCameraConstraints } from "./camera.js";

async function fetchSelfManifest() {
  try {
    const response = await fetch("./manifest.json");
    if (response.ok) {
      let loadedManifest = await response.text();
      let version = JSON.parse(loadedManifest).version;
      dom.modalContent.querySelector("#version").innerHTML = dom.modalContent
        .querySelector("#version")
        .innerHTML.replace("{{version}}", version);
      console.log("Version fetched.");
    } else {
      console.warn("Failed to fetch manifest", response.statusText);
    }
  } catch (error) {
    console.error("Error fetching manifest: ", error);
  }
}

const isMobile = () => "ontouchstart" in window || navigator.maxTouchPoints > 0;

const needsStandalone = () => {
  const standaloneiOS = window.navigator.standalone === true;
  const standaloneAndroid = window.matchMedia(
    "(display-mode: standalone)",
  ).matches;
  return isMobile() && !standaloneiOS && !standaloneAndroid && !config.DEBUG;
};

async function init() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js")
        .then((registration) => {
          console.log("Service Worker registered:", registration);

          // Check for updates every 60 seconds
          setInterval(() => {
            console.log("Checking for service worker updates...");
            registration.update();
          }, 60000);

          // Listen for updates
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            console.log("Service Worker: Update found!");

            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "activated") {
                console.log("Service Worker: New version activated!");
                // Optionally reload the page to get the new version
                if (confirm("A new version is available! Reload to update?")) {
                  window.location.reload();
                }
              }
            });
          });

          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: "CACHE_PALETTES",
              palettes: config.BUILT_IN_PALETTES,
            });
          }
        })
        .catch((error) => {
          console.log("Service Worker registration failed:", error);
        });
    });
  }

  await fetchSelfManifest();
  const w = window.outerWidth;
  const h = window.outerHeight;
  if (h >= w) {
    state.setPortraitHeight(h);
    state.setPortraitWidth(w);
  } else {
    state.setPortraitHeight(w);
    state.setPortraitWidth(h);
  }
  dom.canvas.width = w;
  dom.canvas.height = h;
  initHaptic();
  state.setDesktop(!isMobile());

  console.log("Checking if needs standalone...");
  console.log("isMobile:", isMobile());
  console.log("window.navigator.standalone:", window.navigator.standalone);
  console.log(
    "display-mode standalone:",
    window.matchMedia("(display-mode: standalone)").matches,
  );
  console.log("config.DEBUG:", config.DEBUG);
  console.log("needsStandalone():", needsStandalone());

  if (needsStandalone()) {
    console.log("Needs standalone - showing modal");
    dom.infoModal.style.display = "block";
    const modalContent = dom.infoModal.querySelector("#modal-content");
    modalContent.innerHTML =
      "<h3>📱 Install as PWA</h3>" +
      "<p>Please install as a standalone web app (Usually share → Add to Home Screen)</p>" +
      "<p>Otherwise the sizing and the buttons don't work as well.</p>" +
      "<p>You can always remove it later 😀</p>" +
      "<hr/>" +
      "<h4>⚠️ Important: Camera Permission</h4>" +
      "<p>iOS requires camera permission to be granted <strong>before</strong> installing the PWA.</p>" +
      "<p><strong>Click the button below to grant permission now:</strong></p>" +
      "<button id='grant-camera-permission-btn' style='padding: 12px 24px; background-color: #e23d28; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; margin: 10px 0;'>📸 Grant Camera Permission</button>" +
      "<p id='permission-status' style='margin-top: 10px; font-weight: bold;'></p>" +
      "<hr/>" +
      "<p style='font-size: 14px;'><em>After granting permission, install the app and the camera will work!</em></p>";

    state.setLive(false);

    // Add event listener for the permission button
    const grantBtn = document.getElementById("grant-camera-permission-btn");
    const statusMsg = document.getElementById("permission-status");

    grantBtn.addEventListener("click", async () => {
      grantBtn.disabled = true;
      grantBtn.textContent = "Requesting permission...";
      statusMsg.textContent = "";
      statusMsg.style.color = "";

      try {
        // Request camera permission
        const { startCameraWithConstraints, getCameraConstraints } =
          await import("./camera.js");
        await startCameraWithConstraints(getCameraConstraints("environment"));

        // Success!
        statusMsg.textContent =
          "✅ Camera permission granted! You can now install the PWA.";
        statusMsg.style.color = "#4CAF50";
        grantBtn.textContent = "✓ Permission Granted";
        grantBtn.style.backgroundColor = "#4CAF50";

        // Stop the camera so it doesn't keep running
        setTimeout(() => {
          const videoElement = document.getElementById("videoFeed");
          if (videoElement?.srcObject) {
            videoElement.srcObject.getTracks().forEach((track) => track.stop());
          }
        }, 1000);
      } catch (err) {
        // Failed
        console.error("Permission request failed:", err);
        statusMsg.textContent =
          "❌ Permission denied. Please try again or check Settings.";
        statusMsg.style.color = "#f44336";
        grantBtn.disabled = false;
        grantBtn.textContent = "📸 Try Again";
      }
    });

    return;
  }

  // --- Palette Loading Refactor ---

  // 1. Load built-in palettes
  const builtInPalettes = await Promise.all(
    config.BUILT_IN_PALETTES.map(async (src) => {
      const colors = await getColorsFromSource(src);
      const name = src
        .split("/")
        .pop()
        .replace(/-32x\.png$/, "")
        .replace(/-/g, " ");
      return { id: src, name, colors, isCustom: false };
    }),
  );
  state.setAllPalettes(builtInPalettes);

  // 2. Migration for old custom palette
  const oldCustomPalette = await get("customPalette");
  if (oldCustomPalette) {
    const colors = await getColorsFromSource(oldCustomPalette);
    const newCustomPalette = {
      id: `custom-${Date.now()}`,
      name: "My Palette",
      colors,
      isCustom: true,
    };
    await set("customPalettes", [newCustomPalette]);
    await del("customPalette");
    console.log("Migrated old custom palette.");
  }

  // 3. Load new custom palettes
  const customPalettes = (await get("customPalettes")) || [];
  state.allPalettes.push(...customPalettes);

  // 4. Load last used palette
  const savedPaletteId =
    localStorage.getItem("savedPalette") || state.allPalettes[0].id;
  let paletteIndex = state.allPalettes.findIndex(
    (p) => p.id === savedPaletteId,
  );
  if (paletteIndex === -1) {
    console.warn("Saved palette not found, defaulting to first palette.");
    paletteIndex = 0;
  }

  state.setCurrentPaletteIndex(paletteIndex);
  await loadPalette(state.allPalettes[paletteIndex]);

  // --- Camera Permission Handling ---
  if (!state.isDesktop) {
    const cameraPermissionGranted = await get("cameraPermissionGranted");

    if (cameraPermissionGranted === true) {
      // Try to start camera - if it fails, permission was revoked
      try {
        await startCameraWithConstraints(getCameraConstraints("environment"));
        // Camera started successfully - ensure no blinking
        clearPermissionNeededUI();
      } catch (err) {
        // Permission was revoked - UI state already set by startCameraWithConstraints
        setPermissionNeededUI();
      }
    } else {
      // No permission yet or previously denied
      setPermissionNeededUI();
    }
  }

  setupEventListeners();
}

init();
