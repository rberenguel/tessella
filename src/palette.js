import * as dom from "./dom.js";
import * as state from "./state.js";

export function displayPalette(palette) {
  dom.palettePreview.innerHTML = "";
  palette.forEach((color) => {
    const swatch = document.createElement("div");
    swatch.className = "swatch";
    swatch.style.backgroundColor = `rgb(${color.join(",")})`;
    dom.palettePreview.appendChild(swatch);
  });
}

export function updateTheme(palette) {
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

export async function getColorsFromSource(source) {
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

export async function loadPalette(source) {
  let colors;
  if (state.loadedPalettes.has(source)) {
    colors = state.loadedPalettes.get(source);
  } else {
    colors = await getColorsFromSource(source);
    state.addLoadedPalette(source, colors);
  }

  state.setCurrentPalette(colors);
  localStorage.setItem("savedPalette", source);
  displayPalette(state.currentPalette);
  updateTheme(state.currentPalette);
}
