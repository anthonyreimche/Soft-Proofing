// @vitest-environment node
import { describe, expect, it } from "vitest";
import { bakeTable, nodeIndex, type ProofTable } from "../src/bake";
import { BUILT_INS } from "../src/builtins";
import { D65, rgbToD50, srgbToLinear, linearToSrgb, invert, mul, type Vec3 } from "../src/icc/colour";
import type { IccProfile } from "../src/icc/profile";
import { GAMUT_EDGE, INTENT, createProof } from "../src/icc/transform";
import { REC2020_TO_D50 } from "../src/space";
import { hasProfile, realProfile } from "./support/real-profiles";

const SIZE = 9;
const relative = { intent: INTENT.relative, blackPointCompensation: false, simulatePaper: false } as const;

function rec2020Screen(): IccProfile {
  const srgbCurve = (x: number) => srgbToLinear(Math.min(1, Math.max(0, x)));
  return {
    ...BUILT_INS[0].profile,
    description: "Rec. 2020",
    matrixShaper: { matrix: REC2020_TO_D50, curves: [srgbCurve, srgbCurve, srgbCurve] },
  };
}

const node = (t: ProofTable, r: number, g: number, b: number) => {
  const i = nodeIndex(t.size, r, g, b);
  return [...t.data.subarray(i, i + 4)];
};

/** An sRGB colour (0..1, encoded) in the table's encoding. */
function srgbInTable(rgb: Vec3): Vec3 {
  const toD50 = rgbToD50([[0.64, 0.33], [0.3, 0.6], [0.15, 0.06]], D65);
  const xyz = mul(toD50, rgb.map(srgbToLinear) as Vec3);
  return mul(invert(REC2020_TO_D50)!, xyz).map(linearToSrgb) as Vec3;
}

describe("bakeTable", () => {
  it("lays the cube out as size slices of blue, side by side, red across and green down", async () => {
    const t = (await bakeTable(createProof(rec2020Screen(), relative), { size: SIZE }))!;
    expect(t).toMatchObject({ size: SIZE, width: SIZE * SIZE, height: SIZE });
    expect(t.data).toBeInstanceOf(Float32Array);
    expect(t.data.length).toBe(SIZE ** 3 * 4);
    expect(nodeIndex(SIZE, 1, 2, 3)).toBe((2 * SIZE * SIZE + 3 * SIZE + 1) * 4);
  });

  it("changes nothing proofing for the table's own space", async () => {
    const t = (await bakeTable(createProof(rec2020Screen(), relative), { size: SIZE }))!;
    for (let r = 0; r < SIZE; r++) {
      for (let g = 0; g < SIZE; g++) {
        for (let b = 0; b < SIZE; b++) {
          const [pr, pg, pb, margin] = node(t, r, g, b);
          const want = [r, g, b].map((v) => v / (SIZE - 1));
          expect(Math.abs(pr - want[0]) + Math.abs(pg - want[1]) + Math.abs(pb - want[2])).toBeLessThan(2e-3);
          expect(margin).toBeLessThan(GAMUT_EDGE);
        }
      }
    }
  });

  it("keeps an sRGB screen's colours and flags and clips the rest", async () => {
    const t = (await bakeTable(createProof(BUILT_INS[0].profile, relative), { size: SIZE }))!;
    const [r, g, b, grey] = node(t, 4, 4, 4);
    expect([r, g, b].every((v) => Math.abs(v - 0.5) < 2e-3)).toBe(true);
    expect(grey).toBeLessThan(GAMUT_EDGE);
    const [, green, , margin] = node(t, 0, SIZE - 1, 0);
    expect(margin).toBeGreaterThanOrEqual(GAMUT_EDGE);
    // Rec. 2020's green is past sRGB's: the proof shows sRGB's greenest.
    const srgbGreen = srgbInTable([0, 1, 0]);
    expect(Math.abs(green - srgbGreen[1])).toBeLessThan(0.02);
  });

  it("stops and answers null when asked to", async () => {
    const stop = new AbortController();
    const pending = bakeTable(createProof(BUILT_INS[0].profile, relative), { size: SIZE, signal: stop.signal });
    stop.abort();
    expect(await pending).toBeNull();
  });

  it.skipIf(!hasProfile("CoatedFOGRA39.icc"))("bakes a printer's table in good time", async () => {
    const proof = createProof(realProfile("CoatedFOGRA39.icc")!, { ...relative, blackPointCompensation: true });
    const start = performance.now();
    const t = await bakeTable(proof);
    const ms = performance.now() - start;
    expect(t?.size).toBe(33);
    expect(ms).toBeLessThan(5000);
  });
});
