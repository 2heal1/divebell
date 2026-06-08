import type { OpenRuntimeCore, RuntimeClock } from "../../dist/index.js";

export function createClock(start = 1000): RuntimeClock {
  let current = start;
  return {
    now() {
      current += 1;
      return current;
    }
  };
}

export function registerRoute(runtime: Pick<OpenRuntimeCore, "registerTarget">): void {
  runtime.registerTarget({
    id: "route:/home",
    type: "modern.route",
    source: "modern-js",
    label: "Home route",
    description: "Home page route",
    statuses: ["loading", "ready", "blocked", "error"]
  });
}

