// The processing stage: the proof table (bake.ts) applied to the finished
// image, last of the output encoding and ahead of the core's own encoding for
// the screen. It is a view aid (viewOnly): exports, thumbnails, captures,
// colour pickers and the histogram draw the photo without it, and its values
// come from api.develop.setViewValues alone, never the photo's edit. It stays
// out of the program until the proof is first turned on (dormantWhen); the
// view asks for that program to be built ahead (prewarmStages).
//
// The table is size³ nodes in size blue slices side by side; each lookup
// filters two slices in hardware and mixes them. Its alpha is the gamut
// margin, interpolated the same way, so the warning's edge falls where the
// margin crosses GAMUT_EDGE.

import { GAMUT_EDGE } from "./icc/transform";
import { ON_KEY, STAGE_ID, TABLE_KEY, WARN_KEY } from "./ids";
import type { ProcessingStageContribution } from "./safelight";

/** Late in the output encoding, but ahead of overlays such as Focus Mask's (1000). */
export const STAGE_PRIORITY = 990;

const edge = GAMUT_EDGE.toFixed(2);

export const STAGE_GLSL = /* glsl */ `
{
  if (${ON_KEY} != 0) {
    ivec2 spSize = textureSize(${TABLE_KEY}, 0);
    float spN = float(spSize.y);
    if (spSize.y >= 2 && spSize.x == spSize.y * spSize.y) {
      vec3 spAt = clamp(c, 0.0, 1.0) * (spN - 1.0);
      float spSlice = min(floor(spAt.b), spN - 2.0);
      vec2 spTexel = 1.0 / vec2(spSize);
      vec2 spXy = spAt.rg + 0.5;
      vec4 spLo = texture(${TABLE_KEY}, (vec2(spSlice * spN, 0.0) + spXy) * spTexel);
      vec4 spHi = texture(${TABLE_KEY}, (vec2((spSlice + 1.0) * spN, 0.0) + spXy) * spTexel);
      vec4 spShown = mix(spLo, spHi, spAt.b - spSlice);
      c = (${WARN_KEY}.a > 0.5 && spShown.a >= ${edge}) ? ${WARN_KEY}.rgb : spShown.rgb;
    }
  }
}
`;

export function proofStage(): ProcessingStageContribution {
  return {
    id: STAGE_ID,
    name: "Soft proof",
    phase: "output-encode",
    priority: STAGE_PRIORITY,
    space: { encoding: "perceptual", primaries: "rec2020" },
    viewOnly: true,
    presetScope: "per-image",
    uniforms: [
      { key: ON_KEY, glslType: "int", default: 0 },
      { key: WARN_KEY, glslType: "vec4", default: [0, 0, 0, 0] },
    ],
    textures: [{ key: TABLE_KEY, kind: "lut", format: "rgba16f" }],
    glsl: STAGE_GLSL,
    dormantWhen: { [ON_KEY]: 0 },
  };
}
