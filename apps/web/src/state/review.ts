import { createReviewEnvironmentAtoms } from "@t3tools/client-runtime/state/review";
import type { EnvironmentId, ReviewDiffPreviewInput } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";
import { revisionedQuery } from "./revisionedQuery";

export const reviewEnvironment = createReviewEnvironmentAtoms(connectionAtomRuntime);

/**
 * Several checkouts' diff previews, read under one workspace revision. Keyed by the JSON of
 * `{ environmentId, inputs, revision }`; refreshing it refreshes every preview.
 */
export const repositoryDiffPreviewsAtom = Atom.family((key: string) => {
  const { environmentId, inputs, revision } = JSON.parse(key) as {
    readonly environmentId: EnvironmentId;
    readonly inputs: ReadonlyArray<ReviewDiffPreviewInput>;
    readonly revision?: string | null;
  };
  const previews = inputs.map((input) =>
    revisionedQuery(reviewEnvironment.diffPreview({ environmentId, input }), revision),
  );
  return Atom.readable(
    (get) => previews.map((preview) => get(preview)),
    (refresh) => {
      for (const preview of previews) refresh(preview);
    },
  );
});
