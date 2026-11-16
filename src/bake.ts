// The proof as a table the stage reads: every node of a cube over the stage's
// encoding (space.ts) holds the colour to show and, in alpha, the gamut
// margin. Baked a few green rows at a time, giving the window back between
// them, so choosing a profile never holds it up.

import type { Vec3 } from "./icc/colour";
import type { Proof } from "./icc/transform";
import { encodedToXyz, xyzToEncoded } from "./space";

/** Nodes along each edge: as many as Little CMS gives a 3-channel table. */
export const TABLE_SIZE = 33;

/** A size³ cube laid out as `size` blue slices side by side, red across each
 *  and green down: `width` = size², `height` = size, RGBA floats. */
export interface ProofTable {
  size: number;
  width: number;
  height: number;
  data: Float32Array;
}

/** Where node (r, g, b) starts in a table of `size`. */
export const nodeIndex = (size: number, r: number, g: number, b: number) => ((g * size + b) * size + r) * 4;

// Rows of green per slice of work, between which the window gets a turn.
const ROWS_PER_TURN = 2;

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function bakeTable(
  proof: Proof,
  options: { size?: number; signal?: AbortSignal } = {},
): Promise<ProofTable | null> {
  const size = options.size ?? TABLE_SIZE;
  const data = new Float32Array(size * size * size * 4);
  const step = 1 / (size - 1);
  for (let g = 0; g < size; g++) {
    if (g % ROWS_PER_TURN === 0) {
      await nextTurn();
      if (options.signal?.aborted) return null;
    }
    for (let b = 0; b < size; b++) {
      for (let r = 0; r < size; r++) {
        const xyz = encodedToXyz([r * step, g * step, b * step] as Vec3);
        const shown = xyzToEncoded(proof.proof(xyz));
        const at = nodeIndex(size, r, g, b);
        data[at] = shown[0];
        data[at + 1] = shown[1];
        data[at + 2] = shown[2];
        data[at + 3] = proof.gamut(xyz);
      }
    }
  }
  return options.signal?.aborted ? null : { size, width: size * size, height: size, data };
}
