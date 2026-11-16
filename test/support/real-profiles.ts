// The profiles Windows keeps in its colour folder, the Little CMS answers
// scripts/lcms-fixtures.py recorded for them, and the sRGB that script used
// (Little CMS's own, built from primaries).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { D65, invert, linearToSrgb, mul, rgbToD50, srgbToLinear, type Mat3, type Vec3 } from "../../src/icc/colour";
import { parseProfile, type IccProfile } from "../../src/icc/profile";

export const COLOUR_FOLDER = "C:/Windows/System32/spool/drivers/color";

interface Fixtures {
  levels: number[];
  profiles: Record<string, Record<string, number[][] | number[]>>;
}

const here = dirname(fileURLToPath(import.meta.url));
export const fixtures = JSON.parse(readFileSync(join(here, "..", "fixtures", "lcms.json"), "utf8")) as Fixtures;

/** The sample colours the fixtures hold answers for, in their order. */
export const samples: Vec3[] = fixtures.levels.flatMap((r) => fixtures.levels.flatMap((g) => fixtures.levels.map((b): Vec3 => [r, g, b])));

export const SRGB_TO_D50: Mat3 = rgbToD50(
  [
    [0.64, 0.33],
    [0.3, 0.6],
    [0.15, 0.06],
  ],
  D65,
);
const D50_TO_SRGB = invert(SRGB_TO_D50)!;

export const srgb8ToXyz = (rgb: Readonly<Vec3>): Vec3 => mul(SRGB_TO_D50, [srgbToLinear(rgb[0] / 255), srgbToLinear(rgb[1] / 255), srgbToLinear(rgb[2] / 255)]);

export function xyzToSrgb8(xyz: Readonly<Vec3>): Vec3 {
  const lin = mul(D50_TO_SRGB, xyz);
  return lin.map((v) => linearToSrgb(Math.min(1, Math.max(0, v))) * 255) as Vec3;
}

export function realProfile(file: string): IccProfile | null {
  const path = join(COLOUR_FOLDER, file);
  if (!existsSync(path)) return null;
  const parsed = parseProfile(new Uint8Array(readFileSync(path)));
  if (!parsed.ok) throw new Error(`${file}: ${parsed.error}`);
  return parsed.profile;
}

export const hasProfile = (file: string) => existsSync(join(COLOUR_FOLDER, file));
