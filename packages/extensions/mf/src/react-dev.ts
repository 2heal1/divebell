import type { ParsedCliArgs } from "@divebell/cli";

/** Opt-in, installed before the application's MF runtime registers its shares. */
export function createReactDevInitScript(args?: ParsedCliArgs): string {
  const enabled = args?.options.get("mf-react-dev")?.at(-1);
  const version = args?.options.get("mf-react-version")?.at(-1);
  if (enabled !== undefined && enabled !== "true" && enabled !== "false") {
    throw new Error("--mf-react-dev expects true or false.");
  }
  if (version !== undefined && !/^(17|18|19)\.\d+\.\d+$/.test(version)) {
    throw new Error("--mf-react-version expects an exact React 17, 18, or 19 version.");
  }
  if (enabled === "false" && version !== undefined) {
    throw new Error("--mf-react-version conflicts with --mf-react-dev false.");
  }
  if (enabled !== "true" && version === undefined) return "";
  return `;(${installReactDev.toString()})(${JSON.stringify(version ?? null)});`;
}

// Kept self-contained: compiled function source is installed as an init script.
function installReactDev(explicitVersion: string | null): void {
  const page = window as any;
  if (page.__DIVEBELL_MF_REACT_DEV__) return;
  const marker: any = { status: "waiting", version: explicitVersion, source: explicitVersion ? "explicit" : "first-registration" };
  page.__DIVEBELL_MF_REACT_DEV__ = marker;
  const libraries: Record<string, any> = {};
  const pending: Record<string, Promise<any>> = {};
  const packages = new Set(["react", "react-dom", "react-dom/client"]);
  let selectedVersion = explicitVersion;

  function sourceUrl(pkg: string): string {
    if (selectedVersion === "19.2.4") {
      return `https://unpkg.com/umd-react@19.2.4/dist/${pkg}.development.js`;
    }
    if (!selectedVersion || !/^(17|18)\.\d+\.\d+$/.test(selectedVersion)) {
      throw new Error("Development UMD is currently supported for exact React 17/18 versions only; React 19 currently supports 19.2.4 via umd-react.");
    }
    return `https://unpkg.com/${pkg}@${selectedVersion}/umd/${pkg}.development.js`;
  }

  function execute(pkg: string, source: string): any {
    // An eager registration may have completed while an async fetch was pending.
    if (libraries[pkg]) return libraries[pkg];
    const module = { exports: {} as any };
    new Function("module", "exports", "require", source)(module, module.exports, (name: string) => {
      if (name === "react" && libraries.react) return libraries.react;
      throw new Error(`Unexpected development UMD dependency: ${name}`);
    });
    const library = module.exports;
    if (library.version !== selectedVersion) throw new Error(`Expected ${pkg}@${selectedVersion}, received ${library.version}.`);
    if (pkg === "react" && !Object.isFrozen(library.createElement("div"))) {
      throw new Error("React provider is not a development build.");
    }
    libraries[pkg] = library;
    marker.status = libraries.react && libraries["react-dom"] ? "ready" : "loading";
    return library;
  }

  function fail(error: unknown): never {
    marker.status = "failed";
    marker.message = error instanceof Error ? error.message : String(error);
    throw error;
  }

  function loadSync(pkg: string): any {
    if (libraries[pkg]) return libraries[pkg];
    try {
      if (pkg === "react-dom") loadSync("react");
      const xhr = new XMLHttpRequest();
      xhr.open("GET", sourceUrl(pkg), false);
      xhr.send();
      if (xhr.status !== 200) throw new Error(`Development ${pkg}: HTTP ${xhr.status}`);
      return execute(pkg, xhr.responseText);
    } catch (error) { return fail(error); }
  }

  function load(pkg: string): Promise<any> {
    if (libraries[pkg]) return Promise.resolve(libraries[pkg]);
    return pending[pkg] ??= (async () => {
      try {
        if (pkg === "react-dom") await load("react");
        const response = await fetch(sourceUrl(pkg), { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Development ${pkg}: HTTP ${response.status}`);
        return execute(pkg, await response.text());
      } catch (error) { return fail(error); }
    })();
  }

  const federation = page.__FEDERATION__ ??= {};
  federation.__GLOBAL_PLUGIN__ ??= [];
  federation.__GLOBAL_PLUGIN__.push({
    name: "divebell-mf-react-dev",
    beforeRegisterShare(args: any) {
      if (!packages.has(args.pkgName)) return args;
      // The first React-family registration belongs to the host in the usual
      // startup order. Explicit version wins when that order is different.
      if (selectedVersion === null) {
        selectedVersion = args.shared.version;
        marker.version = selectedVersion;
        marker.host = args.origin?.options?.name;
      }
      try { sourceUrl("react"); } catch (error) { fail(error); }
      const pkg = args.pkgName === "react-dom/client" ? "react-dom" : args.pkgName;
      const shared = args.shared;
      shared.version = selectedVersion;
      shared.get = async () => {
        const library = await load(pkg);
        return () => library;
      };
      if (shared.lib || shared.shareConfig?.eager) {
        const library = loadSync(pkg);
        shared.lib = () => library;
      }
      return args;
    }
  });
}
