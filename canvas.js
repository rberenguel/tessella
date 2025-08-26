import { quantize } from "./quantizer.js";
import { initHaptic, triggerHaptic } from "./haptic.js";

// --- Configuration ---
const PIXEL_WIDTH = 192;
const PIXEL_HEIGHT = 256;
const LOW_RES_WIDTH = PIXEL_WIDTH / 2;
const LOW_RES_HEIGHT = PIXEL_HEIGHT / 2;
const FPS = 3;
const FRAME_INTERVAL = 1000 / FPS;
const FADE_DURATION_MS = 250;

const DEFAULT_PALETTES = [
  "palettes/berry-nebula-32x.png", "palettes/chocomilk-8-32x.png", "palettes/cl8uds-32x.png",
  "palettes/dawnbringers-8-color-32x.png", "palettes/eulbink-32x.png", "palettes/funkyfuture-8-32x.png",
  "palettes/hope-diamond-32x.png", "palettes/ink-32x.png", "palettes/inkpink-32x.png",
  "palettes/kirokaze-gameboy-32x.png", "palettes/midnight-ablaze-32x.png", "palettes/nintendo-gameboy-bgb-32x.png",
  "palettes/oil-6-32x.png", "palettes/pollen8-32x.png", "palettes/rust-gold-8-32x.png",
  "palettes/seafoam-32x.png", "palettes/slso8-32x.png", "palettes/twilight-5-32x.png",
  "palettes/wish-gb-32x.png",
];

// --- State ---
let currentPalette = null;
let currentPaletteIndex = 0;
let isLive = true;
let frozenFrameSource = null;
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
  const targetWidth = isLowRes ? LOW_RES_WIDTH : PIXEL_WIDTH;
  const targetHeight = isLowRes ? LOW_RES_HEIGHT : PIXEL_HEIGHT;

  const processedCanvas = document.createElement("canvas");
  processedCanvas.width = targetWidth;
  processedCanvas.height = targetHeight;
  const processedCtx = processedCanvas.getContext("2d");

  const sourceWidth = source.videoWidth || source.width;
  const sourceHeight = source.videoHeight || source.height;

  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");
  const isLandscape = document.body.classList.contains('landscape');

  if (isLandscape && source instanceof HTMLVideoElement) {
    tempCanvas.width = sourceHeight;
    tempCanvas.height = sourceWidth;
    tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
    tempCtx.rotate(Math.PI / 2);
    tempCtx.drawImage(source, -sourceWidth / 2, -sourceHeight / 2);
  } else {
    tempCanvas.width = sourceWidth;
    tempCanvas.height = sourceHeight;
    tempCtx.drawImage(source, 0, 0);
  }

  const sRatio = tempCanvas.width / tempCanvas.height;
  const tRatio = targetWidth / targetHeight;
  let sx = 0, sy = 0, sWidth = tempCanvas.width, sHeight = tempCanvas.height;

  if (sRatio > tRatio) {
    sWidth = tempCanvas.height * tRatio;
    sx = (tempCanvas.width - sWidth) / 2;
  } else {
    sHeight = tempCanvas.width / tRatio;
    sy = (tempCanvas.height - sHeight) / 2;
  }
  processedCtx.drawImage(tempCanvas, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);

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
    if (!source || (source instanceof HTMLVideoElement && !source.videoWidth) || canvas.clientWidth === 0) {
        return;
    }
    const processedCanvas = await processFrame(source);
    const displayCtx = canvas.getContext("2d");

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    
    displayCtx.imageSmoothingEnabled = false;
    displayCtx.clearRect(0, 0, canvas.width, canvas.height);
    displayCtx.drawImage(processedCanvas, 0, 0, canvas.width, canvas.height);

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
  const padding = h * 0.02;
  const buttonY = h - (h * 0.1);
  const paletteY = h * 0.05;
  const buttonRowX = w / 2;
  const paletteRowX = w / 2;
  const buttonSize = h * 0.035;
  const shutterSize = h * 0.05;
  const swatchSize = h * 0.025;

  drawPalette(ctx, paletteRowX, paletteY, swatchSize, padding);
  
  if (!isDesktop) {
    drawButtons(ctx, buttonRowX, buttonY, buttonSize, shutterSize);
  } else {
    drawDesktopShutter(ctx, buttonRowX, buttonY, shutterSize);
  }
}

function drawPalette(ctx, x, y, size, padding) {
    const totalWidth = currentPalette.length * (size + padding) - padding;
    const startX = x - totalWidth / 2;
    const startY = y - size / 2;
    uiBounds.palette = { x: startX, y: startY, w: totalWidth, h: size, type: 'palette' };
    currentPalette.forEach((color, i) => {
        const swatchX = startX + i * (size + padding);
        ctx.fillStyle = `rgb(${color.join(",")})`;
        ctx.fillRect(swatchX, startY, size, size);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 2;
        ctx.strokeRect(swatchX, startY, size, size);
    });
}

function drawButtons(ctx, x, y, size, shutterSize) {
    const gap = size * 3;
    uiBounds.shutter = { x: x, y: y, r: shutterSize, type: 'shutter' };
    ctx.beginPath();
    ctx.arc(x, y, shutterSize, 0, 2 * Math.PI);
    ctx.fillStyle = isLive ? "#e23d28" : "#34c759";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.stroke();

    const resX = x - gap;
    uiBounds.resToggle = { x: resX, y: y, r: size, type: 'resToggle' };
    ctx.beginPath();
    ctx.arc(resX, y, size, 0, 2 * Math.PI);
    ctx.fillStyle = "#2c2c2e";
    ctx.fill();
    ctx.strokeStyle = isLowRes ? "#fff" : "#555";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    if (isLowRes) {
        ctx.fillRect(resX - size * 0.25, y - size * 0.25, size * 0.5, size * 0.5);
    } else {
        const s = size * 0.18;
        ctx.fillRect(resX - s * 1.5, y - s * 1.5, s, s);
        ctx.fillRect(resX + s * 0.5, y - s * 1.5, s, s);
        ctx.fillRect(resX - s * 1.5, y + s * 0.5, s, s);
        ctx.fillRect(resX + s * 0.5, y + s * 0.5, s, s);
    }

    const revX = x + gap;
    uiBounds.reverseCamera = { x: revX, y: y, r: size, type: 'reverseCamera' };
    ctx.beginPath();
    ctx.arc(revX, y, size, 0, 2 * Math.PI);
    ctx.fillStyle = "#2c2c2e";
    ctx.fill();
    ctx.strokeStyle = "#555";
    ctx.stroke();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(revX, y, size * 0.5, -Math.PI * 0.25, Math.PI * 0.75);
    ctx.moveTo(revX + size * 0.5 * Math.cos(Math.PI * 0.75) + 4, y + size * 0.5 * Math.sin(Math.PI * 0.75) - 4);
    ctx.lineTo(revX + size * 0.5 * Math.cos(Math.PI * 0.75), y + size * 0.5 * Math.sin(Math.PI * 0.75));
    ctx.lineTo(revX + size * 0.5 * Math.cos(Math.PI * 0.75) - 4, y + size * 0.5 * Math.sin(Math.PI * 0.75) - 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(revX, y, size * 0.5, Math.PI * 0.75, -Math.PI * 0.25);
    ctx.moveTo(revX + size * 0.5 * Math.cos(-Math.PI * 0.25) - 4, y + size * 0.5 * Math.sin(-Math.PI * 0.25) + 4);
    ctx.lineTo(revX + size * 0.5 * Math.cos(-Math.PI * 0.25), y + size * 0.5 * Math.sin(-Math.PI * 0.25));
    ctx.lineTo(revX + size * 0.5 * Math.cos(-Math.PI * 0.25) + 4, y + size * 0.5 * Math.sin(-Math.PI * 0.25) + 4);
    ctx.stroke();
}

function drawDesktopShutter(ctx, x, y, shutterSize) {
    uiBounds.shutter = { x: x, y: y, r: shutterSize, type: 'shutter' };
    ctx.beginPath();
    ctx.arc(x, y, shutterSize, 0, 2 * Math.PI);
    ctx.fillStyle = "#007aff";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    const s = shutterSize * 0.5;
    ctx.fillRect(x - s/2, y - s/2, s, s*0.8);
    ctx.font = `${shutterSize*0.4}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("...", x, y);
}

// --- Event Handlers ---

function handleCanvasClick(event) {
  const rect = canvas.getBoundingClientRect();
  const isLandscape = document.body.classList.contains('landscape');
  const touch = event.touches ? event.touches[0] : event;

  let physicalClickX = touch.clientX - rect.left;
  let physicalClickY = touch.clientY - rect.top;
  
  let logicalClickX, logicalClickY;

  if (isLandscape) {
    logicalClickX = physicalClickY;
    logicalClickY = rect.width - physicalClickX;
  } else {
    logicalClickX = physicalClickX;
    logicalClickY = physicalClickY;
  }

  const logicalCanvasWidth = isLandscape ? rect.height : rect.width;
  const logicalCanvasHeight = isLandscape ? rect.width : rect.height;

  const x = logicalClickX * (canvas.width / logicalCanvasWidth);
  const y = logicalClickY * (canvas.height / logicalCanvasHeight);

  for (const key of ['shutter', 'resToggle', 'reverseCamera']) {
      const bound = uiBounds[key];
      if (bound.r && Math.sqrt((x - bound.x)**2 + (y - bound.y)**2) < bound.r) {
          handleUIAction(bound.type);
          return;
      }
  }

  const pBound = uiBounds.palette;
  if (pBound.w && x > pBound.x && x < pBound.x + pBound.w && y > pBound.y && y < pBound.y + pBound.h) {
      handleUIAction(pBound.type);
      return;
  }
}

async function handleUIAction(actionType) {
    triggerHaptic();
    switch (actionType) {
        case 'shutter':
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
        case 'resToggle':
            isLowRes = !isLowRes;
            if (!isLive && frozenFrameSource) await drawScene(frozenFrameSource);
            break;
        case 'reverseCamera':
            isFrontCamera = !isFrontCamera;
            const mode = isFrontCamera ? 'user' : 'environment';
            startCameraWithConstraints(cameraConstraints[mode]);
            break;
        case 'palette':
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
  const sorted = [...palette].sort((a, b) => getLuminance(...a) - getLuminance(...b));
  const darkest = sorted[0];
  const isDarkMode = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const themeColor = `rgb(${isDarkMode ? darkest.join(",") : sorted[sorted.length - 1].join(",")})`;
  document.documentElement.style.setProperty("--chrome-bg", themeColor);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", themeColor);
}

async function loadPalette(source) {
  const img = new Image();
  img.src = source;
  await new Promise(resolve => { img.onload = resolve; });

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
  currentPalette = Array.from(uniqueColors).map(str => str.split(",").map(Number));
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
    const isLandscape = window.innerWidth > window.innerHeight;
    document.body.classList.toggle("landscape", isLandscape);
    setTimeout(() => {
        const source = isLive ? video : (frozenFrameSource || document.createElement('canvas'));
        drawScene(source);
    }, 100); // A small delay for the layout to settle
  };
  
  window.addEventListener("resize", handleOrientationAndResize);
  
  // Wait for the window to load to ensure all styles are applied
  // before the first draw. This is the key to fixing the initial size.
  window.addEventListener('load', handleOrientationAndResize);

  let pressTimer = null;
  const startPress = (e) => {
    e.preventDefault();
    pressTimer = setTimeout(async () => {
      try {
        const blob = await new Promise(resolve => {
          const upscaleFactor = isLowRes ? 16 : 8;
          const upscaledCanvas = document.createElement("canvas");
          upscaledCanvas.width = canvas.width * (upscaleFactor / 2);
          upscaledCanvas.height = canvas.height * (upscaleFactor / 2);
          const upscaledCtx = upscaledCanvas.getContext("2d");
          upscaledCtx.imageSmoothingEnabled = false;
          upscaledCtx.drawImage(canvas, 0, 0, upscaledCanvas.width, upscaledCanvas.height);
          upscaledCanvas.toBlob(resolve, "image/png");
        });
        const file = new File([blob], `tessella-${Date.now()}.png`, { type: "image/png" });
        if (!isDesktop && navigator.share && navigator.canShare({ files: [file] })) {
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
  canvas.addEventListener("mousedown", startPress);
  canvas.addEventListener("touchstart", startPress, { passive: false });
  canvas.addEventListener("mouseup", cancelPress);
  canvas.addEventListener("mouseleave", cancelPress);
  canvas.addEventListener("touchend", cancelPress);
  canvas.addEventListener("touchcancel", cancelPress);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
}

init();
