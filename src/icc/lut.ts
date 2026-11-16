// The processing elements an ICC profile's transforms are made of, and their
// evaluation: per-channel curves, a 3×3 matrix with an optional offset, and a
// colour lookup table of any number of inputs. Values run normalized, 0 to 1,
// as in the tags themselves.
//
// The table interpolates as Little CMS does: tetrahedral across three inputs
// (trilinear for a table indexed by L*a*b*), and with more, linear along the
// first input between the tables of the rest.

import type { Mat3, Vec3 } from "./colour";

/** Maps 0..1 to 0..1. */
export type Curve = (x: number) => number;

export type Step =
  | { kind: "curves"; curves: readonly Curve[] }
  | { kind: "matrix"; m: Readonly<Mat3>; offset: Readonly<Vec3> | null }
  | { kind: "clut"; grid: readonly number[]; outputs: number; table: Float32Array; trilinear?: boolean };

export interface Lut {
  inputs: number;
  outputs: number;
  steps: readonly Step[];
}

const clamp01 = (v: number) => (v > 1 ? 1 : v > 0 ? v : 0);

export function tableCurve(table: ArrayLike<number>): Curve {
  const n = table.length;
  if (n === 0) return (x) => x;
  if (n === 1) return () => table[0];
  const last = n - 1;
  return (x) => {
    const p = clamp01(x) * last;
    const i = p >= last ? last - 1 : Math.floor(p);
    const f = p - i;
    return table[i] + (table[i + 1] - table[i]) * f;
  };
}

/** The inverse of a curve rising (or falling) across 0..1, by bisection on a
 *  sampled copy; flat stretches resolve to their first point. */
export function inverseCurve(curve: Curve, samples = 4096): Curve {
  const ys = new Float64Array(samples + 1);
  for (let i = 0; i <= samples; i++) ys[i] = curve(i / samples);
  const rising = ys[samples] >= ys[0];
  return (y) => {
    const target = rising ? y : -y;
    const at = (i: number) => (rising ? ys[i] : -ys[i]);
    if (target <= at(0)) return 0;
    if (target >= at(samples)) return 1;
    let lo = 0;
    let hi = samples;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (at(mid) < target) lo = mid;
      else hi = mid;
    }
    const a = at(lo);
    const b = at(hi);
    const f = b > a ? (target - a) / (b - a) : 0;
    return (lo + f) / samples;
  };
}

function interpolate(
  trilinear: boolean,
  table: Float32Array,
  grid: readonly number[],
  strides: readonly number[],
  outputs: number,
  dim: number,
  base: number,
  x: ArrayLike<number>,
  out: Float64Array,
): void {
  const remaining = grid.length - dim;
  if (remaining <= 3) {
    simplex(trilinear, table, grid, strides, outputs, dim, base, x, out);
    return;
  }
  const g = grid[dim];
  const p = clamp01(x[dim]) * (g - 1);
  const i = g === 1 ? 0 : Math.min(Math.floor(p), g - 2);
  const f = g === 1 ? 0 : p - i;
  const lo = new Float64Array(outputs);
  interpolate(trilinear, table, grid, strides, outputs, dim + 1, base + i * strides[dim], x, lo);
  if (f === 0) {
    out.set(lo);
    return;
  }
  const hi = new Float64Array(outputs);
  interpolate(trilinear, table, grid, strides, outputs, dim + 1, base + (i + 1) * strides[dim], x, hi);
  for (let o = 0; o < outputs; o++) out[o] = lo[o] + (hi[o] - lo[o]) * f;
}

// Interpolation across the last one, two or three inputs: linear, bilinear,
// and tetrahedral or trilinear. The tetrahedron walks from the cell's low
// corner along the inputs in order of their fractions, largest first.
function simplex(
  trilinear: boolean,
  table: Float32Array,
  grid: readonly number[],
  strides: readonly number[],
  outputs: number,
  dim: number,
  base: number,
  x: ArrayLike<number>,
  out: Float64Array,
): void {
  const n = grid.length - dim;
  const idx = [0, 0, 0];
  const frac = [0, 0, 0];
  const step = [0, 0, 0];
  let origin = base;
  for (let k = 0; k < n; k++) {
    const g = grid[dim + k];
    const p = clamp01(x[dim + k]) * (g - 1);
    const i = g === 1 ? 0 : Math.min(Math.floor(p), g - 2);
    idx[k] = i;
    frac[k] = g === 1 ? 0 : p - i;
    step[k] = strides[dim + k];
    origin += i * step[k];
  }
  if (n === 2) {
    const [fx, fy] = frac;
    for (let o = 0; o < outputs; o++) {
      const v00 = table[origin + o];
      const v10 = table[origin + step[0] + o];
      const v01 = table[origin + step[1] + o];
      const v11 = table[origin + step[0] + step[1] + o];
      const a = v00 + (v10 - v00) * fx;
      const b = v01 + (v11 - v01) * fx;
      out[o] = a + (b - a) * fy;
    }
    return;
  }
  if (n === 1) {
    for (let o = 0; o < outputs; o++) {
      const a = table[origin + o];
      out[o] = a + (table[origin + step[0] + o] - a) * frac[0];
    }
    return;
  }
  if (trilinear) {
    const [fx, fy, fz] = frac;
    const [sx, sy, sz] = step;
    for (let o = 0; o < outputs; o++) {
      const at = (dx: number, dy: number, dz: number) => table[origin + dx * sx + dy * sy + dz * sz + o];
      const y0 = (at(0, 0, 0) + (at(1, 0, 0) - at(0, 0, 0)) * fx) * (1 - fy) + (at(0, 1, 0) + (at(1, 1, 0) - at(0, 1, 0)) * fx) * fy;
      const y1 = (at(0, 0, 1) + (at(1, 0, 1) - at(0, 0, 1)) * fx) * (1 - fy) + (at(0, 1, 1) + (at(1, 1, 1) - at(0, 1, 1)) * fx) * fy;
      out[o] = y0 + (y1 - y0) * fz;
    }
    return;
  }
  const order = [0, 1, 2].sort((a, b) => frac[b] - frac[a]);
  const o1 = origin + step[order[0]];
  const o2 = o1 + step[order[1]];
  const o3 = o2 + step[order[2]];
  const [f1, f2, f3] = [frac[order[0]], frac[order[1]], frac[order[2]]];
  for (let o = 0; o < outputs; o++) {
    const c0 = table[origin + o];
    const c1 = table[o1 + o];
    const c2 = table[o2 + o];
    const c3 = table[o3 + o];
    out[o] = c0 + f1 * (c1 - c0) + f2 * (c2 - c1) + f3 * (c3 - c2);
  }
}

export function clutStrides(grid: readonly number[], outputs: number): number[] {
  const strides = new Array<number>(grid.length);
  let s = outputs;
  for (let d = grid.length - 1; d >= 0; d--) {
    strides[d] = s;
    s *= grid[d];
  }
  return strides;
}

const stridesOf = new WeakMap<Float32Array, number[]>();

function evalStep(step: Step, v: Float64Array): Float64Array {
  switch (step.kind) {
    case "curves": {
      const out = new Float64Array(step.curves.length);
      for (let i = 0; i < out.length; i++) out[i] = step.curves[i](v[i]);
      return out;
    }
    case "matrix": {
      const { m, offset } = step;
      const out = new Float64Array(3);
      for (let r = 0; r < 3; r++) out[r] = m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2] + (offset ? offset[r] : 0);
      return out;
    }
    case "clut": {
      let strides = stridesOf.get(step.table);
      if (!strides) {
        strides = clutStrides(step.grid, step.outputs);
        stridesOf.set(step.table, strides);
      }
      const out = new Float64Array(step.outputs);
      interpolate(step.trilinear === true, step.table, step.grid, strides, step.outputs, 0, 0, v, out);
      return out;
    }
  }
}

/** Runs `lut` on `input` (0..1 per channel); the result is clamped to 0..1, as
 *  the tag's encoding holds it. */
export function evalLut(lut: Lut, input: ArrayLike<number>): Float64Array {
  let v: Float64Array = Float64Array.from({ length: lut.inputs }, (_, i) => input[i]);
  for (const step of lut.steps) v = evalStep(step, v);
  for (let i = 0; i < v.length; i++) v[i] = clamp01(v[i]);
  return v;
}
