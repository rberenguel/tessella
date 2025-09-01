import { get, set } from "../libs/idb-keyval.js";
import * as dom from "./dom.js";
import * as state from "./state.js";
import { triggerHaptic } from "./haptic.js";
import { loadPalette } from "./palette.js";
import { drawScene, runLiveView } from "./rendering.js";
import { startCameraWithConstraints, getCameraConstraints } from "./camera.js";

// --- DOM Elements for Palette Extractor ---
const extractorModal = document.getElementById("paletteExtractorModal");
const colorCountSlider = document.getElementById("color-count");
const colorCountValue = document.getElementById("color-count-value");
const paletteCanvas = document.getElementById("palette-canvas");
const paletteImage = document.getElementById("palette-image");
const resultContainer = document.getElementById("extractor-result-container");
const initialMessage = document.getElementById("extractor-initial-message");
const colorMatrix = document.getElementById("color-matrix");
const savePaletteBtn = document.getElementById("save-palette-btn");
const cancelPaletteBtn = document.getElementById("cancel-palette-btn");
const newPaletteNameInput = document.getElementById("new-palette-name");

// --- Palette Extractor State ---
let fullPalette = [];
let selectedColors = [];
let processing = false;
const colorThief = new ColorThief();

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
      // This function now only processes images to be pixelated, not palettes.
      state.setLive(false);
      dom.shutterBtn.classList.add("active");
      state.setFrozenFrameSource(img);
      await drawScene(state.frozenFrameSource);
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

// --- Palette Extractor Logic ---

function getLuminosity(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function drawPaletteImage() {
  const ctx = paletteCanvas.getContext("2d");
  const blockSize = 32;

  if (selectedColors.length === 0) {
    paletteCanvas.width = blockSize;
    paletteCanvas.height = blockSize;
    ctx.clearRect(0, 0, blockSize, blockSize);
  } else {
    paletteCanvas.width = selectedColors.length * blockSize;
    paletteCanvas.height = blockSize;
    selectedColors.forEach((color, i) => {
      ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
      ctx.fillRect(i * blockSize, 0, blockSize, blockSize);
    });
  }
  paletteImage.src = paletteCanvas.toDataURL("image/png");
  savePaletteBtn.disabled = selectedColors.length === 0;
}

function toggleColorSelection(index, swatchElement) {
  swatchElement.classList.toggle("selected");
  const color = fullPalette[index];
  const isSelected = swatchElement.classList.contains("selected");

  if (isSelected) {
    selectedColors.push(color);
  } else {
    selectedColors = selectedColors.filter(
      (c) => JSON.stringify(c) !== JSON.stringify(color),
    );
  }

  selectedColors.sort((a, b) => getLuminosity(a) - getLuminosity(b));
  drawPaletteImage();
}

function renderColorMatrix() {
  colorMatrix.innerHTML = "";
  fullPalette.forEach((color, index) => {
    const swatch = document.createElement("div");
    swatch.className = "color-swatch selected";
    swatch.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    swatch.dataset.colorIndex = index;

    swatch.addEventListener("click", () => {
      toggleColorSelection(index, swatch);
    });

    colorMatrix.appendChild(swatch);
  });
}

async function handlePaletteImageFile(event) {
  if (processing || event.target.files.length === 0) return;
  state.setLive(false);
  processing = true;
  const file = event.target.files[0];
  const reader = new FileReader();

  reader.onload = (e) => {
    const img = new Image();

    img.onload = () => {
      extractorModal.style.display = "block";
      initialMessage.classList.add("hidden");
      resultContainer.classList.add("hidden");

      setTimeout(() => {
        const k = parseInt(colorCountSlider.value, 10);
        fullPalette = colorThief.getPalette(img, k);
        fullPalette.sort((a, b) => getLuminosity(a) - getLuminosity(b));
        selectedColors = [...fullPalette];

        renderColorMatrix();
        drawPaletteImage();

        resultContainer.classList.remove("hidden");
        processing = false;
      }, 50);
    };
    img.crossOrigin = "Anonymous";
    img.src = e.target.result;
  };

  if (file) {
    reader.readAsDataURL(file);
  } else {
    processing = false;
  }
}

async function saveCustomPalette() {
  const name = newPaletteNameInput.value.trim();
  if (!name) {
    alert("Please enter a name for the palette.");
    return;
  }
  if (selectedColors.length === 0) {
    alert("Cannot save an empty palette.");
    return;
  }

  const newPalette = {
    id: `custom-${Date.now()}`,
    name,
    colors: selectedColors,
    isCustom: true,
  };

  const customPalettes = (await get("customPalettes")) || [];
  customPalettes.push(newPalette);
  await set("customPalettes", customPalettes);

  state.allPalettes.push(newPalette);
  state.setCurrentPaletteIndex(state.allPalettes.length - 1);
  await loadPalette(newPalette);

  // Redraw scene with new palette
  const source = state.isLive
    ? dom.video
    : state.frozenFrameSource || document.createElement("canvas");
  drawScene(source);

  // Reset and close modal
  newPaletteNameInput.value = "";
  extractorModal.style.display = "none";
}

// --- Main Event Listeners Setup ---

export function setupEventListeners() {
  dom.imageInput.addEventListener("change", handleImageFile);
  dom.loadBtn.addEventListener("click", () => dom.imageInput.click());
  dom.getPaletteBtn.addEventListener("click", () =>
    dom.paletteImageInput.click(),
  );
  dom.paletteImageInput.addEventListener("change", handlePaletteImageFile);

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
    if (!state.isLive && state.frozenFrameSource)
      await drawScene(state.frozenFrameSource);
  });

  dom.ditherToggleBtn.addEventListener("click", async () => {
    triggerHaptic();
    state.setDithering(!state.isDithering);
    dom.ditherToggleBtn.classList.toggle("active", state.isDithering);
    if (!state.isLive && state.frozenFrameSource)
      await drawScene(state.frozenFrameSource);
  });

  dom.reverseCameraBtn.addEventListener("click", () => {
    triggerHaptic();
    state.setFrontCamera(!state.isFrontCamera);
    state.setLive(true);
    dom.shutterBtn.classList.remove("active");
    if (state.isFrontCamera) {
      dom.reverseCameraBtn.querySelector("span").classList.add("iconoir-lens");
      dom.reverseCameraBtn
        .querySelector("span")
        .classList.remove("iconoir-face-id");
    } else {
      dom.reverseCameraBtn
        .querySelector("span")
        .classList.remove("iconoir-lens");
      dom.reverseCameraBtn
        .querySelector("span")
        .classList.add("iconoir-face-id");
    }
    const mode = state.isFrontCamera ? "user" : "environment";
    startCameraWithConstraints(getCameraConstraints(mode));
  });

  document
    .getElementById("palette")
    .addEventListener("click", async (event) => {
      if (event.target.closest("#settingsBtn")) return;
      triggerHaptic();
      state.setCurrentPaletteIndex(
        (state.currentPaletteIndex + 1) % state.allPalettes.length,
      );
      await loadPalette(state.allPalettes[state.currentPaletteIndex]);
      const source = state.isLive
        ? dom.video
        : state.frozenFrameSource || document.createElement("canvas");
      drawScene(source);
    });

  // --- Long Press & Share ---
  let pressTimer = null;
  const startPress = (e) => {
    e.preventDefault();
    pressTimer = setTimeout(async () => {
      if (!state.lastProcessedFrame) return;
      try {
        const blob = await new Promise((resolve) => {
          const upscaleFactor = 8;
          const originalUpscaledWidth =
            state.lastProcessedFrame.width * upscaleFactor;
          const originalUpscaledHeight =
            state.lastProcessedFrame.height * upscaleFactor;
          let newUpscaledWidth = originalUpscaledWidth;
          let newUpscaledHeight = originalUpscaledHeight;
          const PALETTE_STRIP_SIZE = 32;
          const isPortrait =
            state.lastProcessedFrame.height > state.lastProcessedFrame.width;
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
          upscaledCtx.drawImage(
            state.lastProcessedFrame,
            0,
            0,
            originalUpscaledWidth,
            originalUpscaledHeight,
          );
          if (state.currentPalette && state.currentPalette.length > 0) {
            if (isPortrait) {
              const swatchHeight = PALETTE_STRIP_SIZE;
              const swatchWidth =
                newUpscaledWidth / state.currentPalette.length;
              state.currentPalette.forEach((color, index) => {
                upscaledCtx.fillStyle = `rgb(${color.join(",")})`;
                upscaledCtx.fillRect(
                  index * swatchWidth,
                  originalUpscaledHeight,
                  swatchWidth,
                  swatchHeight,
                );
              });
            } else {
              const swatchWidth = PALETTE_STRIP_SIZE;
              const swatchHeight =
                newUpscaledHeight / state.currentPalette.length;
              state.currentPalette.forEach((color, index) => {
                upscaledCtx.fillStyle = `rgb(${color.join(",")})`;
                upscaledCtx.fillRect(
                  originalUpscaledWidth,
                  index * swatchHeight,
                  swatchWidth,
                  swatchHeight,
                );
              });
            }
          }
          upscaledCanvas.toBlob(resolve, "image/png");
        });
        const file = new File([blob], `tessella-${Date.now()}.png`, {
          type: "image/png",
        });
        if (
          !state.isDesktop &&
          navigator.share &&
          navigator.canShare({ files: [file] })
        ) {
          await navigator.share({ files: [file], title: "Tesseŀla" });
        } else {
          const link = document.createElement("a");
          link.download = file.name;
          link.href = URL.createObjectURL(blob);
          link.click();
          URL.revokeObjectURL(link.href);
        }
      } catch (err) {
        if (err.name !== "AbortError")
          console.error("Share/Download failed:", err);
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

  // --- Modal Logic ---
  let wasLiveBeforeModal = false;

  const confirmModal = document.getElementById("confirmModal");
  const confirmModalTitle = document.getElementById("confirm-modal-title");
  const confirmModalText = document.getElementById("confirm-modal-text");
  const confirmModalConfirmBtn = document.getElementById(
    "confirm-modal-confirm-btn",
  );
  const confirmModalCancelBtn = document.getElementById(
    "confirm-modal-cancel-btn",
  );

  function showConfirmationModal(title, text, onConfirm) {
    confirmModalTitle.textContent = title;
    confirmModalText.textContent = text;
    confirmModal.style.display = "block";

    const confirmHandler = () => {
      onConfirm();
      confirmModal.style.display = "none";
      confirmModalConfirmBtn.removeEventListener("click", confirmHandler);
      confirmModalCancelBtn.removeEventListener("click", cancelHandler);
    };

    const cancelHandler = () => {
      confirmModal.style.display = "none";
      confirmModalConfirmBtn.removeEventListener("click", confirmHandler);
      confirmModalCancelBtn.removeEventListener("click", cancelHandler);
    };

    confirmModalConfirmBtn.addEventListener("click", confirmHandler);
    confirmModalCancelBtn.addEventListener("click", cancelHandler);
  }

  async function deleteCustomPalette(paletteIdToDelete) {
    // Remove from state
    const paletteIndex = state.allPalettes.findIndex(
      (p) => p.id === paletteIdToDelete,
    );
    if (paletteIndex === -1) return;

    state.allPalettes.splice(paletteIndex, 1);

    // Remove from storage
    const customPalettes = (await get("customPalettes")) || [];
    const updatedCustomPalettes = customPalettes.filter(
      (p) => p.id !== paletteIdToDelete,
    );
    await set("customPalettes", updatedCustomPalettes);

    // If the deleted palette was the current one, switch to the first palette
    if (state.currentPaletteIndex === paletteIndex) {
      state.setCurrentPaletteIndex(0);
      await loadPalette(state.allPalettes[0]);
      const source = state.isLive
        ? dom.video
        : state.frozenFrameSource || document.createElement("canvas");
      drawScene(source);
    } else if (state.currentPaletteIndex > paletteIndex) {
      // Adjust index if a palette before the current one was deleted
      state.setCurrentPaletteIndex(state.currentPaletteIndex - 1);
    }

    // Refresh the modal view
    populateAndShowPaletteModal();
  }

  // Palette Grid Modal
  const paletteModalCloseBtn = dom.paletteModal.querySelector(".close-button");
  const populateAndShowPaletteModal = async () => {
    wasLiveBeforeModal = state.isLive;
    state.setLive(false);
    dom.paletteGrid.innerHTML = "";

    for (const [index, palette] of state.allPalettes.entries()) {
      const item = document.createElement("div");
      item.className = "palette-grid-item";

      if (palette.isCustom) {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-palette-btn iconoir-xmark";
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation(); // Prevent the palette from being selected
          showConfirmationModal(
            "Delete Palette",
            `Are you sure you want to delete "${palette.name}"?`,
            () => {
              deleteCustomPalette(palette.id);
            },
          );
        });
        item.appendChild(deleteBtn);
      }

      const name = document.createElement("div");
      name.className = "palette-name";
      name.textContent = palette.name;
      item.appendChild(name);

      const swatchContainer = document.createElement("div");
      swatchContainer.className = "mini-swatch-container";
      palette.colors.forEach((color) => {
        const swatch = document.createElement("div");
        swatch.className = "mini-swatch";
        swatch.style.backgroundColor = `rgb(${color.join(",")})`;
        swatchContainer.appendChild(swatch);
      });
      item.appendChild(swatchContainer);

      item.addEventListener("click", async () => {
        state.setCurrentPaletteIndex(index);
        await loadPalette(palette);
        const redrawSource = state.isLive
          ? dom.video
          : state.frozenFrameSource || document.createElement("canvas");
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
    if (event.target.closest("#settingsBtn")) return;
    await populateAndShowPaletteModal();
  });

  paletteModalCloseBtn.addEventListener("click", () => {
    dom.paletteModal.style.display = "none";
    if (wasLiveBeforeModal) {
      state.setLive(true);
      runLiveView();
    }
  });

  // Info Modal
  dom.settingsBtn.addEventListener("click", () => {
    dom.infoModal.style.display = "block";
    state.setLive(false);
  });
  Array.from(dom.closeButton).forEach((c) =>
    c.addEventListener("click", () => {
      dom.infoModal.style.display = "none";
    }),
  );
  window.addEventListener("click", (event) => {
    if (event.target == dom.infoModal) {
      dom.infoModal.style.display = "none";
    }
  });

  // Palette Extractor Modal
  const extractorModalCloseBtn = extractorModal.querySelector(".close-button");
  extractorModalCloseBtn.addEventListener("click", () => {
    extractorModal.style.display = "none";
  });
  cancelPaletteBtn.addEventListener("click", () => {
    extractorModal.style.display = "none";
  });
  savePaletteBtn.addEventListener("click", saveCustomPalette);
  colorCountSlider.addEventListener("input", (e) => {
    colorCountValue.textContent = e.target.value;
  });
  colorCountSlider.addEventListener("change", () => {
    // Re-trigger extraction with the new count
    handlePaletteImageFile({ target: dom.paletteImageInput });
  });

  // --- Resize & Orientation ---
  const handleOrientationAndResize = () => {
    landscaping();
    let newWidth, newHeight;
    if (isLandscape()) {
      newWidth = state.portraitHeight;
      newHeight = state.portraitWidth;
    } else {
      newWidth = state.portraitWidth;
      newHeight = state.portraitHeight;
    }
    if (dom.canvas.width !== newWidth || dom.canvas.height !== newHeight) {
      dom.canvas.width = newWidth;
      dom.canvas.height = newHeight;
      const source = state.isLive
        ? dom.video
        : state.frozenFrameSource || document.createElement("canvas");
      drawScene(source);
    }
  };
  window.addEventListener("resize", handleOrientationAndResize);
  window.addEventListener("load", handleOrientationAndResize);
  setInterval(handleOrientationAndResize, 500);
}
