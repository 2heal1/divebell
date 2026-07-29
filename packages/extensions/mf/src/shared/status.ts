import { filterGlobalShared } from "../results.js";
import type { BrowserObservabilitySnapshot } from "../types.js";
import type {
  SharedStatusOptions,
  SharedStatusResult,
  SharedStatusSelectors
} from "./types.js";

export function createSharedStatusResult(
  snapshot: BrowserObservabilitySnapshot,
  selectors: SharedStatusSelectors,
  options: SharedStatusOptions = {}
): SharedStatusResult {
  return {
    shared: filterGlobalShared(snapshot.globalShared, {
      ...selectors,
      verbose: options.verbose === true
    })
  };
}
