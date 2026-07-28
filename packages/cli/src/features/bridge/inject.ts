export function createBridgeInitScript(bridgeUrl: string): string {
  return `(() => {
  const BRIDGE_URL = ${JSON.stringify(trimTrailingSlash(bridgeUrl))};
  const MANAGER_KEY = "__DIVEBELL_BRIDGE_MANAGER__";
  const REGISTRY_KEY = "__DIVEBELL_REGISTRY__";
  const SESSION_PARAM = "divebellSessionId";
  const reconnectDelays = [1000, 2000, 4000, 8000, 10000];

  if (globalThis[MANAGER_KEY] !== undefined) return;

  const connections = new Map();
  const pageInstanceId = createId("page");
  let stopped = false;
  let registry;
  let unsubscribe;
  let registryTimer;

  const manager = {
    get connectionCount() {
      return connections.size;
    },
    close() {
      stopped = true;
      if (registryTimer !== undefined) clearTimeout(registryTimer);
      unsubscribe?.();
      for (const connection of connections.values()) connection.close();
      connections.clear();
      if (globalThis[MANAGER_KEY] === manager) delete globalThis[MANAGER_KEY];
    }
  };
  globalThis[MANAGER_KEY] = manager;
  globalThis.addEventListener?.("beforeunload", () => manager.close(), { once: true });

  function createId(prefix) {
    const uuid = globalThis.crypto?.randomUUID?.();
    return uuid === undefined
      ? \`\${prefix}-\${Date.now().toString(36)}-\${Math.random().toString(36).slice(2)}\`
      : \`\${prefix}-\${uuid}\`;
  }

  function waitForRegistry() {
    if (stopped) return;
    const candidate = globalThis[REGISTRY_KEY];
    if (candidate === undefined || typeof candidate.list !== "function" || typeof candidate.subscribe !== "function") {
      registryTimer = setTimeout(waitForRegistry, 20);
      return;
    }

    registry = candidate;
    for (const instance of registry.list()) register(instance);
    unsubscribe = registry.subscribe((event) => {
      if (event?.type === "registered") register(event.instance);
      if (event?.type === "unregistered") unregister(event.instance?.runtimeId);
    });
  }

  function register(instance) {
    if (
      stopped ||
      typeof instance?.runtimeId !== "string" ||
      instance.runtimeId.length === 0 ||
      instance.runtime === undefined ||
      connections.has(instance.runtimeId)
    ) return;

    const connection = createConnection(instance);
    connections.set(instance.runtimeId, connection);
    connection.open();
  }

  function unregister(runtimeId) {
    if (typeof runtimeId !== "string") return;
    const connection = connections.get(runtimeId);
    if (connection === undefined) return;
    connections.delete(runtimeId);
    connection.close();
  }

  function createConnection(instance) {
    const connectionId = createId("connection");
    let stream;
    let bridgeRuntimeId;
    let reconnectAttempt = 0;
    let reconnectTimer;
    let connectionStopped = false;

    const connection = {
      open,
      close() {
        connectionStopped = true;
        if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
        const activeStream = stream;
        stream = undefined;
        void fetch(\`\${BRIDGE_URL}/runtimes/\${encodeURIComponent(instance.runtimeId)}/disconnect\`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ connectionId }),
          keepalive: true
        }).catch(() => {}).finally(() => activeStream?.close());
      }
    };

    function open() {
      if (stopped || connectionStopped) return;
      if (typeof EventSource === "undefined") return;

      const pageUrl = globalThis.location?.href ?? "unknown";
      const url = new URL(\`\${BRIDGE_URL}/connect\`);
      url.searchParams.set("url", pageUrl);
      url.searchParams.set("pageInstanceId", pageInstanceId);
      url.searchParams.set("connectionId", connectionId);
      url.searchParams.set("runtimeId", instance.runtimeId);
      setOptional(url, "renderId", instance.renderId);
      setOptional(url, "source", instance.source);
      setOptional(url, "name", instance.name);
      setOptional(url, "parentRuntimeId", instance.parentRuntimeId);
      try {
        setOptional(url, "sessionId", new URL(pageUrl).searchParams.get(SESSION_PARAM));
      } catch {}

      stream = new EventSource(url.toString());
      stream.addEventListener("connected", (event) => {
        const data = parseJson(event.data);
        bridgeRuntimeId = typeof data?.runtimeId === "string" ? data.runtimeId : instance.runtimeId;
        reconnectAttempt = 0;
      });
      stream.addEventListener("request", (event) => {
        void respond(instance.runtime, event).catch(() => {});
      });
      stream.onerror = () => {
        stream?.close();
        stream = undefined;
        if (stopped || connectionStopped) return;
        const delay = reconnectDelays[Math.min(reconnectAttempt, reconnectDelays.length - 1)] ?? 10000;
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(open, delay);
      };
    }

    async function respond(runtime, event) {
      const request = parseRequest(event);
      if (request === undefined) return;

      let response;
      try {
        response = { success: true, result: await execute(runtime, request) };
      } catch (error) {
        response = { success: false, error: toError(error) };
      }

      const responseRuntimeId = bridgeRuntimeId ?? instance.runtimeId;
      await fetch(
        \`\${BRIDGE_URL}/runtimes/\${encodeURIComponent(responseRuntimeId)}/responses/\${encodeURIComponent(request.requestId)}\`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(response)
        }
      );
    }

    return connection;
  }

  function setOptional(url, name, value) {
    if (typeof value === "string" && value.length > 0) url.searchParams.set(name, value);
  }

  function parseJson(value) {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  function parseRequest(event) {
    const request = parseJson(event.data);
    if (request === null || typeof request !== "object" || typeof request.requestId !== "string") return undefined;
    if (![
      "getTargets",
      "getSnapshot",
      "getEvents",
      "getActions",
      "getInputOptions",
      "runAction",
      "waitFor"
    ].includes(request.method)) return undefined;
    return request;
  }

  function requireString(value, field) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(\`Bridge request is missing "\${field}".\`);
    }
    return value;
  }

  async function execute(runtime, request) {
    switch (request.method) {
      case "getTargets":
        return runtime.getTargets(request.query);
      case "getSnapshot":
        return runtime.getSnapshot(request.query);
      case "getEvents":
        return runtime.getEvents(request.query);
      case "getActions":
        return runtime.getActions(request.query);
      case "getInputOptions":
        return runtime.getInputOptions(
          requireString(request.actionName, "actionName"),
          requireString(request.inputName, "inputName"),
          request.payload,
          request.options
        );
      case "runAction":
        return runtime.runAction(requireString(request.actionName, "actionName"), request.payload);
      case "waitFor":
        return runtime.waitFor({
          id: requireString(request.targetId, "targetId"),
          status: requireString(request.status, "status"),
          ...(request.where === undefined ? {} : { where: request.where })
        }, request.options);
    }
  }

  function toError(error) {
    if (!(error instanceof Error)) return { message: String(error) };
    return {
      message: error.message,
      ...(typeof error.code === "string" ? { code: error.code } : {}),
      ...(typeof error.stack === "string" ? { stack: error.stack } : {}),
      ...(error.data === undefined ? {} : { data: error.data })
    };
  }

  waitForRegistry();
})();`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
