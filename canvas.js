import { quantize } from "./quantizer.js";
import { initHaptic, triggerHaptic } from "./haptic.js";

// --- Configuration ---
const PIXEL_WIDTH = 192;
const PIXEL_HEIGHT = 256;
const LOW_RES_WIDTH = PIXEL_WIDTH / 2;
const LOW_RES_HEIGHT = PIXEL_HEIGHT / 2;
const FPS = 2;
const FRAME_INTERVAL = 1000 / FPS;
const FADE_DURATION_MS = 250;

const DEFAULT_PALETTES = [
  "palettes/berry-nebula-32x.png",
  "palettes/chocomilk-8-32x.png",
  "palettes/cl8uds-32x.png",
  "palettes/dawnbringers-8-color-32x.png",
  "palettes/eulbink-32x.png",
  "palettes/funkyfuture-8-32x.png",
  "palettes/hope-diamond-32x.png",
  "palettes/ink-32x.png",
  "palettes/inkpink-32x.png",
  "palettes/kirokaze-gameboy-32x.png",
  "palettes/midnight-ablaze-32x.png",
  "palettes/nintendo-gameboy-bgb-32x.png",
  "palettes/oil-6-32x.png",
  "palettes/pollen8-32x.png",
  "palettes/rust-gold-8-32x.png",
  "palettes/seafoam-32x.png",
  "palettes/slso8-32x.png",
  "palettes/twilight-5-32x.png",
  "palettes/wish-gb-32x.png",
];

// --- State ---
let currentPalette = null;
let currentPaletteIndex = 0;
let isLive = true;
let frozenFrameSource = null;
let lastProcessedFrame = null;
let isLowRes = false;
let isFrontCamera = false;
let isDesktop = false;

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

// --- Camera Constraints ---
const cameraConstraints = {
  user: { video: { facingMode: "user" } },
  environment: { video: { facingMode: "environment" } },
};

// --- Main App Logic ---

/**
 * Starts or switches the camera stream.
 * @param {object} constraints - The media constraints for the desired camera.
 */
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

/**
 * Processes a single frame from a source, handling rotation, cropping,
 * and quantization.
 * @param {CanvasImageSource} source - The source image or video frame.
 * @returns {Promise<HTMLCanvasElement>} A canvas with the processed frame.
 */
async function processFrame(source) {
  const isViewLandscape = window.innerWidth > window.innerHeight;

  // Set target dimensions based on the viewport's orientation
  const targetWidth = isLowRes
    ? (isViewLandscape ? LOW_RES_HEIGHT : LOW_RES_WIDTH)
    : (isViewLandscape ? PIXEL_HEIGHT : PIXEL_WIDTH);
  const targetHeight = isLowRes
    ? (isViewLandscape ? LOW_RES_WIDTH : LOW_RES_HEIGHT)
    : (isViewLandscape ? PIXEL_WIDTH : PIXEL_HEIGHT);

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

  // Crop the source video to match the target aspect ratio
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
  quantize(imageData, currentPalette);
  processedCtx.putImageData(imageData, 0, 0);

  return processedCanvas;
}

/**
 * Draws the entire scene, including the processed frame and the UI.
 * @param {CanvasImageSource} source - The source image or video frame to process.
 */
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

  const w = canvas.width;
  const h = canvas.height;
  const isLandscape = w > h;
  const shortDim = isLandscape ? h : w;

  // 1. Define UI sizes from a single, stable source.
  const shutterSize = shortDim * 0.18;
  const swatchSize = shortDim * 0.08;
  const padding = shortDim * 0.04;

  // 2. Define chrome areas based on the UI sizes they must contain.
  let viewfinder;
  if (isLandscape) {
    const sideChromeWidth = shutterSize + padding * 2;
    viewfinder = {
      x: sideChromeWidth,
      y: 0,
      width: w - sideChromeWidth * 2,
      height: h,
    };
  } else {
    const topChromeHeight = swatchSize + padding * 2;
    const bottomChromeHeight = shutterSize + padding * 2;
    viewfinder = {
      x: 0,
      y: topChromeHeight,
      width: w,
      height: h - topChromeHeight - bottomChromeHeight,
    };
  }

  // 3. Draw the video to cover the available viewfinder area.
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

  drawUI(displayCtx);
}

/**
 * Main render loop for the live camera feed.
 */
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

// --- UI Drawing Functions ---

function drawUI(ctx) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const isLandscape = w > h;
  const shortDim = isLandscape ? h : w;

  // Define UI sizes from a single, stable source. These values are identical
  // to those in drawScene, ensuring consistency.
  const shutterSize = shortDim * 0.18;
  const buttonSize = shutterSize * 0.55;
  const swatchSize = shortDim * 0.08;
  const padding = shortDim * 0.04;

  if (isLandscape) {
    const sideChromeWidth = shutterSize + padding * 2;
    // Position UI within the calculated chrome bands
    drawPalette(ctx, sideChromeWidth / 2, h / 2, swatchSize, padding, true);
    if (!isDesktop) {
      drawButtons(
        ctx,
        w - sideChromeWidth / 2,
        h / 2,
        buttonSize,
        shutterSize,
        true,
      );
    } else {
      drawDesktopShutter(ctx, w - sideChromeWidth / 2, h / 2, shutterSize);
    }
  } else {
    // Portrait
    const topChromeHeight = swatchSize + padding * 2;
    const bottomChromeHeight = shutterSize + padding * 2;
    // Position UI within the calculated chrome bands
    drawPalette(ctx, w / 2, topChromeHeight / 2, swatchSize, padding, false);
    if (!isDesktop) {
      drawButtons(
        ctx,
        w / 2,
        h - bottomChromeHeight / 2,
        buttonSize,
        shutterSize,
        false,
      );
    } else {
      drawDesktopShutter(
        ctx,
        w / 2,
        h - bottomChromeHeight / 2,
        shutterSize,
      );
    }
  }
}

function drawPalette(ctx, x, y, size, padding, isVertical = false) {
  const totalLength = currentPalette.length * (size + padding) - padding;
  const startX = isVertical ? x - size / 2 : x - totalLength / 2;
  const startY = isVertical ? y - totalLength / 2 : y - size / 2;

  uiBounds.palette = {
    x: startX,
    y: startY,
    w: isVertical ? size : totalLength,
    h: isVertical ? totalLength : size,
    type: "palette",
  };

  currentPalette.forEach((color, i) => {
    const offset = i * (size + padding);
    const swatchX = startX + (isVertical ? 0 : offset);
    const swatchY = startY + (isVertical ? offset : 0);
    ctx.fillStyle = `rgb(${color.join(",")})`;
    ctx.fillRect(swatchX, swatchY, size, size);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(swatchX, swatchY, size, size);
  });
}

function drawButtons(ctx, x, y, size, shutterSize, isVertical = false) {
  const gap = size * 3;

  // Shutter button (center)
  uiBounds.shutter = { x: x, y: y, r: shutterSize, type: "shutter" };
  ctx.beginPath();
  ctx.arc(x, y, shutterSize, 0, 2 * Math.PI);
  ctx.fillStyle = isLive ? "#e23d28" : "#34c759";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  ctx.stroke();

  // Resolution Toggle button
  const resX = x + (isVertical ? 0 : -gap);
  const resY = y + (isVertical ? -gap : 0);
  uiBounds.resToggle = { x: resX, y: resY, r: size, type: "resToggle" };
  ctx.beginPath();
  ctx.arc(resX, resY, size, 0, 2 * Math.PI);
  ctx.fillStyle = "#2c2c2e";
  ctx.fill();
  ctx.strokeStyle = isLowRes ? "#fff" : "#555";
  ctx.stroke();
  ctx.fillStyle = "#fff";
  if (isLowRes) {
    ctx.fillRect(resX - size * 0.25, resY - size * 0.25, size * 0.5, size * 0.5);
  } else {
    const s = size * 0.18;
    ctx.fillRect(resX - s * 1.5, resY - s * 1.5, s, s);
    ctx.fillRect(resX + s * 0.5, resY - s * 1.5, s, s);
    ctx.fillRect(resX - s * 1.5, resY + s * 0.5, s, s);
    ctx.fillRect(resX + s * 0.5, resY + s * 0.5, s, s);
  }

  // Reverse Camera button
  const revX = x + (isVertical ? 0 : gap);
  const revY = y + (isVertical ? gap : 0);
  uiBounds.reverseCamera = { x: revX, y: revY, r: size, type: "reverseCamera" };
  ctx.beginPath();
  ctx.arc(revX, revY, size, 0, 2 * Math.PI);
  ctx.fillStyle = "#2c2c2e";
  ctx.fill();
  ctx.strokeStyle = "#555";
  ctx.stroke();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(revX, revY, size * 0.5, -Math.PI * 0.25, Math.PI * 0.75);
  ctx.moveTo(
    revX + size * 0.5 * Math.cos(Math.PI * 0.75) + 4,
    revY + size * 0.5 * Math.sin(Math.PI * 0.75) - 4,
  );
  ctx.lineTo(
    revX + size * 0.5 * Math.cos(Math.PI * 0.75),
    revY + size * 0.5 * Math.sin(Math.PI * 0.75),
  );
  ctx.lineTo(
    revX + size * 0.5 * Math.cos(Math.PI * 0.75) - 4,
    revY + size * 0.5 * Math.sin(Math.PI * 0.75) - 4,
  );
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(revX, revY, size * 0.5, Math.PI * 0.75, -Math.PI * 0.25);
  ctx.moveTo(
    revX + size * 0.5 * Math.cos(-Math.PI * 0.25) - 4,
    revY + size * 0.5 * Math.sin(-Math.PI * 0.25) + 4,
  );
  ctx.lineTo(
    revX + size * 0.5 * Math.cos(-Math.PI * 0.25),
    revY + size * 0.5 * Math.sin(-Math.PI * 0.25),
  );
  ctx.lineTo(
    revX + size * 0.5 * Math.cos(-Math.PI * 0.25) + 4,
    revY + size * 0.5 * Math.sin(-Math.PI * 0.25) + 4,
  );
  ctx.stroke();
}

function drawDesktopShutter(ctx, x, y, shutterSize) {
  uiBounds.shutter = { x: x, y: y, r: shutterSize, type: "shutter" };
  ctx.beginPath();
  ctx.arc(x, y, shutterSize, 0, 2 * Math.PI);
  ctx.fillStyle = "#007aff";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  const s = shutterSize * 0.5;
  ctx.fillRect(x - s / 2, y - s / 2, s, s * 0.8);
  ctx.font = `${shutterSize * 0.4}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("...", x, y);
}

// --- Event Handlers ---

function handleCanvasClick(event) {
  const rect = canvas.getBoundingClientRect();
  const touch = event.touches ? event.touches[0] : event;

  const physicalClickX = touch.clientX - rect.left;
  const physicalClickY = touch.clientY - rect.top;

  // With rotations removed, we just scale from the element's CSS size to
  // the canvas's internal buffer size. This is now robust and correct.
  const x = physicalClickX * (canvas.width / rect.width);
  const y = physicalClickY * (canvas.height / rect.height);

  for (const key of ["shutter", "resToggle", "reverseCamera"]) {
    const bound = uiBounds[key];
    if (
      bound.r &&
      Math.sqrt((x - bound.x) ** 2 + (y - bound.y) ** 2) < bound.r
    ) {
      handleUIAction(bound.type);
      return;
    }
  }

  const pBound = uiBounds.palette;
  if (
    pBound.w &&
    x > pBound.x &&
    x < pBound.x + pBound.w &&
    y > pBound.y &&
    y < pBound.y + pBound.h
  ) {
    handleUIAction(pBound.type);
    return;
  }
}

async function handleUIAction(actionType) {
  triggerHaptic();
  switch (actionType) {
    case "shutter":
      if (isDesktop) {
        imageInput.click();
      } else {
        isLive = !isLive;
        if (isLive) {
          runLiveView();
        } else {
          setTimeout(() => triggerHaptic(), 50);
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = video.videoWidth;
          tempCanvas.height = video.videoHeight;
          tempCanvas.getContext("2d").drawImage(video, 0, 0);
          frozenFrameSource = tempCanvas;
          await drawScene(frozenFrameSource);
        }
      }
      break;
    case "resToggle":
      isLowRes = !isLowRes;
      if (!isLive && frozenFrameSource) await drawScene(frozenFrameSource);
      break;
    case "reverseCamera":
      isFrontCamera = !isFrontCamera;
      const mode = isFrontCamera ? "user" : "environment";
      startCameraWithConstraints(cameraConstraints[mode]);
      break;
    case "palette":
      currentPaletteIndex = (currentPaletteIndex + 1) % DEFAULT_PALETTES.length;
      await loadPalette(DEFAULT_PALETTES[currentPaletteIndex]);
      if (!isLive && frozenFrameSource) await drawScene(frozenFrameSource);
      break;
  }
}

function handleImageFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  isLive = false;
  const img = new Image();
  img.onload = async () => {
    frozenFrameSource = img;
    await drawScene(frozenFrameSource);
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(file);
}

// --- Utility & Initialization Functions ---

function updateTheme(palette) {
  const getLuminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const sorted = [...palette].sort(
    (a, b) => getLuminance(...a) - getLuminance(...b),
  );
  const darkest = sorted[0];
  const isDarkMode =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const themeColor = `rgb(${isDarkMode ? darkest.join(",") : sorted[sorted.length - 1].join(",")})`;
  document.documentElement.style.setProperty("--chrome-bg", themeColor);
  document
    .querySelector('meta[name="theme-color"]')
    .setAttribute("content", themeColor);
}

async function loadPalette(source) {
  const img = new Image();
  img.src = source;
  await new Promise((resolve) => {
    img.onload = resolve;
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
  currentPalette = Array.from(uniqueColors).map((str) =>
    str.split(",").map(Number),
  );
  if (source.startsWith("data:image")) {
    localStorage.setItem("savedPalette", source);
  } else {
    localStorage.setItem("savedPalette", "");
  }
  updateTheme(currentPalette);
}

/**
 * Main initialization function for the application.
 */
async function init() {
  // Set initial size
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initHaptic();
  isDesktop = !("ontouchstart" in window || navigator.maxTouchPoints > 0);

  const savedPalette = localStorage.getItem("savedPalette");
  await loadPalette(savedPalette || DEFAULT_PALETTES[0]);

  if (isDesktop) {
    imageInput.addEventListener("change", handleImageFile);
  } else {
    startCameraWithConstraints(cameraConstraints.environment);
  }

  canvas.addEventListener("click", handleCanvasClick);
  canvas.addEventListener("touchstart", handleCanvasClick, { passive: true });

  const handleOrientationAndResize = () => {
    // Resize the canvas drawing buffer to match the new window size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const isLandscape = window.innerWidth > window.innerHeight;
    document.body.classList.toggle("landscape", isLandscape);

    // Redraw the scene immediately with the correct dimensions
    const source = isLive
      ? video
      : frozenFrameSource || document.createElement("canvas");
    drawScene(source);
  };

  window.addEventListener("resize", handleOrientationAndResize);
  // The 'load' event is kept to ensure the first draw happens after layout
  window.addEventListener("load", handleOrientationAndResize);

  let pressTimer = null;
  const startPress = (e) => {
    e.preventDefault();
    pressTimer = setTimeout(async () => {
      if (!lastProcessedFrame) return; // Don't share if there's no image
      try {
        const blob = await new Promise((resolve) => {
          const upscaleFactor = 8;
          const upscaledCanvas = document.createElement("canvas");
          upscaledCanvas.width = lastProcessedFrame.width * upscaleFactor;
  
          upscaledCanvas.height = lastProcessedFrame.height * upscaleFactor;
          const upscaledCtx = upscaledCanvas.getContext("2d");
          upscaledCtx.imageSmoothingEnabled = false;
          upscaledCtx.drawImage(
            lastProcessedFrame, // Use the clean frame as the source
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
}

init();
