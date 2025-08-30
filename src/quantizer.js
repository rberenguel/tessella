// --- Helper Functions ---
const getLuminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const colorDistance = (c1, c2) =>
  (c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2;

// --- K-Means Clustering ---
function kmeans(pixels, k) {
  // Create a set of unique colors for deterministic re-initialization
  const uniqueColorsSet = new Set();
  for (const pixel of pixels) {
    uniqueColorsSet.add(pixel.toString());
  }
  const uniqueColors = Array.from(uniqueColorsSet).map((str) =>
    str.split(",").map(Number),
  );

  // 1. Initialize k centroids randomly from the pixel data
  let centroids = [];
  const step = Math.floor(pixels.length / k);
  for (let i = 0; i < k; i++) {
    // Pick colors at almost intervals instead of fully randomly
    centroids.push(pixels[i * step]);
  }

  let assignments = new Array(pixels.length);
  for (let iter = 0; iter < 15; iter++) {
    // Limit iterations
    // 2. Assign each pixel to the closest centroid
    for (let i = 0; i < pixels.length; i++) {
      let minDistance = Infinity;
      for (let j = 0; j < k; j++) {
        const distance = colorDistance(pixels[i], centroids[j]);
        if (distance < minDistance) {
          minDistance = distance;
          assignments[i] = j;
        }
      }
    }

    // 3. Recalculate centroids as the mean of assigned pixels
    let newCentroids = new Array(k).fill(0).map(() => [0, 0, 0]);
    let counts = new Array(k).fill(0);
    for (let i = 0; i < pixels.length; i++) {
      const clusterIndex = assignments[i];
      newCentroids[clusterIndex][0] += pixels[i][0];
      newCentroids[clusterIndex][1] += pixels[i][1];
      newCentroids[clusterIndex][2] += pixels[i][2];
      counts[clusterIndex]++;
    }
    for (let i = 0; i < k; i++) {
      if (counts[i] > 0) {
        newCentroids[i][0] /= counts[i];
        newCentroids[i][1] /= counts[i];
        newCentroids[i][2] /= counts[i];
      } else {
        // Handle empty clusters deterministically by picking from unique colors
        newCentroids[i] = uniqueColors[(iter * k + i) % uniqueColors.length];
      }
    }

    // 4. Check for convergence (or just use fixed iterations for simplicity)
    centroids = newCentroids;
  }
  return { centroids, assignments };
}

// --- Palette Mapping ---
function mapPalettesByLuminance(imagePalette, targetPalette) {
  const sortedImage = imagePalette
    .map((c, i) => ({ color: c, lum: getLuminance(...c), index: i }))
    .sort((a, b) => a.lum - b.lum);
  const sortedTarget = [...targetPalette].sort(
    (a, b) => getLuminance(...a) - getLuminance(...b),
  );

  const mapping = new Array(imagePalette.length);
  for (let i = 0; i < imagePalette.length; i++) {
    mapping[sortedImage[i].index] = sortedTarget[i];
  }
  return mapping;
}

// --- Main Quantization Logic ---
export function quantize(imageData, targetPalette) {
  const useKmeans = true,
    useDithering = true;
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  // Convert Uint8ClampedArray to a simple array of [r,g,b] pixels
  const originalPixels = [];
  for (let i = 0; i < data.length; i += 4) {
    originalPixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  let finalColors = new Array(originalPixels.length);

  if (useKmeans && targetPalette.length > 0) {
    // Step 1: K-Means on source image
    const { centroids: imagePalette, assignments } = kmeans(
      originalPixels,
      targetPalette.length,
    );

    // Step 2: Map the two palettes by luminance
    const colorMap = mapPalettesByLuminance(imagePalette, targetPalette);

    // Step 3: Assign the final mapped color to each pixel
    for (let i = 0; i < originalPixels.length; i++) {
      finalColors[i] = colorMap[assignments[i]];
    }
  } else if (targetPalette.length > 0) {
    // Direct mapping
    for (let i = 0; i < originalPixels.length; i++) {
      let minDistance = Infinity;
      let closestColor = targetPalette[0];
      for (const paletteColor of targetPalette) {
        const dist = colorDistance(originalPixels[i], paletteColor);
        if (dist < minDistance) {
          minDistance = dist;
          closestColor = paletteColor;
        }
      }
      finalColors[i] = closestColor;
    }
  } else {
    // No palette loaded, just return
    return;
  }

  // TODO clean up this. This dithering does nothing
  if (false) {
    const floatPixels = new Float32Array(originalPixels.flat());
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const i4 = i * 4;
        const finalColor = finalColors[i];

        const errR = floatPixels[i * 3] - finalColor[0];
        const errG = floatPixels[i * 3 + 1] - finalColor[1];
        const errB = floatPixels[i * 3 + 2] - finalColor[2];

        data[i4] = finalColor[0];
        data[i4 + 1] = finalColor[1];
        data[i4 + 2] = finalColor[2];

        const diffuse = (dx, dy, factor) => {
          if (x + dx >= 0 && x + dx < width && y + dy < height) {
            const ni = ((y + dy) * width + (x + dx)) * 3;
            floatPixels[ni] += errR * factor;
            floatPixels[ni + 1] += errG * factor;
            floatPixels[ni + 2] += errB * factor;
          }
        };
        diffuse(1, 0, 7 / 16);
        diffuse(-1, 1, 3 / 16);
        diffuse(0, 1, 5 / 16);
        diffuse(1, 1, 1 / 16);
      }
    }
  } else {
    // No dithering
    for (let i = 0; i < finalColors.length; i++) {
      const i4 = i * 4;
      data[i4] = finalColors[i][0];
      data[i4 + 1] = finalColors[i][1];
      data[i4 + 2] = finalColors[i][2];
    }
  }
}

export function quantizeWithDithering(imageData, targetPalette) {
  if (!targetPalette || targetPalette.length === 0) return;

  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  // 8x8 Bayer matrix
  const bayerMatrix = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
  ];

  const findClosest = (r, g, b, palette) => {
    let closest = palette[0];
    let minDistanceSq = Infinity;
    for (const pColor of palette) {
      const dR = r - pColor[0];
      const dG = g - pColor[1];
      const dB = b - pColor[2];
      const distanceSq = dR * dR + dG * dG + dB * dB;
      if (distanceSq < minDistanceSq) {
        minDistanceSq = distanceSq;
        closest = pColor;
      }
    }
    return closest;
  };

  const DITHER_FACTOR = 4; // Adjust this to control dither strength

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i4 = (y * width + x) * 4;
      const matrixVal = bayerMatrix[y % 8][x % 8];

      // Normalize matrix value and apply dither
      const dither = (matrixVal / 64 - 0.5) * DITHER_FACTOR;

      const r = data[i4] + dither;
      const g = data[i4 + 1] + dither;
      const b = data[i4 + 2] + dither;

      const newColor = findClosest(r, g, b, targetPalette);

      data[i4] = newColor[0];
      data[i4 + 1] = newColor[1];
      data[i4 + 2] = newColor[2];
    }
  }
}
