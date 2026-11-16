// @vitest-environment node
import { describe, expect, it } from "vitest";
import { D50, D65, deltaE76, mul, rgbToD50, xyzToLab, type Vec3 } from "../src/icc/colour";
import { PROFILE_ERROR, parseProfile, profileDescription, type IccProfile } from "../src/icc/profile";
import { deviceToXyz, xyzToDevice } from "../src/icc/transform";
import {
  buildProfile,
  descTag,
  gammaCurv,
  lutAB,
  lutN,
  mlucTag,
  paraCurve,
  tableCurv,
  xyzTag,
  type ProfileSpec,
} from "./support/icc-builder";
import { PAPER_WHITE, aToBSampler, bToASampler, printerCmy, printerXyz, type Encoding } from "./support/model-printer";

function parsed(spec: ProfileSpec): IccProfile {
  const result = parseProfile(buildProfile(spec));
  if (!result.ok) throw new Error(result.error);
  return result.profile;
}

function refused(spec: ProfileSpec | Uint8Array): string {
  const result = parseProfile(spec instanceof Uint8Array ? spec : buildProfile(spec));
  if (result.ok) throw new Error("parsed");
  return result.error;
}

const GRID = 17;
const cmyTables = (wide: boolean | "ab", encoding: Encoding) => {
  const a = { inputs: 3, outputs: 3, grid: GRID, sampler: aToBSampler(encoding) };
  const b = { inputs: 3, outputs: 3, grid: GRID, sampler: bToASampler(encoding) };
  return wide === "ab" ? { A2B0: lutAB(a, true), B2A0: lutAB(b, false) } : { A2B0: lutN(a, wide), B2A0: lutN(b, wide) };
};

const CMY_DEVICES = [
  [0, 0, 0],
  [1, 1, 1],
  [0.5, 0.5, 0.5],
  [0.2, 0.7, 0.1],
  [0.9, 0.05, 0.4],
  [0.33, 0.33, 0.8],
];

describe("parseProfile", () => {
  it("reads the header: class, colour space, PCS, version and the paper's white", () => {
    const p = parsed({ colorSpace: "CMY ", version: 0x02100000, wtpt: PAPER_WHITE, tags: { desc: descTag("Glossy"), ...cmyTables(true, "lab-v2") } });
    expect(p).toMatchObject({ description: "Glossy", version: 2.1, deviceClass: "prtr", colourSpace: "CMY", channels: 3, pcs: "Lab" });
    p.mediaWhite.forEach((v, i) => expect(v).toBeCloseTo(PAPER_WHITE[i], 4));
  });

  it("reads a version 4 profile's mluc description", () => {
    const p = parsed({ colorSpace: "CMY ", version: 0x04300000, tags: { desc: mlucTag("Matte paper"), ...cmyTables("ab", "lab-v4") } });
    expect(p.version).toBe(4.3);
    expect(p.description).toBe("Matte paper");
    expect(profileDescription(buildProfile({ colorSpace: "CMY ", tags: { desc: mlucTag("Matte paper") } }))).toBe("Matte paper");
  });

  it("takes D50 as the white of a version 2 display profile and of one without a white", () => {
    const tags = { rXYZ: xyzTag([0.43, 0.22, 0.01]), gXYZ: xyzTag([0.39, 0.72, 0.1]), bXYZ: xyzTag([0.14, 0.06, 0.71]), rTRC: gammaCurv(2.2), gTRC: gammaCurv(2.2), bTRC: gammaCurv(2.2) };
    const display = parsed({ deviceClass: "mntr", colorSpace: "RGB ", pcs: "XYZ ", wtpt: [0.95, 1, 1.09], tags });
    expect(display.mediaWhite).toEqual([...D50]);
    expect(parsed({ colorSpace: "CMY ", wtpt: null, tags: cmyTables(true, "lab-v2") }).mediaWhite).toEqual([...D50]);
  });

  it("counts the channels of n-colour spaces", () => {
    const sixInks = { inputs: 6, outputs: 3, grid: 2, sampler: () => [0.5, 0.5, 0.5] };
    const back = { inputs: 3, outputs: 6, grid: 2, sampler: () => [0, 0, 0, 0, 0, 0] };
    const p = parsed({ colorSpace: "6CLR", tags: { A2B0: lutN(sixInks, true), B2A0: lutN(back, true) } });
    expect(p.channels).toBe(6);
  });

  it("refuses what isn't a profile, or is cut short", () => {
    expect(refused(new Uint8Array(300))).toBe(PROFILE_ERROR.notIcc);
    const whole = buildProfile({ colorSpace: "CMY ", tags: cmyTables(true, "lab-v2") });
    expect(refused(whole.subarray(0, whole.length - 40))).toBe(PROFILE_ERROR.notIcc);
  });

  it("refuses device links, abstract and named colour profiles", () => {
    expect(refused({ deviceClass: "link", colorSpace: "CMY ", tags: cmyTables(true, "lab-v2") })).toBe(PROFILE_ERROR.kind);
    expect(refused({ deviceClass: "abst", colorSpace: "CMY ", tags: cmyTables(true, "lab-v2") })).toBe(PROFILE_ERROR.kind);
  });

  it("refuses a colour space it can't proof, and a profile that converts only one way", () => {
    expect(refused({ colorSpace: "Luv ", tags: cmyTables(true, "lab-v2") })).toBe(PROFILE_ERROR.colourSpace);
    expect(refused({ colorSpace: "CMY ", tags: { A2B0: cmyTables(true, "lab-v2").A2B0 } })).toBe(PROFILE_ERROR.oneWay);
  });

  it("refuses a table of an unknown type or the wrong size", () => {
    const odd = new Uint8Array([..."xxxx"].map((c) => c.charCodeAt(0)).concat(new Array(40).fill(0)));
    expect(refused({ colorSpace: "CMY ", tags: { ...cmyTables(true, "lab-v2"), A2B0: odd } })).toBe(PROFILE_ERROR.tagType);
    const fourIn = lutN({ inputs: 4, outputs: 3, grid: 2, sampler: () => [0, 0, 0] }, true);
    expect(refused({ colorSpace: "CMY ", tags: { ...cmyTables(true, "lab-v2"), A2B0: fourIn } })).toBe(PROFILE_ERROR.notIcc);
  });
});

const INTERIOR_DEVICES = [
  [0.5, 0.5, 0.5],
  [0.3, 0.4, 0.35],
  [0.6, 0.45, 0.5],
  [0.4, 0.55, 0.65],
];

describe.each([
  ["lut16, version 2 L*a*b*", true, "lab-v2", 0.6, 0.02],
  ["lut8, 8-bit L*a*b*", false, "lab-v4", 1.5, 0.03],
  ["lutAtoB and lutBtoA, version 4 L*a*b*", "ab", "lab-v4", 0.6, 0.02],
  // A table indexed by XYZ has few nodes for dark colours, where the inverse
  // of the model's ink curve bends most.
  ["lut16, XYZ", true, "xyz", 0.6, 0.05],
] as const)("a printer profile with %s tables", (_, wide, encoding, maxDeltaE, maxDevice) => {
  const pcs = encoding === "xyz" ? "XYZ " : "Lab ";
  const profile = parsed({ colorSpace: "CMY ", pcs, version: wide === "ab" ? 0x04200000 : 0x02100000, tags: cmyTables(wide, encoding) });

  it("converts device values to the colour they print", () => {
    const toXyz = deviceToXyz(profile, 1);
    for (const cmy of CMY_DEVICES) expect(deltaE76(xyzToLab(toXyz(cmy)), xyzToLab(printerXyz(cmy)))).toBeLessThan(maxDeltaE);
  });

  // Away from the gamut's edge, where a table's cells straddle colours the
  // inks can't reach and interpolate between clipped nodes.
  it("converts a colour well inside what the inks reach to the device values printing it", () => {
    const toDevice = xyzToDevice(profile, 1);
    for (const cmy of INTERIOR_DEVICES) {
      const got = toDevice(printerXyz(cmy));
      got.forEach((v, i) => expect(Math.abs(v - cmy[i])).toBeLessThan(maxDevice));
    }
  });
});

it("reads a lutAtoB's matrix and offset", () => {
  // The table only passes values through; the matrix halves the first channel
  // and the offset lifts the third.
  const pass = { inputs: 3, outputs: 3, grid: 2, sampler: (v: number[]) => v };
  const profile = parsed({
    colorSpace: "RGB ",
    pcs: "XYZ ",
    version: 0x04200000,
    tags: { A2B0: lutAB({ ...pass, abMatrix: [0.5, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0.25] }, true), B2A0: lutAB(pass, false) },
  });
  const xyz = deviceToXyz(profile, 0)([0.4, 0.3, 0.2]);
  const scale = 65535 / 32768;
  expect(xyz[0]).toBeCloseTo(0.2 * scale, 3);
  expect(xyz[1]).toBeCloseTo(0.3 * scale, 3);
  expect(xyz[2]).toBeCloseTo(0.45 * scale, 3);
});

describe("a matrix/TRC display profile", () => {
  const matrix = rgbToD50(
    [
      [0.68, 0.32],
      [0.265, 0.69],
      [0.15, 0.06],
    ],
    D65,
  );
  const col = (i: number): Vec3 => [matrix[i], matrix[3 + i], matrix[6 + i]];
  const srgbPara = paraCurve(3, [2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045]);
  const profile = parsed({
    deviceClass: "mntr",
    colorSpace: "RGB ",
    pcs: "XYZ ",
    version: 0x04200000,
    tags: { rXYZ: xyzTag(col(0)), gXYZ: xyzTag(col(1)), bXYZ: xyzTag(col(2)), rTRC: srgbPara, gTRC: tableCurv((x) => x ** 2.2, 1024), bTRC: gammaCurv(1.8) },
  });

  it("converts through its colorants and curves", () => {
    const rgb = [0.5, 0.25, 0.75];
    const lin: Vec3 = [((0.5 + 0.055) / 1.055) ** 2.4, 0.25 ** 2.2, 0.75 ** 1.8];
    const want = mul(matrix, lin);
    deviceToXyz(profile, 1)(rgb).forEach((v, i) => expect(v).toBeCloseTo(want[i], 3));
    xyzToDevice(profile, 1)(want).forEach((v, i) => expect(v).toBeCloseTo(rgb[i], 3));
  });

  it("clips a colour outside its primaries to the nearest it can show", () => {
    const device = xyzToDevice(profile, 1)(mul(matrix, [1.4, -0.2, 0.3]));
    expect(device[0]).toBe(1);
    expect(device[1]).toBe(0);
  });
});

describe("a grey profile", () => {
  it("connects through Y with an XYZ PCS", () => {
    const p = parsed({ colorSpace: "GRAY", pcs: "XYZ ", tags: { kTRC: gammaCurv(2) } });
    const xyz = deviceToXyz(p, 1)([0.5]);
    xyz.forEach((v, i) => expect(v).toBeCloseTo(0.25 * D50[i], 3));
    expect(xyzToDevice(p, 1)([0.25 * D50[0], 0.25, 0.25 * D50[2]])[0]).toBeCloseTo(0.5, 3);
  });

  it("connects through L* with a L*a*b* PCS", () => {
    const p = parsed({ colorSpace: "GRAY", pcs: "Lab ", tags: { kTRC: gammaCurv(1) } });
    expect(xyzToLab(deviceToXyz(p, 1)([0.4]))[0]).toBeCloseTo(40, 3);
    expect(xyzToDevice(p, 1)(printerXyz([0.5, 0.5, 0.5]))[0]).toBeCloseTo(xyzToLab(printerXyz([0.5, 0.5, 0.5]))[0] / 100, 3);
  });
});

it("uses an intent's own table, and the perceptual one when the intent has none", () => {
  const dark = { inputs: 3, outputs: 3, grid: 2, sampler: () => [0.9, 0.9, 0.9] };
  const tables = cmyTables(true, "lab-v2");
  const p = parsed({ colorSpace: "CMY ", tags: { ...tables, B2A1: lutN(dark, true) } });
  expect([...xyzToDevice(p, 1)([0.5, 0.5, 0.5])]).toEqual([expect.closeTo(0.9, 4), expect.closeTo(0.9, 4), expect.closeTo(0.9, 4)]);
  const perceptual = xyzToDevice(p, 2)(printerXyz([0.3, 0.3, 0.3]));
  perceptual.forEach((v, i) => expect(v).toBeCloseTo(printerCmy(printerXyz([0.3, 0.3, 0.3]))[i], 1));
});
