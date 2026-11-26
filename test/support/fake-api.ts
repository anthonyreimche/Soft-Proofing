// A stand-in Safelight API for unit tests, over real React and zustand. It has
// only what this extension uses: reading any other member throws, naming it,
// so a test shows what to add here when the extension starts using more.
//
// The develop and UI stores hold the fields the extension reads; the develop
// store also holds the photo's param bag and counts its commits, so a test
// can tell that the extension never edits the photo. setViewValues and
// setStageTexture record each call, prewarmStages counts its calls, the
// settings are a Map that tells its listeners of each write, pickFile answers
// with whatever the test queued, and the dialogs record what they were asked
// and answer as the test says. The UI kit's controls are plain elements: a
// Toggle is a checkbox, a Select a native select (with optgroups), a Button a
// button.

import * as React from "react";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { EXTENSION_ID } from "../../src/ids";
import type {
  ButtonProps,
  ConfirmDialogOptions,
  KeyActionContribution,
  PanelContribution,
  ProcessingStageContribution,
  SafelightAPI,
  SelectProps,
  StageTextureData,
  ToggleProps,
  UITokens,
} from "../../src/safelight";

interface DevelopSlice {
  photoId: string | null;
  proof: boolean;
  paramBag: Record<string, unknown>;
  commitEdit(label: string): Promise<void>;
}
interface UiSlice {
  activeModule: string;
}

type Store<T> = UseBoundStore<StoreApi<T>>;

export interface TextureCall {
  stageId: string;
  key: string;
  tex: StageTextureData | null;
}

type FakeMembers = Pick<
  SafelightAPI,
  | "version"
  | "extensionId"
  | "react"
  | "registerProcessingStage"
  | "unregisterProcessingStage"
  | "registerPanel"
  | "registerKeybinding"
  | "setStageTexture"
> & {
  settings: SafelightAPI["settings"];
  keybindings: Pick<SafelightAPI["keybindings"], "getBinding">;
  ui: Pick<SafelightAPI["ui"], "Button" | "Field" | "Row" | "Select" | "Stack" | "Toggle" | "tokens" | "alertDialog" | "confirmDialog">;
  develop: Pick<SafelightAPI["develop"], "setViewValues" | "prewarmStages">;
  presets: Pick<SafelightAPI["presets"], "pickFile">;
  navigation: Pick<SafelightAPI["navigation"], "current">;
  stores: { useDevelopStore: Store<DevelopSlice>; useUIStore: Store<UiSlice>; create: SafelightAPI["stores"]["create"] };
};

export interface Rig {
  api: SafelightAPI;
  stages: ProcessingStageContribution[];
  unregistered: string[];
  panels: PanelContribution[];
  keys: KeyActionContribution[];
  viewValues: (Record<string, unknown> | null)[];
  textures: TextureCall[];
  prewarms(): number;
  settings: Map<string, unknown>;
  develop: Store<DevelopSlice>;
  ui: Store<UiSlice>;
  /** The module navigation.current() answers, apart from the UI store the view listens to. */
  nav: { module: string };
  commits: string[];
  /** Files pickFile hands out, first queued first; null for a cancelled pick. */
  picks: (File | null)[];
  alerts: { title: string; message: string }[];
  confirms: ConfirmDialogOptions[];
  /** What the next confirmDialog answers. */
  confirmAnswer: boolean;
}

const TOKENS = {
  textPrimary: "var(--color-text-primary)",
  textSecondary: "var(--color-text-secondary)",
  textMuted: "var(--color-text-muted)",
  surface2: "var(--color-surface-2)",
  border: "var(--color-border)",
} as Partial<UITokens> as UITokens;

export function fakeApi(): Rig {
  const stages: ProcessingStageContribution[] = [];
  const unregistered: string[] = [];
  const panels: PanelContribution[] = [];
  const keys: KeyActionContribution[] = [];
  const viewValues: (Record<string, unknown> | null)[] = [];
  const textures: TextureCall[] = [];
  const commits: string[] = [];
  let prewarms = 0;
  const settings = new Map<string, unknown>();
  const settingListeners = new Set<(key: string, value: unknown) => void>();
  const rig = { picks: [] as (File | null)[], alerts: [] as { title: string; message: string }[], confirms: [] as ConfirmDialogOptions[], confirmAnswer: true };

  const develop = create<DevelopSlice>()(() => ({
    photoId: "p1",
    proof: false,
    paramBag: {},
    commitEdit: (label) => {
      commits.push(label);
      return Promise.resolve();
    },
  }));
  const ui = create<UiSlice>()(() => ({ activeModule: "develop" }));
  const nav = { module: "develop" };

  function Select({ value, onChange, options, groups, ariaLabel, disabled }: SelectProps) {
    const option = (o: { value: string; label: string }) => React.createElement("option", { key: o.value, value: o.value }, o.label);
    const children = groups
      ? groups.map((g, i) => React.createElement("optgroup", { key: i, label: g.title }, g.items.map(option)))
      : (options ?? []).map(option);
    return React.createElement(
      "select",
      { value, disabled, "aria-label": ariaLabel, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value) },
      children,
    );
  }

  function Toggle({ checked, onChange, label, ariaLabel }: ToggleProps) {
    return React.createElement(
      "label",
      null,
      label,
      React.createElement("input", { type: "checkbox", checked, "aria-label": ariaLabel, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked) }),
    );
  }

  function Button({ children, onClick, disabled, title }: ButtonProps) {
    return React.createElement("button", { type: "button", onClick, disabled, title }, children);
  }

  const box = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);

  const members: FakeMembers = {
    version: 1,
    extensionId: EXTENSION_ID,
    react: React,
    registerProcessingStage: (c) => void stages.push(c),
    unregisterProcessingStage: (id) => void unregistered.push(id),
    registerPanel: (c) => void panels.push(c),
    registerKeybinding: (c) => void keys.push(c),
    setStageTexture: (stageId, key, tex) => void textures.push({ stageId, key, tex }),
    settings: {
      get: <T,>(key: string, fallback: T): T => (settings.has(key) ? (settings.get(key) as T) : fallback),
      set: (key, value) => {
        settings.set(key, value);
        for (const l of settingListeners) l(key, value);
      },
      onChange: (cb) => {
        settingListeners.add(cb);
        return () => void settingListeners.delete(cb);
      },
    },
    keybindings: { getBinding: (id) => keys.find((k) => k.id === id)?.defaultCombo ?? "" },
    ui: {
      Button,
      Field: ({ label, hint, children }) =>
        React.createElement("div", null, React.createElement("span", null, label), children, hint ? React.createElement("p", null, hint) : null),
      Row: box,
      Select,
      Stack: box,
      Toggle,
      tokens: TOKENS,
      alertDialog: async (o) => void rig.alerts.push({ title: o.title, message: o.message }),
      confirmDialog: async (o) => {
        rig.confirms.push(o);
        return rig.confirmAnswer;
      },
    },
    develop: {
      setViewValues: (values) => void viewValues.push(values),
      prewarmStages: () => void prewarms++,
    },
    presets: { pickFile: async () => rig.picks.shift() ?? null },
    navigation: { current: () => nav.module },
    stores: { useDevelopStore: develop, useUIStore: ui, create },
  };

  return Object.assign(rig, {
    // The fake implements a typed subset; the strict proxy turns any other
    // member's read into a test failure that names it.
    api: strict(members, "api") as unknown as SafelightAPI,
    stages,
    unregistered,
    panels,
    keys,
    viewValues,
    textures,
    prewarms: () => prewarms,
    settings,
    develop,
    ui,
    nav,
    commits,
  });
}

/** Wraps a plain object so reading a member it lacks throws, naming the member. */
function strict<T extends object>(target: T, path: string): T {
  return new Proxy(target, {
    get(obj, key, receiver) {
      if (typeof key === "symbol" || key === "then" || key === "toJSON") return Reflect.get(obj, key, receiver);
      if (!(key in obj)) throw new Error(`The fake API has no ${path}.${key}. Add it to test/support/fake-api.ts.`);
      const value: unknown = Reflect.get(obj, key, receiver);
      const isPlainObject = typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
      return isPlainObject && key !== "react" ? strict(value, `${path}.${key}`) : value;
    },
  });
}
