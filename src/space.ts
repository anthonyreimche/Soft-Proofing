// The space the proof table is indexed in and answers in: Rec. 2020
// primaries through the sRGB curve, as the stage receives its colour
// (`space: { encoding: "perceptual", primaries: "rec2020" }`). Its [0, 1]
// cube holds nearly every colour a photo carries, so few are clipped before
// the profile sees them, and the curve spends the table's nodes evenly by eye.

import { D65, invert, linearToSrgb, mul, rgbToD50, srgbToLinear, type Mat3, type Vec3 } from "./icc/colour";

export const REC2020_TO_D50: Mat3 = rgbToD50(
  [
    [0.708, 0.292],
    [0.17, 0.797],
    [0.131, 0.046],
  ],
  D65,
);
export const D50_TO_REC2020: Mat3 = invert(REC2020_TO_D50)!;

/** A colour in the stage's encoding to D50 XYZ. */
export function encodedToXyz(rgb: Readonly<Vec3>): Vec3 {
  return mul(REC2020_TO_D50, [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])]);
}

/** D50 XYZ to the stage's encoding, sign kept for colours past its primaries. */
export function xyzToEncoded(xyz: Readonly<Vec3>): Vec3 {
  const lin = mul(D50_TO_REC2020, xyz);
  return [linearToSrgb(lin[0]), linearToSrgb(lin[1]), linearToSrgb(lin[2])];
}
