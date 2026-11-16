// Builds small ICC profiles for the tests: any class, colour space, PCS and
// version, with matrix/TRC or grey tags, and LUT tags (lut8, lut16, lutAtoB,
// lutBtoA) sampled from a function on a grid.

export type Xyz = readonly [number, number, number];

export const ICC_D50: Xyz = [0.9642, 1, 0.8249];

const s15f16 = (x: number) => Math.round(x * 65536);
const align4 = (n: number) => (n + 3) & ~3;
const sig = (s: string) => [...s].map((c) => c.charCodeAt(0));
const u16 = (v: number) => [(v >> 8) & 0xff, v & 0xff];
const u32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
const s32 = (v: number) => u32(v >>> 0);
const q = (v: number, max: number) => Math.round(Math.min(1, Math.max(0, v)) * max);

function tagBytes(type: string, body: number[]): Uint8Array {
  return new Uint8Array([...sig(type), 0, 0, 0, 0, ...body]);
}

const pad4 = (bytes: number[]) => [...bytes, ...new Array<number>(align4(bytes.length) - bytes.length).fill(0)];

export function xyzTag(xyz: Xyz): Uint8Array {
  return tagBytes("XYZ ", [...s32(s15f16(xyz[0])), ...s32(s15f16(xyz[1])), ...s32(s15f16(xyz[2]))]);
}

export function gammaCurv(gamma: number): Uint8Array {
  return tagBytes("curv", [...u32(1), ...u16(Math.round(gamma * 256))]);
}

export function tableCurv(fn: (x: number) => number, n = 256): Uint8Array {
  const body = [...u32(n)];
  for (let i = 0; i < n; i++) body.push(...u16(q(fn(i / (n - 1)), 65535)));
  return tagBytes("curv", body);
}

export function paraCurve(fn: number, params: number[]): Uint8Array {
  return tagBytes("para", [...u16(fn), 0, 0, ...params.flatMap((p) => s32(s15f16(p)))]);
}

export function descTag(text: string): Uint8Array {
  const ascii = [...text].map((c) => c.charCodeAt(0) & 0x7f);
  return tagBytes("desc", [...u32(ascii.length + 1), ...ascii, 0, ...new Array(4 + 4 + 2 + 1 + 67).fill(0)]);
}

export function mlucTag(text: string): Uint8Array {
  const utf16 = [...text].flatMap((c) => u16(c.charCodeAt(0)));
  return tagBytes("mluc", [...u32(1), ...u32(12), ...sig("en"), ...sig("US"), ...u32(utf16.length), ...u32(28), ...utf16]);
}

/** A function from `inputs` values to `outputs` values, all 0..1 encoded. */
export type Sampler = (input: number[]) => number[];

function sampleGrid(inputs: number, grid: number, sampler: Sampler): number[][] {
  const cells: number[][] = [];
  const total = grid ** inputs;
  for (let i = 0; i < total; i++) {
    const at: number[] = [];
    let rest = i;
    for (let d = inputs - 1; d >= 0; d--) {
      at[d] = (rest % grid) / (grid - 1);
      rest = Math.floor(rest / grid);
    }
    cells.push(sampler(at));
  }
  return cells;
}

export interface LutSpec {
  inputs: number;
  outputs: number;
  grid: number;
  sampler: Sampler;
  /** A lut8/lut16 matrix, row-major; the identity by default. */
  matrix?: number[];
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** lut16 (wide) or lut8, with identity input and output tables. */
export function lutN(spec: LutSpec, wide: boolean): Uint8Array {
  const { inputs, outputs, grid, sampler } = spec;
  const max = wide ? 65535 : 255;
  const put = (v: number) => (wide ? u16(q(v, max)) : [q(v, max)]);
  const entries = wide ? 2 : 256;
  const body = [inputs, outputs, grid, 0, ...(spec.matrix ?? IDENTITY).flatMap((v) => s32(s15f16(v)))];
  if (wide) body.push(...u16(entries), ...u16(entries));
  const ramp = (n: number) => Array.from({ length: n }, (_, i) => i / (n - 1));
  for (let c = 0; c < inputs; c++) for (const v of ramp(entries)) body.push(...put(v));
  for (const cell of sampleGrid(inputs, grid, sampler)) for (const v of cell) body.push(...put(v));
  for (let c = 0; c < outputs; c++) for (const v of ramp(entries)) body.push(...put(v));
  return tagBytes(wide ? "mft2" : "mft1", body);
}

const identityCurveSet = (n: number) => Array.from({ length: n }, () => pad4([...tagBytes("curv", [...u32(0)])]));

/** lutAtoB (aToB) or lutBtoA: identity curves around a 16-bit table, and for
 *  `matrix` (row-major 3×3 then 3 offsets) the matrix with identity M curves. */
export function lutAB(spec: LutSpec & { abMatrix?: number[] }, aToB: boolean): Uint8Array {
  const { inputs, outputs, grid, sampler } = spec;
  const pcsChannels = aToB ? outputs : inputs;
  const deviceChannels = aToB ? inputs : outputs;
  const header = 32;
  const parts: { key: "B" | "matrix" | "M" | "clut" | "A"; bytes: number[] }[] = [];
  parts.push({ key: "B", bytes: identityCurveSet(pcsChannels).flat() });
  if (spec.abMatrix) {
    parts.push({ key: "matrix", bytes: spec.abMatrix.flatMap((v) => s32(s15f16(v))) });
    parts.push({ key: "M", bytes: identityCurveSet(pcsChannels).flat() });
  }
  const clutGrid = new Array<number>(16).fill(0);
  for (let i = 0; i < inputs; i++) clutGrid[i] = grid;
  const clut = [...clutGrid, 2, 0, 0, 0];
  for (const cell of sampleGrid(inputs, grid, sampler)) for (const v of cell) clut.push(...u16(q(v, 65535)));
  parts.push({ key: "clut", bytes: pad4(clut) });
  parts.push({ key: "A", bytes: identityCurveSet(deviceChannels).flat() });
  const offsets: Record<string, number> = { B: 0, matrix: 0, M: 0, clut: 0, A: 0 };
  let at = header;
  const body: number[] = [];
  for (const part of parts) {
    offsets[part.key] = at;
    body.push(...part.bytes);
    at += part.bytes.length;
  }
  const head = [inputs, outputs, 0, 0, ...u32(offsets.B), ...u32(offsets.matrix), ...u32(offsets.M), ...u32(offsets.clut), ...u32(offsets.A)];
  return tagBytes(aToB ? "mAB " : "mBA ", [...head, ...body]);
}

export interface ProfileSpec {
  deviceClass?: string;
  colorSpace?: string;
  pcs?: "XYZ " | "Lab ";
  /** Encoded as in the header, e.g. 0x02100000 or 0x04300000. */
  version?: number;
  wtpt?: Xyz | null;
  tags?: Record<string, Uint8Array>;
}

export function buildProfile(spec: ProfileSpec): Uint8Array {
  const tags: [string, Uint8Array][] = [];
  if (spec.wtpt !== null) tags.push(["wtpt", xyzTag(spec.wtpt ?? ICC_D50)]);
  for (const [key, data] of Object.entries(spec.tags ?? {})) tags.push([key, data]);

  let cursor = 128 + 4 + tags.length * 12;
  const placed = new Map<Uint8Array, number>();
  for (const [, data] of tags) {
    if (placed.has(data)) continue;
    placed.set(data, cursor);
    cursor = align4(cursor + data.length);
  }
  const out = new Uint8Array(cursor);
  const view = new DataView(out.buffer);
  view.setUint32(0, cursor);
  view.setUint32(8, spec.version ?? 0x02100000);
  out.set(sig(spec.deviceClass ?? "prtr"), 12);
  out.set(sig(spec.colorSpace ?? "CMYK"), 16);
  out.set(sig(spec.pcs ?? "Lab "), 20);
  out.set(sig("acsp"), 36);
  view.setInt32(68, s15f16(ICC_D50[0]));
  view.setInt32(72, s15f16(ICC_D50[1]));
  view.setInt32(76, s15f16(ICC_D50[2]));
  view.setUint32(128, tags.length);
  tags.forEach(([key, data], i) => {
    const at = 132 + i * 12;
    out.set(sig(key), at);
    view.setUint32(at + 4, placed.get(data)!);
    view.setUint32(at + 8, data.length);
  });
  for (const [data, offset] of placed) out.set(data, offset);
  return out;
}
