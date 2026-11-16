import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BUILT_INS, DEFAULT_PROFILE_ID } from "../src/builtins";
import { INTENT } from "../src/icc/transform";
import { LIST_KEY, ProfileLibrary, type ProfileBytes } from "../src/library";
import { ProofPanel } from "../src/Panel";
import { PREF_KEYS } from "../src/prefs";
import { React, initRuntime } from "../src/rt";
import { createView, type View } from "../src/view";
import { fakeApi, type Rig } from "./support/fake-api";
import { buildProfile, descTag, lutN } from "./support/icc-builder";

let rig: Rig;
let library: ProfileLibrary;
let view: View;

const memoryBytes = (): ProfileBytes => {
  const held = new Map<string, Uint8Array>();
  return { get: async (id) => held.get(id) ?? null, put: async (id, b) => void held.set(id, b), remove: async (id) => void held.delete(id) };
};

beforeEach(() => {
  rig = fakeApi();
  initRuntime(rig.api);
  library = new ProfileLibrary(rig.api.settings, memoryBytes());
  view = createView(rig.api, library, { tableSize: 3, warmWaitMs: 0 });
});
afterEach(() => {
  cleanup();
  view.stop();
});

const pass = (inputs: number, outputs: number) => lutN({ inputs, outputs, grid: 2, sampler: (v) => [...v, 0, 0].slice(0, outputs) }, true);
const printerFile = (name: string) =>
  new File([buildProfile({ colorSpace: "CMY ", tags: { desc: descTag(name), A2B0: pass(3, 3), B2A0: pass(3, 3) } }) as Uint8Array<ArrayBuffer>], `${name}.icc`);

function draw() {
  return render(<ProofPanel view={view} library={library} />);
}

const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;
const checkbox = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe("the panel", () => {
  it("turns the proof on and off", async () => {
    draw();
    expect(checkbox("Show soft proof").checked).toBe(false);
    fireEvent.click(checkbox("Show soft proof"));
    expect(view.store.getState().on).toBe(true);
    await waitFor(() => expect(view.store.getState().status).toBe("ready"));
    expect(checkbox("Show soft proof").checked).toBe(true);
  });

  it("lists the screens, and the person's printers and papers apart", async () => {
    await library.add(new Uint8Array(await printerFile("Baryta").arrayBuffer()), "Baryta.icc");
    draw();
    const groups = within(select("Profile")).getAllByRole("group") as HTMLOptGroupElement[];
    expect(groups.map((g) => g.label)).toEqual(["Screens", "Printers and papers"]);
    expect(within(groups[0]).getAllByRole("option").map((o) => o.textContent)).toEqual(BUILT_INS.map((b) => b.label));
    expect(within(groups[1]).getAllByRole("option").map((o) => o.textContent)).toEqual(["Baryta"]);
  });

  it("saves the choices as preferences", () => {
    draw();
    fireEvent.change(select("Profile"), { target: { value: BUILT_INS[2].id } });
    fireEvent.change(select("Rendering intent"), { target: { value: String(INTENT.perceptual) } });
    fireEvent.click(checkbox("Simulate paper and ink"));
    fireEvent.click(checkbox("Black point compensation"));
    expect(rig.settings.get(PREF_KEYS.profile)).toBe(BUILT_INS[2].id);
    expect(rig.settings.get(PREF_KEYS.intent)).toBe(INTENT.perceptual);
    expect(rig.settings.get(PREF_KEYS.simulatePaper)).toBe(false);
    expect(rig.settings.get(PREF_KEYS.blackPointCompensation)).toBe(false);
  });

  it("offers black point compensation except for absolute colorimetric", () => {
    draw();
    expect(screen.queryByLabelText("Black point compensation")).not.toBeNull();
    act(() => rig.api.settings.set(PREF_KEYS.intent, INTENT.absolute));
    expect(screen.queryByLabelText("Black point compensation")).toBeNull();
  });

  it("shows the gamut warning's colour while the warning is on", () => {
    draw();
    expect(screen.queryByLabelText("Gamut warning colour")).toBeNull();
    fireEvent.click(checkbox("Gamut warning"));
    expect(rig.settings.get(PREF_KEYS.gamutWarning)).toBe(true);
    fireEvent.change(select("Gamut warning colour"), { target: { value: "grey" } });
    expect(rig.settings.get(PREF_KEYS.warnColour)).toBe("grey");
  });

  it("adds a profile and proofs with it", async () => {
    rig.picks.push(printerFile("Pearl"));
    draw();
    fireEvent.click(screen.getByText("Add profile…"));
    await waitFor(() => expect(String(rig.settings.get(PREF_KEYS.profile))).toMatch(/^user:/));
    expect(library.get(String(rig.settings.get(PREF_KEYS.profile)))?.label).toBe("Pearl");
  });

  it("says why a file can't be added", async () => {
    rig.picks.push(new File([new Uint8Array(300)], "junk.icc"));
    draw();
    fireEvent.click(screen.getByText("Add profile…"));
    await waitFor(() => expect(rig.alerts).toHaveLength(1));
    expect(rig.alerts[0].title).toBe("Couldn't add this profile");
    expect(rig.settings.get(PREF_KEYS.profile)).toBeUndefined();
  });

  it("removes a profile of the person's own after asking, and goes back to sRGB", async () => {
    const added = await library.add(new Uint8Array(await printerFile("Pearl").arrayBuffer()), "Pearl.icc");
    if (!added.ok) throw new Error(added.error);
    rig.api.settings.set(PREF_KEYS.profile, added.entry.id);
    draw();
    fireEvent.click(screen.getByText("Remove"));
    await waitFor(() => expect(library.get(added.entry.id)).toBeNull());
    expect(rig.confirms[0].title).toBe("Remove Pearl?");
    expect(rig.settings.get(PREF_KEYS.profile)).toBe(DEFAULT_PROFILE_ID);
  });

  it("offers no Remove for a built-in screen", () => {
    draw();
    expect(screen.queryByText("Remove")).toBeNull();
  });

  it("describes the profile chosen", async () => {
    const added = await library.add(new Uint8Array(await printerFile("Pearl").arrayBuffer()), "Pearl.icc");
    if (!added.ok) throw new Error(added.error);
    rig.api.settings.set(PREF_KEYS.profile, added.entry.id);
    draw();
    expect(screen.getByText("Printer · CMY · ICC 2.1")).toBeTruthy();
  });

  it("says when the profile chosen is gone", async () => {
    rig.api.settings.set(PREF_KEYS.profile, "user:gone");
    draw();
    fireEvent.click(checkbox("Show soft proof"));
    await waitFor(() => expect(screen.getByText(/isn't available any more/)).toBeTruthy());
  });

  it("lists a profile that can't be read under its own name, and lets it be removed", async () => {
    rig.api.settings.set(LIST_KEY, [{ id: "user:lost", label: "Lost Paper" }]);
    rig.api.settings.set(PREF_KEYS.profile, "user:lost");
    await library.sync();
    draw();
    const groups = within(select("Profile")).getAllByRole("group") as HTMLOptGroupElement[];
    expect(groups.at(-1)!.label).toBe("Not available");
    expect(within(groups.at(-1)!).getAllByRole("option").map((o) => o.textContent)).toEqual(["Lost Paper (can't be read)"]);
    fireEvent.click(screen.getByText("Remove"));
    await waitFor(() => expect(rig.settings.get(LIST_KEY)).toEqual([]));
    expect(rig.settings.get(PREF_KEYS.profile)).toBe(DEFAULT_PROFILE_ID);
  });

  it("shows a profile still being read as loading, not as removed", () => {
    rig.api.settings.set(LIST_KEY, [{ id: "user:slow", label: "Slow Paper" }]);
    rig.api.settings.set(PREF_KEYS.profile, "user:slow");
    draw();
    expect(within(select("Profile")).getAllByRole("option").map((o) => o.textContent)).toContain("Slow Paper (loading…)");
    expect(screen.queryByText("Removed profile")).toBeNull();
  });

  it("notes when Safelight's own export proof is on too", () => {
    draw();
    expect(screen.queryByText(/export colour space proof is on too/)).toBeNull();
    act(() => rig.develop.setState({ proof: true }));
    fireEvent.click(checkbox("Show soft proof"));
    expect(screen.getByText(/export colour space proof is on too/)).toBeTruthy();
  });
});
