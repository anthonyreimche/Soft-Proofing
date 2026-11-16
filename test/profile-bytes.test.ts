import { describe, expect, it } from "vitest";
import { indexedDbBytes } from "../src/profile-bytes";

/** An IDBFactory whose open() fails with an error event. */
function failingFactory(): { factory: IDBFactory; opens: () => number } {
  let opens = 0;
  const factory = {
    open: () => {
      opens++;
      const req = { error: new DOMException("blocked"), onerror: null as (() => void) | null } as unknown as IDBOpenDBRequest;
      setTimeout(() => (req.onerror as (() => void) | null)?.call(req));
      return req;
    },
  } as unknown as IDBFactory;
  return { factory, opens: () => opens };
}

describe("indexedDbBytes", () => {
  it("rejects storing where there is no IndexedDB, so adding a profile can say so", async () => {
    const bytes = indexedDbBytes(() => undefined);
    await expect(bytes.put("user:1", new Uint8Array([1]))).rejects.toThrow();
    await expect(bytes.get("user:1")).rejects.toThrow();
  });

  it("tries to open again after a failed open", async () => {
    const { factory, opens } = failingFactory();
    const bytes = indexedDbBytes(() => factory);
    await expect(bytes.get("user:1")).rejects.toThrow();
    await expect(bytes.get("user:1")).rejects.toThrow();
    expect(opens()).toBe(2);
  });
});
