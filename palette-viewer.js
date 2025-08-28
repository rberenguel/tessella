// --- Configuration ---
// This array is copied directly from your canvas.js file.
// If you add more palettes there, you'll need to update this list.
import { BUILT_IN_PALETTES } from "./canvas.js";

/**
 * Extracts unique colors from an image source URL.
 * This function is copied from your canvas.js file.
 * @param {string} source - The URL of the palette image.
 * @returns {Promise<Array<[number, number, number]>>} A promise that resolves to an array of RGB color arrays.
 */
async function getColorsFromSource(source) {
  const img = new Image();
  img.src = source;
  // Wait for the image to load before processing it
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  // Use an offscreen canvas to draw the image and get its pixel data
  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = img.width;
  offscreenCanvas.height = img.height;
  const ctx = offscreenCanvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height).data;

  // Use a Set to store unique colors, preventing duplicates
  const uniqueColors = new Set();
  for (let i = 0; i < imageData.length; i += 4) {
    // Skip transparent pixels
    if (imageData[i + 3] < 255) continue;
    uniqueColors.add(`${imageData[i]},${imageData[i + 1]},${imageData[i + 2]}`);
  }

  // Convert the set of color strings back to an array of number arrays
  return Array.from(uniqueColors).map((str) => str.split(",").map(Number));
}

/**
 * Main function to render all palettes to the DOM.
 */
async function renderPalettes() {
  const container = document.getElementById("palettes-container");
  if (!container) {
    console.error("Container element not found!");
    return;
  }

  // Loop through each palette source URL
  for (const paletteSrc of BUILT_IN_PALETTES) {
    try {
      // Create the main container for this palette
      const paletteItem = document.createElement("div");
      paletteItem.className = "palette-item";

      // Create and append the title
      const title = document.createElement("h2");
      // Clean up the file name for display
      title.textContent = paletteSrc
        .replace("palettes/", "")
        .replace("-32x.png", "")
        .replace(/-/g, " ");
      paletteItem.appendChild(title);

      // Create the container for the color swatches
      const swatchContainer = document.createElement("div");
      swatchContainer.className = "swatch-container";

      // Fetch and process the colors from the image
      const colors = await getColorsFromSource(paletteSrc);

      // Create and append a swatch for each color
      colors.forEach((color) => {
        const swatch = document.createElement("div");
        swatch.className = "swatch";
        swatch.style.backgroundColor = `rgb(${color.join(",")})`;
        swatchContainer.appendChild(swatch);
      });

      paletteItem.appendChild(swatchContainer);
      container.appendChild(paletteItem);
    } catch (error) {
      console.error(`Failed to load or process palette: ${paletteSrc}`, error);
      // Optionally, display an error message in the UI for the failed palette
      const errorItem = document.createElement("div");
      errorItem.className = "palette-item";
      errorItem.innerHTML = `<h2>Error loading ${paletteSrc}</h2>`;
      container.appendChild(errorItem);
    }
  }
}

// Run the main function once the window has loaded
window.onload = renderPalettes;
