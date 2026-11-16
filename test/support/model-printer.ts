// A make-believe CMY printer for the tests, defined by formula so its profile's
// tables can be checked against the truth: ink takes light away from paper
// along a 1.8 curve, through sRGB-like primaries, down to a 3 % black.

import { D50, D65, invert, labToXyz, mul, rgbToD50, xyzToLab, type Vec3 } from "../../src/icc/colour";

const PRIMARIES = rgbToD50(
  [
    [0.64, 0.33],
    [0.3, 0.6],
    [0.15, 0.06],
  ],
  D65,
);
const TO_RGB = invert(PRIMARIES)!;
export const INK_BLACK = 0.03;
const GAMMA = 1.8;

/** The paper's white, absolute: a little yellow and darker than D50. */
export const PAPER_WHITE: Vec3 = [0.86, 0.88, 0.68];

/** Device CMY (0 = no ink) to relative D50 XYZ. */
export function printerXyz(cmy: readonly number[]): Vec3 {
  const lin = mul(PRIMARIES, [(1 - cmy[0]) ** GAMMA, (1 - cmy[1]) ** GAMMA, (1 - cmy[2]) ** GAMMA]);
  return [0, 1, 2].map((i) => INK_BLACK * D50[i] + (1 - INK_BLACK) * lin[i]) as Vec3;
}

/** Relative D50 XYZ to the CMY printing it, clipped to what the inks reach. */
export function printerCmy(xyz: Readonly<Vec3>): number[] {
  const lin = mul(TO_RGB, [0, 1, 2].map((i) => (xyz[i] - INK_BLACK * D50[i]) / (1 - INK_BLACK)) as Vec3);
  return lin.map((v) => 1 - Math.min(1, Math.max(0, v)) ** (1 / GAMMA));
}

const lab4 = (lab: Vec3) => [lab[0] / 100, (lab[1] + 128) / 255, (lab[2] + 128) / 255];
const lab2 = (lab: Vec3) => [(lab[0] / 100) * (65280 / 65535), ((lab[1] + 128) * 256) / 65535, ((lab[2] + 128) * 256) / 65535];
const xyz15 = (xyz: Vec3) => xyz.map((v) => (v * 32768) / 65535);

export type Encoding = "lab-v2" | "lab-v4" | "xyz";

export function encode(xyz: Vec3, encoding: Encoding): number[] {
  if (encoding === "xyz") return xyz15(xyz);
  return encoding === "lab-v2" ? lab2(xyzToLab(xyz)) : lab4(xyzToLab(xyz));
}

export function decode(v: readonly number[], encoding: Encoding): Vec3 {
  if (encoding === "xyz") return v.map((x) => (x * 65535) / 32768) as Vec3;
  if (encoding === "lab-v4") return labToXyz([v[0] * 100, v[1] * 255 - 128, v[2] * 255 - 128]);
  return labToXyz([(v[0] * 65535 * 100) / 65280, (v[1] * 65535) / 256 - 128, (v[2] * 65535) / 256 - 128]);
}

/** The model's A2B and B2A samplers for a tag that encodes its PCS so. */
export const aToBSampler = (encoding: Encoding) => (cmy: number[]) => encode(printerXyz(cmy), encoding);
export const bToASampler = (encoding: Encoding) => (pcs: number[]) => printerCmy(decode(pcs, encoding));
