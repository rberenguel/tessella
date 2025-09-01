import { get, set, del } from "../libs/idb-keyval.js";
import { initHaptic } from "./haptic.js";
import * as dom from "./dom.js";
import * as state from "./state.js";
import * as config from "./config.js";
import { loadPalette, getColorsFromSource } from "./palette.js";
import { setupEventListeners } from "./ui.js";

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

  if (needsStandalone()) {
    console.log("Needs standalone");
    dom.infoModal.style.display = "block";
    (dom.infoModal.querySelector("#modal-content").innerHTML =
      "Please install as a standalone web app (Usually share -> Add to Home Screen)<br/>Otherwise the sizing and the buttons don't work as well.<br/>You can always remove it later 😀"),
      state.setLive(false);
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

  setupEventListeners();
}

init();
