// @vitest-environment node
// The colour engine against Little CMS, on the printer profiles Windows ships
// (scripts/lcms-fixtures.py recorded Little CMS's answers). Skipped where a
// profile isn't there.

import { describe, expect, it } from "vitest";
import { GAMUT_EDGE, createProof, type Intent } from "../src/icc/transform";
import { fixtures, hasProfile, realProfile, samples, srgb8ToXyz, xyzToSrgb8 } from "./support/real-profiles";

// Little CMS rounds its answers to 8 bits; ours aren't rounded.
const MAX_ERROR = 1;
const MEAN_ERROR = 0.3;

function errors(cases: number[][], ours: (i: number) => ArrayLike<number>) {
  let max = 0;
  let sum = 0;
  let n = 0;
  cases.forEach((want, i) => {
    const got = ours(i);
    want.forEach((w, c) => {
      const e = Math.abs(got[c] - w);
      max = Math.max(max, e);
      sum += e;
      n++;
    });
  });
  return { max, mean: sum / n };
}

describe.each(Object.keys(fixtures.profiles))("%s", (file) => {
  const cases = fixtures.profiles[file];
  const run = hasProfile(file) ? it : it.skip;

  run("converts into the profile as Little CMS does, every intent, with and without BPC", () => {
    const profile = realProfile(file)!;
    for (const [name, want] of Object.entries(cases)) {
      const [kind, intent, bpc] = name.split("/");
      if (kind !== "to-device") continue;
      const proof = createProof(profile, { intent: Number(intent) as Intent, blackPointCompensation: bpc === "bpc", simulatePaper: false });
      const e = errors(want as number[][], (i) => proof.device(srgb8ToXyz(samples[i])).map((v) => v * 255));
      expect(e.max, name).toBeLessThanOrEqual(MAX_ERROR);
      expect(e.mean, name).toBeLessThanOrEqual(MEAN_ERROR);
    }
  });

  run("proofs as Little CMS does, relative and with the paper simulated", () => {
    const profile = realProfile(file)!;
    for (const [name, want] of Object.entries(cases)) {
      const [kind, intent, proofIntent] = name.split("/");
      if (kind !== "proof") continue;
      const proof = createProof(profile, {
        intent: Number(intent) as Intent,
        blackPointCompensation: false,
        simulatePaper: proofIntent === "3",
        displayBlack: false,
      });
      const e = errors(want as number[][], (i) => xyzToSrgb8(proof.proof(srgb8ToXyz(samples[i]))));
      expect(e.max, name).toBeLessThanOrEqual(MAX_ERROR);
      expect(e.mean, name).toBeLessThanOrEqual(MEAN_ERROR);
    }
  });

  // Little CMS checks the gamut through its own precalculated tables and so
  // flags a few more colours near the edge. Its check of a one-channel
  // profile flags by the first input alone, so a grey profile isn't compared.
  const gamutRun = hasProfile(file) && !file.startsWith("BlackWhite") ? it : it.skip;
  gamutRun("flags what Little CMS's gamut check flags", () => {
    const profile = realProfile(file)!;
    const proof = createProof(profile, { intent: 1, blackPointCompensation: false, simulatePaper: false });
    const flagged = new Set(cases["gamut/1"] as number[]);
    let agree = 0;
    let oursOnly = 0;
    samples.forEach((s, i) => {
      const ours = proof.gamut(srgb8ToXyz(s)) >= GAMUT_EDGE;
      if (ours === flagged.has(i)) agree++;
      else if (ours) oursOnly++;
    });
    expect(agree / samples.length).toBeGreaterThanOrEqual(0.95);
    expect(oursOnly / samples.length).toBeLessThanOrEqual(0.005);
  });
});
