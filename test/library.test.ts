import { describe, expect, it } from "vitest";
import { BUILT_INS } from "../src/builtins";
import { PROFILE_ERROR } from "../src/icc/profile";
import { ADD_ERROR, LIST_KEY, MAX_PROFILE_BYTES, ProfileLibrary, type ProfileBytes } from "../src/library";
import { buildProfile, descTag, gammaCurv, lutN, xyzTag } from "./support/icc-builder";

function memoryBytes(): ProfileBytes & { held: Map<string, Uint8Array> } {
  const held = new Map<string, Uint8Array>();
  return {
    held,
    get: async (id) => held.get(id) ?? null,
    put: async (id, bytes) => void held.set(id, bytes.slice()),
    remove: async (id) => void held.delete(id),
  };
}

function memorySettings() {
  const values = new Map<string, unknown>();
  return {
    values,
    get: <T,>(key: string, fallback: T): T => (values.has(key) ? (values.get(key) as T) : fallback),
    set: (key: string, value: unknown) => void values.set(key, value),
  };
}

const passThrough = (inputs: number, outputs: number) => lutN({ inputs, outputs, grid: 2, sampler: (v) => [...v, 0, 0, 0].slice(0, outputs) }, true);

function printerProfile(name: string): Uint8Array {
  return buildProfile({ colorSpace: "CMY ", tags: { desc: descTag(name), A2B0: passThrough(3, 3), B2A0: passThrough(3, 3) } });
}

function screenProfile(name: string): Uint8Array {
  const tags = {
    desc: descTag(name),
    rXYZ: xyzTag([0.43, 0.22, 0.01]),
    gXYZ: xyzTag([0.39, 0.72, 0.1]),
    bXYZ: xyzTag([0.14, 0.06, 0.71]),
    rTRC: gammaCurv(2.2),
    gTRC: gammaCurv(2.2),
    bTRC: gammaCurv(2.2),
  };
  return buildProfile({ deviceClass: "mntr", colorSpace: "RGB ", pcs: "XYZ ", tags });
}

function rig() {
  const settings = memorySettings();
  const bytes = memoryBytes();
  return { settings, bytes, library: new ProfileLibrary(settings, bytes) };
}

describe("ProfileLibrary", () => {
  it("lists the built-in screens first", () => {
    const { library } = rig();
    expect(library.entries().map((e) => e.id)).toEqual(BUILT_INS.map((b) => b.id));
    expect(library.entries().every((e) => e.group === "screen" && !e.user)).toBe(true);
  });

  it("adds a profile under its own name, grouped by its class, and keeps its bytes apart from the list", async () => {
    const { library, settings, bytes } = rig();
    const added = await library.add(printerProfile("Baryta Gloss"), "baryta.icc");
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.entry).toMatchObject({ label: "Baryta Gloss", group: "print", user: true });
    expect(added.entry.id).toMatch(/^user:[0-9a-f]{40}$/);
    expect(settings.values.get(LIST_KEY)).toEqual([{ id: added.entry.id, label: "Baryta Gloss" }]);
    expect(bytes.held.has(added.entry.id)).toBe(true);
    expect(library.get(added.entry.id)).toBe(added.entry);

    const screen = await library.add(screenProfile("Studio monitor"), "monitor.icc");
    expect(screen.ok && screen.entry.group).toBe("screen");
  });

  it("names a profile without a description after its file", async () => {
    const { library } = rig();
    const bare = buildProfile({ colorSpace: "CMY ", tags: { A2B0: passThrough(3, 3), B2A0: passThrough(3, 3) } });
    const added = await library.add(bare, "Matte Fine Art.icm");
    expect(added.ok && added.entry.label).toBe("Matte Fine Art");
  });

  it("adds the same profile once", async () => {
    const { library, settings } = rig();
    const first = await library.add(printerProfile("Pearl"), "a.icc");
    const again = await library.add(printerProfile("Pearl"), "b.icc");
    expect(again.ok && first.ok && again.entry.id === first.entry.id).toBe(true);
    expect((settings.values.get(LIST_KEY) as unknown[]).length).toBe(1);
  });

  it("refuses what it can't use, saying why", async () => {
    const { library } = rig();
    expect(await library.add(new Uint8Array(400), "junk.icc")).toEqual({ ok: false, error: PROFILE_ERROR.notIcc });
    const huge = new Uint8Array(MAX_PROFILE_BYTES + 1);
    expect(await library.add(huge, "huge.icc")).toEqual({ ok: false, error: ADD_ERROR.tooBig });
  });

  it("removes a profile of the person's own, never a built-in one", async () => {
    const { library, settings, bytes } = rig();
    const added = await library.add(printerProfile("Pearl"), "a.icc");
    if (!added.ok) throw new Error(added.error);
    await library.remove(BUILT_INS[0].id);
    expect(library.get(BUILT_INS[0].id)).not.toBeNull();
    await library.remove(added.entry.id);
    expect(library.get(added.entry.id)).toBeNull();
    expect(settings.values.get(LIST_KEY)).toEqual([]);
    expect(bytes.held.size).toBe(0);
  });

  it("picks up what another window added or removed", async () => {
    const shared = memorySettings();
    const bytes = memoryBytes();
    const here = new ProfileLibrary(shared, bytes);
    const there = new ProfileLibrary(shared, bytes);
    let heard = 0;
    there.subscribe(() => heard++);
    const added = await here.add(printerProfile("Pearl"), "a.icc");
    if (!added.ok) throw new Error(added.error);
    expect(there.isLoading(added.entry.id)).toBe(true);
    await there.sync();
    expect(there.get(added.entry.id)?.label).toBe("Pearl");
    expect(heard).toBe(1);
    await here.remove(added.entry.id);
    await there.sync();
    expect(there.get(added.entry.id)).toBeNull();
    expect(heard).toBe(2);
  });

  it("keeps syncing after a listener throws", async () => {
    const shared = memorySettings();
    const bytes = memoryBytes();
    const here = new ProfileLibrary(shared, bytes);
    const there = new ProfileLibrary(shared, bytes);
    there.subscribe(() => {
      throw new Error("listener broke");
    });
    const first = await here.add(printerProfile("One"), "1.icc");
    await there.sync();
    const second = await here.add(printerProfile("Two"), "2.icc");
    await there.sync();
    expect(first.ok && second.ok && there.get(second.entry.id)?.label).toBe("Two");
  });

  it("refuses to add a profile it couldn't store", async () => {
    const settings = memorySettings();
    const failing: ProfileBytes = { ...memoryBytes(), put: async () => Promise.reject(new Error("quota")) };
    const library = new ProfileLibrary(settings, failing);
    expect(await library.add(printerProfile("Pearl"), "a.icc")).toEqual({ ok: false, error: ADD_ERROR.notStored });
    expect(settings.values.get(LIST_KEY)).toBeUndefined();
  });

  it("tries again on the next sync when reading the bytes failed, rather than giving up on them", async () => {
    const { library: writer, settings, bytes } = rig();
    const added = await writer.add(printerProfile("Pearl"), "a.icc");
    if (!added.ok) throw new Error(added.error);
    let fail = true;
    const flaky: ProfileBytes = { ...bytes, get: (id) => (fail ? Promise.reject(new Error("busy")) : bytes.get(id)) };
    const reader = new ProfileLibrary(settings, flaky);
    await reader.sync();
    expect(reader.get(added.entry.id)).toBeNull();
    expect(reader.isUnreadable(added.entry.id)).toBe(false);
    fail = false;
    await reader.sync();
    expect(reader.get(added.entry.id)?.label).toBe("Pearl");
  });

  it("doesn't hang on bytes that never arrive", async () => {
    const { library: writer, settings, bytes } = rig();
    const added = await writer.add(printerProfile("Pearl"), "a.icc");
    if (!added.ok) throw new Error(added.error);
    const stuck: ProfileBytes = { ...bytes, get: () => new Promise(() => {}) };
    const reader = new ProfileLibrary(settings, stuck, { readTimeoutMs: 10 });
    await reader.sync();
    expect(reader.get(added.entry.id)).toBeNull();
  });

  it("doesn't bring back a profile removed while it was being read", async () => {
    const { library: writer, settings, bytes } = rig();
    const added = await writer.add(printerProfile("Pearl"), "a.icc");
    if (!added.ok) throw new Error(added.error);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: ProfileBytes = { ...bytes, get: async (id) => (await gate, bytes.get(id)) };
    const reader = new ProfileLibrary(settings, slow);
    const syncing = reader.sync();
    await reader.remove(added.entry.id);
    release();
    await syncing;
    expect(reader.unavailable()).toEqual([]);
    expect(reader.get(added.entry.id)).toBeNull();
  });

  it("lists the profiles it can't offer yet, so they can be removed", async () => {
    const { library, settings } = rig();
    settings.values.set(LIST_KEY, [{ id: "user:0123", label: "Lost" }]);
    expect(library.unavailable()).toEqual([{ id: "user:0123", label: "Lost", reason: "loading" }]);
    await library.sync();
    expect(library.unavailable()).toEqual([{ id: "user:0123", label: "Lost", reason: "unreadable" }]);
    await library.remove("user:0123");
    expect(library.unavailable()).toEqual([]);
  });

  it("marks a listed profile whose bytes are gone as unreadable", async () => {
    const { library, settings } = rig();
    settings.values.set(LIST_KEY, [{ id: "user:0123", label: "Lost" }, { bogus: true }]);
    await library.sync();
    expect(library.get("user:0123")).toBeNull();
    expect(library.isUnreadable("user:0123")).toBe(true);
    expect(library.isLoading("user:0123")).toBe(false);
  });
});
