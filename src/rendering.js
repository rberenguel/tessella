import * as dom from "./dom.js";
import * as state from "./state.js";
import * as config from "./config.js";
import { quantize, quantizeWithDithering } from "./quantizer.js";

async function processFrame(source) {
  const isViewLandscape = window.outerWidth > window.outerHeight;

  const targetWidth = state.isLowRes
    ? isViewLandscape
      ? config.LOW_RES_HEIGHT
      : config.LOW_RES_WIDTH
    : isViewLandscape
      ? config.PIXEL_HEIGHT
      : config.PIXEL_WIDTH;
  const targetHeight = state.isLowRes
    ? isViewLandscape
      ? config.LOW_RES_WIDTH
      : config.LOW_RES_HEIGHT
    : isViewLandscape
      ? config.PIXEL_WIDTH
      : config.PIXEL_HEIGHT;

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
  if (state.isDithering) {
    quantizeWithDithering(imageData, state.currentPalette);
  } else {
    quantize(imageData, state.currentPalette);
  }

  processedCtx.putImageData(imageData, 0, 0);

  return processedCanvas;
}

export async function drawScene(source) {
  if (
    !source ||
    (source instanceof HTMLVideoElement && !source.videoWidth) ||
    dom.canvas.clientWidth === 0
  ) {
    return;
  }
  const processedCanvas = await processFrame(source);
  state.setLastProcessedFrame(processedCanvas);
  const displayCtx = dom.canvas.getContext("2d");

  displayCtx.imageSmoothingEnabled = false;
  displayCtx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);

  const unit = Math.min(state.portraitHeight, state.portraitWidth) / 100;

  const topChrome = config.LAYOUT.PORTRAIT_TOP_CHROME_H * unit;
  const bottomChrome = config.LAYOUT.PORTRAIT_BOTTOM_CHROME_H * unit;
  const sideChrome = config.LAYOUT.LANDSCAPE_SIDE_CHROME_W * unit;

  let viewfinder;

  if (window.outerWidth > window.outerHeight) {
    document.body.classList.add("landscape");
    viewfinder = {
      x: sideChrome,
      y: 0,
      width: state.portraitHeight - sideChrome * 2,
      height: state.portraitWidth,
    };
  } else {
    document.body.classList.remove("landscape");
    viewfinder = {
      x: 0,
      y: topChrome,
      width: state.portraitWidth,
      height: state.portraitHeight - topChrome - bottomChrome,
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

export async function runLiveView() {
  if (!state.isLive) return;

  const transitionCtx = dom.transitionCanvas.getContext("2d");
  dom.transitionCanvas.width = dom.canvas.width;
  dom.transitionCanvas.height = dom.canvas.height;
  if (dom.canvas.width > 0) {
    transitionCtx.drawImage(dom.canvas, 0, 0);
  }
  dom.transitionCanvas.style.transition = "none";
  dom.transitionCanvas.style.opacity = "1";

  await drawScene(dom.video);

  dom.transitionCanvas.style.transition = `opacity ${config.FADE_DURATION_MS}ms ease-out`;
  dom.transitionCanvas.style.opacity = "0";

  setTimeout(runLiveView, config.FRAME_INTERVAL);
}
