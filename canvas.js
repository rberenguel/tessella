import { get, set } from "./libs/idb-keyval.js";
import { quantize, quantizeWithDithering } from "./quantizer.js";
import { initHaptic, triggerHaptic } from "./haptic.js";

// --- Configuration ---
const PIXEL_WIDTH = 192;
const PIXEL_HEIGHT = 256;
const LOW_RES_WIDTH = PIXEL_WIDTH / 2;
const LOW_RES_HEIGHT = PIXEL_HEIGHT / 2;
const FPS = 3;
const FRAME_INTERVAL = 1000 / FPS;
const FADE_DURATION_MS = 10;
const DEBUG = true; // Disables standalone being required

export const BUILT_IN_PALETTES = [
  "palettes/bastille-8-32x.png",
  "palettes/berry-nebula-32x.png",
  "palettes/calm-sunset-32x.png",
  "palettes/cga-palette-1-low-32x.png",
  "palettes/cyclope6-32x.png",
  "palettes/dawnbringers-8-color-32x.png",
  "palettes/eulbink-32x.png",
  "palettes/funkyfuture-8-32x.png",
  "palettes/galaxy-flame-32x.png",
  "palettes/golden-flame-32x.png",
  "palettes/ink-32x.png",
  "palettes/ink-crimson-32x.png",
  "palettes/japanese-woodblock-32x.png",
  "palettes/lost-century-32x.png",
  "palettes/midnight-ablaze-32x.png",
  "palettes/mushroom-32x.png",
  "palettes/na16-32x.png",
  "palettes/nintendo-gameboy-bgb-32x.png",
  "palettes/odd-feeling-32x.png",
  "palettes/oil-6-32x.png",
  "palettes/pollen8-32x.png",
  "palettes/rust-gold-8-32x.png",
  "palettes/seafoam-32x.png",
  "palettes/sirens-at-night-32x.png",
  "palettes/slso8-32x.png",
  "palettes/smooth-polished-silver-32x.png",
  "palettes/steam-lords-32x.png",
  "palettes/sunset-red-32x.png",
  "palettes/twilight-5-32x.png",
  "palettes/vividmemory8-32x.png",
  "palettes/wish-gb-32x.png",
];

//let allPalettes = [...BUILT_IN_PALETTES];

// --- Layout Constants ---
const LAYOUT = {
  PORTRAIT_TOP_CHROME_H: 20,
  PORTRAIT_BOTTOM_CHROME_H: 32,
  LANDSCAPE_SIDE_CHROME_W: 30,
  SHUTTER_RADIUS: 8.5,
  BUTTON_RADIUS: 5,
  SWATCH_SIZE: 5,
  PADDING: 2.5,
  BUTTON_GAP: 22,
};

// --- State ---
let currentPalette = null;
let currentPaletteIndex = 0;
let isLive = true;
let frozenFrameSource = null;
let lastProcessedFrame = null;
let isLowRes = false;
let isDithering = false;
let isFrontCamera = false;
let isDesktop = false;

let loadedPalettes = new Map(); // Stores palette source URL -> [ [r,g,b], ... ]
let allPalettes = []; // Stores palette source URLs, including custom

let portraitHeight = null,
  portraitWidth = null;

// --- UI Element Bounding Boxes for Hit Detection ---
let uiBounds = {
  palette: {},
  resToggle: {},
  shutter: {},
  reverseCamera: {},
};

// --- DOM Elements ---
const video = document.getElementById("videoFeed");
const canvas = document.getElementById("displayCanvas");
const imageInput = document.getElementById("imageInput");
const transitionCanvas = document.getElementById("transitionCanvas");
const resToggleBtn = document.getElementById("resToggleBtn");
const ditherToggleBtn = document.getElementById("ditherBtn");
const reverseCameraBtn = document.getElementById("reverseCameraBtn");
const shutterBtn = document.getElementById("shutterBtn");
const palettePreview = document.getElementById("palettePreview");
const modalContent = document.getElementById("modal-content");
const loadBtn = document.getElementById("loadBtn");
const infoModal = document.getElementById("infoModal");
const closeButton = document.querySelectorAll(".close-button");

const isLandscape = () => window.outerWidth > window.outerHeight;

const landscaping = () => {
  if (isLandscape()) {
    document.body.classList.add("landscape");
  } else {
    document.body.classList.remove("landscape");
  }
};

async function fetchSelfManifest() {
  try {
    const response = await fetch("./manifest.json");
    if (response.ok) {
      let loadedManifest = await response.text();
      let version = JSON.parse(loadedManifest).version;
      modalContent.querySelector("#version").innerHTML = modalContent
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

// --- Camera Constraints ---
const cameraConstraints = {
  user: { video: { facingMode: "user" } },
  environment: { video: { facingMode: "environment" } },
};

// --- Main App Logic ---

async function startCameraWithConstraints(constraints) {
  try {
    if (video.srcObject) {
      video.srcObject.getTracks().forEach((track) => track.stop());
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();
    isLive = true;
    runLiveView();
  } catch (err) {
    alert("Could not access the camera. Please grant permission.");
    console.error("Camera access error:", err);
  }
}

async function processFrame(source) {
  const isViewLandscape = window.outerWidth > window.outerHeight;

  const targetWidth = isLowRes
    ? isViewLandscape
      ? LOW_RES_HEIGHT
      : LOW_RES_WIDTH
    : isViewLandscape
      ? PIXEL_HEIGHT
      : PIXEL_WIDTH;
  const targetHeight = isLowRes
    ? isViewLandscape
      ? LOW_RES_WIDTH
      : LOW_RES_HEIGHT
    : isViewLandscape
      ? PIXEL_WIDTH
      : PIXEL_HEIGHT;

  const processedCanvas = document.createElement("canvas");
  processedCanvas.width = targetWidth;
  processedCanvas.height = targetHeight;
  const processedCtx = processedCanvas.getContext("2d");

  const sourceWidth = source.videoWidth || source.width;
  const sourceHeight = source.videoHeight || source.height;

  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");
  tempCanvas.width = sourceWidth;
  tempCanvas.height = sourceHeight;
  tempCtx.drawImage(source, 0, 0);

  const sRatio = tempCanvas.width / tempCanvas.height;
  const tRatio = targetWidth / targetHeight;
  let sx = 0,
    sy = 0,
    sWidth = tempCanvas.width,
    sHeight = tempCanvas.height;

  if (sRatio > tRatio) {
    sWidth = tempCanvas.height * tRatio;
    sx = (tempCanvas.width - sWidth) / 2;
  } else {
    sHeight = tempCanvas.width / tRatio;
    sy = (tempCanvas.height - sHeight) / 2;
  }
  processedCtx.drawImage(
    tempCanvas,
    sx,
    sy,
    sWidth,
    sHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  const imageData = processedCtx.getImageData(0, 0, targetWidth, targetHeight);
  if (isDithering) {
    quantizeWithDithering(imageData, currentPalette);
  } else {
    quantize(imageData, currentPalette);
  }

  processedCtx.putImageData(imageData, 0, 0);

  return processedCanvas;
}

async function drawScene(source) {
  if (
    !source ||
    (source instanceof HTMLVideoElement && !source.videoWidth) ||
    canvas.clientWidth === 0
  ) {
    return;
  }
  const processedCanvas = await processFrame(source);
  lastProcessedFrame = processedCanvas;
  const displayCtx = canvas.getContext("2d");

  displayCtx.imageSmoothingEnabled = false;
  displayCtx.clearRect(0, 0, canvas.width, canvas.height);

  //const w = canvas.width;
  //const h = canvas.height;
  const unit = Math.min(portraitHeight, portraitWidth) / 100;

  const topChrome = LAYOUT.PORTRAIT_TOP_CHROME_H * unit;
  const bottomChrome = LAYOUT.PORTRAIT_BOTTOM_CHROME_H * unit;
  const sideChrome = LAYOUT.LANDSCAPE_SIDE_CHROME_W * unit;

  let viewfinder;

  if (isLandscape()) {
    document.body.classList.add("landscape");
    viewfinder = {
      x: sideChrome,
      y: 0,
      width: portraitHeight - sideChrome * 2,
      height: portraitWidth,
    };
  } else {
    document.body.classList.remove("landscape");
    viewfinder = {
      x: 0,
      y: topChrome,
      width: portraitWidth,
      height: portraitHeight - topChrome - bottomChrome,
    };
  }

  const vRatio = viewfinder.width / viewfinder.height;
  const pRatio = processedCanvas.width / processedCanvas.height;
  let sx, sy, sWidth, sHeight;
  if (pRatio > vRatio) {
    sHeight = processedCanvas.height;
    sWidth = sHeight * vRatio;
    sx = (processedCanvas.width - sWidth) / 2;
    sy = 0;
  } else {
    sWidth = processedCanvas.width;
    sHeight = sWidth / vRatio;
    sx = 0;
    sy = (processedCanvas.height - sHeight) / 2;
  }
  displayCtx.drawImage(
    processedCanvas,
    sx,
    sy,
    sWidth,
    sHeight,
    viewfinder.x,
    viewfinder.y,
    viewfinder.width,
    viewfinder.height,
  );
}

async function runLiveView() {
  if (!isLive) return;

  const transitionCtx = transitionCanvas.getContext("2d");
  transitionCanvas.width = canvas.width;
  transitionCanvas.height = canvas.height;
  if (canvas.width > 0) {
    transitionCtx.drawImage(canvas, 0, 0);
  }
  transitionCanvas.style.transition = "none";
  transitionCanvas.style.opacity = "1";

  await drawScene(video);

  transitionCanvas.style.transition = `opacity ${FADE_DURATION_MS}ms ease-out`;
  transitionCanvas.style.opacity = "0";

  setTimeout(runLiveView, FRAME_INTERVAL);
}

function displayPalette(palette) {
  palettePreview.innerHTML = "";
  palette.forEach((color) => {
    const swatch = document.createElement("div");
    swatch.className = "swatch";
    swatch.style.backgroundColor = `rgb(${color.join(",")})`;
    palettePreview.appendChild(swatch);
  });
}

function handleCanvasClick(event) {
  // This function is primarily for future canvas-specific interactions
  // The palette interactions are now handled by the #palette header directly.
}

async function handleShutterClickMobile() {
  isLive = !isLive;
  if (isLive) {
    runLiveView();
    shutterBtn.classList.remove("active");
  } else {
    setTimeout(() => triggerHaptic(), 50);
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    tempCanvas.getContext("2d").drawImage(video, 0, 0);
    frozenFrameSource = tempCanvas;
    shutterBtn.classList.add("active");
    await drawScene(frozenFrameSource);
  }
}

async function handleUIAction(actionType) {
  triggerHaptic();
  switch (actionType) {
    case "palette":
      currentPaletteIndex = (currentPaletteIndex + 1) % allPalettes.length;
      await loadPalette(allPalettes[currentPaletteIndex]);
      displayPalette(currentPalette);
      const source = isLive
        ? video
        : frozenFrameSource || document.createElement("canvas");
      drawScene(source);
      break;
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

        // Update allPalettes with the new custom palette
        // Remove any old custom palette first to avoid duplicates
        allPalettes = allPalettes.filter(p => !p.startsWith("data:image"));
        allPalettes.push(dataUrl);
        currentPaletteIndex = allPalettes.length - 1;

        const source = isLive
          ? video
          : frozenFrameSource || document.createElement("canvas");
        await drawScene(source);
      } else {
        isLive = false;
        shutterBtn.classList.add("active");
        frozenFrameSource = img;
        await drawScene(frozenFrameSource);
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function updateTheme(palette) {
  const getLuminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const sorted = [...palette].sort(
    (a, b) => getLuminance(...a) - getLuminance(...b),
  );
  const darkest = sorted[0];
  const isDarkMode =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const themeColor = `rgb(${
    isDarkMode ? darkest.join(",") : sorted[sorted.length - 1].join(",")
  })`;
  document.documentElement.style.setProperty("--chrome-bg", themeColor);
  document
    .querySelector('meta[name="theme-color"]')
    .setAttribute("content", themeColor);
}

const isMobile = () => "ontouchstart" in window || navigator.maxTouchPoints > 0;

const needsStandalone = () => {
  const standaloneiOS = window.navigator.standalone === true;
  const standaloneAndroid = window.matchMedia(
    "(display-mode: standalone)",
  ).matches;

  return isMobile() && !standaloneiOS && !standaloneAndroid && !DEBUG;
};

async function getColorsFromSource(source) {
  const img = new Image();
  img.src = source;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = img.width;
  offscreenCanvas.height = img.height;
  const ctx = offscreenCanvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height).data;
  const uniqueColors = new Set();

  for (let i = 0; i < imageData.length; i += 4) {
    if (imageData[i + 3] < 255) continue;
    uniqueColors.add(`${imageData[i]},${imageData[i + 1]},${imageData[i + 2]}`);
  }
  return Array.from(uniqueColors).map((str) => str.split(",").map(Number));
}
async function loadPalette(source) {
  let colors;
  if (loadedPalettes.has(source)) {
    colors = loadedPalettes.get(source);
  } else {
    // This case should primarily be for newly uploaded custom palettes
    // that weren't pre-loaded.
    colors = await getColorsFromSource(source);
    loadedPalettes.set(source, colors);
  }

  currentPalette = colors;
  localStorage.setItem("savedPalette", source);
  displayPalette(currentPalette);
  updateTheme(currentPalette);
}

async function init() {
  await fetchSelfManifest();
  const w = window.outerWidth;
  const h = window.outerHeight;
  if (h >= w) {
    portraitHeight = h;
    portraitWidth = w;
  } else {
    portraitHeight = w;
    portraitWidth = h;
  }
  canvas.width = w;
  canvas.height = h;
  initHaptic();
  isDesktop = !isMobile();

  if (needsStandalone()) {
    console.log("Needs standalone");
    infoModal.style.display = "block";
    (infoModal.querySelector("#modal-content").innerHTML =
      "Please install as a standalone web app (Usually share -> Add to Home Screen)<br/>Otherwise the sizing and the buttons don't work as well.<br/>You can always remove it later 😀"),
      (isLive = false);
    return;
  }

  // Pre-load all built-in palettes
  for (const paletteSrc of BUILT_IN_PALETTES) {
    loadedPalettes.set(paletteSrc, await getColorsFromSource(paletteSrc));
  }
  allPalettes = [...BUILT_IN_PALETTES];

  // Load custom palette if it exists
  const customPalette = await get("customPalette");
  if (customPalette) {
    loadedPalettes.set(customPalette, await getColorsFromSource(customPalette));
    allPalettes.push(customPalette);
  }

  const savedPaletteSrc =
    localStorage.getItem("savedPalette") || allPalettes[0];
  try {
    // Ensure the saved palette is in allPalettes, if not, default to the first one
    if (!allPalettes.includes(savedPaletteSrc)) {
      throw new Error("Saved palette not found in available palettes.");
    }
    currentPaletteIndex = allPalettes.indexOf(savedPaletteSrc);
    await loadPalette(savedPaletteSrc);
  } catch (err) {
    console.warn("Palette could not be found or is invalid, defaulting.", err);
    currentPaletteIndex = 0;
    await loadPalette(allPalettes[0]);
  }

  imageInput.addEventListener("change", handleImageFile);
  loadBtn.addEventListener("click", () => imageInput.click());

  if (isDesktop) {
    shutterBtn.addEventListener("click", () => imageInput.click());
  } else {
    startCameraWithConstraints(cameraConstraints.environment);
    shutterBtn.addEventListener("click", handleShutterClickMobile);
  }

  resToggleBtn.addEventListener("click", async () => {
    triggerHaptic();
    isLowRes = !isLowRes;
    resToggleBtn.classList.toggle("active", isLowRes);
    if (!isLive && frozenFrameSource) await drawScene(frozenFrameSource);
  });
  ditherToggleBtn.addEventListener("click", async () => {
    triggerHaptic();
    isDithering = !isDithering;
    ditherToggleBtn.classList.toggle("active", isDithering);
    if (!isLive && frozenFrameSource) await drawScene(frozenFrameSource);
  });

  reverseCameraBtn.addEventListener("click", () => {
    triggerHaptic();
    isFrontCamera = !isFrontCamera;
    isLive = true;
    shutterBtn.classList.remove("active");
    if (isFrontCamera) {
      reverseCameraBtn.querySelector("span").classList.add("iconoir-lens");
      reverseCameraBtn
        .querySelector("span")
        .classList.remove("iconoir-face-id");
    } else {
      reverseCameraBtn.querySelector("span").classList.remove("iconoir-lens");
      reverseCameraBtn.querySelector("span").classList.add("iconoir-face-id");
    }
    const mode = isFrontCamera ? "user" : "environment";
    startCameraWithConstraints(cameraConstraints[mode]);
  });

  document.getElementById("palette").addEventListener("click", async (event) => {
    // Only trigger palette cycle if the settings button wasn't clicked
    if (event.target.closest("#settingsBtn")) {
      return;
    }
    triggerHaptic();
    currentPaletteIndex = (currentPaletteIndex + 1) % allPalettes.length;
    await loadPalette(allPalettes[currentPaletteIndex]);
    const source = isLive
      ? video
      : frozenFrameSource || document.createElement("canvas");
    drawScene(source);
  });

  canvas.addEventListener("click", handleCanvasClick);
  canvas.addEventListener("touchstart", handleCanvasClick, { passive: true });

  const handleOrientationAndResize = () => {
    canvas.width = window.outerWidth;
    canvas.height = window.outerHeight;

    landscaping();

    const source = isLive
      ? video
      : frozenFrameSource || document.createElement("canvas");
    drawScene(source);
  };

  window.addEventListener("resize", handleOrientationAndResize);
  window.addEventListener("load", handleOrientationAndResize);

  let pressTimer = null;
  const startPress = (e) => {
    e.preventDefault();
    pressTimer = setTimeout(async () => {
      if (!lastProcessedFrame) return;
      try {
        const blob = await new Promise((resolve) => {
          const upscaleFactor = 8;
          const upscaledCanvas = document.createElement("canvas");
          upscaledCanvas.width = lastProcessedFrame.width * upscaleFactor;
          upscaledCanvas.height = lastProcessedFrame.height * upscaleFactor;
          const upscaledCtx = upscaledCanvas.getContext("2d");
          upscaledCtx.imageSmoothingEnabled = false;
          upscaledCtx.drawImage(
            lastProcessedFrame,
            0,
            0,
            upscaledCanvas.width,
            upscaledCanvas.height,
          );
          upscaledCanvas.toBlob(resolve, "image/png");
        });
        const file = new File([blob], `tessella-${Date.now()}.png`, {
          type: "image/png",
        });
        if (
          !isDesktop &&
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
  canvas.addEventListener("mousedown", startPress);
  canvas.addEventListener("touchstart", startPress, { passive: false });
  canvas.addEventListener("mouseup", cancelPress);
  canvas.addEventListener("mouseleave", cancelPress);
  canvas.addEventListener("touchend", cancelPress);
  canvas.addEventListener("touchcancel", cancelPress);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  const paletteModal = document.getElementById("paletteModal");
  const paletteGrid = document.getElementById("palette-grid");
  const paletteModalCloseBtn = paletteModal.querySelector(".close-button");

  const populateAndShowPaletteModal = async () => {
    isLive = false;
    paletteGrid.innerHTML = "";

    for (const [index, source] of allPalettes.entries()) {
      const item = document.createElement("div");
      item.className = "palette-grid-item";

      const colors = loadedPalettes.get(source);
      colors.forEach((color) => {
        const swatch = document.createElement("div");
        swatch.className = "mini-swatch";
        swatch.style.backgroundColor = `rgb(${color.join(",")})`;
        item.appendChild(swatch);
      });

      item.addEventListener("click", async () => {
        currentPaletteIndex = index;
        await loadPalette(source);
        const redrawSource = isLive
          ? video
          : frozenFrameSource || document.createElement("canvas");
        drawScene(redrawSource);
        paletteModal.style.display = "none";
      });
      paletteGrid.appendChild(item);
    }
    paletteModal.style.display = "block";
  };

  // UPDATED interact.js call to be async
  interact("#palette").on("hold", async (event) => {
    // Only trigger modal if the settings button wasn't held
    if (event.target.closest("#settingsBtn")) {
      return;
    }
    await populateAndShowPaletteModal();
  });

  paletteModalCloseBtn.addEventListener("click", () => {
    paletteModal.style.display = "none";
  });
  const settingsBtn = document.getElementById("settingsBtn");

  settingsBtn.addEventListener("click", () => {
    infoModal.style.display = "block";
    isLive = false;
  });

  Array.from(closeButton).map((c) =>
    c.addEventListener("click", () => {
      infoModal.style.display = "none";
    }),
  );

  window.addEventListener("click", (event) => {
    if (event.target == infoModal) {
      infoModal.style.display = "none";
    }
  });
  setInterval(() => {
    landscaping();
    if (isLandscape()) {
      document.body.classList.add("landscape");
    } else {
      document.body.classList.remove("landscape");
    }
  }, 500);
}

init();
