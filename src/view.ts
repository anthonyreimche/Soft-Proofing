// Whether the proof is shown, and what shows it. On or off is this window's
// alone, for the session: it starts off, and stays as it is from photo to
// photo. Turned on, the profile's proof is baked into a table (bake.ts),
// handed to the stage with api.setStageTexture, and the stage switched on with
// api.develop.setViewValues, which never reaches the edit: the photo isn't
// marked as edited, and nothing reaches the history, presets, copied settings,
// thumbnails or exports.
//
// Tables are kept for the last few ways of proofing, so going back to one
// shows it at once. The gamut warning's colour and switch are view values
// only and bake nothing.

import { bakeTable, TABLE_SIZE, type ProofTable } from "./bake";
import { BUILT_INS } from "./builtins";
import { mul, srgbToLinear } from "./icc/colour";
import { createProof } from "./icc/transform";
import { ON_KEY, STAGE_ID, TABLE_KEY, WARN_KEY, qualified } from "./ids";
import { LIST_KEY, type ProfileLibrary } from "./library";
import { WARN_COLOURS, readPrefs, type Prefs, type WarnColour } from "./prefs";
import type { AppStore, SafelightAPI } from "./safelight";
import { xyzToEncoded } from "./space";

/** off: not shown. loading: the profile's bytes are still being read.
 *  preparing: its table is being baked. ready: shown. missing: the chosen
 *  profile was removed or can't be read. failed: baking it went wrong. */
export type Status = "off" | "loading" | "preparing" | "ready" | "missing" | "failed";

export interface ViewState {
  on: boolean;
  prefs: Prefs;
  status: Status;
  /** Why baking failed, with status "failed". */
  error: string | null;
  toggle(): void;
}

export interface View {
  store: AppStore<ViewState>;
  stop(): void;
}

export interface ViewOptions {
  /** Nodes along the table's edge; the default but in tests. */
  tableSize?: number;
  /** How long an ask to build ahead waits for the window to fall idle, at most. */
  warmWaitMs?: number;
}

// Tables kept for going back to an earlier way of proofing.
const KEPT_TABLES = 4;
const SRGB_TO_D50 = BUILT_INS[0].profile.matrixShaper!.matrix;

/** The stage's warning value: the colour, in the stage's encoding, and 1 to show it. */
export function warnValue(colour: WarnColour, show: boolean): [number, number, number, number] {
  const rgb = WARN_COLOURS[colour].rgb;
  const [r, g, b] = xyzToEncoded(mul(SRGB_TO_D50, [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])]));
  return [r, g, b, show ? 1 : 0];
}

const tableKey = (profileId: string, p: Prefs) => `${profileId}|${p.intent}|${p.blackPointCompensation}|${p.simulatePaper}`;

export function createView(api: SafelightAPI, library: ProfileLibrary, options: ViewOptions = {}): View {
  const tableSize = options.tableSize ?? TABLE_SIZE;
  const warmWaitMs = options.warmWaitMs ?? 2000;

  const store = api.stores.create<ViewState>((set, get) => ({
    on: false,
    prefs: readPrefs(api.settings),
    status: "off",
    error: null,
    toggle: () => set({ on: !get().on }),
  }));

  const tables = new Map<string, ProofTable>();
  let baking: { key: string; stop: AbortController } | null = null;
  let uploaded: ProofTable | null = null;
  let version = 0;
  let shown = "null";
  let stopped = false;

  const setStatus = (status: Status, error: string | null = null) => {
    const s = store.getState();
    if (s.status !== status || s.error !== error) store.setState({ status, error });
  };

  function show(values: Record<string, unknown> | null): void {
    const key = JSON.stringify(values);
    if (key === shown) return;
    api.develop.setViewValues(values);
    shown = key;
  }

  function upload(table: ProofTable): void {
    if (uploaded === table) return;
    version += 1;
    api.setStageTexture(STAGE_ID, TABLE_KEY, {
      data: table.data,
      width: table.width,
      height: table.height,
      format: "rgba16f",
      version,
    });
    uploaded = table;
  }

  function keep(key: string, table: ProofTable): void {
    tables.delete(key);
    tables.set(key, table);
    while (tables.size > KEPT_TABLES) tables.delete(tables.keys().next().value!);
  }

  function cancelBake(): void {
    baking?.stop.abort();
    baking = null;
  }

  async function bake(key: string, prefs: Prefs, entry: NonNullable<ReturnType<ProfileLibrary["get"]>>): Promise<void> {
    cancelBake();
    const stop = new AbortController();
    baking = { key, stop };
    setStatus("preparing");
    let table: ProofTable | null;
    try {
      const proof = createProof(entry.profile, {
        intent: prefs.intent,
        blackPointCompensation: prefs.blackPointCompensation,
        simulatePaper: prefs.simulatePaper,
      });
      table = await bakeTable(proof, { size: tableSize, signal: stop.signal });
    } catch (err) {
      if (baking?.stop === stop) fail(err);
      return;
    }
    if (!table || stopped) return;
    baking = null;
    keep(key, table);
    apply();
  }

  function fail(err: unknown): void {
    cancelBake();
    try {
      show(null);
    } catch (hidden) {
      console.warn("[soft-proofing] couldn't hide the proof:", hidden);
    }
    setStatus("failed", err instanceof Error ? err.message : String(err));
  }

  function apply(): void {
    if (stopped) return;
    const { on, prefs } = store.getState();
    if (!on) {
      cancelBake();
      show(null);
      setStatus("off");
      return;
    }
    const entry = library.get(prefs.profile);
    if (!entry) {
      cancelBake();
      show(null);
      setStatus(library.isLoading(prefs.profile) ? "loading" : "missing");
      return;
    }
    const key = tableKey(entry.id, prefs);
    const table = tables.get(key);
    if (!table) {
      if (baking?.key !== key) void bake(key, prefs, entry);
      return;
    }
    cancelBake();
    try {
      upload(table);
      show({ [qualified(ON_KEY)]: 1, [qualified(WARN_KEY)]: warnValue(prefs.warnColour, prefs.gamutWarning) });
    } catch (err) {
      fail(err);
      return;
    }
    setStatus("ready");
  }

  // Once Develop is idle with a photo, the live view is asked to build the
  // program with the stage in, so the first proof draws at once. Asked once a
  // photo, as its processing version picks the program.
  let warmedFor: string | null = null;
  let cancelWarm: (() => void) | null = null;

  function whenIdle(fn: () => void): () => void {
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(fn, { timeout: warmWaitMs });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(fn, warmWaitMs);
    return () => clearTimeout(id);
  }

  function warmSoon(): void {
    const photoId = api.stores.useDevelopStore.getState().photoId;
    if (cancelWarm || !photoId || photoId === warmedFor || !inDevelop(api)) return;
    cancelWarm = whenIdle(() => {
      cancelWarm = null;
      const now = api.stores.useDevelopStore.getState().photoId;
      if (!now || !inDevelop(api)) return;
      warmedFor = now;
      if (!store.getState().on) api.develop.prewarmStages();
    });
  }

  const stops = [
    store.subscribe((s, prev) => {
      if (s.on !== prev.on || s.prefs !== prev.prefs) apply();
    }),
    api.settings.onChange((key) => {
      if (key === LIST_KEY) void library.sync();
      else store.setState({ prefs: readPrefs(api.settings) });
    }),
    library.subscribe(apply),
    api.stores.useDevelopStore.subscribe((s, prev) => {
      if (s.photoId !== prev.photoId) warmSoon();
    }),
    api.stores.useUIStore.subscribe((s, prev) => {
      if (s.activeModule !== prev.activeModule) warmSoon();
    }),
  ];
  void library.sync();
  warmSoon();

  return {
    store,
    stop() {
      stopped = true;
      for (const s of stops) s();
      cancelBake();
      cancelWarm?.();
      cancelWarm = null;
      show(null);
      if (uploaded) api.setStageTexture(STAGE_ID, TABLE_KEY, null);
      uploaded = null;
      tables.clear();
    },
  };
}

/** True with Develop in front, in this window or a popped-out one, and a photo open. */
export function inDevelop(api: SafelightAPI): boolean {
  const detached = new URLSearchParams(window.location.search).get("detached");
  const develop = api.stores.useUIStore.getState().activeModule === "develop" || detached === "develop";
  return develop && !!api.stores.useDevelopStore.getState().photoId;
}
