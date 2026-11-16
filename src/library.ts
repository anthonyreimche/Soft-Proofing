// The profiles a proof can use: the built-in screens, then the person's own.
// A profile of their own is listed in the extension's settings (so every
// window sees the same list, and hears when it changes) by the SHA-1 of its
// bytes, and its bytes are kept apart (profile-bytes.ts): a printer profile
// is often a megabyte or more, past what settings should hold.

import { BUILT_INS } from "./builtins";
import { parseProfile, profileDescription, type IccProfile } from "./icc/profile";

export interface SettingsStore {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

/** Where a profile's bytes are kept, by id. */
export interface ProfileBytes {
  get(id: string): Promise<Uint8Array | null>;
  put(id: string, bytes: Uint8Array): Promise<void>;
  remove(id: string): Promise<void>;
}

export type ProfileGroup = "screen" | "print" | "other";

export interface ProfileEntry {
  id: string;
  label: string;
  group: ProfileGroup;
  profile: IccProfile;
  user: boolean;
}

interface Listed {
  id: string;
  label: string;
}

export const LIST_KEY = "profiles";
const USER_PREFIX = "user:";
/** The largest profile accepted; real ones stay well under it. */
export const MAX_PROFILE_BYTES = 32 * 1024 * 1024;

export const ADD_ERROR = {
  tooBig: "This file is too large to be an ICC profile.",
  unreadable: "This file couldn't be read.",
  notStored: "Safelight couldn't store this profile. Try again, or restart Safelight.",
} as const;

/** A listed profile the library can't offer: its bytes are still being read,
 *  or are gone or no longer parse. */
export interface Unavailable {
  id: string;
  label: string;
  reason: "loading" | "unreadable";
}

// How long reading a profile's bytes may take before the read counts as
// failed (and is tried again at the next sync).
const READ_TIMEOUT_MS = 10_000;

export type AddResult = { ok: true; entry: ProfileEntry } | { ok: false; error: string };

export function groupOf(profile: IccProfile): ProfileGroup {
  if (profile.deviceClass === "prtr") return "print";
  if (profile.deviceClass === "mntr" || (profile.deviceClass === "spac" && profile.colourSpace === "RGB")) return "screen";
  return "other";
}

const BUILT_IN_ENTRIES: readonly ProfileEntry[] = BUILT_INS.map(({ id, label, profile }) => ({
  id,
  label,
  group: "screen",
  profile,
  user: false,
}));

const isListed = (value: unknown): value is Listed =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Listed).id === "string" &&
  (value as Listed).id.startsWith(USER_PREFIX) &&
  typeof (value as Listed).label === "string";

export async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export class ProfileLibrary {
  private user = new Map<string, ProfileEntry>();
  /** Listed profiles whose bytes are gone or no longer parse. A read that
   *  failed or timed out isn't one: it is tried again at the next sync. */
  private unreadable = new Set<string>();
  private listeners = new Set<() => void>();
  private syncing: Promise<void> = Promise.resolve();
  private readonly readTimeoutMs: number;

  constructor(
    private readonly settings: SettingsStore,
    private readonly bytes: ProfileBytes,
    options: { readTimeoutMs?: number } = {},
  ) {
    this.readTimeoutMs = options.readTimeoutMs ?? READ_TIMEOUT_MS;
  }

  entries(): readonly ProfileEntry[] {
    return [...BUILT_IN_ENTRIES, ...this.listed().flatMap((l) => this.user.get(l.id) ?? [])];
  }

  get(id: string): ProfileEntry | null {
    return this.entries().find((e) => e.id === id) ?? null;
  }

  /** Listed profiles that aren't in entries(), in list order. */
  unavailable(): Unavailable[] {
    return this.listed()
      .filter((l) => !this.user.has(l.id))
      .map(({ id, label }) => ({ id, label, reason: this.unreadable.has(id) ? "unreadable" : "loading" }));
  }

  /** Whether `id` is listed but its profile couldn't be read. */
  isUnreadable(id: string): boolean {
    return this.unreadable.has(id);
  }

  /** Whether `id` is listed and still loading. */
  isLoading(id: string): boolean {
    return this.unavailable().some((u) => u.id === id && u.reason === "loading");
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Brings the loaded profiles in line with the list: reads the bytes of
   *  profiles listed since, and drops those no longer listed. Never rejects,
   *  so one failed sync can't stop the ones after it. */
  sync(): Promise<void> {
    this.syncing = this.syncing.then(
      () => this.load().catch((err) => console.warn("[soft-proofing] reading profiles failed:", err)),
    );
    return this.syncing;
  }

  async add(bytes: Uint8Array, fileName: string): Promise<AddResult> {
    if (bytes.length > MAX_PROFILE_BYTES) return { ok: false, error: ADD_ERROR.tooBig };
    const parsed = parseProfile(bytes);
    if (!parsed.ok) return parsed;
    const id = `${USER_PREFIX}${await sha1Hex(bytes)}`;
    const known = this.get(id);
    if (known) return { ok: true, entry: known };
    try {
      await this.bytes.put(id, bytes);
    } catch {
      return { ok: false, error: ADD_ERROR.notStored };
    }
    const label = profileDescription(bytes) || fileName.replace(/\.(icc|icm)$/i, "");
    this.unreadable.delete(id);
    this.user.set(id, { id, label, group: groupOf(parsed.profile), profile: parsed.profile, user: true });
    this.settings.set(LIST_KEY, [...this.listed().filter((l) => l.id !== id), { id, label }]);
    this.changed();
    return { ok: true, entry: this.user.get(id)! };
  }

  async remove(id: string): Promise<void> {
    if (!id.startsWith(USER_PREFIX)) return;
    this.settings.set(
      LIST_KEY,
      this.listed().filter((l) => l.id !== id),
    );
    this.user.delete(id);
    this.unreadable.delete(id);
    this.changed();
    await this.bytes.remove(id);
  }

  private listed(): Listed[] {
    const value = this.settings.get<unknown>(LIST_KEY, []);
    return Array.isArray(value) ? value.filter(isListed) : [];
  }

  private async load(): Promise<void> {
    const listed = this.listed();
    const ids = new Set(listed.map((l) => l.id));
    let changed = false;
    for (const id of [...this.user.keys(), ...this.unreadable]) {
      if (ids.has(id)) continue;
      this.user.delete(id);
      this.unreadable.delete(id);
      changed = true;
    }
    for (const { id, label } of listed) {
      if (this.user.has(id) || this.unreadable.has(id)) continue;
      const read = await this.read(id);
      // Removed while it was being read.
      if (read === "failed" || !this.listed().some((l) => l.id === id)) continue;
      const parsed = read ? parseProfile(read) : null;
      if (parsed?.ok) this.user.set(id, { id, label, group: groupOf(parsed.profile), profile: parsed.profile, user: true });
      else this.unreadable.add(id);
      changed = true;
    }
    if (changed) this.changed();
  }

  /** The stored bytes, null when there are none, "failed" when reading them
   *  threw or took too long. */
  private read(id: string): Promise<Uint8Array | null | "failed"> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"failed">((resolve) => (timer = setTimeout(() => resolve("failed"), this.readTimeoutMs)));
    const read = this.bytes.get(id).catch((): "failed" => "failed");
    return Promise.race([read, timeout]).finally(() => clearTimeout(timer));
  }

  private changed(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.warn("[soft-proofing] a profile list listener failed:", err);
      }
    }
  }
}
