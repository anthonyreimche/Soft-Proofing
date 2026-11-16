// Reads an ICC profile (versions 2 and 4) into what a proof needs: its class,
// colour space and white, and its transforms between device values and the
// profile connection space, per rendering intent. A transform is a LUT tag
// (lut8, lut16, lutAtoB or lutBtoA), or the colorants and tone curves of a
// matrix/TRC or grey profile.

import { D50, type Mat3, type Vec3 } from "./colour";
import { tableCurve, type Curve, type Lut, type Step } from "./lut";

/** How a LUT tag holds PCS values, 0..1: XYZ as u1Fixed15, L*a*b* in the
 *  version 2 16-bit encoding (lut16 only) or the version 4 one. */
export type PcsEncoding = "xyz" | "lab-v2" | "lab-v4";

export interface LutTag {
  lut: Lut;
  /** The encoding of the tag's PCS side. */
  pcs: PcsEncoding;
}

export type DeviceClass = "scnr" | "mntr" | "prtr" | "link" | "spac" | "abst" | "nmcl";

export interface IccProfile {
  description: string;
  /** The version as major + minor / 10, e.g. 2.1 or 4.3. */
  version: number;
  deviceClass: DeviceClass;
  /** The data colour space's signature, trimmed: "RGB", "CMYK", "GRAY", "6CLR" … */
  colourSpace: string;
  channels: number;
  pcs: "XYZ" | "Lab";
  /** The media white as Little CMS reads it: the wtpt tag, or D50 for a
   *  version 2 display profile or a profile without one. */
  mediaWhite: Vec3;
  /** A2B0, A2B1, A2B2: device to PCS. */
  aToB: readonly (LutTag | undefined)[];
  /** B2A0, B2A1, B2A2: PCS to device. */
  bToA: readonly (LutTag | undefined)[];
  /** An RGB profile's D50 colorants (columns) and tone curves. */
  matrixShaper: { matrix: Mat3; curves: readonly [Curve, Curve, Curve] } | null;
  /** A grey profile's tone curve, to Y (XYZ PCS) or to L* over 100 (Lab PCS). */
  grayTrc: Curve | null;
}

export type ParsedProfile = { ok: true; profile: IccProfile } | { ok: false; error: string };

export const PROFILE_ERROR = {
  notIcc: "This file isn't an ICC profile, or it's damaged.",
  kind: "This is a device link, abstract or named colour profile. Soft proofing needs a printer, display or colour space profile.",
  colourSpace: "This profile's colour space isn't one Safelight can proof.",
  oneWay: "This profile can't convert both into and out of its colour space, which a proof needs.",
  tagType: "This profile uses a table or curve type Safelight can't read.",
} as const;

const HEADER = 128;
const MAX_DESCRIPTION = 256;
const PARA_PARAMS = [1, 3, 4, 5, 7];
const CLASSES: readonly DeviceClass[] = ["scnr", "mntr", "prtr", "link", "spac", "abst", "nmcl"];

class Reader {
  readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  sig(at: number): string {
    const b = this.bytes;
    return String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
  }
  u8(at: number) {
    return this.view.getUint8(at);
  }
  u16(at: number) {
    return this.view.getUint16(at);
  }
  u32(at: number) {
    return this.view.getUint32(at);
  }
  s15(at: number) {
    return this.view.getInt32(at) / 65536;
  }
}

/** A tag's bytes are bad or of an unknown type: the parse stops with this. */
class TagError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

interface Tag {
  offset: number;
  size: number;
}

function need(ok: boolean, reason: string = PROFILE_ERROR.notIcc): asserts ok {
  if (!ok) throw new TagError(reason);
}

/** A curv or para element at `at`, and the bytes it takes (unpadded). */
function readCurve(r: Reader, at: number, end: number): { curve: Curve; size: number } {
  need(at + 12 <= end);
  const type = r.sig(at);
  if (type === "curv") {
    const n = r.u32(at + 8);
    need(at + 12 + n * 2 <= end);
    if (n === 0) return { curve: (x) => x, size: 12 };
    if (n === 1) {
      const gamma = r.u16(at + 12) / 256;
      return { curve: (x) => (x > 0 ? x ** gamma : 0), size: 14 };
    }
    const table = new Float64Array(n);
    for (let i = 0; i < n; i++) table[i] = r.u16(at + 12 + i * 2) / 65535;
    return { curve: tableCurve(table), size: 12 + n * 2 };
  }
  need(type === "para", PROFILE_ERROR.tagType);
  const fn = r.u16(at + 8);
  const count = PARA_PARAMS[fn];
  need(count !== undefined, PROFILE_ERROR.tagType);
  need(at + 12 + count * 4 <= end);
  const [g, a = 1, b = 0, c = 0, d = 0, e = 0, f = 0] = Array.from({ length: count }, (_, i) => r.s15(at + 12 + i * 4));
  const pow = (base: number) => (base > 0 ? base ** g : 0);
  let curve: Curve;
  switch (fn) {
    case 0:
      curve = (x) => pow(x);
      break;
    case 1:
      curve = (x) => (x >= -b / a ? pow(a * x + b) : 0);
      break;
    case 2:
      curve = (x) => (x >= -b / a ? pow(a * x + b) + c : c);
      break;
    case 3:
      curve = (x) => (x >= d ? pow(a * x + b) : c * x);
      break;
    default:
      curve = (x) => (x >= d ? pow(a * x + b) + e : c * x + f);
  }
  const clamped: Curve = (x) => Math.min(1, Math.max(0, curve(Math.min(1, Math.max(0, x)))));
  return { curve: clamped, size: 12 + count * 4 };
}

function readCurveSet(r: Reader, at: number, end: number, count: number): Curve[] {
  const curves: Curve[] = [];
  let p = at;
  for (let i = 0; i < count; i++) {
    const { curve, size } = readCurve(r, p, end);
    curves.push(curve);
    p += (size + 3) & ~3;
  }
  return curves;
}

const isIdentity = (m: Readonly<Mat3>) => m.every((v, i) => Math.abs(v - (i % 4 === 0 ? 1 : 0)) < 1e-6);

function curvesFromTables(tables: Float64Array[]): Step {
  return { kind: "curves", curves: tables.map((t) => tableCurve(t)) };
}

// lut8 (mft1) and lut16 (mft2): matrix (applied to three inputs unless it is
// the identity, as Little CMS does), input tables, table, output tables.
function readLutN(r: Reader, tag: Tag, wide: boolean): Lut {
  const at = tag.offset;
  const end = at + tag.size;
  need(tag.size >= 52);
  const inputs = r.u8(at + 8);
  const outputs = r.u8(at + 9);
  const g = r.u8(at + 10);
  need(inputs > 0 && outputs > 0 && g > 0);
  const m = Array.from({ length: 9 }, (_, i) => r.s15(at + 12 + i * 4)) as Mat3;
  const width = wide ? 2 : 1;
  const max = wide ? 65535 : 255;
  const read = wide ? (p: number) => r.u16(p) : (p: number) => r.u8(p);
  const inEntries = wide ? r.u16(at + 48) : 256;
  const outEntries = wide ? r.u16(at + 50) : 256;
  let p = at + (wide ? 52 : 48);
  const tables = (count: number, entries: number) => {
    need(p + count * entries * width <= end);
    const out: Float64Array[] = [];
    for (let c = 0; c < count; c++) {
      const t = new Float64Array(entries);
      for (let i = 0; i < entries; i++, p += width) t[i] = read(p) / max;
      out.push(t);
    }
    return out;
  };
  const steps: Step[] = [];
  if (inputs === 3 && !isIdentity(m)) steps.push({ kind: "matrix", m, offset: null });
  steps.push(curvesFromTables(tables(inputs, inEntries)));
  const cells = g ** inputs * outputs;
  need(p + cells * width <= end);
  const table = new Float32Array(cells);
  for (let i = 0; i < cells; i++, p += width) table[i] = read(p) / max;
  steps.push({ kind: "clut", grid: new Array<number>(inputs).fill(g), outputs, table });
  steps.push(curvesFromTables(tables(outputs, outEntries)));
  return { inputs, outputs, steps };
}

function readClut(r: Reader, at: number, end: number, inputs: number, outputs: number): Step {
  need(at + 20 <= end);
  const grid = Array.from({ length: inputs }, (_, i) => r.u8(at + i));
  need(grid.every((n) => n > 0));
  const precision = r.u8(at + 16);
  need(precision === 1 || precision === 2, PROFILE_ERROR.tagType);
  const cells = grid.reduce((a, b) => a * b, 1) * outputs;
  need(at + 20 + cells * precision <= end);
  const table = new Float32Array(cells);
  for (let i = 0; i < cells; i++) table[i] = precision === 2 ? r.u16(at + 20 + i * 2) / 65535 : r.u8(at + 20 + i) / 255;
  return { kind: "clut", grid, outputs, table };
}

function readMatrix(r: Reader, at: number, end: number): Step {
  need(at + 48 <= end);
  const v = Array.from({ length: 12 }, (_, i) => r.s15(at + i * 4));
  return { kind: "matrix", m: v.slice(0, 9) as Mat3, offset: [v[9], v[10], v[11]] };
}

// lutAtoB (mAB): A curves, table, M curves, matrix, B curves. lutBtoA (mBA):
// the same elements in reverse. Absent elements have a zero offset.
function readLutAB(r: Reader, tag: Tag, aToB: boolean): Lut {
  const at = tag.offset;
  const end = at + tag.size;
  need(tag.size >= 32);
  const inputs = r.u8(at + 8);
  const outputs = r.u8(at + 9);
  need(inputs > 0 && outputs > 0);
  const [offB, offMatrix, offM, offClut, offA] = [12, 16, 20, 24, 28].map((o) => r.u32(at + o));
  // The side of the table the A curves are on, and the PCS side's width (three).
  const aChannels = aToB ? inputs : outputs;
  const pcsChannels = aToB ? outputs : inputs;
  const a: Step | null = offA ? { kind: "curves", curves: readCurveSet(r, at + offA, end, aChannels) } : null;
  const clut = offClut ? readClut(r, at + offClut, end, aToB ? inputs : pcsChannels, aToB ? pcsChannels : outputs) : null;
  const m: Step | null = offM ? { kind: "curves", curves: readCurveSet(r, at + offM, end, pcsChannels) } : null;
  const matrix = offMatrix && pcsChannels === 3 ? readMatrix(r, at + offMatrix, end) : null;
  need(offB !== 0);
  const b: Step = { kind: "curves", curves: readCurveSet(r, at + offB, end, pcsChannels) };
  need(clut !== null || inputs === outputs);
  const order = aToB ? [a, clut, m, matrix, b] : [b, matrix, m, clut, a];
  return { inputs, outputs, steps: order.filter((s): s is Step => s !== null) };
}

// Little CMS interpolates a table indexed by L*a*b* trilinearly: L*a*b* is
// too far from uniform in its cells for tetrahedra.
function labIndexed(lut: Lut): Lut {
  return { ...lut, steps: lut.steps.map((s) => (s.kind === "clut" ? { ...s, trilinear: true } : s)) };
}

function readLutTag(r: Reader, tag: Tag | undefined, aToB: boolean, pcs: "XYZ" | "Lab"): LutTag | undefined {
  const read = readLutTagAs(r, tag, aToB, pcs);
  return read && !aToB && pcs === "Lab" ? { ...read, lut: labIndexed(read.lut) } : read;
}

function readLutTagAs(r: Reader, tag: Tag | undefined, aToB: boolean, pcs: "XYZ" | "Lab"): LutTag | undefined {
  if (!tag) return undefined;
  need(tag.size >= 12);
  const type = r.sig(tag.offset);
  const lab = (v2: boolean): PcsEncoding => (pcs === "XYZ" ? "xyz" : v2 ? "lab-v2" : "lab-v4");
  if (type === "mft2") return { lut: readLutN(r, tag, true), pcs: lab(true) };
  if (type === "mft1") return { lut: readLutN(r, tag, false), pcs: lab(false) };
  if (type === "mAB " && aToB) return { lut: readLutAB(r, tag, true), pcs: lab(false) };
  if (type === "mBA " && !aToB) return { lut: readLutAB(r, tag, false), pcs: lab(false) };
  throw new TagError(PROFILE_ERROR.tagType);
}

function readXyz(r: Reader, tag: Tag | undefined): Vec3 | null {
  if (!tag || tag.size < 20 || r.sig(tag.offset) !== "XYZ ") return null;
  const at = tag.offset + 8;
  return [r.s15(at), r.s15(at + 4), r.s15(at + 8)];
}

function readDescription(r: Reader, tag: Tag | undefined): string {
  if (!tag || tag.size < 12) return "";
  const at = tag.offset;
  let text = "";
  const type = r.sig(at);
  if (type === "desc") {
    const n = r.u32(at + 8);
    if (12 + n > tag.size) return "";
    for (let i = 0; i < Math.min(n, MAX_DESCRIPTION); i++) text += String.fromCharCode(r.u8(at + 12 + i));
  } else if (type === "mluc") {
    if (tag.size < 28 || r.u32(at + 8) < 1) return "";
    const length = Math.min(r.u32(at + 20), MAX_DESCRIPTION * 2);
    const start = r.u32(at + 24);
    if (start + length > tag.size) return "";
    for (let i = 0; i + 1 < length; i += 2) text += String.fromCharCode(r.u16(at + start + i));
  } else if (type === "text") {
    for (let i = 8; i < Math.min(tag.size, MAX_DESCRIPTION + 8); i++) text += String.fromCharCode(r.u8(at + i));
  }
  return text.split("\0")[0].trim();
}

/** Channels of an ICC colour space signature, or 0 for one a proof can't use. */
export function channelsOf(space: string): number {
  switch (space) {
    case "GRAY":
      return 1;
    case "RGB ":
    case "CMY ":
      return 3;
    case "CMYK":
      return 4;
  }
  const m = /^([2-9A-F])CLR$/.exec(space);
  return m ? parseInt(m[1], 16) : 0;
}

function readTags(r: Reader, size: number): Map<string, Tag> {
  const count = r.u32(HEADER);
  need(HEADER + 4 + count * 12 <= size);
  const tags = new Map<string, Tag>();
  for (let i = 0; i < count; i++) {
    const entry = HEADER + 4 + i * 12;
    const tag = { offset: r.u32(entry + 4), size: r.u32(entry + 8) };
    need(tag.offset + tag.size <= size);
    tags.set(r.sig(entry), tag);
  }
  return tags;
}

/** The profile's own name, or "" when it has none or isn't a profile. */
export function profileDescription(bytes: Uint8Array): string {
  if (bytes.length < HEADER + 4) return "";
  const r = new Reader(bytes);
  try {
    const size = r.u32(0);
    if (r.sig(36) !== "acsp" || size > bytes.length) return "";
    return readDescription(r, readTags(r, size).get("desc"));
  } catch {
    return "";
  }
}

export function parseProfile(bytes: Uint8Array): ParsedProfile {
  try {
    return { ok: true, profile: read(new Reader(bytes)) };
  } catch (err) {
    if (err instanceof TagError) return { ok: false, error: err.reason };
    if (err instanceof RangeError) return { ok: false, error: PROFILE_ERROR.notIcc };
    throw err;
  }
}

function read(r: Reader): IccProfile {
  need(r.bytes.length >= HEADER + 4);
  const size = r.u32(0);
  need(r.sig(36) === "acsp" && size >= HEADER + 4 && size <= r.bytes.length);
  const version = r.u8(8) + (r.u8(9) >> 4) / 10;
  const deviceClass = CLASSES.find((c) => c === r.sig(12));
  need(deviceClass !== undefined);
  need(deviceClass !== "link" && deviceClass !== "abst" && deviceClass !== "nmcl", PROFILE_ERROR.kind);
  const space = r.sig(16);
  const channels = channelsOf(space);
  need(channels > 0, PROFILE_ERROR.colourSpace);
  const pcsSig = r.sig(20);
  need(pcsSig === "XYZ " || pcsSig === "Lab ");
  const pcs = pcsSig === "XYZ " ? "XYZ" : "Lab";
  const tags = readTags(r, size);

  const fits = (t: LutTag | undefined, aToB: boolean) =>
    !t || (aToB ? t.lut.inputs === channels && t.lut.outputs === 3 : t.lut.inputs === 3 && t.lut.outputs === channels);
  const aToB = [0, 1, 2].map((i) => readLutTag(r, tags.get(`A2B${i}`), true, pcs));
  const bToA = [0, 1, 2].map((i) => readLutTag(r, tags.get(`B2A${i}`), false, pcs));
  need(aToB.every((t) => fits(t, true)) && bToA.every((t) => fits(t, false)));

  let matrixShaper: IccProfile["matrixShaper"] = null;
  const colorants = ["rXYZ", "gXYZ", "bXYZ"].map((s) => readXyz(r, tags.get(s)));
  const trcTags = ["rTRC", "gTRC", "bTRC"].map((s) => tags.get(s));
  if (space === "RGB " && pcs === "XYZ" && colorants.every((c) => c) && trcTags.every((t) => t)) {
    const [cr, cg, cb] = colorants as Vec3[];
    const curves = trcTags.map((t) => readCurve(r, t!.offset, t!.offset + t!.size).curve);
    matrixShaper = {
      matrix: [cr[0], cg[0], cb[0], cr[1], cg[1], cb[1], cr[2], cg[2], cb[2]],
      curves: [curves[0], curves[1], curves[2]],
    };
  }
  const kTrc = tags.get("kTRC");
  const grayTrc = space === "GRAY" && kTrc ? readCurve(r, kTrc.offset, kTrc.offset + kTrc.size).curve : null;

  const twoWay = (aToB[0] && bToA[0]) || matrixShaper || grayTrc;
  need(!!twoWay, PROFILE_ERROR.oneWay);

  const wtpt = readXyz(r, tags.get("wtpt"));
  const mediaWhite: Vec3 = !wtpt || (version < 4 && deviceClass === "mntr") ? [...D50] : wtpt;
  return {
    description: readDescription(r, tags.get("desc")),
    version,
    deviceClass,
    colourSpace: space.trim(),
    channels,
    pcs,
    mediaWhite,
    aToB,
    bToA,
    matrixShaper,
    grayTrc,
  };
}
