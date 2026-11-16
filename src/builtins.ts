// The screens a photo can be proofed for without a profile file: the common
// display colour spaces, as matrix/TRC profiles built from their primaries.

import { D50, D65, rgbToD50, srgbToLinear, type Chromaticity } from "./icc/colour";
import type { Curve } from "./icc/lut";
import type { IccProfile } from "./icc/profile";

type Primaries = readonly [Chromaticity, Chromaticity, Chromaticity];

const srgbCurve: Curve = (x) => srgbToLinear(Math.min(1, Math.max(0, x)));
// Adobe RGB (1998): gamma 563/256.
const adobeCurve: Curve = (x) => Math.max(0, x) ** (563 / 256);

function screen(description: string, primaries: Primaries, curve: Curve): IccProfile {
  return {
    description,
    version: 4,
    deviceClass: "mntr",
    colourSpace: "RGB",
    channels: 3,
    pcs: "XYZ",
    mediaWhite: [...D50],
    aToB: [],
    bToA: [],
    matrixShaper: { matrix: rgbToD50(primaries, D65), curves: [curve, curve, curve] },
    grayTrc: null,
  };
}

export interface BuiltIn {
  id: string;
  label: string;
  profile: IccProfile;
}

export const BUILT_INS: readonly BuiltIn[] = [
  {
    id: "screen:srgb",
    label: "sRGB",
    profile: screen("sRGB", [[0.64, 0.33], [0.3, 0.6], [0.15, 0.06]], srgbCurve),
  },
  {
    id: "screen:display-p3",
    label: "Display P3",
    profile: screen("Display P3", [[0.68, 0.32], [0.265, 0.69], [0.15, 0.06]], srgbCurve),
  },
  {
    id: "screen:adobe-rgb",
    label: "Adobe RGB (1998)",
    profile: screen("Adobe RGB (1998)", [[0.64, 0.33], [0.21, 0.71], [0.15, 0.06]], adobeCurve),
  },
];

export const DEFAULT_PROFILE_ID = BUILT_INS[0].id;
