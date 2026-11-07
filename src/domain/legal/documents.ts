/**
 * The legal documents people accept, and their current versions. To publish a new version:
 * change its `version` here (and the text of its page). Everyone is asked to accept it at their
 * next sign-in; what each person accepted, and when, is kept in LegalAcceptance.
 * The text itself is a placeholder until the lawyer supplies it.
 */
export const LEGAL_DOCUMENTS = ["TERMS", "PRIVACY", "DPA"] as const;
export type LegalDocumentName = (typeof LEGAL_DOCUMENTS)[number];

export const LEGAL_INFO: Record<
  LegalDocumentName,
  { title: string; path: string; version: string }
> = {
  TERMS: { title: "Terms of Service", path: "/legal/terms", version: "2026-11-07" },
  PRIVACY: { title: "Privacy Policy", path: "/legal/privacy", version: "2026-11-07" },
  DPA: { title: "Data Processing Agreement", path: "/legal/dpa", version: "2026-11-07" },
};

export interface Acceptance {
  document: LegalDocumentName;
  version: string;
}

/** Documents whose current version this person hasn't accepted yet. */
export function documentsToAccept(accepted: readonly Acceptance[]): LegalDocumentName[] {
  return LEGAL_DOCUMENTS.filter(
    (d) => !accepted.some((a) => a.document === d && a.version === LEGAL_INFO[d].version),
  );
}

/** The current version of every document, as recorded when someone accepts them all. */
export function currentVersions(): Acceptance[] {
  return LEGAL_DOCUMENTS.map((document) => ({ document, version: LEGAL_INFO[document].version }));
}
