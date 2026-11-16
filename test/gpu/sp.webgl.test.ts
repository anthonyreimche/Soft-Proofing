// The stage on the real renderer. Run via `npm run test:gpu` (run.cjs copies
// this file into a SafeLight checkout and runs it under its headless
// Chromium + SwiftShader rig). What the CPU suite cannot check:
//  • core's stage contract takes the stage without a warning;
//  • the GLSL compiles with the host's namespacing, and its table lookup
//    lands on the table where the CPU reads it, in Rec. 2020 through the sRGB
//    curve as the stage's `space` asks;
//  • the gamut warning marks what the table's margin says;
//  • the proof is a view aid: a renderer that doesn't draw for the eye draws
//    the photo as without it.

import { describe, expect, it } from "vitest";
import { bakeTable, nodeIndex, type ProofTable } from "@sp/bake";
import { BUILT_INS } from "@sp/builtins";
import { invert, linearToSrgb, mul, srgbToLinear, type Vec3 } from "@sp/icc/colour";
import { parseProfile } from "@sp/icc/profile";
import { GAMUT_EDGE, INTENT, createProof, type Proof } from "@sp/icc/transform";
import { EXTENSION_ID, ON_KEY, TABLE_KEY, WARN_KEY, qualified } from "@sp/ids";
import { D50_TO_REC2020, REC2020_TO_D50 } from "@sp/space";
import { proofStage } from "@sp/stage";
import { warnValue } from "@sp/view";
import { buildProfile, lutN } from "@sp-test/support/icc-builder";
import { PAPER_WHITE, aToBSampler, bToASampler } from "@sp-test/support/model-printer";
import { CURRENT_PROCESS_VERSION } from "@/catalog/process-version";
import { checkStageContract } from "@/extensions/stage-validation";
import type { StageTextureData } from "@/extensions/api/contributions";
import type { WebGLRenderer, WebGLRendererOpts } from "@/rendering/webgl/renderer";
import { OPEN_PROBE, floatImage, glHarness, identityParams, withRenderer } from "@/rendering/webgl/webgl.test-support";

const PARAMS = identityParams({ processVersion: CURRENT_PROCESS_VERSION });
const W = 32;
const H = 24;
const SRGB_TO_D50 = BUILT_INS[0].profile.matrixShaper!.matrix;
const D50_TO_SRGB = invert(SRGB_TO_D50)!;

/** A seeded uniform deviate. */
function uniforms(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 0.5) / 2 ** 32;
  };
}

// Colours across sRGB, kept off its edges so the plain frame isn't clipped.
const rand = uniforms(7);
const image = floatImage(W, H, () => [0.02 + 0.96 * rand(), 0.02 + 0.96 * rand(), 0.02 + 0.96 * rand()]);

function printerProof(): Proof {
  const table = (sampler: (v: number[]) => number[]) => lutN({ inputs: 3, outputs: 3, grid: 17, sampler }, true);
  const parsed = parseProfile(buildProfile({ colorSpace: "CMY ", wtpt: PAPER_WHITE, tags: { A2B0: table(aToBSampler("lab-v2")), B2A0: table(bToASampler("lab-v2")) } }));
  if (!parsed.ok) throw new Error(parsed.error);
  return createProof(parsed.profile, { intent: INTENT.relative, blackPointCompensation: true, simulatePaper: true });
}

const asTexture = (t: ProofTable): StageTextureData => ({ data: t.data, width: t.width, height: t.height, format: "rgba16f", version: 1 });

/** The canvas, RGBA8 rows from the top. */
function canvasPixels(): Uint8Array {
  const { canvas, gl } = glHarness();
  const { width, height } = canvas;
  const raw = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const data = new Uint8Array(raw.length);
  for (let y = 0; y < height; y++) data.set(raw.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
  return data;
}

function draw(opts: Partial<WebGLRendererOpts>, bag: Record<string, unknown>, table: ProofTable | null): Uint8Array {
  return withRenderer({ pipeline: OPEN_PROBE, stages: [], ...opts }, (r: WebGLRenderer) => {
    r.setImage(image);
    r.setParams(PARAMS);
    if (table) r.setStageTextures({ [qualified(TABLE_KEY)]: asTexture(table) });
    r.setContributedParams(bag);
    r.render();
    return canvasPixels();
  });
}

/** The stage's input for a pixel the plain frame shows as `rgb8`. */
function stageInput(rgb8: ArrayLike<number>): Vec3 {
  const xyz = mul(SRGB_TO_D50, [srgbToLinear(rgb8[0] / 255), srgbToLinear(rgb8[1] / 255), srgbToLinear(rgb8[2] / 255)]);
  return mul(D50_TO_REC2020, xyz).map(linearToSrgb) as Vec3;
}

/** What the canvas shows for the stage's output `enc`. */
function shown(enc: ArrayLike<number>): Vec3 {
  const xyz = mul(REC2020_TO_D50, [srgbToLinear(enc[0]), srgbToLinear(enc[1]), srgbToLinear(enc[2])]);
  return mul(D50_TO_SRGB, xyz).map((v) => linearToSrgb(Math.min(1, Math.max(0, v))) * 255) as Vec3;
}

/** The table read on the CPU as the stage reads it: trilinear across nodes. */
function lookup(t: ProofTable, input: Vec3): number[] {
  const n = t.size;
  const p = input.map((v) => Math.min(1, Math.max(0, v)) * (n - 1));
  const i = p.map((v) => Math.min(Math.floor(v), n - 2));
  const f = p.map((v, k) => v - i[k]);
  const out = [0, 0, 0, 0];
  for (const dr of [0, 1]) {
    for (const dg of [0, 1]) {
      for (const db of [0, 1]) {
        const w = (dr ? f[0] : 1 - f[0]) * (dg ? f[1] : 1 - f[1]) * (db ? f[2] : 1 - f[2]);
        const at = nodeIndex(n, i[0] + dr, i[1] + dg, i[2] + db);
        for (let c = 0; c < 4; c++) out[c] += w * t.data[at + c];
      }
    }
  }
  return out;
}

function stats(diffs: number[]): { max: number; p99: number } {
  const sorted = [...diffs].sort((a, b) => b - a);
  return { max: sorted[0], p99: sorted[Math.floor(sorted.length / 100)] };
}

const LIVE: Partial<WebGLRendererOpts> = { stages: [proofStage()], drawsViewStages: true };
const on = (warn: boolean) => ({ [qualified(ON_KEY)]: 1, [qualified(WARN_KEY)]: warnValue("magenta", warn) });

describe("Soft Proofing on the GPU", () => {
  it("passes core's stage contract without a warning", () => {
    expect(checkStageContract(proofStage(), EXTENSION_ID)).toMatchObject({ error: null, warnings: [] });
  });

  const plain = draw({}, {}, null);

  it.each([
    ["an sRGB screen", () => createProof(BUILT_INS[0].profile, { intent: INTENT.relative, blackPointCompensation: false, simulatePaper: false })],
    ["a printer, paper simulated", printerProof],
  ])("draws the table's colours for %s", async (name, proof) => {
    const table = (await bakeTable(proof()))!;
    const got = draw(LIVE, on(false), table);
    const diffs: number[] = [];
    let moved = 0;
    for (let px = 0; px < W * H; px++) {
      const at = px * 4;
      const want = shown(lookup(table, stageInput(plain.subarray(at, at + 3))));
      for (let c = 0; c < 3; c++) {
        diffs.push(Math.abs(got[at + c] - want[c]));
        if (Math.abs(got[at + c] - plain[at + c]) > 3) moved++;
      }
    }
    const s = stats(diffs);
    console.log(`[sp-gpu] ${name}: max ${s.max.toFixed(2)} p99 ${s.p99.toFixed(2)} (8-bit levels); ${moved} channels moved`);
    // The stage's input is rebuilt from the plain frame's 8-bit pixels; where a
    // cell meets the clipped edge of sRGB the table is steep and that half
    // level grows, so the bound on the worst pixel is looser.
    expect(s.p99).toBeLessThan(1);
    expect(s.max).toBeLessThan(5);
    if (name.startsWith("a printer")) expect(moved).toBeGreaterThan(W * H);
  });

  it("marks what the table's margin puts out of gamut", async () => {
    const table = (await bakeTable(printerProof()))!;
    const got = draw(LIVE, on(true), table);
    const magenta = shown(warnValue("magenta", true));
    let checked = 0;
    let agree = 0;
    for (let px = 0; px < W * H; px++) {
      const at = px * 4;
      const margin = lookup(table, stageInput(plain.subarray(at, at + 3)))[3];
      if (Math.abs(margin - GAMUT_EDGE) < 0.25) continue;
      checked++;
      const marked = [0, 1, 2].every((c) => Math.abs(got[at + c] - magenta[c]) <= 2);
      if (marked === margin >= GAMUT_EDGE) agree++;
    }
    console.log(`[sp-gpu] gamut warning: ${agree}/${checked} agree`);
    expect(checked).toBeGreaterThan((W * H) / 2);
    expect(agree).toBe(checked);
  });

  it("is a view aid: a renderer that doesn't draw for the eye draws the photo as without it", async () => {
    const table = (await bakeTable(printerProof()))!;
    const unseen = draw({ stages: [proofStage()], drawsViewStages: false }, on(true), table);
    let differing = 0;
    for (let i = 0; i < plain.length; i++) if (unseen[i] !== plain[i]) differing++;
    expect(differing).toBe(0);
  });

  it("draws the photo as without it while switched off", async () => {
    const table = (await bakeTable(printerProof()))!;
    const off = draw(LIVE, { [qualified(ON_KEY)]: 0 }, table);
    let differing = 0;
    for (let i = 0; i < plain.length; i++) if (off[i] !== plain[i]) differing++;
    expect(differing).toBe(0);
  });
});
