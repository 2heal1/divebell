import type { DivebellTestEnvironment } from "@divebell/test";

export interface DivebellE2eContext {
  getEnvironment(): DivebellTestEnvironment;
}
