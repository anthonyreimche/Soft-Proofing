// Colour math the profiles meet in: CIE XYZ and L*a*b* against the ICC's D50
// white, 3×3 matrices, and RGB spaces built from primaries the way Little CMS
// builds them (Bradford-adapted to D50).

export type Vec3 = [number, number, number];
/** Row-major 3×3. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** The ICC profile connection space's white (ICC.1 7.2.16). */
export const D50: Readonly<Vec3> = [0.9642, 1.0, 0.8249];

/** The black of perceptual intent in version 4 profiles (ICC.1 6.3.4.3). */
export const PERCEPTUAL_BLACK: Readonly<Vec3> = [0.00336, 0.0034731, 0.00287];

export function mul(m: Readonly<Mat3>, v: Readonly<Vec3>): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function matMul(a: Readonly<Mat3>, b: Readonly<Mat3>): Mat3 {
  const out = new Array<number>(9) as Mat3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  }
  return out;
}

/** The inverse, or null for a singular matrix. */
export function invert(m: Readonly<Mat3>): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const k = 1 / det;
  return [
    A * k, (c * h - b * i) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, (c * d - a * f) * k,
    C * k, (b * g - a * h) * k, (a * e - b * d) * k,
  ];
}

const fLab = (t: number) => (t > (24 / 116) ** 3 ? Math.cbrt(t) : (841 / 108) * t + 16 / 116);
const fLabInverse = (t: number) => (t > 24 / 116 ? t * t * t : (108 / 841) * (t - 16 / 116));

export function xyzToLab(xyz: Readonly<Vec3>): Vec3 {
  const fx = fLab(xyz[0] / D50[0]);
  const fy = fLab(xyz[1] / D50[1]);
  const fz = fLab(xyz[2] / D50[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToXyz(lab: Readonly<Vec3>): Vec3 {
  const fy = (lab[0] + 16) / 116;
  return [D50[0] * fLabInverse(fy + lab[1] / 500), D50[1] * fLabInverse(fy), D50[2] * fLabInverse(fy - lab[2] / 200)];
}

/** CIE 1976 colour difference. */
export function deltaE76(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const BRADFORD: Mat3 = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
const BRADFORD_INVERSE = invert(BRADFORD)!;

/** Bradford adaptation from white `from` to white `to`, both XYZ. */
export function adaptation(from: Readonly<Vec3>, to: Readonly<Vec3>): Mat3 {
  const a = mul(BRADFORD, from);
  const b = mul(BRADFORD, to);
  const scale: Mat3 = [b[0] / a[0], 0, 0, 0, b[1] / a[1], 0, 0, 0, b[2] / a[2]];
  return matMul(BRADFORD_INVERSE, matMul(scale, BRADFORD));
}

export type Chromaticity = readonly [x: number, y: number];

const xyToXyz = ([x, y]: Chromaticity): Vec3 => [x / y, 1, (1 - x - y) / y];

/** RGB (linear) to D50 XYZ for primaries and a white point, Bradford-adapted
 *  as an ICC matrix/TRC profile's colorants are. */
export function rgbToD50(primaries: readonly [Chromaticity, Chromaticity, Chromaticity], white: Chromaticity): Mat3 {
  const [r, g, b] = primaries.map(xyToXyz);
  const p: Mat3 = [r[0], g[0], b[0], r[1], g[1], b[1], r[2], g[2], b[2]];
  const w = xyToXyz(white);
  const s = mul(invert(p)!, w);
  const toXyz: Mat3 = [p[0] * s[0], p[1] * s[1], p[2] * s[2], p[3] * s[0], p[4] * s[1], p[5] * s[2], p[6] * s[0], p[7] * s[1], p[8] * s[2]];
  return matMul(adaptation(w, D50), toXyz);
}

export const D65: Chromaticity = [0.3127, 0.329];

/** The sRGB tone curve, encoded to linear, extended to negatives by symmetry. */
export function srgbToLinear(v: number): number {
  const a = Math.abs(v);
  const l = a <= 0.04045 ? a / 12.92 : ((a + 0.055) / 1.055) ** 2.4;
  return v < 0 ? -l : l;
}

export function linearToSrgb(v: number): number {
  const a = Math.abs(v);
  const e = a <= 0.0031308 ? a * 12.92 : 1.055 * a ** (1 / 2.4) - 0.055;
  return v < 0 ? -e : e;
}
