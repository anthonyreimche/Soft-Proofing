// How to proof, kept in api.settings: the profile and intent, black point
// compensation, the paper and ink, and the gamut warning. They are the
// person's, not the photo's, so they never reach an edit, a preset or the
// history, and every window shares them.

import { DEFAULT_PROFILE_ID } from "./builtins";
import { INTENT, type Intent } from "./icc/transform";
import type { SafelightAPI } from "./safelight";

export const WARN_COLOURS = {
  magenta: { label: "Magenta", rgb: [1, 0, 1] },
  red: { label: "Red", rgb: [1, 0, 0] },
  green: { label: "Green", rgb: [0, 1, 0] },
  cyan: { label: "Cyan", rgb: [0, 1, 1] },
  grey: { label: "Grey", rgb: [0.5, 0.5, 0.5] },
} as const satisfies Record<string, { label: string; rgb: readonly [number, number, number] }>;

export type WarnColour = keyof typeof WARN_COLOURS;

export const INTENT_LABELS: Readonly<Record<Intent, string>> = {
  [INTENT.perceptual]: "Perceptual",
  [INTENT.relative]: "Relative colorimetric",
  [INTENT.saturation]: "Saturation",
  [INTENT.absolute]: "Absolute colorimetric",
};

export interface Prefs {
  /** A library entry's id (library.ts). */
  profile: string;
  intent: Intent;
  blackPointCompensation: boolean;
  simulatePaper: boolean;
  gamutWarning: boolean;
  warnColour: WarnColour;
}

export const PREF_KEYS = {
  profile: "profile",
  intent: "intent",
  blackPointCompensation: "blackPointCompensation",
  simulatePaper: "simulatePaper",
  gamutWarning: "gamutWarning",
  warnColour: "warnColour",
} as const satisfies Record<keyof Prefs, string>;

export const DEFAULT_PREFS: Prefs = {
  profile: DEFAULT_PROFILE_ID,
  intent: INTENT.relative,
  blackPointCompensation: true,
  simulatePaper: true,
  gamutWarning: false,
  warnColour: "magenta",
};

const isIntent = (v: unknown): v is Intent => v === 0 || v === 1 || v === 2 || v === 3;
const isWarnColour = (v: unknown): v is WarnColour => typeof v === "string" && Object.hasOwn(WARN_COLOURS, v);

/** The stored preferences, each one that is missing or malformed at its default. */
export function readPrefs(settings: SafelightAPI["settings"]): Prefs {
  const read = <K extends keyof Prefs>(key: K, valid: (v: unknown) => v is Prefs[K]): Prefs[K] => {
    const value: unknown = settings.get(PREF_KEYS[key], DEFAULT_PREFS[key]);
    return valid(value) ? value : DEFAULT_PREFS[key];
  };
  const isBool = (v: unknown): v is boolean => typeof v === "boolean";
  return {
    profile: read("profile", (v): v is string => typeof v === "string" && v.length > 0),
    intent: read("intent", isIntent),
    blackPointCompensation: read("blackPointCompensation", isBool),
    simulatePaper: read("simulatePaper", isBool),
    gamutWarning: read("gamutWarning", isBool),
    warnColour: read("warnColour", isWarnColour),
  };
}
