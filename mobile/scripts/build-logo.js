#!/usr/bin/env node
// Builds every logo and icon file the app, the receipt PDFs and the verify page use, from one source:
// assets/logo-original.jpg (the church's full logo, emblem above the name). Re-run after replacing it:
//   node scripts/build-logo.js
// Uses jimp-compact, which Expo already installs, so there is nothing extra to install.
const fs = require('node:fs');
const path = require('node:path');
const Jimp = require('jimp-compact');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets/logo-original.jpg');

/** Share of an adaptive icon canvas the emblem may fill: the 66dp safe zone of 108dp is 61.1%. */
const ADAPTIVE_FRACTION = 0.6;

/** True for the emblem's blue disc. Used to find the circle in the source image. */
const isBlue = (r, g, b) => b > 120 && r < 40 && g < 100;

/**
 * Find the emblem: the bounding box of its blue pixels. The outermost blue is the thin line around the
 * grey ring, so the box is the emblem's full outline.
 */
function findEmblem(img) {
  const { width, height, data } = img.bitmap;
  let x0 = width, x1 = -1, y0 = height, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (isBlue(data[i], data[i + 1], data[i + 2])) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('build-logo: no blue emblem found in assets/logo-original.jpg');
  // A circle gives a square box. Anything else means other blue in the image (text, a frame) was
  // picked up, and every output would be cropped wrong, so stop instead of writing them.
  const w = x1 - x0, h = y1 - y0;
  if (Math.abs(w - h) > 0.02 * Math.max(w, h)) {
    throw new Error(`build-logo: blue area is ${w}x${h}, not a circle. Crop logo-original.jpg so the only blue is the emblem.`);
  }
  const r = Math.max(w, h) / 2;
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r };
}

/** Square crop of the emblem with everything outside the circle transparent (soft 1.5px edge). */
function cutEmblem(img, { cx, cy, r }) {
  const R = r + 0.5; // up to the outer edge of the blue line, not into the white background around it
  const side = Math.ceil(R * 2) + 4;
  const out = new Jimp(side, side, 0x00000000);
  const ox = cx - side / 2, oy = cy - side / 2;
  out.scan(0, 0, side, side, function (x, y, i) {
    const sx = Math.round(ox + x), sy = Math.round(oy + y);
    const d = Math.hypot(x + 0.5 - side / 2, y + 0.5 - side / 2);
    const a = Math.max(0, Math.min(1, (R - d) / 1.5 + 0.5));
    if (a === 0 || sx < 0 || sy < 0 || sx >= img.bitmap.width || sy >= img.bitmap.height) return;
    const j = (sy * img.bitmap.width + sx) * 4;
    this.bitmap.data[i] = img.bitmap.data[j];
    this.bitmap.data[i + 1] = img.bitmap.data[j + 1];
    this.bitmap.data[i + 2] = img.bitmap.data[j + 2];
    this.bitmap.data[i + 3] = Math.round(a * 255);
  });
  return out;
}

/** The emblem centred on a square canvas, scaled to `fraction` of its width. */
function placed(emblem, size, fraction, bg = 0x00000000) {
  const canvas = new Jimp(size, size, bg);
  const d = Math.round(size * fraction);
  const e = emblem.clone().resize(d, d, Jimp.RESIZE_BICUBIC);
  return canvas.composite(e, Math.round((size - d) / 2), Math.round((size - d) / 2));
}

/**
 * Android 13+ themed icon: one tint colour wherever the emblem has its crown, rays, ring and the cross's
 * white border. The blue disc and the red of the cross are cut out, so the cross reads as an outline.
 */
function monochrome(emblem, size, fraction) {
  const m = emblem.clone();
  m.scan(0, 0, m.bitmap.width, m.bitmap.height, function (x, y, i) {
    const [r, g, b, a] = this.bitmap.data.slice(i, i + 4);
    const red = r > 180 && g < 110 && b < 110;
    const keep = a > 0 && !isBlue(r, g, b) && !(b > 100 && r < 90) && !red;
    this.bitmap.data[i] = this.bitmap.data[i + 1] = this.bitmap.data[i + 2] = 255;
    this.bitmap.data[i + 3] = keep ? a : 0;
  });
  return placed(m, size, fraction);
}

async function main() {
  const src = await Jimp.read(SRC);
  const emblem = cutEmblem(src, findEmblem(src));
  const WHITE = 0xffffffff;
  const outputs = {
    // App icon (Play Store / launcher fallback): emblem on white with a small margin.
    'assets/icon.png': placed(emblem, 1024, 0.9, WHITE),
    // Adaptive icon: only the central 66dp of the 108dp canvas (61%) is shown by every launcher mask,
    // so the emblem's ring stays inside 60%.
    'assets/android-icon-foreground.png': placed(emblem, 1024, ADAPTIVE_FRACTION),
    'assets/android-icon-background.png': new Jimp(1024, 1024, WHITE),
    'assets/android-icon-monochrome.png': monochrome(emblem, 1024, ADAPTIVE_FRACTION),
    'assets/favicon.png': placed(emblem, 48, 1),
    // In-app header and setup screen.
    'assets/logo-256.png': placed(emblem, 256, 1),
    // Verification page.
    '../verify/logo.png': placed(emblem, 256, 1),
  };
  for (const [rel, img] of Object.entries(outputs)) {
    await img.writeAsync(path.join(ROOT, rel));
    console.log(`wrote ${rel} (${img.bitmap.width}x${img.bitmap.height})`);
  }

  // Receipt and report PDFs embed the logo as a data URI: a small JPEG on white keeps PDFs light.
  const pdf = placed(emblem, 300, 1, WHITE).quality(88);
  const b64 = (await pdf.getBufferAsync(Jimp.MIME_JPEG)).toString('base64');
  const ts = `// Generated from assets/logo-original.jpg by scripts/build-logo.js (300px JPEG). Do not edit by hand.
export const LOGO_DATA_URI =
  'data:image/jpeg;base64,${b64}';
`;
  fs.writeFileSync(path.join(ROOT, 'src/assets/logo.ts'), ts);
  console.log(`wrote src/assets/logo.ts (${Math.round(b64.length / 1024)} KB base64)`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
