
import { get, set } from "../libs/idb-keyval.js";
import * as dom from "./dom.js";
import * as state from "./state.js";
import * as config from "./config.js";
import { triggerHaptic } from "./haptic.js";
import { loadPalette, getColorsFromSource } from "./palette.js";
import { drawScene, runLiveView } from "./rendering.js";
import { startCameraWithConstraints, getCameraConstraints } from "./camera.js";

async function handleShutterClickMobile() {
  state.setLive(!state.isLive);
  if (state.isLive) {
    runLiveView();
    dom.shutterBtn.classList.remove("active");
  } else {
    setTimeout(() => triggerHaptic(), 50);
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = dom.video.videoWidth;
    tempCanvas.height = dom.video.videoHeight;
    tempCanvas.getContext("2d").drawImage(dom.video, 0, 0);
    state.setFrozenFrameSource(tempCanvas);
    dom.shutterBtn.classList.add("active");
    await drawScene(state.frozenFrameSource);
  }
}

async function handleImageFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = async () => {
      if (img.width === 32 || img.height === 32) {
        const dataUrl = img.src;
        await set("customPalette", dataUrl); // Save the new palette
        await loadPalette(dataUrl); // Load it
        alert("Custom palette loaded and saved!");

        let palettes = state.allPalettes.filter((p) => !p.startsWith("data:image"));
        palettes.push(dataUrl);
        state.setAllPalettes(palettes);
        state.setCurrentPaletteIndex(state.allPalettes.length - 1);

        const source = state.isLive
          ? dom.video
          : state.frozenFrameSource || document.createElement("canvas");
        await drawScene(source);
      } else {
        state.setLive(false);
        dom.shutterBtn.classList.add("active");
        state.setFrozenFrameSource(img);
        await drawScene(state.frozenFrameSource);
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

const isLandscape = () => window.outerWidth > window.outerHeight;

const landscaping = () => {
  if (isLandscape()) {
    document.body.classList.add("landscape");
  } else {
    document.body.classList.remove("landscape");
  }
};

export function setupEventListeners() {
  dom.imageInput.addEventListener("change", handleImageFile);
  dom.loadBtn.addEventListener("click", () => dom.imageInput.click());

  if (state.isDesktop) {
    dom.shutterBtn.addEventListener("click", () => dom.imageInput.click());
  } else {
    startCameraWithConstraints(getCameraConstraints("environment"));
    dom.shutterBtn.addEventListener("click", handleShutterClickMobile);
  }

  dom.resToggleBtn.addEventListener("click", async () => {
    triggerHaptic();
    state.setLowRes(!state.isLowRes);
    dom.resToggleBtn.classList.toggle("active", state.isLowRes);
    if (!state.isLive && state.frozenFrameSource) await drawScene(state.frozenFrameSource);
  });

  dom.ditherToggleBtn.addEventListener("click", async () => {
    triggerHaptic();
    state.setDithering(!state.isDithering);
    dom.ditherToggleBtn.classList.toggle("active", state.isDithering);
    if (!state.isLive && state.frozenFrameSource) await drawScene(state.frozenFrameSource);
  });

  dom.reverseCameraBtn.addEventListener("click", () => {
    triggerHaptic();
    state.setFrontCamera(!state.isFrontCamera);
    state.setLive(true);
    dom.shutterBtn.classList.remove("active");
    if (state.isFrontCamera) {
      dom.reverseCameraBtn.querySelector("span").classList.add("iconoir-lens");
      dom.reverseCameraBtn.querySelector("span").classList.remove("iconoir-face-id");
    } else {
      dom.reverseCameraBtn.querySelector("span").classList.remove("iconoir-lens");
      dom.reverseCameraBtn.querySelector("span").classList.add("iconoir-face-id");
    }
    const mode = state.isFrontCamera ? "user" : "environment";
    startCameraWithConstraints(getCameraConstraints(mode));
  });

  document.getElementById("palette").addEventListener("click", async (event) => {
    if (event.target.closest("#settingsBtn")) {
      return;
    }
    triggerHaptic();
    state.setCurrentPaletteIndex((state.currentPaletteIndex + 1) % state.allPalettes.length);
    await loadPalette(state.allPalettes[state.currentPaletteIndex]);
    const source = state.isLive ? dom.video : state.frozenFrameSource || document.createElement("canvas");
    drawScene(source);
  });

  const handleOrientationAndResize = () => {
    landscaping();
    if (isLandscape()) {
      dom.canvas.width = state.portraitHeight;
      dom.canvas.height = state.portraitWidth;
    } else {
      dom.canvas.width = state.portraitWidth;
      dom.canvas.height = state.portraitHeight;
    }
    const source = state.isLive ? dom.video : state.frozenFrameSource || document.createElement("canvas");
    drawScene(source);
  };

  window.addEventListener("resize", handleOrientationAndResize);
  window.addEventListener("load", handleOrientationAndResize);

  let pressTimer = null;
  const startPress = (e) => {
    e.preventDefault();
    pressTimer = setTimeout(async () => {
      if (!state.lastProcessedFrame) return;
      try {
        const blob = await new Promise((resolve) => {
          const upscaleFactor = 8;
          const originalUpscaledWidth = state.lastProcessedFrame.width * upscaleFactor;
          const originalUpscaledHeight = state.lastProcessedFrame.height * upscaleFactor;
          let newUpscaledWidth = originalUpscaledWidth;
          let newUpscaledHeight = originalUpscaledHeight;
          const PALETTE_STRIP_SIZE = 32;
          const isPortrait = state.lastProcessedFrame.height > state.lastProcessedFrame.width;
          if (isPortrait) {
            newUpscaledHeight += PALETTE_STRIP_SIZE;
          } else {
            newUpscaledWidth += PALETTE_STRIP_SIZE;
          }
          const upscaledCanvas = document.createElement("canvas");
          upscaledCanvas.width = newUpscaledWidth;
          upscaledCanvas.height = newUpscaledHeight;
          const upscaledCtx = upscaledCanvas.getContext("2d");
          upscaledCtx.imageSmoothingEnabled = false;
          upscaledCtx.drawImage(state.lastProcessedFrame, 0, 0, originalUpscaledWidth, originalUpscaledHeight);
          if (state.currentPalette && state.currentPalette.length > 0) {
            if (isPortrait) {
              const swatchHeight = PALETTE_STRIP_SIZE;
              const swatchWidth = newUpscaledWidth / state.currentPalette.length;
              state.currentPalette.forEach((color, index) => {
                upscaledCtx.fillStyle = `rgb(${color.join(",")})`;
                upscaledCtx.fillRect(index * swatchWidth, originalUpscaledHeight, swatchWidth, swatchHeight);
              });
            } else {
              const swatchWidth = PALETTE_STRIP_SIZE;
              const swatchHeight = newUpscaledHeight / state.currentPalette.length;
              state.currentPalette.forEach((color, index) => {
                upscaledCtx.fillStyle = `rgb(${color.join(",")})`;
                upscaledCtx.fillRect(originalUpscaledWidth, index * swatchHeight, swatchWidth, swatchHeight);
              });
            }
          }
          upscaledCanvas.toBlob(resolve, "image/png");
        });
        const file = new File([blob], `tessella-${Date.now()}.png`, { type: "image/png" });
        if (!state.isDesktop && navigator.share && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "Tesseŀla" });
        } else {
          const link = document.createElement("a");
          link.download = file.name;
          link.href = URL.createObjectURL(blob);
          link.click();
          URL.revokeObjectURL(link.href);
        }
      } catch (err) {
        if (err.name !== "AbortError") console.error("Share/Download failed:", err);
      }
    }, 500);
  };

  const cancelPress = () => clearTimeout(pressTimer);
  dom.canvas.addEventListener("mousedown", startPress);
  dom.canvas.addEventListener("touchstart", startPress, { passive: false });
  dom.canvas.addEventListener("mouseup", cancelPress);
  dom.canvas.addEventListener("mouseleave", cancelPress);
  dom.canvas.addEventListener("touchend", cancelPress);
  dom.canvas.addEventListener("touchcancel", cancelPress);
  dom.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  const paletteModalCloseBtn = dom.paletteModal.querySelector(".close-button");

  let wasLiveBeforeModal = false;
  const populateAndShowPaletteModal = async () => {
    wasLiveBeforeModal = state.isLive;
    state.setLive(false);
    dom.paletteGrid.innerHTML = "";

    const getPaletteName = (source) => {
      if (source.startsWith('data:')) return 'Custom';
      const filename = source.split('/').pop();
      return filename.replace(/-32x\.png$/, '').replace(/-/g, ' ');
    };

    for (const [index, source] of state.allPalettes.entries()) {
      const item = document.createElement("div");
      item.className = "palette-grid-item";

      const name = document.createElement("div");
      name.className = "palette-name";
      name.textContent = getPaletteName(source);
      item.appendChild(name);

      const swatchContainer = document.createElement("div");
      swatchContainer.className = "mini-swatch-container";
      const colors = state.loadedPalettes.get(source);
      colors.forEach((color) => {
        const swatch = document.createElement("div");
        swatch.className = "mini-swatch";
        swatch.style.backgroundColor = `rgb(${color.join(",")})`;
        swatchContainer.appendChild(swatch);
      });
      item.appendChild(swatchContainer);

      item.addEventListener("click", async () => {
        state.setCurrentPaletteIndex(index);
        await loadPalette(source);
        const redrawSource = state.isLive ? dom.video : state.frozenFrameSource || document.createElement("canvas");
        drawScene(redrawSource);
        dom.paletteModal.style.display = "none";
        if (wasLiveBeforeModal) {
          state.setLive(true);
          runLiveView();
        }
      });
      dom.paletteGrid.appendChild(item);
    }
    dom.paletteModal.style.display = "block";
  };

  interact("#palette").on("hold", async (event) => {
    if (event.target.closest("#settingsBtn")) {
      return;
    }
    await populateAndShowPaletteModal();
  });

  paletteModalCloseBtn.addEventListener("click", () => {
    dom.paletteModal.style.display = "none";
    if (wasLiveBeforeModal) {
      state.setLive(true);
      runLiveView();
    }
  });

  dom.settingsBtn.addEventListener("click", () => {
    dom.infoModal.style.display = "block";
    state.setLive(false);
  });

  Array.from(dom.closeButton).map((c) =>
    c.addEventListener("click", () => {
      dom.infoModal.style.display = "none";
    })
  );

  window.addEventListener("click", (event) => {
    if (event.target == dom.infoModal) {
      dom.infoModal.style.display = "none";
    }
  });

  setInterval(() => {
    landscaping();
    let resized = false;
    if (isLandscape()) {
      document.body.classList.add("landscape");
      if (dom.canvas.width !== state.portraitHeight || dom.canvas.height !== state.portraitWidth) {
        dom.canvas.width = state.portraitHeight;
        dom.canvas.height = state.portraitWidth;
        resized = true;
      }
    } else {
      document.body.classList.remove("landscape");
      if (dom.canvas.width !== state.portraitWidth || dom.canvas.height !== state.portraitHeight) {
        dom.canvas.width = state.portraitWidth;
        dom.canvas.height = state.portraitHeight;
        resized = true;
      }
    }

    if (resized) {
      const source = state.isLive ? dom.video : state.frozenFrameSource || document.createElement("canvas");
      drawScene(source);
    }
  }, 500);
}
