// The proof is a view aid: on and off, and every choice of how to proof,
// reach the live view as view values and a stage texture alone, never the
// photo's edit.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILT_INS } from "../src/builtins";
import { INTENT } from "../src/icc/transform";
import { ON_KEY, STAGE_ID, TABLE_KEY, WARN_KEY, qualified } from "../src/ids";
import { LIST_KEY, ProfileLibrary, type ProfileBytes } from "../src/library";
import { DEFAULT_PREFS, PREF_KEYS, WARN_COLOURS } from "../src/prefs";
import { initRuntime } from "../src/rt";
import { xyzToEncoded } from "../src/space";
import { createView, warnValue, type View } from "../src/view";
import { fakeApi, type Rig } from "./support/fake-api";

const SIZE = 5;
let rig: Rig;
let library: ProfileLibrary;
let view: View;

const noBytes: ProfileBytes = { get: async () => null, put: async () => {}, remove: async () => {} };

beforeEach(() => {
  rig = fakeApi();
  initRuntime(rig.api);
  library = new ProfileLibrary(rig.api.settings, noBytes);
  view = createView(rig.api, library, { tableSize: SIZE, warmWaitMs: 0 });
});
afterEach(() => view.stop());

const state = () => view.store.getState();
const lastValues = () => rig.viewValues.at(-1);
const lastTexture = () => rig.textures.at(-1);
/** Lets a bake in flight finish. */
const settle = () => vi.waitFor(() => expect(state().status).not.toBe("preparing"));

async function turnOn() {
  state().toggle();
  await settle();
}

describe("turning the proof on and off", () => {
  it("starts off, handing the view nothing", () => {
    expect(state().on).toBe(false);
    expect(state().status).toBe("off");
    expect(rig.viewValues).toEqual([]);
    expect(rig.textures).toEqual([]);
  });

  it("hands the view the proof table and switches the stage on once it is ready", async () => {
    await turnOn();
    expect(state().status).toBe("ready");
    const call = lastTexture()!;
    expect(call).toMatchObject({ stageId: STAGE_ID, key: TABLE_KEY });
    expect(call.tex).toMatchObject({ width: SIZE * SIZE, height: SIZE, format: "rgba16f", version: 1 });
    expect(call.tex!.data).toHaveLength(SIZE ** 3 * 4);
    expect(lastValues()).toEqual({ [qualified(ON_KEY)]: 1, [qualified(WARN_KEY)]: warnValue(DEFAULT_PREFS.warnColour, false) });
  });

  it("switches the stage off again", async () => {
    await turnOn();
    state().toggle();
    expect(state().status).toBe("off");
    expect(lastValues()).toBeNull();
  });

  it("never touches the photo's edit", async () => {
    await turnOn();
    rig.api.settings.set(PREF_KEYS.intent, INTENT.perceptual);
    await settle();
    state().toggle();
    expect(rig.develop.getState().paramBag).toEqual({});
    expect(rig.commits).toEqual([]);
  });
});

describe("how to proof", () => {
  it("bakes a new table when the intent, compensation or paper change", async () => {
    await turnOn();
    rig.api.settings.set(PREF_KEYS.intent, INTENT.perceptual);
    await settle();
    rig.api.settings.set(PREF_KEYS.simulatePaper, false);
    await settle();
    rig.api.settings.set(PREF_KEYS.blackPointCompensation, false);
    await settle();
    expect(rig.textures.map((t) => t.tex?.version)).toEqual([1, 2, 3, 4]);
    expect(lastValues()?.[qualified(ON_KEY)]).toBe(1);
  });

  it("hands back a table it baked before instead of baking it again", async () => {
    await turnOn();
    const first = lastTexture()!.tex!.data;
    rig.api.settings.set(PREF_KEYS.intent, INTENT.perceptual);
    await settle();
    rig.api.settings.set(PREF_KEYS.intent, INTENT.relative);
    await settle();
    expect(lastTexture()!.tex!.data).toBe(first);
  });

  it("shows the gamut warning in the chosen colour without baking again", async () => {
    await turnOn();
    const textures = rig.textures.length;
    rig.api.settings.set(PREF_KEYS.gamutWarning, true);
    rig.api.settings.set(PREF_KEYS.warnColour, "cyan");
    expect(lastValues()?.[qualified(WARN_KEY)]).toEqual(warnValue("cyan", true));
    expect(rig.textures.length).toBe(textures);
  });

  it("proofs for another profile", async () => {
    await turnOn();
    rig.api.settings.set(PREF_KEYS.profile, BUILT_INS[1].id);
    await settle();
    expect(rig.textures.length).toBe(2);
    expect(state().status).toBe("ready");
  });

  it("says when the chosen profile is gone, and shows no proof", async () => {
    rig.api.settings.set(LIST_KEY, [{ id: "user:gone", label: "Gone" }]);
    rig.api.settings.set(PREF_KEYS.profile, "user:gone");
    await library.sync();
    await turnOn();
    expect(state().status).toBe("missing");
    expect(rig.viewValues.every((v) => v === null)).toBe(true);
  });
});

describe("when something goes wrong", () => {
  it("says the proof failed rather than staying at preparing when the table can't be handed over", async () => {
    view.stop();
    rig = fakeApi();
    const api = new Proxy(rig.api, {
      get: (target, key, receiver) =>
        key === "setStageTexture"
          ? () => {
              throw new Error("no texture units left");
            }
          : Reflect.get(target, key, receiver),
    });
    initRuntime(api);
    view = createView(api, new ProfileLibrary(api.settings, noBytes), { tableSize: SIZE, warmWaitMs: 0 });
    state().toggle();
    await settle();
    expect(state().status).toBe("failed");
    expect(state().error).toBe("no texture units left");
    expect(lastValues() ?? null).toBeNull();
  });
});

describe("warnValue", () => {
  it("carries the colour in the stage's encoding and whether to show it", () => {
    const [r, g, b, show] = warnValue("magenta", true);
    expect(show).toBe(1);
    const srgbMagenta = BUILT_INS[0].profile.matrixShaper!.matrix;
    const want = xyzToEncoded([srgbMagenta[0] + srgbMagenta[2], srgbMagenta[3] + srgbMagenta[5], srgbMagenta[6] + srgbMagenta[8]]);
    [r, g, b].forEach((v, i) => expect(v).toBeCloseTo(want[i], 6));
    expect(warnValue("grey", false)[3]).toBe(0);
    expect(Object.keys(WARN_COLOURS)).toContain("grey");
  });
});

describe("getting ready ahead", () => {
  it("asks the live view to build the proof's program once Develop is idle with a photo", async () => {
    await vi.waitFor(() => expect(rig.prewarms()).toBe(1));
    rig.develop.setState({ photoId: "p2" });
    await vi.waitFor(() => expect(rig.prewarms()).toBe(2));
  });

  it("starts when the module changes to Develop", async () => {
    view.stop();
    rig = fakeApi();
    initRuntime(rig.api);
    rig.nav.module = "library";
    rig.ui.setState({ activeModule: "library" });
    view = createView(rig.api, new ProfileLibrary(rig.api.settings, noBytes), { tableSize: SIZE, warmWaitMs: 0 });
    await new Promise((r) => setTimeout(r, 50));
    expect(rig.prewarms()).toBe(0);
    rig.nav.module = "develop";
    rig.ui.setState({ activeModule: "develop" });
    await vi.waitFor(() => expect(rig.prewarms()).toBe(1));
  });

  it("doesn't outside Develop", async () => {
    view.stop();
    rig = fakeApi();
    initRuntime(rig.api);
    rig.nav.module = "library";
    view = createView(rig.api, new ProfileLibrary(rig.api.settings, noBytes), { tableSize: SIZE, warmWaitMs: 0 });
    await new Promise((r) => setTimeout(r, 50));
    expect(rig.prewarms()).toBe(0);
  });
});

describe("stopping", () => {
  it("clears the view's values and lets go of the table", async () => {
    await turnOn();
    view.stop();
    expect(lastValues()).toBeNull();
    expect(lastTexture()).toMatchObject({ stageId: STAGE_ID, key: TABLE_KEY, tex: null });
  });
});
