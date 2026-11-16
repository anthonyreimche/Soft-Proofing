// The extension's ids and its stage's keys. Every key starts with `sp`: the
// host rewrites uniform and texture keys wherever they appear as whole words
// in the stage's GLSL, so a key must not collide with a GLSL name.

export const EXTENSION_ID = "soft-proofing";
export const STAGE_ID = `${EXTENSION_ID}.stage`;
export const PANEL_ID = `${EXTENSION_ID}.panel`;
export const TOGGLE_ACTION = `${EXTENSION_ID}.toggle`;

/** 1 while the proof is shown, 0 otherwise. */
export const ON_KEY = "spOn";
/** The gamut warning: its colour in the stage's encoding in rgb, 1 in a while shown. */
export const WARN_KEY = "spWarn";
/** The proof table (bake.ts), set with api.setStageTexture. */
export const TABLE_KEY = "spTable";

export const qualified = (key: string): string => `${STAGE_ID}.${key}`;
