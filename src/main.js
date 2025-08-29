import { get } from "../libs/idb-keyval.js";
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
  const standaloneAndroid = window.matchMedia("(display-mode: standalone)").matches;
  return isMobile() && !standaloneiOS && !standaloneAndroid && !config.DEBUG;
};

async function init() {
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

  for (const paletteSrc of config.BUILT_IN_PALETTES) {
    state.addLoadedPalette(paletteSrc, await getColorsFromSource(paletteSrc));
  }
  state.setAllPalettes([...config.BUILT_IN_PALETTES]);

  const customPalette = await get("customPalette");
  if (customPalette) {
    state.addLoadedPalette(customPalette, await getColorsFromSource(customPalette));
    state.allPalettes.push(customPalette);
  }

  const savedPaletteSrc = localStorage.getItem("savedPalette") || state.allPalettes[0];
  try {
    if (!state.allPalettes.includes(savedPaletteSrc)) {
      throw new Error("Saved palette not found in available palettes.");
    }
    state.setCurrentPaletteIndex(state.allPalettes.indexOf(savedPaletteSrc));
    await loadPalette(savedPaletteSrc);
  } catch (err) {
    console.warn("Palette could not be found or is invalid, defaulting.", err);
    state.setCurrentPaletteIndex(0);
    await loadPalette(state.allPalettes[0]);
  }

  setupEventListeners();
}

init();
