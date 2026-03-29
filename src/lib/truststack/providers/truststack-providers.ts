/**
 * Injectable provider bundle for MultimodalClaimOrchestrator.
 * Omit any field to use the library default (local / mock adapters).
 */

import type { VisionProvider } from "./vision-provider";
import type { OCRProvider } from "./ocr-provider";
import type { TextReasoningProvider } from "./text-reasoning-provider";
import type { PolicyReasoningProvider } from "./policy-reasoning-provider";
import type { DocumentProvider } from "./document-provider";

export type TrustStackProviderDeps = {
  vision?: VisionProvider;
  ocr?: OCRProvider;
  textReasoning?: TextReasoningProvider;
  policyReasoning?: PolicyReasoningProvider;
  document?: DocumentProvider;
};
