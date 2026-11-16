// Conversions through a profile, and the soft proof built from them, the way
// Little CMS links profiles: the media white for absolute colorimetric, black
// point compensation by its black point detection (Adobe's algorithm for
// output tables), and its gamut check.
//
// Everything meets in D50 XYZ, relative to the PCS white. The image's own
// space is a matrix/TRC space whose white is the PCS white and whose black is
// zero, so it needs no profile here: the caller converts to and from XYZ.

import { D50, PERCEPTUAL_BLACK, deltaE76, invert, labToXyz, mul, xyzToLab, type Vec3 } from "./colour";
import { evalLut, inverseCurve, type Curve } from "./lut";
import type { IccProfile, LutTag, PcsEncoding } from "./profile";

/** ICC rendering intents. */
export const INTENT = { perceptual: 0, relative: 1, saturation: 2, absolute: 3 } as const;
export type Intent = (typeof INTENT)[keyof typeof INTENT];

export type ToXyz = (device: ArrayLike<number>) => Vec3;
export type FromXyz = (xyz: Readonly<Vec3>) => Float64Array;

const XYZ_SCALE = 65535 / 32768;
const LAB_V2_L = 65535 / 65280;
const LAB_V2_AB = 65535 / 256;

function decodePcs(v: ArrayLike<number>, encoding: PcsEncoding): Vec3 {
  switch (encoding) {
    case "xyz":
      return [v[0] * XYZ_SCALE, v[1] * XYZ_SCALE, v[2] * XYZ_SCALE];
    case "lab-v4":
      return labToXyz([v[0] * 100, v[1] * 255 - 128, v[2] * 255 - 128]);
    case "lab-v2":
      return labToXyz([v[0] * LAB_V2_L * 100, v[1] * LAB_V2_AB - 128, v[2] * LAB_V2_AB - 128]);
  }
}

function encodePcs(xyz: Readonly<Vec3>, encoding: PcsEncoding): Vec3 {
  if (encoding === "xyz") return [xyz[0] / XYZ_SCALE, xyz[1] / XYZ_SCALE, xyz[2] / XYZ_SCALE];
  const [L, a, b] = xyzToLab(xyz);
  if (encoding === "lab-v4") return [L / 100, (a + 128) / 255, (b + 128) / 255];
  return [L / 100 / LAB_V2_L, (a + 128) / LAB_V2_AB, (b + 128) / LAB_V2_AB];
}

// The tag Little CMS reads for an intent: its own, else the perceptual one.
const TAG_FOR_INTENT = [0, 1, 2, 1] as const;

function lutFor(tags: readonly (LutTag | undefined)[], intent: Intent): LutTag | undefined {
  return tags[TAG_FOR_INTENT[intent]] ?? tags[0];
}

/** Whether Little CMS counts the profile as matrix/TRC (it may carry LUTs too). */
export function isMatrixShaper(profile: IccProfile): boolean {
  return profile.matrixShaper !== null || profile.grayTrc !== null;
}

const clamp01 = (v: number) => (v > 1 ? 1 : v > 0 ? v : 0);

const inverses = new WeakMap<Curve, Curve>();
function inverseOf(curve: Curve): Curve {
  let inv = inverses.get(curve);
  if (!inv) {
    inv = inverseCurve(curve);
    inverses.set(curve, inv);
  }
  return inv;
}

/** Device values (0..1 a channel) to D50 XYZ, through the intent's table. */
export function deviceToXyz(profile: IccProfile, intent: Intent): ToXyz {
  const tag = lutFor(profile.aToB, intent);
  if (tag) return (device) => decodePcs(evalLut(tag.lut, device), tag.pcs);
  if (profile.matrixShaper) {
    const { matrix, curves } = profile.matrixShaper;
    return (d) => mul(matrix, [curves[0](d[0]), curves[1](d[1]), curves[2](d[2])]);
  }
  const trc = profile.grayTrc!;
  if (profile.pcs === "XYZ") {
    return (d) => {
      const y = trc(d[0]);
      return [D50[0] * y, D50[1] * y, D50[2] * y];
    };
  }
  return (d) => labToXyz([trc(d[0]) * 100, 0, 0]);
}

/** D50 XYZ to device values, 0..1 a channel, through the intent's table. */
export function xyzToDevice(profile: IccProfile, intent: Intent): FromXyz {
  const tag = lutFor(profile.bToA, intent);
  if (tag) return (xyz) => evalLut(tag.lut, encodePcs(xyz, tag.pcs));
  if (profile.matrixShaper) {
    const { matrix, curves } = profile.matrixShaper;
    const toRgb = invert(matrix);
    if (!toRgb) throw new Error("The profile's colorants are singular.");
    const inv = curves.map(inverseOf);
    return (xyz) => {
      const rgb = mul(toRgb, xyz);
      return Float64Array.of(inv[0](clamp01(rgb[0])), inv[1](clamp01(rgb[1])), inv[2](clamp01(rgb[2])));
    };
  }
  const inv = inverseOf(profile.grayTrc!);
  if (profile.pcs === "XYZ") return (xyz) => Float64Array.of(inv(clamp01(xyz[1])));
  return (xyz) => Float64Array.of(inv(clamp01(xyzToLab(xyz)[0] / 100)));
}

/** The device values of the darkest colour a colour space can ask for: all
 *  ink for subtractive spaces, zero for RGB and grey; null for others. */
function darkestDevice(profile: IccProfile): number[] | null {
  switch (profile.colourSpace) {
    case "RGB":
    case "GRAY":
      return new Array<number>(profile.channels).fill(0);
    case "CMYK":
    case "CMY":
      return new Array<number>(profile.channels).fill(1);
    default:
      return null;
  }
}

const neutralBlack = (xyz: Readonly<Vec3>): Vec3 => labToXyz([Math.min(xyzToLab(xyz)[0], 50), 0, 0]);

function blackAsDarkerColorant(profile: IccProfile, intent: Intent): Vec3 {
  const black = darkestDevice(profile);
  if (!black) return [0, 0, 0];
  return neutralBlack(deviceToXyz(profile, intent)(black));
}

/** L*a*b* through the profile's `intent` table to device and back through its
 *  relative colorimetric one. */
function roundTrip(profile: IccProfile, intent: Intent): (lab: Readonly<Vec3>) => Vec3 {
  const forward = xyzToDevice(profile, intent);
  const back = deviceToXyz(profile, INTENT.relative);
  return (lab) => xyzToLab(back(forward(labToXyz(lab))));
}

/** The profile's black point as a source (cmsDetectBlackPoint). Where the
 *  profile has no table of the intent's own, the black is found through the
 *  perceptual table it falls back to, as every conversion here does; Little
 *  CMS may instead take a black of zero there, leaving compensation without
 *  effect for such a profile. */
export function sourceBlackPoint(profile: IccProfile, intent: Intent): Vec3 {
  if (profile.version >= 4 && (intent === INTENT.perceptual || intent === INTENT.saturation)) {
    return isMatrixShaper(profile) ? blackAsDarkerColorant(profile, INTENT.relative) : [...PERCEPTUAL_BLACK];
  }
  if (intent === INTENT.relative && profile.deviceClass === "prtr" && profile.colourSpace === "CMYK") {
    return neutralBlack(labToXyz(roundTrip(profile, INTENT.perceptual)([0, 0, 0])));
  }
  return blackAsDarkerColorant(profile, intent);
}

// The vertex of the least-squares quadratic through (x, y), clamped to 0..50.
function quadraticRoot(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  if (n < 4) return 0;
  let sx = 0;
  let sx2 = 0;
  let sx3 = 0;
  let sx4 = 0;
  let sy = 0;
  let syx = 0;
  let syx2 = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const x2 = xi * xi;
    sx += xi;
    sx2 += x2;
    sx3 += x2 * xi;
    sx4 += x2 * x2;
    sy += y[i];
    syx += y[i] * xi;
    syx2 += y[i] * x2;
  }
  const m = invert([n, sx, sx2, sx, sx2, sx3, sx2, sx3, sx4]);
  if (!m) return 0;
  const [c, b, a] = mul(m, [sy, syx, syx2]);
  if (Math.abs(a) < 1e-10) {
    if (Math.abs(b) < 1e-10) return 0;
    // As Little CMS has it: min(0, max(50, …)), which is always 0.
    return Math.min(0, Math.max(50, -c / b));
  }
  const d = b * b - 4 * a * c;
  if (d <= 0) return 0;
  return Math.max(0, Math.min(50, (-b + Math.sqrt(d)) / (2 * a)));
}

/** The profile's black point as a destination (cmsDetectDestinationBlackPoint):
 *  for a LUT-based grey, RGB or CMYK output table, from the round trip's L*
 *  ramp as Adobe's black point compensation specifies. */
export function destinationBlackPoint(profile: IccProfile, intent: Intent): Vec3 {
  if (profile.version >= 4 && (intent === INTENT.perceptual || intent === INTENT.saturation)) {
    return isMatrixShaper(profile) ? blackAsDarkerColorant(profile, INTENT.relative) : [...PERCEPTUAL_BLACK];
  }
  const lutBased = lutFor(profile.bToA, intent) !== undefined;
  if (!lutBased || !["GRAY", "RGB", "CMYK"].includes(profile.colourSpace)) return sourceBlackPoint(profile, intent);

  const initial: Vec3 = intent === INTENT.relative ? xyzToLab(sourceBlackPoint(profile, intent)) : [0, 0, 0];
  const trip = roundTrip(profile, intent);
  const a = Math.min(50, Math.max(-50, initial[1]));
  const b = Math.min(50, Math.max(-50, initial[2]));
  const inRamp: number[] = [];
  const outRamp: number[] = [];
  for (let l = 0; l < 256; l++) {
    const L = (l * 100) / 255;
    inRamp.push(L);
    outRamp.push(trip([L, a, b])[0]);
  }
  for (let l = 254; l > 0; l--) outRamp[l] = Math.min(outRamp[l], outRamp[l + 1]);
  if (!(outRamp[0] < outRamp[255])) return [0, 0, 0];
  const minL = outRamp[0];
  const maxL = outRamp[255];
  if (intent === INTENT.relative) {
    const straight = inRamp.every((L, l) => L <= minL + 0.2 * (maxL - minL) || Math.abs(L - outRamp[l]) < 4);
    if (straight) return labToXyz(initial);
  }
  const [lo, hi] = intent === INTENT.relative ? [0.1, 0.5] : [0.03, 0.25];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let l = 0; l < 256; l++) {
    const y = (outRamp[l] - minL) / (maxL - minL);
    if (y >= lo && y < hi) {
      xs.push(inRamp[l]);
      ys.push(y);
    }
  }
  if (xs.length < 3) return [0, 0, 0];
  return labToXyz([Math.max(0, quadraticRoot(xs, ys)), initial[1], initial[2]]);
}

/** Black point compensation from black `from` to black `to`, per channel in
 *  XYZ, keeping the PCS white; null when the blacks are the same. */
export function blackPointScaling(from: Readonly<Vec3>, to: Readonly<Vec3>): ((xyz: Readonly<Vec3>) => Vec3) | null {
  if (from.every((v, i) => v === to[i])) return null;
  const scale = [0, 1, 2].map((i) => (to[i] - D50[i]) / (from[i] - D50[i]));
  const offset = [0, 1, 2].map((i) => (-D50[i] * (to[i] - from[i])) / (from[i] - D50[i]));
  return (xyz) => [scale[0] * xyz[0] + offset[0], scale[1] * xyz[1] + offset[1], scale[2] * xyz[2] + offset[2]];
}

const whiteScaling =
  (from: Readonly<Vec3>, to: Readonly<Vec3>) =>
  (xyz: Readonly<Vec3>): Vec3 => [(xyz[0] * from[0]) / to[0], (xyz[1] * from[1]) / to[1], (xyz[2] * from[2]) / to[2]];

export interface ProofOptions {
  intent: Intent;
  /** Black point compensation into the proof profile; ignored for absolute
   *  colorimetric, implied for a version 4 profile's perceptual and saturation
   *  tables. */
  blackPointCompensation: boolean;
  /** Show the paper's white and the ink's black as they are (absolute
   *  colorimetric to the display). Off, they map to the display's white and
   *  black (relative colorimetric with black point compensation). */
  simulatePaper: boolean;
  /** For comparing with Little CMS, whose proofs never compensate the
   *  display's black: false leaves it out. Default true. */
  displayBlack?: boolean;
}

export interface Proof {
  /** The device values the profile's output receives for the image colour. */
  device(xyz: Readonly<Vec3>): Float64Array;
  /** The image colour (D50 XYZ, relative to the PCS white) as the display
   *  should show it to look like the proof's output. */
  proof(xyz: Readonly<Vec3>): Vec3;
  /** How far past the edge of what the profile reproduces the colour lies,
   *  in delta E: negative inside. At GAMUT_EDGE or above, Little CMS's gamut
   *  check flags it. A signed margin rather than its rounded value, so a
   *  table of margins interpolates to the edge itself. Independent of the
   *  options: the check is relative colorimetric. */
  gamut(xyz: Readonly<Vec3>): number;
}

/** The gamut margin from which a colour counts as out of gamut. */
export const GAMUT_EDGE = 0.5;
// Margins are held to ±this, so a cell between a far-out node and an inside one
// still crosses the edge near where the colour does.
const MARGIN_LIMIT = 8;
const MATRIX_THRESHOLD = 1;
const LUT_THRESHOLD = 5;

export function createProof(profile: IccProfile, options: ProofOptions): Proof {
  const { intent, simulatePaper } = options;
  const white = profile.mediaWhite;

  const absolute = intent === INTENT.absolute;
  const compensate =
    !absolute &&
    (options.blackPointCompensation ||
      (profile.version >= 4 && (intent === INTENT.perceptual || intent === INTENT.saturation)));
  const intoProof = absolute
    ? whiteScaling(D50, white)
    : compensate
      ? blackPointScaling([0, 0, 0], destinationBlackPoint(profile, intent))
      : null;
  const toDevice = xyzToDevice(profile, intent);
  const fromDevice = deviceToXyz(profile, INTENT.relative);
  const toDisplay = simulatePaper
    ? whiteScaling(white, D50)
    : options.displayBlack === false
      ? null
      : blackPointScaling(sourceBlackPoint(profile, INTENT.relative), [0, 0, 0]);

  const forward = xyzToDevice(profile, INTENT.relative);
  const threshold = isMatrixShaper(profile) ? MATRIX_THRESHOLD : LUT_THRESHOLD;
  const trip = (lab: Readonly<Vec3>) => xyzToLab(fromDevice(forward(labToXyz(lab))));
  const device = (xyz: Readonly<Vec3>) => toDevice(intoProof ? intoProof(xyz) : xyz);

  return {
    device,
    proof(xyz) {
      const pcs = fromDevice(device(xyz));
      return toDisplay ? toDisplay(pcs) : pcs;
    },
    gamut(xyz) {
      // Little CMS's check: once through the profile and back, then again from
      // there. A colour that moves the first time and not the second was out.
      const in1 = xyzToLab(xyz);
      const out1 = trip(in1);
      const out2 = trip(out1);
      const dE1 = deltaE76(in1, out1);
      const dE2 = deltaE76(out1, out2);
      const margin =
        dE1 < threshold || dE2 < threshold ? dE1 - threshold : (dE2 === 0 ? dE1 : dE1 / dE2) - threshold;
      return Math.min(MARGIN_LIMIT, Math.max(-MARGIN_LIMIT, margin));
    },
  };
}
