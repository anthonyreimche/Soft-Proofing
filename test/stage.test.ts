// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ON_KEY, STAGE_ID, TABLE_KEY, WARN_KEY } from "../src/ids";
import { STAGE_GLSL, STAGE_PRIORITY, proofStage } from "../src/stage";

describe("proofStage", () => {
  const stage = proofStage();

  it("runs last of the output encoding, on Rec. 2020 through the sRGB curve, for the live view only", () => {
    expect(stage).toMatchObject({
      id: STAGE_ID,
      phase: "output-encode",
      priority: STAGE_PRIORITY,
      space: { encoding: "perceptual", primaries: "rec2020" },
      viewOnly: true,
    });
    // Ahead of Focus Mask's overlay (1000), which should mark the proofed image.
    expect(STAGE_PRIORITY).toBeLessThan(1000);
  });

  // The inline's ints are mediump unless declared highp: 16 bits where the
  // driver honours precision (Mesa), so 1.0 / vec2(1089) is a half-float
  // reciprocal, up to half a texel off. A precision lead is not allowed inline.
  it("reads the table's size into a highp int vector", () => {
    expect(STAGE_GLSL).toMatch(/highp\s+ivec2\s+spSize\s*=\s*textureSize/);
    expect(STAGE_GLSL).not.toMatch(/precision\s+highp\s+int/);
  });

  it("stays out of the program until first turned on", () => {
    expect(stage.dormantWhen).toEqual({ [ON_KEY]: 0 });
    expect(stage.uniforms).toEqual([
      { key: ON_KEY, glslType: "int", default: 0 },
      { key: WARN_KEY, glslType: "vec4", default: [0, 0, 0, 0] },
    ]);
  });

  it("reads its table as an interpolating half-float texture", () => {
    expect(stage.textures).toEqual([{ key: TABLE_KEY, kind: "lut", format: "rgba16f" }]);
  });

  it("keeps its GLSL to one block with prefixed names and no preprocessor", () => {
    expect(stage.glsl).toBe(STAGE_GLSL);
    expect(STAGE_GLSL).not.toContain("#");
    expect(STAGE_GLSL.trim().startsWith("{")).toBe(true);
    expect(STAGE_GLSL.trim().endsWith("}")).toBe(true);
    const opens = STAGE_GLSL.split("{").length;
    expect(STAGE_GLSL.split("}").length).toBe(opens);
    for (const key of [ON_KEY, WARN_KEY, TABLE_KEY]) expect(STAGE_GLSL).toMatch(new RegExp(`\\b${key}\\b`));
    const locals = [...STAGE_GLSL.matchAll(/\b(?:float|int|vec[234]|ivec2)\s+(\w+)\s*=/g)].map((m) => m[1]);
    expect(locals.length).toBeGreaterThan(0);
    for (const name of locals) expect(name.startsWith("sp")).toBe(true);
  });

  it("writes only floats with a decimal point", () => {
    // GLSL ES has no implicit int-to-float conversion.
    expect(STAGE_GLSL).not.toMatch(/float\s+\w+\s*=\s*-?\d+\s*;/);
  });
});
