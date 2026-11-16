// Soft Proofing, a Safelight extension (GPL-3.0-or-later).
//
// Shows on the Develop canvas how a photo will look printed on a paper or
// shown on another screen, from the ICC profile of the printer and paper or
// the screen: the colours the output can't reach are mapped as the rendering
// intent says, and the paper's white and the ink's black can be shown as they
// are. A gamut warning marks what the output can't reproduce. A view aid only:
// the proof never reaches the edit or an export.

import { EXTENSION_ID, PANEL_ID, STAGE_ID, TOGGLE_ACTION } from "./ids";
import { ProfileLibrary, type ProfileBytes } from "./library";
import { ProofPanel } from "./Panel";
import { indexedDbBytes } from "./profile-bytes";
import { React, initRuntime } from "./rt";
import type { SafelightAPI } from "./safelight";
import { proofStage } from "./stage";
import { createView, inDevelop, type View } from "./view";

export { EXTENSION_ID };

let active: { host: SafelightAPI; view: View } | null = null;

/** `bytes` is where profiles of the person's own are kept: IndexedDB unless a
 *  test hands it another. */
export function activate(host: SafelightAPI, bytes: ProfileBytes = indexedDbBytes()): void {
  initRuntime(host);
  const library = new ProfileLibrary(host.settings, bytes);
  const view = createView(host, library);
  active = { host, view };

  host.registerProcessingStage(proofStage());
  host.registerPanel({
    id: PANEL_ID,
    title: "Soft Proofing",
    component: () => <ProofPanel view={view} library={library} />,
    defaultDock: { module: "develop", direction: "right" },
  });
  host.registerKeybinding({
    id: TOGGLE_ACTION,
    label: "Soft proof with a profile",
    category: "Develop",
    defaultCombo: "Shift+S",
    handler: () => {
      if (inDevelop(host)) view.store.getState().toggle();
    },
  });
}

export function deactivate(): void {
  const current = active;
  if (!current) return;
  active = null;
  // A throw here would skip the host's sweep of this extension's
  // registrations, so a failure is logged instead.
  try {
    current.view.stop();
    current.host.unregisterProcessingStage(STAGE_ID);
  } catch (err) {
    console.warn("[soft-proofing] deactivate failed:", err);
  }
}
