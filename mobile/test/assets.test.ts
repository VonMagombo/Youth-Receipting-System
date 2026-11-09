/**
 * Checks the icon files made by scripts/build-logo.js against Android's rules, so a regenerated logo
 * cannot ship an emblem that launchers clip.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const Jimp = require('jimp-compact');
const asset = (name: string) => Jimp.read(new URL(`../assets/${name}`, import.meta.url).pathname);

/** Largest distance from the centre, as a share of the canvas width, of any pixel with alpha above 8. */
function outerRadius(img: any): number {
  const { width, height, data } = img.bitmap;
  let max = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) max = Math.max(max, Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2));
    }
  }
  return max / width;
}

// Android shows the central 66dp of a 108dp adaptive icon on every launcher mask.
const SAFE_RADIUS = 66 / 108 / 2;

describe('generated icons', () => {
  it('keeps the adaptive icon emblem inside the safe zone every launcher shows', async () => {
    const r = outerRadius(await asset('android-icon-foreground.png'));
    expect(r).toBeLessThanOrEqual(SAFE_RADIUS);
    expect(r).toBeGreaterThan(SAFE_RADIUS * 0.9); // not shrunk to a speck either
  });

  it('makes the themed (monochrome) icon a single-colour shape inside the safe zone', async () => {
    const img = await asset('android-icon-monochrome.png');
    expect(outerRadius(img)).toBeLessThanOrEqual(SAFE_RADIUS);
    const { data } = img.bitmap;
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      opaque++;
      expect([data[i], data[i + 1], data[i + 2]]).toEqual([255, 255, 255]);
    }
    expect(opaque).toBeGreaterThan(data.length / 4 / 20); // a real shape, not a few stray pixels
  });

  it('cuts the emblem out round, with transparent corners, for the in-app logo', async () => {
    const img = await asset('logo-256.png');
    const alpha = (x: number, y: number) => img.bitmap.data[(y * 256 + x) * 4 + 3];
    expect([alpha(0, 0), alpha(255, 0), alpha(0, 255), alpha(255, 255)]).toEqual([0, 0, 0, 0]);
    expect(alpha(128, 128)).toBe(255);
  });
});
