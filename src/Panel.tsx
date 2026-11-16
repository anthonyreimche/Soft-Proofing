// The Develop panel: show the proof, choose the profile and how to proof
// with it, the gamut warning, and adding or removing profiles of your own.

import { DEFAULT_PROFILE_ID } from "./builtins";
import { INTENT, type Intent } from "./icc/transform";
import type { IccProfile } from "./icc/profile";
import { ADD_ERROR, type ProfileEntry, type ProfileGroup, type ProfileLibrary, type Unavailable } from "./library";
import { INTENT_LABELS, PREF_KEYS, WARN_COLOURS, type WarnColour } from "./prefs";
import { React, api } from "./rt";
import type { SelectGroup } from "./safelight";
import type { Status, View } from "./view";

const GROUP_TITLES: Readonly<Record<ProfileGroup, string>> = {
  screen: "Screens",
  print: "Printers and papers",
  other: "Other",
};

const CLASS_LABELS: Readonly<Record<IccProfile["deviceClass"], string>> = {
  prtr: "Printer",
  mntr: "Display",
  spac: "Colour space",
  scnr: "Input",
  link: "Device link",
  abst: "Abstract",
  nmcl: "Named colour",
};

const STATUS_NOTES: Partial<Record<Status, string>> = {
  loading: "Reading the profile…",
  preparing: "Preparing the proof…",
  missing: "The profile chosen isn't available any more. Choose another.",
};

const MISSING_LABEL = "Removed profile";

export function describeProfile(profile: IccProfile): string {
  return `${CLASS_LABELS[profile.deviceClass]} · ${profile.colourSpace} · ICC ${profile.version.toFixed(1)}`;
}

const UNAVAILABLE_SUFFIX: Readonly<Record<Unavailable["reason"], string>> = {
  loading: "loading…",
  unreadable: "can't be read",
};

function profileGroups(entries: readonly ProfileEntry[], unavailable: readonly Unavailable[], selected: string): SelectGroup[] {
  const groups = (Object.keys(GROUP_TITLES) as ProfileGroup[])
    .map((group) => ({
      title: GROUP_TITLES[group],
      items: entries.filter((e) => e.group === group).map((e) => ({ value: e.id, label: e.label })),
    }))
    .filter((g) => g.items.length > 0);
  const notAvailable = unavailable.map((u) => ({ value: u.id, label: `${u.label} (${UNAVAILABLE_SUFFIX[u.reason]})` }));
  const known = entries.some((e) => e.id === selected) || unavailable.some((u) => u.id === selected);
  if (!known) notAvailable.push({ value: selected, label: MISSING_LABEL });
  if (notAvailable.length > 0) groups.push({ title: "Not available", items: notAvailable });
  return groups;
}

function useLibrary(library: ProfileLibrary): { entries: readonly ProfileEntry[]; unavailable: readonly Unavailable[] } {
  const [, redraw] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => library.subscribe(redraw), [library]);
  return { entries: library.entries(), unavailable: library.unavailable() };
}

export function ProofPanel({ view, library }: { view: View; library: ProfileLibrary }) {
  const { Toggle, Select, Field, Stack, Row, Button, tokens, alertDialog, confirmDialog } = api.ui;
  const { entries, unavailable } = useLibrary(library);
  const on = view.store((s) => s.on);
  const prefs = view.store((s) => s.prefs);
  const status = view.store((s) => s.status);
  const error = view.store((s) => s.error);
  const coreProof = api.stores.useDevelopStore((s) => s.proof);
  const selected = entries.find((e) => e.id === prefs.profile);
  // A profile of the person's own, or one listed that can't be read: either can go.
  const removable =
    (selected?.user ? selected : null) ?? unavailable.find((u) => u.id === prefs.profile && u.reason === "unreadable") ?? null;
  const set = (key: keyof typeof PREF_KEYS, value: unknown) => api.settings.set(PREF_KEYS[key], value);
  const note = (text: string, colour: string = tokens.textMuted) => <div style={{ color: colour, fontSize: 11 }}>{text}</div>;

  async function add() {
    const file = await api.presets.pickFile(".icc,.icm");
    if (!file) return;
    const bytes = await file
      .arrayBuffer()
      .then((b) => new Uint8Array(b))
      .catch(() => null);
    const added = bytes ? await library.add(bytes, file.name) : ({ ok: false, error: ADD_ERROR.unreadable } as const);
    if (!added.ok) {
      await alertDialog({ title: "Couldn't add this profile", message: added.error });
      return;
    }
    set("profile", added.entry.id);
  }

  async function remove() {
    if (!removable) return;
    const sure = await confirmDialog({
      title: `Remove ${removable.label}?`,
      message: "Safelight forgets this profile. The file you added it from isn't touched.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!sure) return;
    set("profile", DEFAULT_PROFILE_ID);
    await library.remove(removable.id);
  }

  const statusNote = status === "failed" ? `Couldn't prepare the proof: ${error ?? "unknown error"}` : STATUS_NOTES[status];

  return (
    <div style={{ padding: 8 }}>
      <Stack gap={8}>
        <Toggle label="Show soft proof" ariaLabel="Show soft proof" checked={on} onChange={() => view.store.getState().toggle()} />
        <Field label="Profile" hint={selected?.user ? describeProfile(selected.profile) : undefined}>
          <Select
            value={prefs.profile}
            groups={profileGroups(entries, unavailable, prefs.profile)}
            ariaLabel="Profile"
            onChange={(id) => set("profile", id)}
          />
        </Field>
        <Row gap={6}>
          <Button size="sm" variant="secondary" onClick={() => void add()} title="Add an ICC profile (.icc or .icm) for a printer and paper, or a screen">
            Add profile…
          </Button>
          {removable ? (
            <Button size="sm" variant="ghost" onClick={() => void remove()}>
              Remove
            </Button>
          ) : null}
        </Row>
        <Field label="Rendering intent">
          <Select
            value={String(prefs.intent)}
            ariaLabel="Rendering intent"
            options={Object.values(INTENT).map((i) => ({ value: String(i), label: INTENT_LABELS[i] }))}
            onChange={(v) => set("intent", Number(v) as Intent)}
          />
        </Field>
        {prefs.intent !== INTENT.absolute ? (
          <Toggle
            label="Black point compensation"
            ariaLabel="Black point compensation"
            checked={prefs.blackPointCompensation}
            onChange={(v) => set("blackPointCompensation", v)}
          />
        ) : null}
        <Toggle label="Simulate paper and ink" ariaLabel="Simulate paper and ink" checked={prefs.simulatePaper} onChange={(v) => set("simulatePaper", v)} />
        <Toggle label="Gamut warning" ariaLabel="Gamut warning" checked={prefs.gamutWarning} onChange={(v) => set("gamutWarning", v)} />
        {prefs.gamutWarning ? (
          <Field label="Warning colour">
            <Select
              value={prefs.warnColour}
              ariaLabel="Gamut warning colour"
              options={(Object.keys(WARN_COLOURS) as WarnColour[]).map((value) => ({ value, label: WARN_COLOURS[value].label }))}
              onChange={(v) => set("warnColour", v)}
            />
          </Field>
        ) : null}
        {on && statusNote ? note(statusNote, status === "failed" ? tokens.textPrimary : tokens.textMuted) : null}
        {on && coreProof
          ? note("Safelight's export colour space proof is on too, so the photo is proofed twice. Turn it off with Proof in the status bar.")
          : null}
      </Stack>
    </div>
  );
}
