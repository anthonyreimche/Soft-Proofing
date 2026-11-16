// @vitest-environment node
// What a proof shows, on the formula printer of model-printer.ts: paper and
// ink as the display's white and black, or as they are; black point
// compensation; the gamut margin.

import { describe, expect, it } from "vitest";
import { D50, deltaE76, xyzToLab, type Vec3 } from "../src/icc/colour";
import { parseProfile, type IccProfile } from "../src/icc/profile";
import { GAMUT_EDGE, INTENT, createProof, destinationBlackPoint, type ProofOptions } from "../src/icc/transform";
import { buildProfile, lutN } from "./support/icc-builder";
import { INK_BLACK, PAPER_WHITE, aToBSampler, bToASampler, printerXyz } from "./support/model-printer";

const GRID = 33;

function printer(): IccProfile {
  const table = (sampler: (v: number[]) => number[]) => lutN({ inputs: 3, outputs: 3, grid: GRID, sampler }, true);
  const tags = { A2B0: table(aToBSampler("lab-v2")), B2A0: table(bToASampler("lab-v2")) };
  const parsed = parseProfile(buildProfile({ colorSpace: "CMY ", wtpt: PAPER_WHITE, tags }));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.profile;
}

const profile = printer();
const options = (o: Partial<ProofOptions> = {}): ProofOptions => ({
  intent: INTENT.relative,
  blackPointCompensation: false,
  simulatePaper: false,
  ...o,
});
const scaled = (k: number): Vec3 => [k * D50[0], k * D50[1], k * D50[2]];
const dE = (a: Vec3, b: Vec3) => deltaE76(xyzToLab(a), xyzToLab(b));

describe("the paper and ink", () => {
  it("show as the display's white and black unless simulated", () => {
    const proof = createProof(profile, options());
    expect(dE(proof.proof(scaled(1)), scaled(1))).toBeLessThan(0.5);
    expect(xyzToLab(proof.proof(scaled(0)))[0]).toBeLessThan(0.5);
  });

  it("show as they are when simulated: the paper's own white, the ink's own black", () => {
    const proof = createProof(profile, options({ simulatePaper: true }));
    expect(dE(proof.proof(scaled(1)), PAPER_WHITE)).toBeLessThan(0.5);
    const inkBlack = PAPER_WHITE.map((v, i) => (v * INK_BLACK * D50[i]) / D50[i]) as Vec3;
    expect(dE(proof.proof(scaled(0)), inkBlack)).toBeLessThan(1);
  });

  it("simulated, scale every colour by the paper's white", () => {
    const relative = createProof(profile, options({ displayBlack: false }));
    const simulated = createProof(profile, options({ simulatePaper: true }));
    for (const x of [scaled(0.18), scaled(0.5), printerXyz([0.2, 0.6, 0.3])]) {
      const want = relative.proof(x).map((v, i) => (v * PAPER_WHITE[i]) / D50[i]);
      simulated.proof(x).forEach((v, i) => expect(v).toBeCloseTo(want[i], 5));
    }
  });

  it("not simulated, lower a mid grey only a little as the ink's black maps to the display's", () => {
    const grey = scaled(0.18);
    const plain = xyzToLab(createProof(profile, options()).proof(grey));
    expect(Math.abs(plain[0] - xyzToLab(grey)[0])).toBeLessThan(4);
  });
});

describe("absolute colorimetric", () => {
  it("prints the paper's own colour as bare paper", () => {
    const proof = createProof(profile, options({ intent: INTENT.absolute, simulatePaper: true }));
    for (const ink of proof.device(PAPER_WHITE)) expect(ink).toBeLessThan(0.01);
    expect(dE(proof.proof(PAPER_WHITE), PAPER_WHITE)).toBeLessThan(0.5);
  });

  it("can't print white brighter than the paper", () => {
    const proof = createProof(profile, options({ intent: INTENT.absolute, simulatePaper: true }));
    expect(Math.abs(xyzToLab(proof.proof(scaled(1)))[0] - xyzToLab(PAPER_WHITE)[0])).toBeLessThan(1);
  });
});

describe("black point compensation", () => {
  it("finds the printer's black", () => {
    const black = destinationBlackPoint(profile, INTENT.relative);
    expect(Math.abs(black[1] - INK_BLACK)).toBeLessThan(0.004);
  });

  it("keeps shadows darker than the ink apart instead of clipping them to it", () => {
    const deep = [0.002, 0.008, 0.016].map(scaled);
    const plain = createProof(profile, options());
    const compensated = createProof(profile, options({ blackPointCompensation: true }));
    const lightness = (p: typeof plain) => deep.map((x) => xyzToLab(p.proof(x))[0]);
    const [a, b, c] = lightness(plain);
    expect(Math.max(a, b, c) - Math.min(a, b, c)).toBeLessThan(0.6);
    const [d, e, f] = lightness(compensated);
    expect(e - d).toBeGreaterThan(1);
    expect(f - e).toBeGreaterThan(1);
  });

  it("is left out for absolute colorimetric", () => {
    const withBpc = createProof(profile, options({ intent: INTENT.absolute, blackPointCompensation: true }));
    const without = createProof(profile, options({ intent: INTENT.absolute }));
    for (const k of [0, 0.01, 0.5]) expect(withBpc.proof(scaled(k))).toEqual(without.proof(scaled(k)));
  });
});

describe("the gamut margin", () => {
  const proof = createProof(profile, options());

  it("is below the edge for colours the inks reach", () => {
    for (const cmy of [
      [0.5, 0.5, 0.5],
      [0.2, 0.6, 0.3],
      [0, 0, 0],
    ]) {
      expect(proof.gamut(printerXyz(cmy))).toBeLessThan(GAMUT_EDGE);
    }
  });

  it("is past the edge for colours they don't", () => {
    const greener: Vec3 = [0.2, 0.6, 0.05];
    expect(proof.gamut(greener)).toBeGreaterThanOrEqual(GAMUT_EDGE);
  });

  it("doesn't depend on the intent or the paper", () => {
    const other = createProof(profile, options({ intent: INTENT.perceptual, simulatePaper: true, blackPointCompensation: true }));
    for (const x of [scaled(0.4), [0.2, 0.6, 0.05] as Vec3]) expect(other.gamut(x)).toBe(proof.gamut(x));
  });
});
