import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activate, deactivate } from "../src/index";
import { PANEL_ID, STAGE_ID, TOGGLE_ACTION } from "../src/ids";
import type { ProfileBytes } from "../src/library";
import { proofStage } from "../src/stage";
import { fakeApi, type Rig } from "./support/fake-api";

let rig: Rig;
const noBytes: ProfileBytes = { get: async () => null, put: async () => {}, remove: async () => {} };

beforeEach(() => {
  rig = fakeApi();
  activate(rig.api, noBytes);
});
afterEach(() => deactivate());

describe("activate", () => {
  it("registers the stage, a Develop panel and the shortcut", () => {
    expect(rig.stages).toEqual([proofStage()]);
    expect(rig.panels).toHaveLength(1);
    expect(rig.panels[0]).toMatchObject({ id: PANEL_ID, title: "Soft Proofing", defaultDock: { module: "develop", direction: "right" } });
    expect(rig.keys).toHaveLength(1);
    expect(rig.keys[0]).toMatchObject({ id: TOGGLE_ACTION, category: "Develop", defaultCombo: "Shift+S" });
  });

  it("toggles the proof with the shortcut in Develop only", async () => {
    rig.keys[0].handler();
    await vi.waitFor(() => expect(rig.viewValues.at(-1)).toMatchObject({ [`${STAGE_ID}.spOn`]: 1 }));
    rig.keys[0].handler();
    expect(rig.viewValues.at(-1)).toBeNull();
    const calls = rig.viewValues.length;
    rig.nav.module = "library";
    rig.keys[0].handler();
    await new Promise((r) => setTimeout(r, 20));
    expect(rig.viewValues.length).toBe(calls);
  });
});

describe("deactivate", () => {
  it("clears the view and takes the stage away", async () => {
    rig.keys[0].handler();
    await vi.waitFor(() => expect(rig.viewValues.at(-1)).toMatchObject({ [`${STAGE_ID}.spOn`]: 1 }));
    deactivate();
    expect(rig.viewValues.at(-1)).toBeNull();
    expect(rig.unregistered).toEqual([STAGE_ID]);
  });
});
