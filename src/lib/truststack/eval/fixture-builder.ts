/**
 * Build ClaimCase + mediaBuffers from MultimodalEvalFixture definitions.
 */

import type { EvidenceArtifact } from "../types/artifact";
import type { ClaimCase } from "../types/case";
import type { MultimodalEvalFixture, EvalExpectation } from "./types";
import type { TrustStackProviderDeps } from "../providers/truststack-providers";

/** Minimal valid JPEG SOI…EOI for placeholder image bytes */
const MIN_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
  0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
  0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
  0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
  0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
  0xff, 0xff, 0xff, 0xd9,
]).buffer;

export type BuiltEvalScenario = {
  claimCase: ClaimCase;
  mediaBuffers: Map<string, ArrayBuffer>;
  providers: TrustStackProviderDeps;
  expect: EvalExpectation;
  fixtureId: string;
};

export function buildEvalScenario(fixture: MultimodalEvalFixture): BuiltEvalScenario {
  const now      = new Date();
  const userId   = fixture.userId ?? "eval-harness";
  const ref      = fixture.ref ?? `EVAL-${fixture.id}`;
  const evidence: EvidenceArtifact[] = [];
  const mediaBuffers = new Map<string, ArrayBuffer>();

  for (const slot of fixture.evidenceLayout) {
    if (slot.modality === "text") {
      evidence.push({
        id:        slot.slotId,
        caseId:    fixture.caseId,
        modality:  "text",
        status:    "pending",
        content:   fixture.claimText,
        createdAt: now,
      });
      continue;
    }

    if (slot.modality === "image") {
      evidence.push({
        id:        slot.slotId,
        caseId:    fixture.caseId,
        modality:  "image",
        status:    "pending",
        mimeType:  slot.mimeType ?? "image/jpeg",
        createdAt: now,
      });
      const buf =
        fixture.imagePlaceholderBySlotId?.[slot.slotId] ?? MIN_JPEG;
      mediaBuffers.set(slot.slotId, buf);
      continue;
    }

    if (slot.modality === "document") {
      const content = fixture.documentTextBySlotId?.[slot.slotId];
      if (content === undefined) {
        throw new Error(
          `Fixture ${fixture.id}: document slot ${slot.slotId} missing documentTextBySlotId entry`,
        );
      }
      evidence.push({
        id:        slot.slotId,
        caseId:    fixture.caseId,
        modality:  "document",
        status:    "pending",
        content,
        filename:  slot.filename,
        mimeType:  slot.mimeType ?? "text/plain",
        createdAt: now,
      });
    }
  }

  const claimCase: ClaimCase = {
    id:          fixture.caseId,
    ref,
    userId,
    status:      "ANALYZING",
    description: fixture.claimText,
    evidence,
    createdAt:   now,
    updatedAt:   now,
    ...fixture.caseFields,
  };

  return {
    claimCase,
    mediaBuffers,
    providers: fixture.providers,
    expect:    fixture.expect,
    fixtureId: fixture.id,
  };
}
