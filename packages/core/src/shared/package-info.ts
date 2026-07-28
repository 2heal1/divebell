export const DIVEBELL_PHASE = "phase-0" as const;

export type DivebellPackageName = string;

export interface DivebellPackageInfo {
  name: DivebellPackageName;
  phase: typeof DIVEBELL_PHASE;
  role: string;
}

// Temporary scaffold marker for phase-0 package validation. Remove this once
// each package has real Divebell exports and tests.
export function createPackageInfo(
  name: DivebellPackageName,
  role: string
): DivebellPackageInfo {
  return {
    name,
    phase: DIVEBELL_PHASE,
    role
  };
}
