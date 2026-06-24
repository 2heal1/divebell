import type { ParsedCliArgs } from "../args.js";
import type { BrowserRunner } from "../browser.js";
import type { Fetcher, RuntimeSelector } from "../client.js";

export interface CliExtensionRunOptions {
  args: ParsedCliArgs;
  stdout: {
    write(chunk: string): void;
  };
  browserRunner: BrowserRunner;
  fetcher: Fetcher;
  bridgeUrl: string;
  runtimeSelector: RuntimeSelector;
}
