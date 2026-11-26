import { mFallback, msg } from "gt-i18n";
import type { MFunctionType } from "gt-i18n/types";

import {
  type LinkedPrompt,
  type NewThreadLink,
  parseNewThreadLink as parseNewThreadLinkWith,
  parseThreadLinkPrompt as parseThreadLinkPromptWith,
  PROMPT_LINK_MAX_PROMPT_LENGTH,
  type PromptLinkError,
  type PromptLinkResult,
} from "./promptLinks.ts";

function promptLinkErrorMessage(
  error: PromptLinkError,
  resolve: MFunctionType,
  brand: string,
): string {
  switch (error) {
    case "prompt-too-long":
      return resolve(
        msg("This prompt is longer than {maxLength} characters, so {brand} did not open it.", {
          maxLength: PROMPT_LINK_MAX_PROMPT_LENGTH.toLocaleString("en-US"),
          brand,
        }),
      );
    case "prompt-only-hidden":
      return resolve(
        msg(
          "This prompt had only hidden characters, so it may be malicious. {brand} did not open it.",
          { brand },
        ),
      );
    case "unreadable-pull-request":
      return resolve(msg("This link names a pull request {brand} cannot read.", { brand }));
    case "missing-prompt":
      return resolve(msg("This link has no prompt."));
    case "unreadable-repository":
      return resolve(msg("This link names a repository {brand} cannot read.", { brand }));
  }
}

/** @public */
export function parseNewThreadLink(
  search: string,
  resolve: MFunctionType = mFallback,
  brand = "T3 Code",
): PromptLinkResult<NewThreadLink> {
  return parseNewThreadLinkWith(search, (error) => promptLinkErrorMessage(error, resolve, brand));
}

/** @public */
export function parseThreadLinkPrompt(
  search: string,
  resolve: MFunctionType = mFallback,
  brand = "T3 Code",
): PromptLinkResult<LinkedPrompt | null> {
  return parseThreadLinkPromptWith(search, (error) =>
    promptLinkErrorMessage(error, resolve, brand),
  );
}
