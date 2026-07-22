"use strict";
var ModuleFederationChromeObservabilityPlugin = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // packages/observability-plugin/src/chrome-devtool.ts
  var chrome_devtool_exports = {};
  __export(chrome_devtool_exports, {
    ChromeObservabilityPlugin: () => ChromeObservabilityPlugin,
    default: () => chrome_devtool_default
  });

  // packages/sdk/dist/constant.js
  var BROWSER_LOG_KEY = "FEDERATION_DEBUG";
  var NameTransformSymbol = {
    AT: "@",
    HYPHEN: "-",
    SLASH: "/"
  };
  var NameTransformMap = {
    [NameTransformSymbol.AT]: "scope_",
    [NameTransformSymbol.HYPHEN]: "_",
    [NameTransformSymbol.SLASH]: "__"
  };
  var EncodedNameTransformMap = {
    [NameTransformMap[NameTransformSymbol.AT]]: NameTransformSymbol.AT,
    [NameTransformMap[NameTransformSymbol.HYPHEN]]: NameTransformSymbol.HYPHEN,
    [NameTransformMap[NameTransformSymbol.SLASH]]: NameTransformSymbol.SLASH
  };

  // packages/sdk/dist/env.js
  var isBrowserEnvValue = typeof ENV_TARGET !== "undefined" ? ENV_TARGET === "web" : typeof window !== "undefined" && typeof window.document !== "undefined";
  function isBrowserEnv() {
    return isBrowserEnvValue;
  }
  function isBrowserDebug() {
    try {
      if (isBrowserEnv() && window.localStorage) return Boolean(localStorage.getItem(BROWSER_LOG_KEY));
    } catch (error) {
      return false;
    }
    return false;
  }
  function isDebugMode() {
    if (typeof process !== "undefined" && process.env && process.env["FEDERATION_DEBUG"]) return Boolean(process.env["FEDERATION_DEBUG"]);
    if (typeof FEDERATION_DEBUG !== "undefined" && Boolean(FEDERATION_DEBUG)) return true;
    return isBrowserDebug();
  }

  // packages/sdk/dist/logger.js
  var PREFIX = "[ Module Federation ]";
  var DEFAULT_DELEGATE = console;
  var LOGGER_STACK_SKIP_TOKENS = [
    "logger.ts",
    "logger.js",
    "captureStackTrace",
    "Logger.emit",
    "Logger.log",
    "Logger.info",
    "Logger.warn",
    "Logger.error",
    "Logger.debug"
  ];
  function captureStackTrace() {
    try {
      const stack = (/* @__PURE__ */ new Error()).stack;
      if (!stack) return;
      const [, ...rawLines] = stack.split("\n");
      const filtered = rawLines.filter((line) => !LOGGER_STACK_SKIP_TOKENS.some((token) => line.includes(token)));
      if (!filtered.length) return;
      return `Stack trace:
${filtered.slice(0, 5).join("\n")}`;
    } catch {
      return;
    }
  }
  var Logger = class {
    constructor(prefix, delegate = DEFAULT_DELEGATE) {
      this.prefix = prefix;
      this.delegate = delegate ?? DEFAULT_DELEGATE;
    }
    setPrefix(prefix) {
      this.prefix = prefix;
    }
    setDelegate(delegate) {
      this.delegate = delegate ?? DEFAULT_DELEGATE;
    }
    emit(method, args) {
      const delegate = this.delegate;
      const stackTrace = isDebugMode() ? captureStackTrace() : void 0;
      const enrichedArgs = stackTrace ? [...args, stackTrace] : args;
      const order = (() => {
        switch (method) {
          case "log":
            return ["log", "info"];
          case "info":
            return ["info", "log"];
          case "warn":
            return [
              "warn",
              "info",
              "log"
            ];
          case "error":
            return [
              "error",
              "warn",
              "log"
            ];
          default:
            return ["debug", "log"];
        }
      })();
      for (const candidate of order) {
        const handler = delegate[candidate];
        if (typeof handler === "function") {
          handler.call(delegate, this.prefix, ...enrichedArgs);
          return;
        }
      }
      for (const candidate of order) {
        const handler = DEFAULT_DELEGATE[candidate];
        if (typeof handler === "function") {
          handler.call(DEFAULT_DELEGATE, this.prefix, ...enrichedArgs);
          return;
        }
      }
    }
    log(...args) {
      this.emit("log", args);
    }
    warn(...args) {
      this.emit("warn", args);
    }
    error(...args) {
      this.emit("error", args);
    }
    success(...args) {
      this.emit("info", args);
    }
    info(...args) {
      this.emit("info", args);
    }
    ready(...args) {
      this.emit("info", args);
    }
    debug(...args) {
      if (isDebugMode()) this.emit("debug", args);
    }
  };
  function createLogger(prefix) {
    return new Logger(prefix);
  }
  function createInfrastructureLogger(prefix) {
    const infrastructureLogger2 = new Logger(prefix);
    Object.defineProperty(infrastructureLogger2, "__mf_infrastructure_logger__", {
      value: true,
      enumerable: false,
      configurable: false
    });
    return infrastructureLogger2;
  }
  var logger = createLogger(PREFIX);
  var infrastructureLogger = createInfrastructureLogger(PREFIX);

  // node_modules/.pnpm/@openruntime+core@https+++pkg.pr.new+2heal1+openruntime+@openruntime+core@a13b382/node_modules/@openruntime/core/dist/shared/query.js
  function matchesValue(value, query) {
    if (query === void 0) {
      return true;
    }
    if (value === void 0) {
      return false;
    }
    const values = Array.isArray(query) ? query : [query];
    return values.includes(value);
  }
  function matchesAnyValue(values, query) {
    if (query === void 0) {
      return true;
    }
    const expected = Array.isArray(query) ? query : [query];
    return expected.some((value) => values.includes(value));
  }
  function matchesText(fields, query) {
    if (query === void 0 || query === "") {
      return true;
    }
    const normalizedQuery = query.toLowerCase();
    return fields.some((field) => field?.toLowerCase().includes(normalizedQuery));
  }

  // node_modules/.pnpm/@openruntime+core@https+++pkg.pr.new+2heal1+openruntime+@openruntime+core@a13b382/node_modules/@openruntime/core/dist/action/registry.js
  var defaultActionSource = "business";
  var defaultActionRisk = "state-changing";
  var ActionRegistry = class {
    #clock;
    #actions = /* @__PURE__ */ new Map();
    constructor(clock) {
      this.#clock = clock;
    }
    register(input) {
      const now = this.#clock.now();
      const existing = this.#actions.get(input.name);
      const action = normalizeAction(input, existing?.registeredAt ?? now, now);
      this.#actions.set(action.name, action);
    }
    unregister(actionName) {
      return this.#actions.delete(actionName);
    }
    get(actionName) {
      const action = this.#actions.get(actionName);
      return action === void 0 ? void 0 : cloneRegisteredAction(action);
    }
    list(query, snapshot) {
      return Array.from(this.#actions.values()).map((action) => toDescriptor(action, getAvailability(action.availableWhen, snapshot))).filter((action) => matchesAction(action, query)).map(cloneActionDescriptor);
    }
    async getInputOptions(actionName, inputName, currentPayload, context) {
      const action = this.#actions.get(actionName);
      if (action?.getInputOptions === void 0) {
        return [];
      }
      const properties = action.inputSchema?.properties;
      if (properties !== void 0 && !(inputName in properties)) {
        return [];
      }
      const options = await action.getInputOptions(inputName, currentPayload, context);
      return options.map((option) => ({ ...option }));
    }
  };
  function getAvailability(availableWhen, snapshot) {
    if (availableWhen === void 0) {
      return { enabled: true };
    }
    const conditions = Array.isArray(availableWhen) ? availableWhen : [availableWhen];
    for (const condition of conditions) {
      const target = snapshot.targets[condition.id];
      if (target?.status !== condition.status) {
        return {
          enabled: false,
          reason: `Waiting for ${condition.id} to reach ${condition.status}.`
        };
      }
    }
    return { enabled: true };
  }
  function normalizeAction(input, registeredAt, updatedAt) {
    const name = assertNonEmptyString(input.name, "action name");
    if (typeof input.handler !== "function") {
      throw new Error("action handler must be a function");
    }
    const action = {
      name,
      source: input.source ?? defaultActionSource,
      risk: input.risk ?? defaultActionRisk,
      hasInputOptions: input.getInputOptions !== void 0,
      enabled: true,
      registeredAt,
      updatedAt,
      handler: input.handler
    };
    assignOptionalActionFields(action, input);
    if (input.getInputOptions !== void 0) {
      action.getInputOptions = input.getInputOptions;
    }
    return action;
  }
  function toDescriptor(action, availability) {
    const descriptor = {
      name: action.name,
      source: action.source,
      risk: action.risk,
      hasInputOptions: action.hasInputOptions,
      enabled: availability.enabled,
      registeredAt: action.registeredAt,
      updatedAt: action.updatedAt
    };
    assignOptionalActionFields(descriptor, action);
    if (!availability.enabled && availability.reason !== void 0) {
      descriptor.reason = availability.reason;
    }
    return descriptor;
  }
  function cloneRegisteredAction(action) {
    const clone = {
      ...cloneActionDescriptor(action),
      handler: action.handler
    };
    if (action.getInputOptions !== void 0) {
      clone.getInputOptions = action.getInputOptions;
    }
    return clone;
  }
  function cloneActionDescriptor(action) {
    const clone = {
      name: action.name,
      source: action.source,
      risk: action.risk,
      hasInputOptions: action.hasInputOptions,
      enabled: action.enabled,
      registeredAt: action.registeredAt,
      updatedAt: action.updatedAt
    };
    assignOptionalActionFields(clone, action);
    if (action.reason !== void 0)
      clone.reason = action.reason;
    return clone;
  }
  function assignOptionalActionFields(target, input) {
    if (input.description !== void 0)
      target.description = input.description;
    if (input.availableWhen !== void 0) {
      target.availableWhen = Array.isArray(input.availableWhen) ? input.availableWhen.map((condition) => ({ ...condition })) : { ...input.availableWhen };
    }
    if (input.inputSchema !== void 0)
      target.inputSchema = cloneInputSchema(input.inputSchema);
  }
  function cloneInputSchema(schema) {
    if (schema === void 0) {
      return schema;
    }
    return structuredClone(schema);
  }
  function matchesAction(action, query) {
    if (query === void 0) {
      return true;
    }
    return matchesValue(action.name, query.name) && matchesValue(action.source, query.source) && matchesValue(action.risk, query.risk) && (query.enabled === void 0 || action.enabled === query.enabled) && matchesText([action.name, action.description], query.query);
  }
  function assertNonEmptyString(value, label) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`${label} must be a non-empty string`);
    }
    return value;
  }

  // node_modules/.pnpm/@openruntime+core@https+++pkg.pr.new+2heal1+openruntime+@openruntime+core@a13b382/node_modules/@openruntime/core/dist/action/validation.js
  function validateActionPayload(schema, payload) {
    if (schema === void 0) {
      return void 0;
    }
    const value = payload ?? {};
    return validateObjectSchema(schema, value, "payload");
  }
  function validateObjectSchema(schema, value, path) {
    if (!isPlainObject(value)) {
      return createValidationError(`${path} must be an object`);
    }
    const properties = schema.properties ?? {};
    const required = schema.required ?? [];
    for (const key of required) {
      if (!(key in value)) {
        return createValidationError(`${path}.${key} is required`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          return createValidationError(`${path}.${key} is not allowed`);
        }
      }
    }
    for (const [key, property] of Object.entries(properties)) {
      if (key in value) {
        const error = validateProperty(property, value[key], `${path}.${key}`);
        if (error !== void 0) {
          return error;
        }
      }
    }
    return void 0;
  }
  function validateProperty(property, value, path) {
    if (property.enum !== void 0 && !property.enum.includes(value)) {
      return createValidationError(`${path} must be one of the declared enum values`);
    }
    switch (property.type) {
      case "string":
        return typeof value === "string" ? void 0 : createValidationError(`${path} must be a string`);
      case "number":
        return typeof value === "number" ? void 0 : createValidationError(`${path} must be a number`);
      case "boolean":
        return typeof value === "boolean" ? void 0 : createValidationError(`${path} must be a boolean`);
      case "array":
        return validateArrayProperty(property, value, path);
      case "object":
        return validateNestedObjectProperty(property, value, path);
    }
  }
  function validateArrayProperty(property, value, path) {
    if (!Array.isArray(value)) {
      return createValidationError(`${path} must be an array`);
    }
    if (property.items === void 0) {
      return void 0;
    }
    for (let index = 0; index < value.length; index += 1) {
      const error = validateProperty(property.items, value[index], `${path}[${index}]`);
      if (error !== void 0) {
        return error;
      }
    }
    return void 0;
  }
  function validateNestedObjectProperty(property, value, path) {
    const schema = {
      type: "object"
    };
    if (property.properties !== void 0)
      schema.properties = property.properties;
    if (property.required !== void 0)
      schema.required = property.required;
    if (property.additionalProperties !== void 0) {
      schema.additionalProperties = property.additionalProperties;
    }
    return validateObjectSchema(schema, value, path);
  }
  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function createValidationError(message) {
    return {
      message,
      code: "action_payload_invalid"
    };
  }

  // node_modules/.pnpm/@openruntime+core@https+++pkg.pr.new+2heal1+openruntime+@openruntime+core@a13b382/node_modules/@openruntime/core/dist/bridge/command.js
  async function executeBridgeRuntimeRequest(runtime, request) {
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
        return runtime.getInputOptions(requireString(request.actionName, "actionName"), requireString(request.inputName, "inputName"), request.payload, request.options);
      case "runAction":
        return runtime.runAction(requireString(request.actionName, "actionName"), request.payload);
      case "waitFor":
        return runtime.waitFor({
          id: requireString(request.targetId, "targetId"),
          status: requireString(request.status, "status"),
          ...request.where === void 0 ? {} : { where: request.where }
        }, request.options);
    }
  }
  function requireString(value, field) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Bridge request is missing "${field}".`);
    }
    return value;
  }

  // node_modules/.pnpm/@openruntime+core@https+++pkg.pr.new+2heal1+openruntime+@openruntime+core@a13b382/node_modules/@openruntime/core/dist/bridge/types.js
  var OPEN_RUNTIME_BRIDGE_DEFAULT_PORT = 17321;

  // node_modules/.pnpm/@openruntime+core@https+++pkg.pr.new+2heal1+openruntime+@openruntime+core@a13b382/node_modules/@openruntime/core/dist/bridge/connect.js
  var reconnectDelays = [1e3, 2e3, 4e3, 8e3, 1e4];
  function connectBridge(runtime, options = {}) {
    if (getGlobalBridgeConnection() !== void 0) {
      return;
    }
    const port = options.port ?? OPEN_RUNTIME_BRIDGE_DEFAULT_PORT;
    const autoReconnect = options.autoReconnect ?? true;
    const pageUrl = getPageUrl();
    const pageInstanceId = getPageInstanceId(options.pageInstanceId);
    const configuredRuntimeId = normalizeOptional(options.runtimeId);
    const configuredRenderId = normalizeOptional(options.renderId);
    let runtimeId;
    let stream;
    let stopped = false;
    let reconnectAttempt = 0;
    let connection;
    const open = () => {
      if (typeof EventSource === "undefined") {
        throw new Error("EventSource is required to connect OpenRuntime Bridge.");
      }
      stream = new EventSource(createBridgeConnectUrl({
        port,
        pageUrl,
        pageInstanceId,
        ...configuredRuntimeId === void 0 ? {} : { runtimeId: configuredRuntimeId },
        ...configuredRenderId === void 0 ? {} : { renderId: configuredRenderId }
      }));
      stream.addEventListener("connected", (event) => {
        runtimeId = parseConnectedRuntimeId(event);
        reconnectAttempt = 0;
      });
      stream.addEventListener("request", (event) => {
        void handleRequest(runtime, port, () => runtimeId, event);
      });
      stream.onerror = () => {
        stream?.close();
        stream = void 0;
        if (!stopped && autoReconnect) {
          const delay = reconnectDelays[Math.min(reconnectAttempt, reconnectDelays.length - 1)] ?? 1e4;
          reconnectAttempt += 1;
          setTimeout(open, delay);
        }
      };
    };
    const stop = () => {
      stopped = true;
      stream?.close();
      if (connection !== void 0) {
        clearGlobalBridgeConnection(connection);
      }
    };
    connection = { close: stop };
    setGlobalBridgeConnection(connection);
    globalThis.addEventListener?.("beforeunload", stop, { once: true });
    try {
      open();
    } catch (error) {
      clearGlobalBridgeConnection(connection);
      throw error;
    }
  }
  async function handleRequest(runtime, port, getRuntimeId, event) {
    const request = parseRequest(event);
    if (request === void 0)
      return;
    let response;
    try {
      response = {
        success: true,
        result: await executeBridgeRuntimeRequest(runtime, request)
      };
    } catch (error) {
      response = {
        success: false,
        error: toRuntimeError(error)
      };
    }
    const runtimeId = getRuntimeId();
    if (runtimeId === void 0)
      return;
    await fetch(createBridgeResponseUrl(port, runtimeId, request.requestId), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(response)
    });
  }
  function createBridgeConnectUrl(options) {
    const { port, pageUrl, pageInstanceId, runtimeId, renderId } = options;
    const url = new URL(`http://localhost:${port}/connect`);
    url.searchParams.set("url", pageUrl);
    url.searchParams.set("pageInstanceId", pageInstanceId);
    if (runtimeId !== void 0) {
      url.searchParams.set("runtimeId", runtimeId);
    }
    if (renderId !== void 0) {
      url.searchParams.set("renderId", renderId);
    }
    return url.toString();
  }
  function createBridgeResponseUrl(port, runtimeId, requestId) {
    return `http://localhost:${port}/runtimes/${encodeURIComponent(runtimeId)}/responses/${encodeURIComponent(requestId)}`;
  }
  function getPageUrl() {
    return globalThis.location?.href ?? "unknown";
  }
  function getBridgeGlobal() {
    return globalThis;
  }
  function getGlobalBridgeConnection() {
    return getBridgeGlobal().__OPEN_RUNTIME_BRIDGE_CONNECTION__;
  }
  function setGlobalBridgeConnection(connection) {
    getBridgeGlobal().__OPEN_RUNTIME_BRIDGE_CONNECTION__ = connection;
  }
  function clearGlobalBridgeConnection(connection) {
    const bridgeGlobal = getBridgeGlobal();
    if (bridgeGlobal.__OPEN_RUNTIME_BRIDGE_CONNECTION__ === connection) {
      delete bridgeGlobal.__OPEN_RUNTIME_BRIDGE_CONNECTION__;
    }
  }
  function getPageInstanceId(configuredId) {
    if (configuredId !== void 0 && configuredId.length > 0) {
      return configuredId;
    }
    return createPageInstanceId();
  }
  function createPageInstanceId() {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid !== void 0) {
      return `page-${uuid}`;
    }
    return `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  function normalizeOptional(value) {
    return value === void 0 || value.length === 0 ? void 0 : value;
  }
  function parseConnectedRuntimeId(event) {
    const data = parseJson(event.data);
    return typeof data?.runtimeId === "string" ? data.runtimeId : void 0;
  }
  function parseRequest(event) {
    const data = parseJson(event.data);
    if (data === void 0 || typeof data !== "object")
      return void 0;
    const request = data;
    if (typeof request.requestId !== "string")
      return void 0;
    if (request.method !== "getTargets" && request.method !== "getSnapshot" && request.method !== "getEvents" && request.method !== "getActions" && request.method !== "getInputOptions" && request.method !== "runAction" && request.method !== "waitFor") {
      return void 0;
    }
    const bridgeRequest = {
      requestId: request.requestId,
      method: request.method
    };
    if (request.query !== void 0) {
      bridgeRequest.query = request.query;
    }
    if (typeof request.actionName === "string") {
      bridgeRequest.actionName = request.actionName;
    }
    if (typeof request.inputName === "string") {
      bridgeRequest.inputName = request.inputName;
    }
    if (isRecord(request.payload)) {
      bridgeRequest.payload = request.payload;
    }
    if (typeof request.targetId === "string") {
      bridgeRequest.targetId = request.targetId;
    }
    if (typeof request.status === "string") {
      bridgeRequest.status = request.status;
    }
    if (Array.isArray(request.where)) {
      bridgeRequest.where = request.where;
    }
    if (isRecord(request.options)) {
      bridgeRequest.options = request.options;
    }
    return bridgeRequest;
  }
  function parseJson(value) {
    if (typeof value !== "string")
      return void 0;
    try {
      const parsed = JSON.parse(value);
      return parsed !== null && typeof parsed === "object" ? parsed : void 0;
    } catch {
      return void 0;
    }
  }
  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  function toRuntimeError(error) {
    if (error instanceof Error) {
      const runtimeError = {
        message: error.message
      };
      if (error.stack !== void 0) {
        runtimeError.stack = error.stack;
      }
      return runtimeError;
    }
    return {
      message: String(error)
    };
  }

  // node_modules/.pnpm/@openruntime+core@https+++pkg.pr.new+2heal1+openruntime+@openruntime+core@a13b382/node_modules/@openruntime/core/dist/event/log.js
  var DEFAULT_EVENT_LIMIT = 100;
  var EventLog = class {
    #clock;
    #events = [];
    #nextEventId = 1;
    constructor(clock) {
      this.#clock = clock;
    }
    append(input) {
      const event = normalizeEvent(input, this.#nextEventId, this.#clock.now());
      this.#nextEventId += 1;
      this.#events.push(event);
      return cloneEvent(event);
    }
    latestEventId() {
      return this.#nextEventId - 1;
    }
    get(query) {
      const filtered = this.#events.filter((event) => matchesEvent(event, query));
      const limit = normalizeLimit(query?.limit);
      const truncated = filtered.length > limit;
      const events = truncated ? filtered.slice(filtered.length - limit) : filtered;
      return {
        events: events.map(cloneEvent),
        latestEventId: this.latestEventId(),
        truncated
      };
    }
  };
  function normalizeEvent(input, id, timestamp) {
    const event = {
      id,
      type: input.type,
      source: input.source,
      timestamp
    };
    if (input.targetId !== void 0)
      event.targetId = input.targetId;
    if (input.actionName !== void 0)
      event.actionName = input.actionName;
    if (input.status !== void 0)
      event.status = input.status;
    if ("payload" in input)
      event.payload = input.payload;
    if (input.error !== void 0)
      event.error = { ...input.error };
    return event;
  }
  function cloneEvent(event) {
    const clone = {
      id: event.id,
      type: event.type,
      source: event.source,
      timestamp: event.timestamp
    };
    if (event.targetId !== void 0)
      clone.targetId = event.targetId;
    if (event.actionName !== void 0)
      clone.actionName = event.actionName;
    if (event.status !== void 0)
      clone.status = event.status;
    if ("payload" in event)
      clone.payload = event.payload;
    if (event.error !== void 0)
      clone.error = { ...event.error };
    return clone;
  }
  function matchesEvent(event, query) {
    if (query === void 0) {
      return true;
    }
    if (query.since !== void 0 && event.id <= query.since) {
      return false;
    }
    return matchesValue(event.targetId, query.targetId) && matchesValue(event.actionName, query.actionName) && matchesValue(event.type, query.type) && matchesValue(event.source, query.source) && matchesValue(event.status, query.status);
  }
  function normalizeLimit(limit) {
    if (limit === void 0) {
      return DEFAULT_EVENT_LIMIT;
    }
    if (!Number.isFinite(limit) || limit < 1) {
      return DEFAULT_EVENT_LIMIT;
    }
    return Math.floor(limit);
  }

  // node_modules/.pnpm/@openruntime+core@https+++pkg.pr.new+2heal1+openruntime+@openruntime+core@a13b382/node_modules/@openruntime/core/dist/snapshot/store.js
  var SnapshotStore = class {
    #clock;
    #targets = /* @__PURE__ */ new Map();
    constructor(clock) {
      this.#clock = clock;
    }
    update(target, input) {
      const updatedAt = this.#clock.now();
      const next = {
        id: target.id,
        type: target.type,
        status: input.status,
        updatedAt
      };
      const source = input.source ?? target.source;
      if (source !== void 0)
        next.source = source;
      const description = input.description ?? target.description;
      if (description !== void 0)
        next.description = description;
      if ("data" in input)
        next.data = input.data;
      if (input.error !== void 0)
        next.error = { ...input.error };
      if (input.dependsOn !== void 0)
        next.dependsOn = [...input.dependsOn];
      this.#targets.set(next.id, next);
      return cloneSnapshotTarget(next);
    }
    remove(targetId) {
      this.#targets.delete(targetId);
    }
    get(query, latestEventId) {
      const targets = {};
      for (const target of this.#targets.values()) {
        if (matchesSnapshotTarget(target, query)) {
          targets[target.id] = cloneSnapshotTarget(target);
        }
      }
      return {
        targets,
        latestEventId,
        capturedAt: this.#clock.now()
      };
    }
  };
  function matchesSnapshotTarget(target, query) {
    if (query === void 0) {
      return true;
    }
    return matchesValue(target.id, query.id) && matchesValue(target.type, query.type) && matchesValue(target.source, query.source) && matchesValue(target.status, query.status) && matchesText([target.id, target.description], query.query);
  }
  function cloneSnapshotTarget(target) {
    const clone = {
      id: target.id,
      type: target.type,
      status: target.status,
      updatedAt: target.updatedAt
    };
    if (target.source !== void 0)
      clone.source = target.source;
    if (target.description !== void 0)
      clone.description = target.description;
    if ("data" in target)
      clone.data = target.data;
    if (target.error !== void 0)
      clone.error = { ...target.error };
    if (target.dependsOn !== void 0)
      clone.dependsOn = [...target.dependsOn];
    return clone;
  }

  // node_modules/.pnpm/@openruntime+core@https+++pkg.pr.new+2heal1+openruntime+@openruntime+core@a13b382/node_modules/@openruntime/core/dist/target/registry.js
  var TargetRegistry = class {
    #clock;
    #targets = /* @__PURE__ */ new Map();
    constructor(clock) {
      this.#clock = clock;
    }
    register(input) {
      const now = this.#clock.now();
      const existing = this.#targets.get(input.id);
      const descriptor = normalizeTarget(input, existing?.registeredAt ?? now, now);
      this.#targets.set(descriptor.id, descriptor);
    }
    unregister(targetId) {
      return this.#targets.delete(targetId);
    }
    get(targetId) {
      const descriptor = this.#targets.get(targetId);
      return descriptor === void 0 ? void 0 : cloneTarget(descriptor);
    }
    list(query) {
      const descriptors = Array.from(this.#targets.values());
      return descriptors.filter((target) => matchesTarget(target, query)).map(cloneTarget);
    }
  };
  function normalizeTarget(input, registeredAt, updatedAt) {
    const id = assertNonEmptyString2(input.id, "target id");
    const type = assertNonEmptyString2(input.type, "target type");
    const source = assertNonEmptyString2(input.source, "target source");
    const statuses = uniqueStatuses(input.statuses);
    const descriptor = {
      id,
      type,
      source,
      statuses,
      registeredAt,
      updatedAt
    };
    assignOptionalTargetFields(descriptor, input);
    return descriptor;
  }
  function assignOptionalTargetFields(descriptor, input) {
    if (input.label !== void 0)
      descriptor.label = input.label;
    if (input.description !== void 0)
      descriptor.description = input.description;
    if (input.params !== void 0)
      descriptor.params = input.params.map((param) => ({ ...param }));
    if (input.matcher !== void 0)
      descriptor.matcher = { ...input.matcher };
    if ("data" in input)
      descriptor.data = input.data;
  }
  function cloneTarget(target) {
    const clone = {
      id: target.id,
      type: target.type,
      source: target.source,
      statuses: [...target.statuses],
      registeredAt: target.registeredAt,
      updatedAt: target.updatedAt
    };
    assignOptionalTargetFields(clone, target);
    return clone;
  }
  function uniqueStatuses(statuses) {
    if (!Array.isArray(statuses) || statuses.length === 0) {
      throw new Error("target statuses must not be empty");
    }
    const unique = /* @__PURE__ */ new Set();
    for (const status of statuses) {
      unique.add(assertNonEmptyString2(status, "target status"));
    }
    return [...unique];
  }
  function assertNonEmptyString2(value, label) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`${label} must be a non-empty string`);
    }
    return value;
  }
  function matchesTarget(target, query) {
    if (query === void 0) {
      return true;
    }
    return matchesValue(target.id, query.id) && matchesValue(target.type, query.type) && matchesValue(target.source, query.source) && matchesAnyValue(target.statuses, query.status) && matchesText([target.id, target.label, target.description], query.query);
  }

  // node_modules/.pnpm/@openruntime+core@https+++pkg.pr.new+2heal1+openruntime+@openruntime+core@a13b382/node_modules/@openruntime/core/dist/wait/condition.js
  function matchesRuntimeCondition(target, condition) {
    return target?.status === condition.status && matchesDataConditions(target.data, condition.where);
  }
  function matchesDataConditions(data, conditions) {
    if (conditions === void 0 || conditions.length === 0) {
      return true;
    }
    return conditions.every((condition) => {
      const values = getValuesByPath(data, condition.path);
      return values.some((value) => matchesExpectedValue(value, condition.equals));
    });
  }
  function getValuesByPath(value, path) {
    const segments = path.split(".").filter(Boolean);
    if (segments.length === 0) {
      return [value];
    }
    return segments.reduce((values, segment) => {
      const next = [];
      for (const item of values) {
        if (Array.isArray(item)) {
          for (const entry of item) {
            next.push(...readProperty(entry, segment));
          }
          continue;
        }
        next.push(...readProperty(item, segment));
      }
      return next;
    }, [value]);
  }
  function readProperty(value, segment) {
    if (value === null || typeof value !== "object") {
      return [];
    }
    if (!(segment in value)) {
      return [];
    }
    return [value[segment]];
  }
  function matchesExpectedValue(value, expected) {
    if (typeof expected === "string") {
      return String(value) === expected;
    }
    return Object.is(value, expected);
  }

  // node_modules/.pnpm/@openruntime+core@https+++pkg.pr.new+2heal1+openruntime+@openruntime+core@a13b382/node_modules/@openruntime/core/dist/wait/manager.js
  var WaitManager = class {
    #waits = /* @__PURE__ */ new Map();
    #nextWaitId = 1;
    waitFor(condition, options, getSnapshot) {
      return new Promise((resolve) => {
        const waitId = this.#nextWaitId;
        this.#nextWaitId += 1;
        const timeout = normalizeTimeout(options?.timeout);
        const timer = setTimeout(() => {
          this.#failWait(waitId, getSnapshot, "Timed out waiting for target status.");
        }, timeout);
        this.#waits.set(waitId, {
          id: waitId,
          condition: { ...condition },
          resolve,
          timer
        });
      });
    }
    resolveForTarget(targetId, getSnapshot) {
      for (const wait of this.#waits.values()) {
        if (wait.condition.id === targetId) {
          const snapshot = getSnapshot();
          const target = snapshot.targets[wait.condition.id];
          if (matchesRuntimeCondition(target, wait.condition)) {
            this.#clear(wait);
            wait.resolve(createSuccessResult(wait.condition, snapshot, target));
          }
        }
      }
    }
    rejectForTarget(targetId, getSnapshot) {
      for (const wait of this.#waits.values()) {
        if (wait.condition.id === targetId) {
          this.#failWait(wait.id, getSnapshot, "Target was unregistered.");
        }
      }
    }
    #failWait(waitId, getSnapshot, reason) {
      const wait = this.#waits.get(waitId);
      if (wait === void 0) {
        return;
      }
      this.#clear(wait);
      wait.resolve({
        success: false,
        condition: wait.condition,
        snapshot: getSnapshot(),
        reason
      });
    }
    #clear(wait) {
      clearTimeout(wait.timer);
      this.#waits.delete(wait.id);
    }
  };
  var defaultWaitTimeout = 5e3;
  function normalizeTimeout(timeout) {
    if (timeout === void 0 || !Number.isFinite(timeout) || timeout < 0) {
      return defaultWaitTimeout;
    }
    return Math.floor(timeout);
  }
  function createSuccessResult(condition, snapshot, target) {
    return {
      success: true,
      condition,
      snapshot,
      target
    };
  }

  // node_modules/.pnpm/@openruntime+core@https+++pkg.pr.new+2heal1+openruntime+@openruntime+core@a13b382/node_modules/@openruntime/core/dist/runtime/center.js
  var systemSource = "openruntime";
  var RuntimeCenter = class {
    #targets;
    #snapshot;
    #events;
    #actions;
    #waits = new WaitManager();
    #bridgeConnected = false;
    constructor(options = {}) {
      const clock = options.clock ?? systemClock;
      this.#targets = new TargetRegistry(clock);
      this.#snapshot = new SnapshotStore(clock);
      this.#events = new EventLog(clock);
      this.#actions = new ActionRegistry(clock);
    }
    connectBridge(options) {
      if (this.#bridgeConnected) {
        return;
      }
      connectBridge(this, options);
      this.#bridgeConnected = true;
    }
    registerTarget(target) {
      this.#targets.register(target);
    }
    unregisterTarget(targetId) {
      this.#targets.unregister(targetId);
      this.#snapshot.remove(targetId);
      this.#waits.rejectForTarget(targetId, () => this.getSnapshot());
    }
    getTargets(query) {
      return this.#targets.list(query);
    }
    updateSnapshot(input) {
      const target = this.#targets.get(input.id);
      if (target === void 0) {
        this.#recordRejectedUpdate(input, {
          message: `Cannot update unregistered target "${input.id}".`,
          code: "target_not_registered"
        });
        return;
      }
      if (input.type !== void 0 && input.type !== target.type) {
        this.#recordRejectedUpdate(input, {
          message: `Snapshot type "${input.type}" does not match registered target type "${target.type}".`,
          code: "target_type_mismatch"
        }, target);
        return;
      }
      if (!target.statuses.includes(input.status)) {
        this.#recordRejectedUpdate(input, {
          message: `Status "${input.status}" is not declared for target "${input.id}".`,
          code: "target_status_not_declared"
        }, target);
        return;
      }
      this.#snapshot.update(target, input);
      this.#events.append({
        type: "snapshot.updated",
        source: input.source ?? target.source,
        targetId: input.id,
        status: input.status,
        payload: normalizeAcceptedUpdate(input, target)
      });
      this.#waits.resolveForTarget(input.id, () => this.getSnapshot());
    }
    getSnapshot(query) {
      return this.#snapshot.get(query, this.#events.latestEventId());
    }
    getEvents(query) {
      return this.#events.get(query);
    }
    registerAction(action) {
      this.#actions.register(action);
    }
    unregisterAction(actionName) {
      this.#actions.unregister(actionName);
    }
    getActions(query) {
      return this.#actions.list(query, this.getSnapshot());
    }
    async getInputOptions(actionName, inputName, currentPayload, options) {
      const inputOptions = this.#actions.getInputOptions(actionName, inputName, currentPayload, this.#createActionContext(actionName));
      return withTimeout(inputOptions, options?.timeout, "Timed out while reading input options.");
    }
    async runAction(actionName, payload) {
      const action = this.#actions.get(actionName);
      if (action === void 0) {
        return this.#recordActionFailure(actionName, payload, {
          message: `Action "${actionName}" is not registered.`,
          code: "action_not_registered"
        });
      }
      const availability = getAvailability(action.availableWhen, this.getSnapshot());
      if (!availability.enabled) {
        return this.#recordActionFailure(actionName, payload, {
          message: availability.reason ?? `Action "${actionName}" is not available.`,
          code: "action_not_available"
        }, action.source);
      }
      const validationError = validateActionPayload(action.inputSchema, payload);
      if (validationError !== void 0) {
        return this.#recordActionFailure(actionName, payload, validationError, action.source);
      }
      this.#events.append({
        type: "action.started",
        source: action.source,
        actionName,
        payload
      });
      try {
        const result = await action.handler(payload ?? {}, this.#createActionContext(actionName));
        this.#events.append({
          type: "action.success",
          source: action.source,
          actionName,
          payload: result
        });
        return {
          success: true,
          actionName,
          result
        };
      } catch (error) {
        return this.#recordActionFailure(actionName, payload, toRuntimeError2(error), action.source);
      }
    }
    waitFor(condition, options) {
      const snapshot = this.getSnapshot();
      const target = snapshot.targets[condition.id];
      if (matchesRuntimeCondition(target, condition)) {
        return Promise.resolve({
          success: true,
          condition,
          snapshot,
          target
        });
      }
      if (target === void 0 && this.#targets.get(condition.id) === void 0) {
        return Promise.resolve({
          success: false,
          condition,
          snapshot,
          reason: "Target is not registered."
        });
      }
      return this.#waits.waitFor(condition, options, () => this.getSnapshot());
    }
    #recordRejectedUpdate(input, error, target) {
      this.#events.append({
        type: "snapshot.update.rejected",
        source: input.source ?? target?.source ?? systemSource,
        targetId: input.id,
        status: input.status,
        payload: input,
        error
      });
    }
    #recordActionFailure(actionName, payload, error, source = systemSource) {
      this.#events.append({
        type: "action.error",
        source,
        actionName,
        payload,
        error
      });
      return {
        success: false,
        actionName,
        error
      };
    }
    #createActionContext(actionName) {
      return {
        actionName,
        getSnapshot: () => this.getSnapshot(),
        updateSnapshot: (input) => this.updateSnapshot(input),
        waitFor: (condition, options) => this.waitFor(condition, options)
      };
    }
  };
  function createOpenRuntime(options) {
    return new RuntimeCenter(options);
  }
  var systemClock = {
    now: () => Date.now()
  };
  function normalizeAcceptedUpdate(input, target) {
    const payload = {
      id: input.id,
      type: target.type,
      source: input.source ?? target.source,
      status: input.status
    };
    if (input.description !== void 0)
      payload.description = input.description;
    if ("data" in input)
      payload.data = input.data;
    if (input.error !== void 0)
      payload.error = { ...input.error };
    if (input.dependsOn !== void 0)
      payload.dependsOn = [...input.dependsOn];
    return payload;
  }
  function toRuntimeError2(error) {
    if (error instanceof Error) {
      const runtimeError = {
        message: error.message
      };
      if (error.stack !== void 0) {
        runtimeError.stack = error.stack;
      }
      return runtimeError;
    }
    return {
      message: String(error)
    };
  }
  function withTimeout(promise, timeout, message) {
    if (timeout === void 0 || !Number.isFinite(timeout) || timeout < 0) {
      return promise;
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(message));
      }, Math.floor(timeout));
      promise.then((value) => {
        clearTimeout(timer);
        resolve(value);
      }, (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  // node_modules/.pnpm/@openruntime+core@https+++pkg.pr.new+2heal1+openruntime+@openruntime+core@a13b382/node_modules/@openruntime/core/dist/runtime/window.js
  function installOpenRuntimeOnWindow(runtime = createOpenRuntime(), host = getDefaultWindowHost()) {
    if (host === void 0) {
      return runtime;
    }
    host.__OPEN_RUNTIME__ = runtime;
    return runtime;
  }
  function getOpenRuntimeFromWindow(host = getDefaultWindowHost()) {
    return host?.__OPEN_RUNTIME__;
  }
  function getDefaultWindowHost() {
    if (typeof window === "undefined") {
      return void 0;
    }
    return window;
  }

  // packages/observability-plugin/src/openruntime-actions.ts
  var reportStatuses = [
    "pending",
    "success",
    "error"
  ];
  var reportOutcomes = [
    "pending",
    "runtime-loaded",
    "shared-resolved",
    "preloaded",
    "component-loaded",
    "failed",
    "recovered"
  ];
  function registerOpenRuntimeActions(runtime, source, reportReader, registeredActionRuntimes) {
    if (registeredActionRuntimes.has(runtime)) {
      return;
    }
    if (reportReader) {
      runtime.registerAction({
        name: "mf:get-runtime-state",
        source,
        risk: "safe",
        description: "Get the current safe Module Federation runtime state.",
        handler: () => reportReader.getRuntimeState()
      });
      runtime.registerAction({
        name: "mf:list-reports",
        source,
        risk: "safe",
        description: "List Module Federation loading report summaries.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: {
              type: "number",
              description: "Maximum report count to return."
            },
            traceId: {
              type: "string",
              description: "Exact report trace id."
            },
            instanceRef: {
              type: "string",
              description: "Stable observability instance reference."
            },
            remote: {
              type: "string",
              description: "Remote name or alias to match."
            },
            expose: {
              type: "string",
              description: "Exposed module to match."
            },
            shared: {
              type: "string",
              description: "Shared dependency name to match."
            },
            status: {
              type: "string",
              enum: reportStatuses,
              description: "Report status to match."
            },
            outcome: {
              type: "string",
              enum: reportOutcomes,
              description: "Report outcome to match."
            }
          }
        },
        getInputOptions: (inputName) => getReportInputOptions(inputName, reportReader),
        handler: (payload) => listReports(reportReader, payload)
      });
      runtime.registerAction({
        name: "mf:get-latest-report",
        source,
        risk: "safe",
        description: "Get the latest Module Federation loading report.",
        handler: () => {
          const report = reportReader.getLatestReport();
          return {
            found: report !== void 0,
            report
          };
        }
      });
      runtime.registerAction({
        name: "mf:get-report",
        source,
        risk: "safe",
        description: "Get a Module Federation loading report by trace id.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["traceId"],
          properties: {
            traceId: {
              type: "string",
              description: "Report trace id."
            }
          }
        },
        getInputOptions: (inputName) => getReportInputOptions(inputName, reportReader),
        handler: (payload) => {
          const traceId = getPayloadString(payload, "traceId");
          const report = traceId ? reportReader.getReport(traceId) : void 0;
          return {
            found: report !== void 0,
            traceId,
            report
          };
        }
      });
      runtime.registerAction({
        name: "mf:export-report",
        source,
        risk: "safe",
        description: "Export a Module Federation loading report.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            traceId: {
              type: "string",
              description: "Report trace id. When omitted, exports latest report."
            }
          }
        },
        getInputOptions: (inputName) => getReportInputOptions(inputName, reportReader),
        handler: (payload) => {
          const traceId = getPayloadString(payload, "traceId");
          const report = reportReader.exportReport(traceId);
          return {
            found: report !== void 0,
            traceId: report?.traceId || traceId,
            report
          };
        }
      });
    }
    if (!reportReader) {
      registeredActionRuntimes.add(runtime);
      return;
    }
    runtime.registerAction({
      name: "mf:get-federation-global",
      source,
      risk: "safe",
      description: "Get a summary of the current global MF runtime state.",
      handler: () => getFederationGlobalSummary(reportReader.getRuntimeState())
    });
    runtime.registerAction({
      name: "mf:get-federation-module-info",
      source,
      risk: "safe",
      description: "Get __FEDERATION__.moduleInfo or one moduleInfo entry.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: {
            type: "string",
            description: "moduleInfo key."
          },
          name: {
            type: "string",
            description: "moduleInfo name. Used when key is omitted."
          },
          instanceRef: {
            type: "string",
            description: "Consumer observability instance reference."
          }
        }
      },
      getInputOptions: (inputName) => getFederationModuleInfoInputOptions(
        inputName,
        reportReader.getRuntimeState()
      ),
      handler: (payload) => getFederationModuleInfoActionResult(
        payload,
        reportReader.getRuntimeState()
      )
    });
    runtime.registerAction({
      name: "mf:list-federation-instances",
      source,
      risk: "safe",
      description: "List current __FEDERATION__.__INSTANCES__ entries.",
      handler: () => {
        const instances = reportReader.getRuntimeState().instances;
        return {
          count: instances.length,
          instances
        };
      }
    });
    runtime.registerAction({
      name: "mf:get-federation-instance-config",
      source,
      risk: "safe",
      description: "Get one __FEDERATION__.__INSTANCES__ config.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            description: "Instance name."
          },
          instanceRef: {
            type: "string",
            description: "Stable observability instance reference."
          },
          index: {
            type: "number",
            description: "Unstable compatibility index in __INSTANCES__."
          }
        }
      },
      getInputOptions: (inputName) => getFederationInstanceInputOptions(
        inputName,
        reportReader.getRuntimeState()
      ),
      handler: (payload) => getFederationInstanceConfigActionResult(
        payload,
        reportReader.getRuntimeState()
      )
    });
    registeredActionRuntimes.add(runtime);
  }
  function listReports(reportReader, payload) {
    const query = getReportQuery(payload);
    const reports = hasReportQueryFilter(query) ? reportReader.findReports(query) : reportReader.getReports({ limit: query.limit });
    return {
      count: reports.length,
      reports: reports.map(createReportSummary)
    };
  }
  function getReportQuery(payload) {
    const query = {};
    const limit = getPayloadNumber(payload, "limit");
    const traceId = getPayloadString(payload, "traceId");
    const instanceRef = getPayloadString(payload, "instanceRef");
    const remote = getPayloadString(payload, "remote");
    const expose = getPayloadString(payload, "expose");
    const shared = getPayloadString(payload, "shared");
    const status = getPayloadReportStatus(payload, "status");
    const outcome = getPayloadReportOutcome(payload, "outcome");
    if (limit !== void 0) {
      query.limit = limit;
    }
    if (traceId !== void 0) {
      query.traceId = traceId;
    }
    if (instanceRef !== void 0) {
      query.instanceRef = instanceRef;
    }
    if (remote !== void 0) {
      query.remote = remote;
    }
    if (expose !== void 0) {
      query.expose = expose;
    }
    if (shared !== void 0) {
      query.shared = shared;
    }
    if (status !== void 0) {
      query.status = status;
    }
    if (outcome !== void 0) {
      query.outcome = outcome;
    }
    return query;
  }
  function hasReportQueryFilter(query) {
    return query.traceId !== void 0 || query.instanceRef !== void 0 || query.remote !== void 0 || query.expose !== void 0 || query.shared !== void 0 || query.status !== void 0 || query.outcome !== void 0;
  }
  function createReportSummary(report) {
    return compactObject({
      traceId: report.traceId,
      instanceRef: report.instanceRef,
      status: report.status,
      requestId: report.requestId,
      requestAlias: report.requestAlias,
      hostName: report.hostName,
      runtimeVersion: report.runtimeVersion,
      remote: report.remote,
      expose: report.expose,
      shared: report.shared,
      startedAt: report.startedAt,
      updatedAt: report.updatedAt,
      duration: report.duration,
      outcome: report.summary.outcome,
      lastPhase: report.summary.lastPhase,
      eventCount: report.summary.eventCount,
      failedPhase: report.failedPhase,
      errorCode: report.errorCode,
      errorMessage: report.errorMessage
    });
  }
  function getReportInputOptions(inputName, reportReader) {
    if (inputName !== "traceId") {
      return [];
    }
    return reportReader.getReports({ limit: 20 }).map((report) => ({
      value: report.traceId,
      description: report.remote?.name || report.shared?.name || report.requestAlias || report.requestId || report.summary.outcome
    }));
  }
  function getFederationGlobalSummary(runtimeState) {
    return {
      available: true,
      schemaVersion: runtimeState.schemaVersion,
      observedAt: runtimeState.observedAt,
      scope: runtimeState.scope,
      completeness: runtimeState.completeness,
      capabilities: runtimeState.capabilities,
      moduleInfoCount: runtimeState.moduleInfo.length,
      moduleInfoKeys: runtimeState.moduleInfo.map((entry) => entry.key),
      instanceCount: runtimeState.instances.length,
      instances: runtimeState.instances,
      relationshipCount: runtimeState.relationships.length
    };
  }
  function getFederationModuleInfoActionResult(payload, runtimeState) {
    const key = getPayloadString(payload, "key") || getPayloadString(payload, "name");
    const instanceRef = getPayloadString(payload, "instanceRef");
    const instance = instanceRef ? runtimeState.instances.find(
      (candidate) => candidate.instanceRef === instanceRef
    ) : void 0;
    if (instanceRef && !instance) {
      return {
        available: true,
        found: false,
        instanceRef,
        instances: runtimeState.instances.map(createInstanceCandidate)
      };
    }
    const matched = key ? runtimeState.moduleInfo.find(
      (entry) => entry.key === key || entry.name === key
    ) : void 0;
    return key ? compactObject({
      available: true,
      found: matched !== void 0,
      key,
      instance: instance ? createInstanceCandidate(instance) : void 0,
      relationships: instance ? runtimeState.relationships.filter(
        (relationship) => relationship.consumerInstanceRef === instance.instanceRef
      ) : void 0,
      moduleInfo: matched
    }) : compactObject({
      available: true,
      keys: runtimeState.moduleInfo.map((entry) => entry.key),
      instance: instance ? createInstanceCandidate(instance) : void 0,
      relationships: instance ? runtimeState.relationships.filter(
        (relationship) => relationship.consumerInstanceRef === instance.instanceRef
      ) : void 0,
      moduleInfo: runtimeState.moduleInfo
    });
  }
  function getFederationModuleInfoInputOptions(inputName, runtimeState) {
    if (inputName !== "key" && inputName !== "name" && inputName !== "instanceRef") {
      return [];
    }
    if (inputName === "instanceRef") {
      return runtimeState.instances.map((instance) => ({
        value: instance.instanceRef,
        description: instance.optionsName || instance.name || instance.instanceRef
      }));
    }
    return runtimeState.moduleInfo.map((entry) => ({
      value: entry.key
    }));
  }
  function getFederationInstanceConfigActionResult(payload, runtimeState) {
    const instanceRef = getPayloadString(payload, "instanceRef");
    const name = getPayloadString(payload, "name");
    const index = getPayloadNumber(payload, "index");
    const nameMatches = name ? runtimeState.instances.filter(
      (instance2) => instance2.name === name || instance2.optionsName === name
    ) : [];
    const instance = instanceRef ? runtimeState.instances.find(
      (candidate) => candidate.instanceRef === instanceRef
    ) : nameMatches.length === 1 ? nameMatches[0] : index !== void 0 ? runtimeState.instances[index] : void 0;
    if (!instance) {
      return {
        found: false,
        instanceRef,
        name,
        index,
        unstableIndex: index !== void 0 || void 0,
        candidates: nameMatches.length > 1 ? nameMatches.map(createInstanceCandidate) : void 0,
        instances: runtimeState.instances.map(createInstanceCandidate)
      };
    }
    return {
      found: true,
      unstableIndex: index !== void 0 || void 0,
      instance
    };
  }
  function getFederationInstanceInputOptions(inputName, runtimeState) {
    if (inputName !== "name" && inputName !== "index" && inputName !== "instanceRef") {
      return [];
    }
    return runtimeState.instances.map((instance, index) => ({
      value: inputName === "instanceRef" ? instance.instanceRef : inputName === "index" ? index : instance.optionsName || instance.name || instance.instanceRef,
      description: `${instance.optionsName || instance.name || "unnamed"} (${instance.instanceRef})`
    }));
  }
  function createInstanceCandidate(instance) {
    return compactObject({
      instanceRef: instance.instanceRef,
      name: instance.name,
      optionsName: instance.optionsName,
      optionsVersion: instance.optionsVersion,
      runtimeVersion: instance.runtimeVersion,
      role: instance.role,
      active: instance.active
    });
  }
  function getPayloadString(payload, key) {
    const value = getRecordProperty(asRecord(payload), key);
    return typeof value === "string" && value ? value : void 0;
  }
  function getPayloadNumber(payload, key) {
    const value = getRecordProperty(asRecord(payload), key);
    return typeof value === "number" && Number.isFinite(value) ? value : void 0;
  }
  function getPayloadReportStatus(payload, key) {
    const value = getPayloadString(payload, key);
    return value && isReportStatus(value) ? value : void 0;
  }
  function getPayloadReportOutcome(payload, key) {
    const value = getPayloadString(payload, key);
    return value && isReportOutcome(value) ? value : void 0;
  }
  function isReportStatus(value) {
    return reportStatuses.includes(value);
  }
  function isReportOutcome(value) {
    return reportOutcomes.includes(value);
  }
  function asRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return void 0;
    }
    return value;
  }
  function getRecordProperty(record, key) {
    return record ? record[key] : void 0;
  }
  function compactObject(input) {
    const output = {};
    Object.entries(input).forEach(([key, value]) => {
      if (value !== void 0) {
        output[key] = value;
      }
    });
    return output;
  }

  // packages/observability-plugin/src/openruntime.ts
  var openRuntimeSource = "module-federation";
  var loadingStatuses = [
    "registered",
    "loading",
    "ready",
    "error",
    "recovered"
  ];
  var sharedStatuses = [
    "unloaded",
    "loading",
    "loaded",
    "recovered",
    "error"
  ];
  var sharedConflictStatuses = ["warning"];
  var remoteLifecyclePhases = /* @__PURE__ */ new Set([
    "matchRemote",
    "manifest",
    "remoteEntry",
    "remoteEntryInit",
    "loadRemote",
    "preload"
  ]);
  var remoteFailurePhases = /* @__PURE__ */ new Set([
    "matchRemote",
    "manifest",
    "remoteEntry",
    "remoteEntryInit",
    "loadRemote"
  ]);
  function createOpenRuntimeObservabilityAdapter(input, reportReader) {
    if (!input) {
      return void 0;
    }
    const options = input === true ? {} : input;
    if (options.enabled === false) {
      return void 0;
    }
    const connectedRuntimes = /* @__PURE__ */ new WeakSet();
    const registeredActionRuntimes = /* @__PURE__ */ new WeakSet();
    let createdRuntime;
    const getRuntime = () => {
      if (options.runtime) {
        return options.runtime;
      }
      const host = options.host || getDefaultHost();
      const runtime = getOpenRuntimeFromWindow(host);
      if (runtime) {
        return runtime;
      }
      if (!createdRuntime) {
        const nextRuntime = createOpenRuntime();
        createdRuntime = host ? installOpenRuntimeOnWindow(nextRuntime, host) : nextRuntime;
      }
      return createdRuntime;
    };
    const prepareRuntime = () => {
      const runtime = getRuntime();
      const source = options.source || openRuntimeSource;
      registerOpenRuntimeActions(
        runtime,
        source,
        reportReader,
        registeredActionRuntimes
      );
      connectRuntimeBridge(runtime, options.bridge, connectedRuntimes);
      return { runtime, source };
    };
    return {
      register() {
        try {
          prepareRuntime();
        } catch {
        }
      },
      syncReport(report) {
        try {
          const { runtime, source } = prepareRuntime();
          syncReportToOpenRuntime(runtime, source, report, reportReader);
        } catch {
        }
      }
    };
  }
  function connectRuntimeBridge(runtime, bridge, connectedRuntimes) {
    if (bridge === void 0 || bridge === false || connectedRuntimes.has(runtime)) {
      return;
    }
    runtime.connectBridge(bridge);
    connectedRuntimes.add(runtime);
  }
  function syncReportToOpenRuntime(runtime, source, report, reportReader) {
    if (report.remote) {
      syncRemote(runtime, source, report, reportReader);
      syncRemoteModule(runtime, source, report, reportReader);
    }
    if (report.shared) {
      syncShared(runtime, source, report);
      syncSharedConflict(runtime, source, report);
    }
  }
  function syncRemote(runtime, source, report, reportReader) {
    const remote = report.remote;
    if (!remote?.name) {
      return;
    }
    const targetId = targetIds.remote(report.instanceRef, remote.name);
    const remoteReports = getRemoteReports(report, remote, reportReader);
    const remoteStatus = getRemoteStatus(remoteReports);
    const remoteData = getRemoteTargetData(remote, remoteReports);
    runtime.registerTarget({
      id: targetId,
      type: targetTypes.remote,
      source,
      label: `MF remote ${remote.name}`,
      description: "Module Federation remote loading state.",
      statuses: loadingStatuses,
      data: remoteData
    });
    runtime.updateSnapshot({
      id: targetId,
      status: remoteStatus,
      source,
      data: remoteData,
      error: getRemoteError(remoteReports, remoteStatus)
    });
  }
  function syncRemoteModule(runtime, source, report, reportReader) {
    const remote = report.remote;
    if (!remote?.name || !report.expose) {
      return;
    }
    const targetId = targetIds.remoteModule(
      report.instanceRef,
      remote.name,
      report.expose
    );
    const remoteModuleReports = getRemoteModuleReports(
      report,
      remote,
      report.expose,
      reportReader
    );
    const latestReport = remoteModuleReports[0] || report;
    const remoteModuleData = getRemoteModuleTargetData(
      latestReport,
      remoteModuleReports
    );
    runtime.registerTarget({
      id: targetId,
      type: targetTypes.remoteModule,
      source,
      label: `MF remote module ${remote.name}/${normalizeExpose(report.expose)}`,
      description: "Module Federation exposed module loading state.",
      statuses: loadingStatuses,
      data: remoteModuleData
    });
    runtime.updateSnapshot({
      id: targetId,
      status: getRemoteModuleStatus(latestReport),
      source,
      data: remoteModuleData,
      error: getReportError(latestReport),
      dependsOn: getRemoteModuleDependsOn(report.instanceRef, remote.name)
    });
  }
  function syncShared(runtime, source, report) {
    const shared = report.shared;
    if (!shared?.name) {
      return;
    }
    const targetId = targetIds.shared(report.instanceRef, shared);
    runtime.registerTarget({
      id: targetId,
      type: targetTypes.shared,
      source,
      label: `MF shared ${shared.name}`,
      description: "Module Federation shared dependency loading state.",
      statuses: sharedStatuses,
      data: getSharedTargetData(report, shared)
    });
    runtime.updateSnapshot({
      id: targetId,
      status: getSharedStatus(report),
      source,
      data: getSharedTargetData(report, shared),
      error: getReportError(report)
    });
  }
  function syncSharedConflict(runtime, source, report) {
    const shared = report.shared;
    if (!shared?.name || shared.reason !== "singleton-multiple-versions") {
      return;
    }
    const targetId = targetIds.sharedConflict(report.instanceRef, shared);
    const data = getSharedConflictTargetData(report, shared);
    runtime.registerTarget({
      id: targetId,
      type: targetTypes.sharedConflict,
      source,
      label: `MF shared conflict ${shared.name}`,
      description: "Module Federation singleton shared dependency version conflict.",
      statuses: sharedConflictStatuses,
      data
    });
    runtime.updateSnapshot({
      id: targetId,
      status: "warning",
      source,
      data
    });
  }
  function getRemoteTargetData(remote, reports) {
    const latestReport = reports[0];
    const exposes = getRemoteExposeData(remote.name, reports);
    return compactObject2({
      instanceRef: latestReport?.instanceRef,
      hostName: getReportHostNames(reports),
      runtimeVersion: latestReport?.runtimeVersion,
      remote: getLatestRemoteInfo(remote, reports),
      exposes: exposes.length > 0 ? exposes : void 0,
      reportCount: reports.length
    });
  }
  function getRemoteModuleTargetData(report, reports) {
    const hostNames = getReportHostNames(reports, report.expose);
    return compactObject2({
      instanceRef: report.instanceRef,
      traceId: report.traceId,
      requestId: report.requestId,
      requestAlias: report.requestAlias,
      hostName: hostNames,
      runtimeVersion: report.runtimeVersion,
      consumers: hostNames,
      lastPhase: report.summary.lastPhase,
      phases: report.summary.phases,
      loadedBefore: report.loadedBefore
    });
  }
  function getSharedTargetData(report, shared) {
    return compactObject2({
      instanceRef: report.instanceRef,
      traceId: report.traceId,
      requestId: report.requestId,
      hostName: report.hostName,
      runtimeVersion: report.runtimeVersion,
      shared: getSharedSnapshotData(shared),
      lastPhase: report.summary.lastPhase,
      phases: report.summary.phases
    });
  }
  function getSharedConflictTargetData(report, shared) {
    const conflict = shared.conflict;
    return compactObject2({
      instanceRef: report.instanceRef,
      traceId: report.traceId,
      requestId: report.requestId,
      hostName: report.hostName,
      runtimeVersion: report.runtimeVersion,
      reason: shared.reason,
      sharedName: shared.name,
      scope: conflict?.scope || getSharedTargetScope(shared),
      singleton: shared.singleton,
      currentVersion: conflict?.currentVersion || getSharedTargetVersion(shared),
      currentFrom: conflict?.currentFrom || shared.provider,
      versions: conflict?.versions || shared.availableVersions,
      existingVersions: conflict?.existingVersions,
      shared: getSharedSnapshotData(shared)
    });
  }
  function getSharedSnapshotData(shared) {
    return compactObject2({
      name: shared.name,
      shareScope: shared.shareScope,
      version: getSharedTargetVersion(shared),
      requiredVersion: shared.requiredVersion,
      provider: shared.provider,
      singleton: shared.singleton,
      strictVersion: shared.strictVersion,
      eager: shared.eager,
      strategy: shared.strategy,
      loaded: shared.loaded,
      loading: shared.loaded ? void 0 : shared.loading,
      reason: shared.reason,
      definedBy: shared.definedBy,
      conflict: shared.conflict
    });
  }
  function getRemoteStatus(reports) {
    const phaseRecord = getLatestRemotePhaseRecord(reports);
    if (!phaseRecord) {
      return "loading";
    }
    const failedPhase = getFailedPhase(phaseRecord.report);
    if (failedPhase && remoteFailurePhases.has(failedPhase) && failedPhase === phaseRecord.phaseName) {
      return phaseRecord.report.summary.recovered ? "recovered" : "error";
    }
    const phase = phaseRecord.report.summary.phases[phaseRecord.phaseName];
    if (phase) {
      return mapPhaseStatus(phase);
    }
    return mapEventStatus(phaseRecord.event.status);
  }
  function getRemoteExposeData(remoteName, reports) {
    const reportsByExpose = /* @__PURE__ */ new Map();
    reports.forEach((report) => {
      const expose = getReportExpose(report);
      const exposeKey = expose ? normalizeExpose(expose) : "";
      if (!expose || reportsByExpose.has(exposeKey)) {
        return;
      }
      reportsByExpose.set(exposeKey, report);
    });
    return Array.from(reportsByExpose.values()).map(
      (report) => compactObject2({
        targetId: targetIds.remoteModule(
          report.instanceRef,
          remoteName,
          getReportExpose(report) || ""
        )
      })
    ).filter((item) => item["targetId"] !== void 0).sort(
      (left, right) => String(left["targetId"] || "").localeCompare(
        String(right["targetId"] || "")
      )
    );
  }
  function getRemoteModuleStatus(report) {
    if (report.status === "error") {
      return "error";
    }
    if (report.summary.recovered) {
      return "recovered";
    }
    if (report.summary.componentLoaded || report.summary.runtimeLoaded) {
      return "ready";
    }
    const exposePhaseStatus = getPhaseTargetStatus(report, "moduleFactory") || getPhaseTargetStatus(report, "expose");
    return exposePhaseStatus || "loading";
  }
  function getSharedStatus(report) {
    const sharedPhaseStatus = report.summary.phases["shared"]?.status;
    if (report.status === "error" || sharedPhaseStatus === "error") {
      return "error";
    }
    if (report.summary.recovered) {
      return "recovered";
    }
    if (report.shared?.loaded || report.summary.sharedResolved) {
      return "loaded";
    }
    if (report.shared?.loading) {
      return "loading";
    }
    if (sharedPhaseStatus === "start") {
      return "loading";
    }
    return "unloaded";
  }
  function getPhaseTargetStatus(report, phase) {
    const summary = report.summary.phases[phase];
    if (!summary) {
      return void 0;
    }
    if (summary.recovered) {
      return "recovered";
    }
    return mapPhaseStatus(summary);
  }
  function mapPhaseStatus(summary) {
    if (summary.status === "start") {
      return "loading";
    }
    if (summary.status === "error") {
      return "error";
    }
    if (summary.status === "success" || summary.status === "complete") {
      return "ready";
    }
    return "registered";
  }
  function mapEventStatus(status) {
    if (status === "start") {
      return "loading";
    }
    if (status === "error") {
      return "error";
    }
    if (status === "success" || status === "complete") {
      return "ready";
    }
    return "registered";
  }
  function getReportError(report) {
    const error = report.summary.error;
    if (!error && report.status !== "error") {
      return void 0;
    }
    const runtimeError = {
      message: error?.errorMessage || report.errorMessage || "MF loading failed."
    };
    const code = error?.errorCode || report.errorCode;
    const data = compactObject2({
      traceId: report.traceId,
      failedPhase: error?.failedPhase || report.failedPhase,
      lifecycle: error?.lifecycle,
      ownerHint: error?.ownerHint,
      retryable: error?.retryable,
      context: error?.context || report.errorContext
    });
    if (code) {
      runtimeError.code = code;
    }
    if (report.errorStack) {
      runtimeError.stack = report.errorStack;
    }
    if (Object.keys(data).length > 0) {
      runtimeError.data = data;
    }
    return runtimeError;
  }
  function getRemoteError(reports, status) {
    if (status !== "error") {
      return void 0;
    }
    const failedReport = reports.find((report) => isRemoteFailureReport(report));
    return failedReport ? getReportError(failedReport) : void 0;
  }
  function getRemoteModuleDependsOn(instanceRef, remoteName) {
    return [targetIds.remote(instanceRef, remoteName)];
  }
  function getRemoteReports(currentReport, remote, reportReader) {
    const reports = reportReader ? reportReader.getReports().filter(
      (report) => report.instanceRef === currentReport.instanceRef && isSameRemoteReport(report, remote)
    ) : [];
    if (!reports.some((report) => report.traceId === currentReport.traceId)) {
      reports.unshift(currentReport);
    }
    return Array.from(
      new Map(reports.map((report) => [report.traceId, report])).values()
    ).sort(compareReportsByTime);
  }
  function getRemoteModuleReports(currentReport, remote, expose, reportReader) {
    const reports = getRemoteReports(currentReport, remote, reportReader).filter(
      (report) => isSameExposeReport(report, expose)
    );
    if (!reports.some((report) => report.traceId === currentReport.traceId)) {
      reports.unshift(currentReport);
    }
    return Array.from(
      new Map(reports.map((report) => [report.traceId, report])).values()
    ).sort(compareReportsByTime);
  }
  function getLatestRemoteInfo(fallback, reports) {
    return reports.find((report) => report.remote)?.remote || fallback;
  }
  function isSameRemoteReport(report, remote) {
    if (!report.remote) {
      return false;
    }
    const expected = new Set(
      [remote.name, remote.alias, remote.entry].filter(
        (value) => value !== void 0
      )
    );
    const actual = [report.remote.name, report.remote.alias, report.remote.entry];
    return actual.some((value) => value !== void 0 && expected.has(value));
  }
  function isSameExposeReport(report, expose) {
    const reportExpose = getReportExpose(report);
    if (!reportExpose) {
      return false;
    }
    return normalizeExpose(reportExpose) === normalizeExpose(expose);
  }
  function getReportHostNames(reports, expose) {
    const hostNames = [];
    const seen = /* @__PURE__ */ new Set();
    const addHostName = (hostName) => {
      if (!isNonEmptyString(hostName) || seen.has(hostName)) {
        return;
      }
      seen.add(hostName);
      hostNames.push(hostName);
    };
    reports.forEach((report) => {
      addHostName(report.hostName);
      report.loadedBefore?.consumers.forEach((consumer) => {
        if (expose && !hasLoadedExpose(consumer.exposes, expose)) {
          return;
        }
        addHostName(consumer.name);
      });
    });
    return hostNames.length > 0 ? hostNames : void 0;
  }
  function hasLoadedExpose(loadedExposes, expose) {
    return Boolean(
      loadedExposes?.some(
        (loadedExpose) => normalizeExpose(loadedExpose) === normalizeExpose(expose)
      )
    );
  }
  function compareReportsByTime(left, right) {
    if (right.updatedAt !== left.updatedAt) {
      return right.updatedAt - left.updatedAt;
    }
    return right.startedAt - left.startedAt;
  }
  function getLatestRemotePhaseRecord(reports) {
    return reports.flatMap(
      (report) => report.events.filter((event) => remoteLifecyclePhases.has(event.phase)).map((event) => ({
        report,
        event,
        phaseName: event.phase
      }))
    ).sort((left, right) => right.event.timestamp - left.event.timestamp)[0];
  }
  function isRemoteFailureReport(report) {
    const failedPhase = getFailedPhase(report);
    return failedPhase !== void 0 && remoteFailurePhases.has(failedPhase);
  }
  function getFailedPhase(report) {
    return report.summary.error?.failedPhase || report.failedPhase;
  }
  function getExposeFromRequestId(requestId) {
    if (!requestId) {
      return void 0;
    }
    const separatorIndex = requestId.indexOf("/");
    if (separatorIndex < 0 || separatorIndex === requestId.length - 1) {
      return void 0;
    }
    return requestId.slice(separatorIndex + 1);
  }
  function getReportExpose(report) {
    return report.expose || getExposeFromRequestId(report.requestId);
  }
  function compactObject2(input) {
    const output = {};
    Object.entries(input).forEach(([key, value]) => {
      if (value !== void 0) {
        output[key] = value;
      }
    });
    return output;
  }
  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
  }
  function getDefaultHost() {
    if (typeof window === "undefined") {
      return void 0;
    }
    return window;
  }
  function normalizeSegment(value) {
    const normalized = value.trim().replace(/\s+/g, "_");
    return normalized || "unknown";
  }
  function normalizeExpose(value) {
    return normalizeSegment(value.replace(/^\.\//, ""));
  }
  var targetTypes = {
    remote: "mf.remote",
    remoteModule: "mf.remote.expose",
    shared: "mf.shared",
    sharedConflict: "mf.shared.conflict"
  };
  var targetIds = {
    remote(instanceRef, remoteName) {
      return `mf:instance:${normalizeSegment(
        instanceRef || "legacy"
      )}:remote:${normalizeSegment(remoteName)}`;
    },
    remoteModule(instanceRef, remoteName, expose) {
      return `${targetIds.remote(instanceRef, remoteName)}:expose:${normalizeExpose(expose)}`;
    },
    shared(instanceRef, shared) {
      return `mf:instance:${normalizeSegment(
        instanceRef || "legacy"
      )}:shared:${normalizeSegment(shared.name)}:${normalizeSegment(
        getSharedTargetVersion(shared)
      )}:${normalizeSegment(getSharedTargetScope(shared))}`;
    },
    sharedConflict(instanceRef, shared) {
      return `mf:instance:${normalizeSegment(
        instanceRef || "legacy"
      )}:shared-conflict:${normalizeSegment(
        shared.name
      )}:${normalizeSegment(getSharedTargetScope(shared))}`;
    }
  };
  function getSharedTargetVersion(shared) {
    const requiredVersion = typeof shared.requiredVersion === "string" ? shared.requiredVersion : "";
    return shared.selectedVersion || shared.version || requiredVersion || "unknown";
  }
  function getSharedTargetScope(shared) {
    return shared.shareScope?.length ? shared.shareScope.join("_") : "default";
  }

  // packages/observability-plugin/src/core.ts
  function continuePreloadAssetsGeneration() {
    return void 0;
  }
  var DEFAULT_MAX_EVENTS = 100;
  var HARD_MAX_EVENTS = 1e3;
  var DEFAULT_COLLECTOR_PORT = 17891;
  var COLLECTOR_PATH = "/__mf_observability";
  var logger2 = createLogger("[ Module Federation Observability Plugin ]");
  var DEFAULT_DEVTOOLS_SOURCE = "module-federation/observability";
  var COMPONENT_BUSINESS_LOADED_EVENT = "component:business-loaded";
  var ON_MF_REMOTE_LOADED_PROP = "onMFRemoteLoaded";
  var SHARED_SINGLETON_MULTIPLE_VERSIONS_REASON = "singleton-multiple-versions";
  var SENSITIVE_PAIR_PATTERN = /\b(token|authorization|cookie|secret|password|session|access_token|refresh_token|api_key|apikey|key)\s*[:=]\s*([^&\s'",;<>]+)/gi;
  var ERROR_CODE_PATTERN = /\b(?:RUNTIME|TYPE|BUILD)-\d{3}\b/;
  var URL_PATTERN = /https?:\/\/[^\s'"<>]+/g;
  var DIAGNOSTIC_DOC_LINK_PATTERN = /https?:\/\/module-federation\.io\/guide\/troubleshooting\/[^\s'"<>]+/i;
  var RUNTIME_DOC_LINK = "https://module-federation.io/guide/troubleshooting/runtime";
  var MAX_METADATA_KEYS = 20;
  var MAX_FACT_KEYS = 50;
  var MAX_MODULE_INFO_ENTRIES = 20;
  var HARD_MAX_REPORT_QUERY_LIMIT = 1e3;
  var traceCounter = 0;
  function isRecord2(value) {
    return typeof value === "object" && value !== null;
  }
  function normalizeMaxEvents(value, fallback) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(1, Math.min(HARD_MAX_EVENTS, Math.floor(value)));
  }
  function normalizeQueryLimit(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return void 0;
    }
    return Math.max(1, Math.min(HARD_MAX_REPORT_QUERY_LIMIT, Math.floor(value)));
  }
  function normalizeCollectorPort(value) {
    if (!Number.isFinite(value) || !value) {
      return DEFAULT_COLLECTOR_PORT;
    }
    const port = Math.floor(value);
    return port > 0 && port <= 65535 ? port : DEFAULT_COLLECTOR_PORT;
  }
  function normalizeCollectorOptions(value) {
    if (value === true) {
      return {
        enabled: true,
        port: DEFAULT_COLLECTOR_PORT
      };
    }
    if (!value || value.enabled === false) {
      return void 0;
    }
    return {
      enabled: true,
      port: normalizeCollectorPort(value.port)
    };
  }
  function normalizeDevtoolsOptions(value) {
    if (value === true) {
      return {
        enabled: true,
        source: DEFAULT_DEVTOOLS_SOURCE
      };
    }
    if (!value || value.enabled === false) {
      return void 0;
    }
    return {
      enabled: true,
      source: sanitizeText(value.source, 160) || DEFAULT_DEVTOOLS_SOURCE
    };
  }
  function getCollectorUrl(port) {
    return `http://127.0.0.1:${port}${COLLECTOR_PATH}`;
  }
  function sanitizeText(value, maxLength = 800) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    const sanitized = String(value).replace(URL_PATTERN, (url) => sanitizeUrl(url) || "[redacted-url]").replace(SENSITIVE_PAIR_PATTERN, "[redacted]");
    return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength)}...` : sanitized;
  }
  function getRawText(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return String(value);
  }
  function clipText(value, maxLength = 320) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    const sanitized = String(value);
    return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength)}...` : sanitized;
  }
  function clipObservabilityMetadata(metadata, maxKeys = MAX_METADATA_KEYS) {
    if (!metadata || typeof metadata !== "object") {
      return void 0;
    }
    const clipped = {};
    Object.entries(metadata).slice(0, maxKeys).forEach(([rawKey, rawValue]) => {
      const key = clipText(rawKey, 80);
      if (!key || rawValue === void 0 || rawValue === null) {
        return;
      }
      if (typeof rawValue === "boolean") {
        clipped[key] = rawValue;
        return;
      }
      if (typeof rawValue === "number") {
        if (Number.isFinite(rawValue)) {
          clipped[key] = rawValue;
        }
        return;
      }
      const value = clipText(rawValue, 240);
      if (value) {
        clipped[key] = value;
      }
    });
    return Object.keys(clipped).length ? clipped : void 0;
  }
  function clipMetadata(metadata, maxKeys = MAX_METADATA_KEYS) {
    if (!metadata || typeof metadata !== "object") {
      return void 0;
    }
    const clipped = {};
    Object.entries(metadata).slice(0, maxKeys).forEach(([rawKey, rawValue]) => {
      const key = sanitizeText(rawKey, 80);
      if (!key || rawValue === void 0 || rawValue === null) {
        return;
      }
      if (typeof rawValue === "boolean") {
        clipped[key] = rawValue;
        return;
      }
      if (typeof rawValue === "number") {
        if (Number.isFinite(rawValue)) {
          clipped[key] = rawValue;
        }
        return;
      }
      const value = clipText(rawValue, 240);
      if (value) {
        clipped[key] = value;
      }
    });
    return Object.keys(clipped).length ? clipped : void 0;
  }
  function sanitizeStack(stack, options) {
    if (!stack || options?.enabled === false) {
      return void 0;
    }
    return stack;
  }
  function getRawStack(error) {
    if (error instanceof Error) {
      return error.stack || error.message;
    }
    return void 0;
  }
  function sanitizeRequestId(value) {
    if (!value) {
      return void 0;
    }
    return clipText(value, 240);
  }
  function sanitizeUrl(value) {
    if (!value) {
      return void 0;
    }
    try {
      const base = typeof window !== "undefined" && window.location ? window.location.origin : "http://localhost";
      const parsedUrl = new URL(value, base);
      const sanitized = `${parsedUrl.origin}${parsedUrl.pathname}`;
      return /^https?:\/\//i.test(value) ? sanitized : parsedUrl.pathname;
    } catch {
      const [withoutHash] = value.split("#");
      const [withoutQuery] = withoutHash.split("?");
      return sanitizeText(withoutQuery, 240);
    }
  }
  function sanitizeRemote(remote) {
    if (!remote || !remote.name) {
      return void 0;
    }
    return {
      name: remote.name,
      alias: sanitizeText(remote.alias, 120),
      entry: clipText(remote.entry, 320),
      entryGlobalName: sanitizeText(remote.entryGlobalName, 120),
      type: sanitizeText(remote.type, 80)
    };
  }
  function createRemoteInfo(remote) {
    if (!remote?.name) {
      return void 0;
    }
    return {
      name: remote.name,
      alias: remote.alias,
      entry: remote.entry,
      entryGlobalName: remote.entryGlobalName,
      type: remote.type
    };
  }
  function isManifestUrl(value) {
    const sanitized = sanitizeUrl(value);
    return Boolean(sanitized && /manifest.*\.json$/i.test(sanitized));
  }
  function normalizeSharedScope(value) {
    if (!value) {
      return [];
    }
    return (Array.isArray(value) ? value : [value]).map((scope) => sanitizeText(scope, 120)).filter((scope) => Boolean(scope));
  }
  function getSharedScopes(shareInfo) {
    return normalizeSharedScope(shareInfo?.scope).length ? normalizeSharedScope(shareInfo?.scope) : ["default"];
  }
  function getAvailableSharedVersions(args) {
    const versions = /* @__PURE__ */ new Set();
    const shareScopeMap = args.shareScopeMap || {};
    getSharedScopes(args.shareInfo).forEach((scope) => {
      Object.keys(shareScopeMap[scope]?.[args.pkgName] || {}).forEach(
        (version) => {
          versions.add(version);
        }
      );
    });
    return Array.from(versions);
  }
  function getOriginShareScopeMap(origin) {
    return origin.shareScopeMap || origin.sharedHandler?.shareScopeMap || {};
  }
  function getSharedVersion(value) {
    return sanitizeText(value?.version, 120);
  }
  function isSingletonShared(value) {
    return value?.shareConfig?.singleton === true;
  }
  function createSharedConflictVersion(version, shared) {
    return {
      version,
      from: sanitizeText(shared?.from, 160),
      singleton: isSingletonShared(shared) || void 0,
      loaded: shared?.loaded === true || void 0
    };
  }
  function createSharedSingletonConflict(args) {
    const currentVersion = getSharedVersion(args.shared);
    if (!currentVersion) {
      return void 0;
    }
    const existingVersionMap = args.shareScopeMap[args.scope]?.[args.pkgName] || {};
    const existingVersions = Object.entries(existingVersionMap).map(
      ([version, shared]) => createSharedConflictVersion(
        sanitizeText(version, 120) || version,
        shared
      )
    ).filter((item) => item.version && item.version !== currentVersion);
    if (!existingVersions.length) {
      return void 0;
    }
    const hasSingleton = isSingletonShared(args.shared) || existingVersions.some((item) => item.singleton === true);
    if (!hasSingleton) {
      return void 0;
    }
    const versions = Array.from(
      /* @__PURE__ */ new Set([currentVersion, ...existingVersions.map((item) => item.version)])
    ).sort();
    if (versions.length <= 1) {
      return void 0;
    }
    return {
      reason: SHARED_SINGLETON_MULTIPLE_VERSIONS_REASON,
      scope: args.scope,
      currentVersion,
      currentFrom: sanitizeText(args.shared.from, 160),
      versions,
      existingVersions
    };
  }
  function createSharedConflictInfo(args) {
    const shareConfig = args.shared.shareConfig;
    return {
      name: args.pkgName,
      shareScope: [args.conflict.scope],
      version: args.conflict.currentVersion || args.shared.version,
      requiredVersion: shareConfig?.requiredVersion,
      availableVersions: args.conflict.versions,
      provider: args.conflict.currentFrom,
      useIn: args.shared.useIn,
      singleton: true,
      strictVersion: shareConfig?.strictVersion,
      eager: shareConfig?.eager,
      strategy: args.shared.strategy,
      loaded: args.shared.loaded,
      loading: args.shared.loaded ? void 0 : Boolean(args.shared.loading) || void 0,
      reason: SHARED_SINGLETON_MULTIPLE_VERSIONS_REASON,
      conflict: args.conflict
    };
  }
  function getSharedConflictKey(args) {
    return [
      args.hostName || "unknown",
      args.pkgName,
      args.conflict.scope,
      args.conflict.versions.join(",")
    ].join("|");
  }
  function getSharedUseIn(args) {
    const useIn = [
      ...args.selectedShared?.useIn || [],
      ...args.shareInfo?.useIn || [],
      args.origin.options?.name || args.origin.name
    ].map((consumer) => sanitizeText(consumer, 160)).filter((consumer) => Boolean(consumer));
    return Array.from(new Set(useIn));
  }
  function getSharedMissReason(args) {
    if (!args.shareInfo) {
      return "missing-config";
    }
    return getAvailableSharedVersions(args).length ? "version-mismatch" : "missing-provider";
  }
  function getSharedErrorReason(args) {
    if (args.recovered) {
      return getSharedMissReason(args);
    }
    const errorInfo = getErrorInfo(args.error, { enabled: false });
    const errorMessage = errorInfo.errorMessage || "";
    if (!args.shareInfo || /Cannot find shared/i.test(errorMessage)) {
      return "missing-config";
    }
    if (args.lifecycle === "loadShareSync" && typeof args.shareInfo.get === "function" && /RUNTIME-00[56]/.test(errorMessage)) {
      return "sync-async-boundary";
    }
    if (args.lifecycle === "loadShareSync" && !args.shareInfo.get && /RUNTIME-006/.test(errorMessage)) {
      return getSharedMissReason(args);
    }
    if (args.error) {
      return "load-error";
    }
    return void 0;
  }
  function parseStableVersion(version) {
    const matched = version?.match(/^(\d+)\.(\d+)\.(\d+)(?:\+[\w.-]+)?$/);
    if (!matched) {
      return void 0;
    }
    return {
      major: Number(matched[1]),
      minor: Number(matched[2]),
      patch: Number(matched[3])
    };
  }
  function isVersionAtLeast(version, target) {
    if (version.major !== target.major) {
      return version.major > target.major;
    }
    if (version.minor !== target.minor) {
      return version.minor > target.minor;
    }
    return version.patch >= target.patch;
  }
  function supportsRuntimeObservability(origin) {
    const version = parseStableVersion(origin?.version);
    if (!version) {
      return false;
    }
    return isVersionAtLeast(version, {
      major: 2,
      minor: 5,
      patch: 0
    });
  }
  function createSharedInfo(args, reason) {
    const shareConfig = args.shareInfo?.shareConfig;
    const handledBundlerRuntimeShared = reason === "custom-share-info-unmatched";
    const loaded = args.selectedShared?.loaded;
    return {
      name: args.pkgName,
      shareScope: getSharedScopes(args.shareInfo),
      version: args.selectedShared?.version || args.shareInfo?.version,
      requiredVersion: shareConfig?.requiredVersion,
      selectedVersion: args.selectedShared?.version,
      availableVersions: getAvailableSharedVersions(args),
      provider: args.selectedShared?.from,
      useIn: getSharedUseIn(args),
      singleton: shareConfig?.singleton,
      strictVersion: shareConfig?.strictVersion,
      eager: shareConfig?.eager,
      strategy: args.shareInfo?.strategy,
      loaded,
      loading: loaded ? void 0 : Boolean(args.selectedShared?.loading) || void 0,
      reason,
      definedBy: handledBundlerRuntimeShared ? "bundler-runtime" : void 0
    };
  }
  function sanitizeShared(shared) {
    if (!shared || !shared.name) {
      return void 0;
    }
    return {
      name: sanitizeText(shared.name, 160) || "unknown",
      shareScope: normalizeSharedScope(shared.shareScope),
      version: sanitizeText(shared.version, 120),
      requiredVersion: shared.requiredVersion === false ? false : sanitizeText(shared.requiredVersion, 120),
      selectedVersion: sanitizeText(shared.selectedVersion, 120),
      availableVersions: (shared.availableVersions || []).map((version) => sanitizeText(version, 120)).filter((version) => Boolean(version)).slice(0, 20),
      provider: sanitizeText(shared.provider, 160),
      useIn: (shared.useIn || []).map((consumer) => sanitizeText(consumer, 160)).filter((consumer) => Boolean(consumer)),
      singleton: shared.singleton,
      strictVersion: shared.strictVersion,
      eager: shared.eager,
      strategy: sanitizeText(shared.strategy, 80),
      loaded: shared.loaded,
      loading: shared.loading,
      reason: sanitizeText(shared.reason, 120),
      definedBy: shared.definedBy === "bundler-runtime" ? "bundler-runtime" : void 0,
      conflict: sanitizeSharedConflict(shared.conflict)
    };
  }
  function sanitizeSharedConflict(conflict) {
    if (!conflict) {
      return void 0;
    }
    const scope = sanitizeText(conflict.scope, 120) || "default";
    const versions = (conflict.versions || []).map((version) => sanitizeText(version, 120)).filter((version) => Boolean(version)).slice(0, 20);
    const existingVersions = (conflict.existingVersions || []).map((item) => ({
      version: sanitizeText(item.version, 120),
      from: sanitizeText(item.from, 160),
      singleton: item.singleton === true || void 0,
      loaded: item.loaded === true || void 0
    })).filter(
      (item) => typeof item.version === "string" && item.version.length > 0
    ).slice(0, 20);
    return {
      reason: SHARED_SINGLETON_MULTIPLE_VERSIONS_REASON,
      scope,
      currentVersion: sanitizeText(conflict.currentVersion, 120),
      currentFrom: sanitizeText(conflict.currentFrom, 160),
      versions,
      existingVersions
    };
  }
  function getObjectValue(value, key) {
    return value[key];
  }
  function isReactLike(value) {
    if (!isRecord2(value)) {
      return false;
    }
    return typeof getObjectValue(value, "createElement") === "function";
  }
  function resolveReactLike(value) {
    if (isReactLike(value)) {
      return value;
    }
    if (isRecord2(value)) {
      const defaultExport = getObjectValue(value, "default");
      if (isReactLike(defaultExport)) {
        return defaultExport;
      }
    }
    return void 0;
  }
  function getReactComponentName(component, fallback) {
    if (typeof component === "function") {
      const displayName2 = component.displayName;
      return displayName2 || component.name || fallback;
    }
    if (!isRecord2(component)) {
      return fallback;
    }
    const displayName = getObjectValue(component, "displayName");
    if (typeof displayName === "string" && displayName) {
      return displayName;
    }
    const render = getObjectValue(component, "render");
    if (typeof render === "function") {
      const renderFunction = render;
      return renderFunction.displayName || renderFunction.name || fallback;
    }
    return fallback;
  }
  function isLikelyReactFunctionComponent(component, allowAnonymousComponent = false) {
    if (typeof component !== "function") {
      return false;
    }
    const name = component.displayName || component.name || "";
    if (/^use[A-Z0-9]/.test(name)) {
      return false;
    }
    if (allowAnonymousComponent) {
      return true;
    }
    if (!name) {
      return false;
    }
    return /^[A-Z]/.test(name);
  }
  function copyComponentStatics(target, source) {
    const reserved = /* @__PURE__ */ new Set([
      "arguments",
      "caller",
      "length",
      "name",
      "prototype",
      "displayName"
    ]);
    Object.getOwnPropertyNames(source).forEach((key) => {
      if (reserved.has(key)) {
        return;
      }
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (!descriptor || !descriptor.configurable) {
        return;
      }
      try {
        Object.defineProperty(target, key, descriptor);
      } catch {
      }
    });
  }
  function cloneModuleWithDefaultExport(moduleExports, defaultExport) {
    const descriptors = Object.getOwnPropertyDescriptors(moduleExports);
    const defaultDescriptor = descriptors["default"];
    descriptors["default"] = {
      configurable: true,
      enumerable: defaultDescriptor?.enumerable ?? true,
      writable: true,
      value: defaultExport
    };
    return Object.defineProperties(
      Object.create(Object.getPrototypeOf(moduleExports)),
      descriptors
    );
  }
  function resolveReactComponentTarget(component, defaultExportMode = "preserve", allowAnonymousComponent = false) {
    if (isLikelyReactFunctionComponent(component, allowAnonymousComponent)) {
      return {
        component,
        createResult: (wrappedComponent) => wrappedComponent
      };
    }
    if (!isRecord2(component)) {
      return void 0;
    }
    const defaultExport = getObjectValue(component, "default");
    if (!isLikelyReactFunctionComponent(defaultExport, allowAnonymousComponent)) {
      return void 0;
    }
    return {
      component: defaultExport,
      createResult: (wrappedComponent) => {
        const descriptor = Object.getOwnPropertyDescriptor(component, "default");
        let defaultExportReplaced = false;
        try {
          if (!descriptor || descriptor.writable || descriptor.set) {
            component["default"] = wrappedComponent;
            defaultExportReplaced = true;
          } else if (descriptor.configurable) {
            Object.defineProperty(component, "default", {
              configurable: true,
              enumerable: descriptor.enumerable,
              writable: true,
              value: wrappedComponent
            });
            defaultExportReplaced = true;
          }
        } catch {
        }
        if (defaultExportMode === "component") {
          return wrappedComponent;
        }
        return defaultExportReplaced ? void 0 : cloneModuleWithDefaultExport(component, wrappedComponent);
      }
    };
  }
  function normalizeEventSource(value) {
    return value === "runtime" || value === "business" || value === "react" ? value : void 0;
  }
  function extractErrorCode(value) {
    const matched = String(value ?? "").match(ERROR_CODE_PATTERN)?.[0];
    return matched ? sanitizeText(matched, 40) : void 0;
  }
  function getErrorInfo(error, stackTraceOptions) {
    if (!error) {
      return {};
    }
    if (error instanceof Error) {
      return {
        errorCode: extractErrorCode(
          `${error.name}
${error.message}
${error.stack || ""}`
        ),
        errorName: getRawText(error.name),
        errorMessage: getRawText(error.message),
        errorStack: sanitizeStack(error.stack, stackTraceOptions)
      };
    }
    return {
      errorCode: extractErrorCode(error),
      errorMessage: getRawText(error)
    };
  }
  function omitUndefinedFields(value) {
    if (Array.isArray(value)) {
      return value.map((item) => omitUndefinedFields(item));
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    const cleanValue = {};
    Object.entries(value).forEach(([key, item]) => {
      if (item === void 0) {
        return;
      }
      cleanValue[key] = omitUndefinedFields(item);
    });
    return cleanValue;
  }
  function copyEvent(event) {
    return omitUndefinedFields({
      ...event,
      remote: event.remote ? { ...event.remote } : void 0,
      shared: event.shared ? {
        ...event.shared,
        shareScope: event.shared.shareScope ? [...event.shared.shareScope] : void 0,
        availableVersions: event.shared.availableVersions ? [...event.shared.availableVersions] : void 0,
        conflict: copySharedConflict(event.shared.conflict)
      } : void 0,
      errorContext: event.errorContext ? { ...event.errorContext } : void 0,
      metadata: event.metadata ? { ...event.metadata } : void 0,
      loadedBefore: copyLoadedBeforeInfo(event.loadedBefore)
    });
  }
  function copySharedConflict(conflict) {
    if (!conflict) {
      return void 0;
    }
    return {
      ...conflict,
      versions: [...conflict.versions],
      existingVersions: conflict.existingVersions.map((item) => ({ ...item }))
    };
  }
  function copySummary(summary) {
    return {
      ...summary,
      phases: Object.entries(summary.phases).reduce((memo, [phase, phaseSummary]) => {
        memo[phase] = { ...phaseSummary };
        return memo;
      }, {}),
      shared: summary.shared ? {
        ...summary.shared,
        shareScope: summary.shared.shareScope ? [...summary.shared.shareScope] : void 0
      } : void 0,
      flags: { ...summary.flags },
      error: summary.error ? {
        ...summary.error,
        context: summary.error.context ? { ...summary.error.context } : void 0
      } : void 0
    };
  }
  function copyFactReport(diagnosis) {
    if (!diagnosis) {
      return void 0;
    }
    return {
      ...diagnosis,
      facts: { ...diagnosis.facts },
      completedPhases: [...diagnosis.completedPhases],
      pendingPhases: [...diagnosis.pendingPhases],
      warnings: diagnosis.warnings ? [...diagnosis.warnings] : void 0,
      actions: diagnosis.actions.map((action) => ({ ...action }))
    };
  }
  function copyModuleInfoSummary(moduleInfo) {
    if (!moduleInfo) {
      return void 0;
    }
    return {
      ...moduleInfo,
      entries: moduleInfo.entries.map((entry) => ({ ...entry })),
      availableNames: moduleInfo.availableNames ? [...moduleInfo.availableNames] : void 0
    };
  }
  function copyLoadedBeforeInfo(loadedBefore) {
    if (!loadedBefore) {
      return void 0;
    }
    return {
      producer: loadedBefore.producer,
      expose: loadedBefore.expose,
      consumers: loadedBefore.consumers.map((consumer) => ({
        ...consumer,
        exposes: consumer.exposes ? [...consumer.exposes] : void 0
      }))
    };
  }
  function copyReport(report) {
    return omitUndefinedFields({
      ...report,
      remote: report.remote ? { ...report.remote } : void 0,
      shared: report.shared ? {
        ...report.shared,
        shareScope: report.shared.shareScope ? [...report.shared.shareScope] : void 0,
        availableVersions: report.shared.availableVersions ? [...report.shared.availableVersions] : void 0,
        conflict: copySharedConflict(report.shared.conflict)
      } : void 0,
      errorContext: report.errorContext ? { ...report.errorContext } : void 0,
      moduleInfo: copyModuleInfoSummary(report.moduleInfo),
      loadedBefore: copyLoadedBeforeInfo(report.loadedBefore),
      events: report.events.map(copyEvent),
      summary: copySummary(report.summary),
      diagnosis: copyFactReport(report.diagnosis)
    });
  }
  function getFederationGlobal() {
    return globalThis.__FEDERATION__;
  }
  function normalizeExposeName(value) {
    const sanitized = sanitizeText(value, 240);
    if (!sanitized) {
      return void 0;
    }
    return sanitized.replace(/^\.\//, "");
  }
  function getModuleCacheEntries(moduleCache) {
    if (!moduleCache) {
      return [];
    }
    if (moduleCache instanceof Map) {
      return Array.from(moduleCache.values());
    }
    const entries = typeof moduleCache.entries === "function" ? Array.from(
      moduleCache.entries.call(moduleCache)
    ) : void 0;
    if (entries) {
      return entries.map(([, value]) => value);
    }
    if (isRecord2(moduleCache)) {
      return Object.values(moduleCache);
    }
    return [];
  }
  function getLoadedExposesForRemote(instance, remoteName) {
    if (!remoteName) {
      return [];
    }
    return Array.from(
      new Set(
        Object.values(instance.remoteHandler?.idToRemoteMap || {}).filter((item) => item?.name === remoteName).map((item) => sanitizeText(item.expose, 240)).filter((expose) => Boolean(expose))
      )
    );
  }
  function collectLoadedBeforeInfo(remote, expose, origin) {
    const entryGlobalName = remote?.entryGlobalName;
    if (!entryGlobalName) {
      return void 0;
    }
    const federation = getFederationGlobal();
    const instances = Array.isArray(federation?.__INSTANCES__) ? federation.__INSTANCES__ : [];
    const targetExpose = normalizeExposeName(expose);
    const consumers = [];
    instances.forEach((instance) => {
      if (instance === origin) {
        return;
      }
      const matchedModule = getModuleCacheEntries(instance.moduleCache).find(
        (item) => isRuntimeModuleWithEntryGlobalName(item, entryGlobalName)
      );
      if (!matchedModule) {
        return;
      }
      const exposes = getLoadedExposesForRemote(
        instance,
        matchedModule.remoteInfo?.name
      );
      const consumer = {
        name: sanitizeText(instance.options?.name, 120) || sanitizeText(instance.name, 120),
        remoteEntryExports: Boolean(matchedModule.remoteEntryExports),
        containerInitialized: matchedModule.inited === true,
        exposes: exposes.length ? exposes : void 0
      };
      consumers.push(omitUndefinedFields(consumer));
    });
    if (!consumers.length) {
      return void 0;
    }
    const exposeLoadedBefore = targetExpose ? consumers.some(
      (consumer) => (consumer.exposes || []).some(
        (loadedExpose) => normalizeExposeName(loadedExpose) === targetExpose
      )
    ) : false;
    return {
      producer: true,
      expose: exposeLoadedBefore,
      consumers
    };
  }
  function isRuntimeModuleWithEntryGlobalName(value, entryGlobalName) {
    if (!isRecord2(value)) {
      return false;
    }
    const remoteInfo = getObjectValue(value, "remoteInfo");
    return isRecord2(remoteInfo) && getObjectValue(remoteInfo, "entryGlobalName") === entryGlobalName;
  }
  function normalizeScope(value) {
    const sanitized = sanitizeText(value, 120);
    const normalized = sanitized?.replace(/[^\w:@.-]+/g, "-");
    return normalized || "default";
  }
  function shouldRecordEvent(level, event) {
    if (level === "verbose") {
      return true;
    }
    if (level === "summary") {
      return event.status !== "start";
    }
    return event.status === "error" || Boolean(event.error);
  }
  function createTraceId(event) {
    traceCounter += 1;
    const owner = event.remote?.name || event.phase || "runtime";
    const normalizedOwner = owner.replace(/[^a-z0-9]+/gi, "-").slice(0, 80);
    return `mf-${normalizedOwner}-${Date.now().toString(36)}-${traceCounter.toString(
      36
    )}`;
  }
  function getPhaseDurationKey(event) {
    const exposeKey = event.phase === "expose" || event.phase === "moduleFactory" ? event.expose || "" : "";
    return [
      event.traceId,
      event.phase,
      event.requestId || event.remote?.name || event.shared?.name || "",
      exposeKey
    ].join("|");
  }
  function getRemoteEntryKey(remote) {
    if (!remote?.name) {
      return void 0;
    }
    return [remote.name, remote.entryGlobalName || "", remote.entry || ""].join(
      "|"
    );
  }
  function getHostRemotesSummary(options) {
    const remotes = (options?.remotes || []).map((remote) => clipText(remote.alias || remote.name || remote.entry, 120)).filter((remote) => Boolean(remote)).slice(0, 20);
    return remotes.length ? remotes.join(",") : void 0;
  }
  function resolveRemoteFromRequestId(id, options) {
    if (!id) {
      return void 0;
    }
    const matchedRemote = (options?.remotes || []).filter((remote) => {
      const keys = [remote.alias, remote.name].filter(
        (key) => Boolean(key)
      );
      return keys.some((key) => id === key || id.startsWith(`${key}/`));
    }).sort((left, right) => {
      const leftKey = left.alias || left.name || "";
      const rightKey = right.alias || right.name || "";
      return rightKey.length - leftKey.length;
    })[0];
    return createRemoteInfo(matchedRemote);
  }
  function resolveAliasRequestId(requestId, remote) {
    if (!requestId || !remote?.alias || remote.alias === remote.name) {
      return void 0;
    }
    if (requestId === remote.name) {
      return remote.alias;
    }
    if (requestId.startsWith(`${remote.name}/`)) {
      return `${remote.alias}/${requestId.slice(remote.name.length + 1)}`;
    }
    return void 0;
  }
  function sanitizeModuleInfoPath(value) {
    if (typeof value !== "string") {
      return void 0;
    }
    return clipText(value, 320);
  }
  function sanitizeModuleInfoGetPublicPath(value) {
    if (typeof value !== "string") {
      return void 0;
    }
    return clipText(value, 500);
  }
  function sanitizeModuleInfoRemoteEntry(value) {
    if (typeof value !== "string") {
      return void 0;
    }
    return clipText(value, 320);
  }
  function createClippedModuleInfoEntry(rawName, rawValue) {
    const name = clipText(rawName, 240);
    if (!name) {
      return void 0;
    }
    const value = isRecord2(rawValue) ? rawValue : {};
    return {
      name,
      publicPath: sanitizeModuleInfoPath(value["publicPath"]),
      getPublicPath: sanitizeModuleInfoGetPublicPath(value["getPublicPath"]),
      remoteEntry: sanitizeModuleInfoRemoteEntry(value["remoteEntry"]),
      globalName: sanitizeText(value["globalName"], 160)
    };
  }
  function normalizeModuleInfoLookupValue(value) {
    if (typeof value !== "string" || !value) {
      return void 0;
    }
    const sanitized = /^https?:\/\//i.test(value) || value.startsWith("/") ? sanitizeUrl(value) : sanitizeText(value, 240);
    return sanitized?.toLowerCase();
  }
  function getModuleInfoLookupValues(report) {
    return new Set(
      [
        report.requestId?.split("/")[0],
        report.remote?.name,
        report.remote?.alias,
        report.remote?.entry,
        report.remote?.entryGlobalName,
        report.sanitizedUrl,
        report.errorContext?.["remoteName"],
        report.errorContext?.["remoteAlias"],
        report.errorContext?.["url"],
        report.summary.error?.context?.["remoteName"],
        report.summary.error?.context?.["remoteAlias"],
        report.summary.error?.context?.["url"]
      ].map(normalizeModuleInfoLookupValue).filter((value) => Boolean(value))
    );
  }
  function matchesModuleInfoLookup(entry, lookupValues) {
    if (!lookupValues.size) {
      return false;
    }
    const entryValues = [
      entry.name,
      entry.publicPath,
      entry.getPublicPath,
      entry.remoteEntry,
      entry.globalName
    ].map(normalizeModuleInfoLookupValue).filter((value) => Boolean(value));
    return entryValues.some(
      (entryValue) => Array.from(lookupValues).some(
        (lookupValue) => entryValue === lookupValue || entryValue.startsWith(`${lookupValue}:`) || entryValue.includes(`:${lookupValue}`) || lookupValue.startsWith("http") && entryValue.includes(lookupValue)
      )
    );
  }
  function getModuleInfoCaptureReason(report) {
    const text = [
      report.errorCode,
      report.errorName,
      report.errorMessage,
      report.summary.error?.errorCode,
      report.summary.error?.errorName,
      report.summary.error?.errorMessage,
      ...report.events.flatMap((event) => [
        event.errorCode,
        event.errorName,
        event.errorMessage,
        event.message,
        event.lifecycle
      ])
    ].join("\n");
    if (/RUNTIME-007/.test(text)) {
      return "remote-snapshot";
    }
    if (/RUNTIME-011/.test(text)) {
      return "remote-entry-missing-in-snapshot";
    }
    if (/moduleInfo|module info/i.test(text)) {
      return "module-info";
    }
    if (/remote snapshot|global snapshot|snapshot/i.test(text)) {
      return "remote-snapshot";
    }
    return void 0;
  }
  function createModuleInfoSummary(report) {
    const reason = getModuleInfoCaptureReason(report);
    if (!reason) {
      return void 0;
    }
    const moduleInfo = getFederationGlobal()?.moduleInfo;
    const rawEntries = isRecord2(moduleInfo) ? Object.entries(moduleInfo) : [];
    const clippedEntries = rawEntries.map(([name, value]) => createClippedModuleInfoEntry(name, value)).filter((entry) => Boolean(entry));
    const lookupValues = getModuleInfoLookupValues(report);
    const matchedEntries = clippedEntries.filter(
      (entry) => matchesModuleInfoLookup(entry, lookupValues)
    );
    return {
      reason,
      clipped: true,
      totalCount: rawEntries.length,
      matchedCount: matchedEntries.length,
      entries: matchedEntries.slice(0, MAX_MODULE_INFO_ENTRIES),
      availableNames: matchedEntries.length ? void 0 : clippedEntries.map((entry) => entry.name).slice(0, MAX_MODULE_INFO_ENTRIES)
    };
  }
  function getResourceErrorType(event) {
    const text = `${event.errorMessage || ""}
${event.message || ""}`;
    if (!event.errorCode && !text) {
      return void 0;
    }
    if (/ScriptExecutionError/i.test(text)) {
      return "script-execution";
    }
    if (/timeout|timed out/i.test(text)) {
      return "timeout";
    }
    if (/ScriptNetworkError|NetworkError|Failed to fetch|Request failed|ERR_|404|CORS/i.test(
      text
    )) {
      return "network";
    }
    return event.errorCode === "RUNTIME-008" ? "unknown" : void 0;
  }
  function getOwnerHint(event) {
    const resourceErrorType = getResourceErrorType(event);
    switch (event.errorCode) {
      case "RUNTIME-001":
      case "RUNTIME-002":
      case "RUNTIME-011":
      case "RUNTIME-013":
      case "RUNTIME-014":
      case "RUNTIME-015":
        return "remote";
      case "RUNTIME-003":
      case "RUNTIME-004":
      case "RUNTIME-007":
        return "host";
      case "RUNTIME-005":
      case "RUNTIME-006":
      case "RUNTIME-012":
        return "shared";
      case "RUNTIME-008":
        return resourceErrorType === "network" || resourceErrorType === "timeout" ? "network" : "remote";
      default:
        if (event.shared) {
          return "shared";
        }
        if (event.remote) {
          return "remote";
        }
        if (event.phase === "manifest" || event.phase === "matchRemote") {
          return "host";
        }
        return event.errorCode ? "runtime" : void 0;
    }
  }
  function getRetryable(event) {
    const resourceErrorType = getResourceErrorType(event);
    if (event.errorCode === "RUNTIME-008") {
      return resourceErrorType === "network" || resourceErrorType === "timeout";
    }
    if (event.errorCode === "RUNTIME-003") {
      const text = `${event.errorMessage || ""}
${event.message || ""}`;
      return /NetworkError|Failed to fetch|Request failed|timeout|timed out/i.test(
        text
      );
    }
    if (event.errorCode && [
      "RUNTIME-001",
      "RUNTIME-002",
      "RUNTIME-004",
      "RUNTIME-005",
      "RUNTIME-006",
      "RUNTIME-011",
      "RUNTIME-012",
      "RUNTIME-013",
      "RUNTIME-014",
      "RUNTIME-015"
    ].includes(event.errorCode)) {
      return false;
    }
    return void 0;
  }
  function createErrorContext(event, inputContext) {
    const context = {
      ...inputContext
    };
    if (event.lifecycle) {
      context["lifecycle"] = event.lifecycle;
    }
    if (event.requestId) {
      context["requestId"] = event.requestId;
    }
    if (event.requestAlias) {
      context["requestAlias"] = event.requestAlias;
    }
    if (event.remote?.name) {
      context["remoteName"] = event.remote.name;
    }
    if (event.remote?.alias) {
      context["remoteAlias"] = event.remote.alias;
    }
    if (event.remote?.type) {
      context["remoteType"] = event.remote.type;
    }
    if (event.remote?.entryGlobalName) {
      context["entryGlobalName"] = event.remote.entryGlobalName;
    }
    if (event.sanitizedUrl) {
      context["url"] = event.sanitizedUrl;
    }
    if (event.expose) {
      context["expose"] = event.expose;
    }
    if (event.shared?.name) {
      context["shareName"] = event.shared.name;
    }
    if (event.shared?.requiredVersion) {
      context["requiredVersion"] = event.shared.requiredVersion;
    }
    if (event.shared?.selectedVersion) {
      context["selectedVersion"] = event.shared.selectedVersion;
    }
    if (event.shared?.provider) {
      context["provider"] = event.shared.provider;
    }
    const resourceErrorType = getResourceErrorType(event);
    if (resourceErrorType) {
      context["resourceErrorType"] = resourceErrorType;
    }
    return clipObservabilityMetadata(context);
  }
  function createObservability(rawOptions = {}, adapterOptions = {}) {
    const options = {
      ...rawOptions,
      browser: adapterOptions.fixedBrowserScope ? {
        ...rawOptions.browser,
        scope: adapterOptions.fixedBrowserScope
      } : rawOptions.browser,
      react: adapterOptions.disableReact ? {
        ...rawOptions.react,
        enabled: false,
        injectLoadedCallback: false
      } : rawOptions.react
    };
    const pluginName = adapterOptions.pluginName || "observability-plugin";
    const shouldAttachInstanceApi = adapterOptions.attachInstanceApi !== false;
    const shouldGuardSharedHooksByRuntimeVersion = adapterOptions.guardSharedHooksByRuntimeVersion === true;
    const shouldGuardRuntimeHooksByRuntimeVersion = adapterOptions.guardRuntimeHooksByRuntimeVersion === true;
    const shouldDisablePreloadHooks = adapterOptions.disablePreloadHooks === true;
    const shouldReturnHookArgs = adapterOptions.returnHookArgs === true;
    const shouldForceDevelopmentChannels = adapterOptions.forceDevelopmentChannels === true;
    const returnHookArgs = (args) => shouldReturnHookArgs ? args : void 0;
    const level = options.level || "summary";
    const configuredMaxEvents = normalizeMaxEvents(
      options.maxEvents,
      DEFAULT_MAX_EVENTS
    );
    const events = [];
    const reports = /* @__PURE__ */ new Map();
    const latestTraceByInstance = /* @__PURE__ */ new Map();
    const traceByRequest = /* @__PURE__ */ new Map();
    const traceByRemote = /* @__PURE__ */ new Map();
    const instanceRefs = /* @__PURE__ */ new WeakMap();
    const instancesByRef = /* @__PURE__ */ new Map();
    const lateBoundInstanceRefs = /* @__PURE__ */ new Set();
    const boundInstanceRefs = /* @__PURE__ */ new Set();
    const attachedInstanceApis = /* @__PURE__ */ new WeakMap();
    const phaseStartTimes = /* @__PURE__ */ new Map();
    const reportedSharedConflictKeys = /* @__PURE__ */ new Set();
    const collectorOptions = normalizeCollectorOptions(options.collector);
    const devtoolsOptions = normalizeDevtoolsOptions(options.devtools);
    const seenManifestUrls = /* @__PURE__ */ new Set();
    const loadingManifestUrls = /* @__PURE__ */ new Set();
    const seenRemoteEntryKeys = /* @__PURE__ */ new Set();
    const consoleReportedTraceIds = /* @__PURE__ */ new Set();
    const consoleReportedStartKeys = /* @__PURE__ */ new Set();
    let latestTraceId;
    let runtimeObservabilityEnabled = false;
    let suppressRuntimeEvents = false;
    let effectiveMaxEvents = configuredMaxEvents;
    let browserGlobalScope;
    let lastRuntimeOrigin;
    let appliedRuntimeVersion;
    let instanceRefCounter = 0;
    let historyCleared = false;
    const getActiveRuntimeInstances = () => {
      const federation = getFederationGlobal();
      return Array.isArray(federation?.__INSTANCES__) ? federation.__INSTANCES__ : [];
    };
    const registerRuntimeInstance = (origin, lateBound) => {
      const existingRef = instanceRefs.get(origin);
      if (existingRef) {
        return existingRef;
      }
      instanceRefCounter += 1;
      const instanceRef = `mf-${instanceRefCounter}`;
      instanceRefs.set(origin, instanceRef);
      instancesByRef.set(instanceRef, origin);
      if (lateBound ?? getActiveRuntimeInstances().some((instance) => instance === origin)) {
        lateBoundInstanceRefs.add(instanceRef);
      }
      return instanceRef;
    };
    const getInstanceRef = (origin) => origin ? registerRuntimeInstance(origin) : void 0;
    const getTraceMapKey = (instanceRef, value) => `${instanceRef || "legacy"}\0${value}`;
    const isEnabled = () => {
      if (options.enabled === false) {
        return false;
      }
      runtimeObservabilityEnabled = true;
      return true;
    };
    const resolveTraceId = (event) => {
      const sanitizedRequestId = sanitizeRequestId(event.requestId);
      const instanceRef = sanitizeText(event.instanceRef, 80);
      if (event.traceId && reports.has(event.traceId)) {
        return event.traceId;
      }
      if (event.status === "start" && event.phase === "loadRemote") {
        const traceId = event.traceId || createTraceId(event);
        if (sanitizedRequestId) {
          traceByRequest.set(
            getTraceMapKey(instanceRef, sanitizedRequestId),
            traceId
          );
        }
        if (event.remote?.name) {
          traceByRemote.set(
            getTraceMapKey(instanceRef, event.remote.name),
            traceId
          );
        }
        return traceId;
      }
      if (sanitizedRequestId) {
        const traceId = traceByRequest.get(
          getTraceMapKey(instanceRef, sanitizedRequestId)
        );
        if (traceId) {
          return traceId;
        }
      }
      if (event.remote?.name) {
        const traceId = traceByRemote.get(
          getTraceMapKey(instanceRef, event.remote.name)
        );
        if (traceId) {
          return traceId;
        }
      }
      return event.traceId || createTraceId(event);
    };
    const normalizeEvent2 = (event, traceId, origin) => {
      const errorInfo = getErrorInfo(event.error, options.stackTrace);
      const sanitizedRemote = sanitizeRemote(event.remote);
      const sanitizedShared = sanitizeShared(event.shared);
      const requestAlias = sanitizeRequestId(event.requestAlias) || resolveAliasRequestId(event.requestId, sanitizedRemote);
      const hostName = sanitizeText(event.hostName, 120) || sanitizeText(origin?.options?.name, 120);
      const runtimeVersion = sanitizeText(origin?.version, 80) || appliedRuntimeVersion;
      const message = getRawText(event.message) || errorInfo.errorMessage;
      const normalizedEvent = {
        traceId,
        instanceRef: event.instanceRef || getInstanceRef(origin),
        timestamp: event.timestamp || Date.now(),
        phase: sanitizeText(event.phase, 120) || "runtime",
        status: event.status,
        requestId: sanitizeRequestId(event.requestId),
        requestAlias,
        hostName,
        runtimeVersion,
        remote: sanitizedRemote,
        shared: sanitizedShared,
        expose: sanitizeText(event.expose, 240),
        sanitizedUrl: clipText(event.url || event.remote?.entry, 320),
        message,
        errorCode: errorInfo.errorCode,
        errorName: errorInfo.errorName,
        errorMessage: errorInfo.errorMessage,
        errorStack: errorInfo.errorStack,
        duration: typeof event.duration === "number" && Number.isFinite(event.duration) ? Math.max(0, event.duration) : void 0,
        lifecycle: sanitizeText(event.lifecycle, 120),
        eventName: sanitizeText(event.eventName, 160),
        source: normalizeEventSource(event.source),
        recovered: event.recovered === true || void 0,
        cached: event.cached === true || void 0,
        componentName: sanitizeText(event.componentName, 160),
        metadata: clipObservabilityMetadata(event.metadata),
        loadedBefore: copyLoadedBeforeInfo(event.loadedBefore)
      };
      if (normalizedEvent.status === "error" || event.error) {
        normalizedEvent.ownerHint = getOwnerHint(normalizedEvent);
        normalizedEvent.retryable = getRetryable(normalizedEvent);
        normalizedEvent.errorContext = createErrorContext(
          normalizedEvent,
          event.errorContext
        );
      }
      return normalizedEvent;
    };
    const supportsRuntimeHookObservability = (origin) => supportsRuntimeObservability({
      ...origin,
      version: sanitizeText(origin?.version, 80) || appliedRuntimeVersion || origin?.version
    });
    const shouldSkipRuntimeHook = (origin) => shouldGuardRuntimeHooksByRuntimeVersion && !supportsRuntimeHookObservability(origin);
    const applyPhaseDuration = (event) => {
      const key = getPhaseDurationKey(event);
      if (event.status === "start") {
        phaseStartTimes.set(key, event.timestamp);
        return;
      }
      if (event.duration !== void 0) {
        return;
      }
      const startedAt = phaseStartTimes.get(key);
      if (startedAt === void 0) {
        return;
      }
      event.duration = Math.max(0, event.timestamp - startedAt);
      phaseStartTimes.delete(key);
    };
    const updateTraceMaps = (event) => {
      if (event.requestId) {
        traceByRequest.set(
          getTraceMapKey(event.instanceRef, event.requestId),
          event.traceId
        );
      }
      if (event.remote?.name) {
        traceByRemote.set(
          getTraceMapKey(event.instanceRef, event.remote.name),
          event.traceId
        );
      }
    };
    const trimEvents = (report) => {
      while (events.length > effectiveMaxEvents) {
        events.shift();
      }
      while (report.events.length > effectiveMaxEvents) {
        report.events.shift();
      }
    };
    const getEventOutcome = (event) => {
      if (event.status === "success") {
        return "success";
      }
      if (event.status === "error") {
        return "error";
      }
      if (event.status === "complete") {
        if (event.recovered) {
          return "recovered";
        }
        if (event.errorName || event.errorMessage) {
          return "error";
        }
      }
      return void 0;
    };
    const isLoadRemoteCompleteEvent = (event) => event.phase === "loadRemote" && event.status === "complete";
    const isRuntimeLoadedEvent = (event) => event.phase === "loadRemote" && (event.status === "success" || event.status === "complete" && event.recovered);
    const isSharedResolvedEvent = (event) => event.phase === "shared" && (event.status === "success" || event.status === "complete" && event.recovered);
    const isPreloadedEvent = (event) => event.phase === "preload" && event.status === "success";
    const isComponentLoadedEvent = (event) => event.status === "success" && (event.eventName === COMPONENT_BUSINESS_LOADED_EVENT || event.phase === "component" && event.message === COMPONENT_BUSINESS_LOADED_EVENT);
    const shouldReplaceFailedPhase = (report, event) => {
      if (isLoadRemoteCompleteEvent(event) && report.failedPhase) {
        return false;
      }
      if (!report.failedPhase) {
        return true;
      }
      return report.failedPhase === "loadRemote" && event.phase !== "loadRemote";
    };
    const createEmptyPhaseCollection = () => ({
      phases: {},
      flags: {
        cached: false,
        fallback: false,
        recovered: false
      }
    });
    const createPhaseCollection = (eventsForReport) => {
      const collection = createEmptyPhaseCollection();
      eventsForReport.forEach((event) => {
        const phase = event.phase;
        const phaseSummary = collection.phases[phase] || {
          status: event.status
        };
        if (event.status !== "start") {
          phaseSummary.status = event.status;
        }
        if (event.duration !== void 0) {
          phaseSummary.duration = event.duration;
        }
        if (event.cached) {
          phaseSummary.cached = true;
          collection.flags.cached = true;
        }
        if (event.recovered) {
          phaseSummary.recovered = true;
          collection.flags.recovered = true;
        }
        if (event.lifecycle) {
          phaseSummary.lifecycle = event.lifecycle;
        }
        collection.phases[phase] = phaseSummary;
        if (event.phase === "loadRemote" && event.status === "complete" && event.recovered) {
          collection.flags.fallback = true;
        }
        if (event.shared?.selectedVersion || event.shared?.provider) {
          collection.shared = {
            name: event.shared.name,
            provider: event.shared.provider,
            selectedVersion: event.shared.selectedVersion,
            shareScope: event.shared.shareScope ? [...event.shared.shareScope] : void 0
          };
        }
      });
      return collection;
    };
    const createErrorSummary = (eventsForReport, failedPhase) => {
      const errorEvent = eventsForReport.find(
        (event) => event.status === "error" && event.phase === failedPhase
      ) || eventsForReport.find((event) => event.status === "error") || eventsForReport.find(
        (event) => event.status === "complete" && event.errorMessage
      );
      if (!errorEvent) {
        return void 0;
      }
      return {
        errorCode: errorEvent.errorCode,
        errorName: errorEvent.errorName,
        errorMessage: errorEvent.errorMessage,
        failedPhase: failedPhase || errorEvent.phase,
        lifecycle: errorEvent.lifecycle,
        ownerHint: errorEvent.ownerHint,
        retryable: errorEvent.retryable,
        context: errorEvent.errorContext ? { ...errorEvent.errorContext } : void 0
      };
    };
    const createReportSummary2 = (report) => {
      const loadCompleted = report.events.some(isLoadRemoteCompleteEvent);
      const runtimeLoaded = report.events.some(isRuntimeLoadedEvent);
      const sharedResolved = report.events.some(isSharedResolvedEvent);
      const preloaded = report.events.some(isPreloadedEvent);
      const recovered = report.events.some((item) => item.recovered);
      const componentLoaded = report.events.some(isComponentLoadedEvent);
      const lastEvent = report.events[report.events.length - 1];
      let outcome = "pending";
      if (recovered) {
        outcome = "recovered";
      } else if (componentLoaded) {
        outcome = "component-loaded";
      } else if (report.status === "error") {
        outcome = "failed";
      } else if (runtimeLoaded) {
        outcome = "runtime-loaded";
      } else if (sharedResolved) {
        outcome = "shared-resolved";
      } else if (preloaded) {
        outcome = "preloaded";
      }
      const phaseCollection = createPhaseCollection(report.events);
      return {
        eventCount: report.events.length,
        recovered,
        loadCompleted,
        runtimeLoaded,
        sharedResolved,
        preloaded,
        componentLoaded,
        outcome,
        lastPhase: lastEvent?.phase,
        phases: phaseCollection.phases,
        shared: phaseCollection.shared,
        flags: phaseCollection.flags,
        error: createErrorSummary(report.events, report.failedPhase)
      };
    };
    const refreshModuleInfoSummary = (report) => {
      const moduleInfo = createModuleInfoSummary(report);
      if (moduleInfo) {
        report.moduleInfo = moduleInfo;
      }
    };
    const getReportContext = (report) => report.summary.error?.context || report.errorContext;
    const getContextText = (context, key) => {
      const value = context?.[key];
      return typeof value === "string" && value ? value : void 0;
    };
    const getDiagnosisOwnerHint = (report) => report.summary.error?.ownerHint || report.ownerHint || (report.shared ? "shared" : report.remote ? "remote" : "unknown");
    const getDiagnosisResourceErrorType = (report) => getContextText(getReportContext(report), "resourceErrorType") || getResourceErrorType({
      errorCode: report.errorCode,
      errorMessage: report.errorMessage,
      message: report.events.at(-1)?.message,
      lifecycle: report.summary.error?.lifecycle
    });
    const getDiagnosisDocLink = (report) => {
      const text = [
        report.errorMessage,
        report.errorStack,
        ...report.events.flatMap((event) => [
          event.errorMessage,
          event.errorStack,
          event.message
        ])
      ].filter((item) => Boolean(item)).join("\n");
      const matched = text.match(DIAGNOSTIC_DOC_LINK_PATTERN)?.[0];
      const docLink = sanitizeText(matched, 240);
      if (docLink) {
        return docLink;
      }
      return report.errorCode?.startsWith("RUNTIME-") ? RUNTIME_DOC_LINK : void 0;
    };
    const getDiagnosisTitle = (report) => {
      if (report.status !== "error") {
        if (report.shared) {
          if (report.shared.reason === SHARED_SINGLETON_MULTIPLE_VERSIONS_REASON) {
            return "Singleton shared dependency version conflict detected";
          }
          if (report.summary.sharedResolved) {
            return "Shared dependency resolved successfully";
          }
          return "Shared dependency loading is pending";
        }
        if (report.summary.componentLoaded) {
          return "Business component loaded";
        }
        if (report.summary.runtimeLoaded) {
          return "Remote loaded successfully";
        }
        if (report.summary.preloaded) {
          return "Remote preloaded successfully";
        }
        return "Remote loading is pending";
      }
      switch (report.errorCode) {
        case "RUNTIME-001":
          return "Remote entry global was not registered";
        case "RUNTIME-003":
          return "Manifest could not be loaded";
        case "RUNTIME-004":
          return "Remote was not found in host remotes";
        case "RUNTIME-007":
          return "Deployment moduleInfo did not match the requested remote";
        case "RUNTIME-013":
          return "Manifest is not a valid Module Federation manifest";
        case "RUNTIME-014":
          return "Requested expose was not found in the remote";
        case "RUNTIME-015":
          return "Remote container initialization failed";
        case "RUNTIME-005":
        case "RUNTIME-006":
          return "Shared dependency could not be resolved";
        case "RUNTIME-008": {
          const resourceErrorType = getDiagnosisResourceErrorType(report);
          if (resourceErrorType === "network") {
            return "Remote entry failed because of a network error";
          }
          if (resourceErrorType === "timeout") {
            return "Remote entry request timed out";
          }
          if (resourceErrorType === "script-execution") {
            return "Remote entry loaded but failed during execution";
          }
          return "Remote entry resource could not be loaded";
        }
        default:
          if (report.failedPhase === "shared" || report.shared) {
            return "Shared dependency could not be resolved";
          }
          return report.failedPhase ? `Module Federation failed at ${report.failedPhase}` : "Module Federation loading failed";
      }
    };
    const getCompletedPhases = (report) => Array.from(
      new Set(
        report.events.filter(
          (event) => event.status === "success" || event.status === "complete"
        ).map((event) => event.phase)
      )
    );
    const getPendingPhases = (report) => {
      const started = /* @__PURE__ */ new Set();
      const ended = /* @__PURE__ */ new Set();
      report.events.forEach((event) => {
        if (event.status === "start") {
          started.add(event.phase);
          return;
        }
        ended.add(event.phase);
      });
      return Array.from(started).filter((phase) => !ended.has(phase));
    };
    const createDiagnosisFacts = (report, ownerHint) => {
      const context = getReportContext(report);
      const facts = {};
      const addFact = (key, value) => {
        if (value === void 0 || value === null || value === "") {
          return;
        }
        facts[key] = Array.isArray(value) ? value.join(",") : value;
      };
      addFact("traceId", report.traceId);
      addFact("status", report.status);
      addFact("outcome", report.summary.outcome);
      addFact("errorCode", report.errorCode || report.summary.error?.errorCode);
      addFact(
        "failedPhase",
        report.failedPhase || report.summary.error?.failedPhase
      );
      addFact("lifecycle", report.summary.error?.lifecycle);
      addFact("ownerHint", ownerHint);
      addFact("retryable", report.retryable ?? report.summary.error?.retryable);
      addFact("requestId", report.requestId);
      addFact(
        "requestAlias",
        report.requestAlias || report.summary.error?.context?.["requestAlias"]
      );
      addFact("hostName", report.hostName);
      addFact("remoteName", report.remote?.name);
      addFact("remoteAlias", report.remote?.alias);
      addFact("remoteEntry", report.remote?.entry);
      addFact("entryGlobalName", report.remote?.entryGlobalName);
      addFact("remoteType", report.remote?.type);
      addFact("url", report.sanitizedUrl || getContextText(context, "url"));
      addFact("expose", report.expose);
      addFact("hostRemotes", getContextText(context, "hostRemotes"));
      addFact("resourceErrorType", getDiagnosisResourceErrorType(report));
      addFact("shareName", report.shared?.name);
      addFact("shareScope", report.shared?.shareScope);
      addFact("shareVersion", report.shared?.version);
      addFact("requiredVersion", report.shared?.requiredVersion);
      addFact("selectedVersion", report.shared?.selectedVersion);
      addFact("availableVersions", report.shared?.availableVersions);
      addFact("provider", report.shared?.provider);
      addFact("useIn", report.shared?.useIn);
      addFact("sharedDefinedBy", report.shared?.definedBy);
      addFact("singleton", report.shared?.singleton);
      addFact("strictVersion", report.shared?.strictVersion);
      addFact("eager", report.shared?.eager);
      addFact("sharedReason", report.shared?.reason);
      addFact(
        "componentName",
        report.events.find(isComponentLoadedEvent)?.componentName
      );
      addFact("moduleInfoReason", report.moduleInfo?.reason);
      addFact("moduleInfoTotalCount", report.moduleInfo?.totalCount);
      addFact("moduleInfoMatchedCount", report.moduleInfo?.matchedCount);
      addFact(
        "moduleInfoNames",
        report.moduleInfo?.entries.length ? report.moduleInfo.entries.map((entry) => entry.name) : report.moduleInfo?.availableNames
      );
      addFact("cached", report.summary.flags.cached);
      addFact("fallback", report.summary.flags.fallback);
      addFact("recovered", report.summary.recovered);
      addFact("loadCompleted", report.summary.loadCompleted);
      addFact("runtimeLoaded", report.summary.runtimeLoaded);
      addFact("componentLoaded", report.summary.componentLoaded);
      return clipMetadata(facts, MAX_FACT_KEYS) || {};
    };
    const createDiagnosisWarnings = (report) => {
      const warnings = [];
      if (report.status === "error" && !report.errorCode) {
        warnings.push("No known Module Federation error code was captured");
      }
      if (report.summary.flags.fallback) {
        warnings.push("Remote loading completed through fallback recovery");
      }
      if (report.summary.runtimeLoaded && !report.summary.componentLoaded) {
        warnings.push("Business component readiness signal was not recorded");
      }
      if (report.moduleInfo && report.moduleInfo.matchedCount === 0) {
        warnings.push(
          "No matching clipped moduleInfo entry was found for the failed remote"
        );
      }
      if (report.shared?.reason === SHARED_SINGLETON_MULTIPLE_VERSIONS_REASON) {
        warnings.push(
          "Singleton shared dependency has multiple versions in the same share scope"
        );
      }
      return warnings;
    };
    const createDiagnosisActions = (report, ownerHint) => {
      const actions = [];
      const pushAction = (id, title, hint = ownerHint, detail) => {
        actions.push({
          id,
          ownerHint: hint,
          title,
          detail
        });
      };
      if (report.shared?.reason === SHARED_SINGLETON_MULTIPLE_VERSIONS_REASON) {
        pushAction(
          "check-shared-version",
          "Align singleton shared dependency versions in the same share scope",
          "shared"
        );
        pushAction(
          "check-shared-provider",
          "Check which host or remote registered each shared version",
          "shared"
        );
        return actions;
      }
      if (report.status !== "error" && !report.summary.error) {
        return actions;
      }
      switch (report.errorCode) {
        case "RUNTIME-001":
          pushAction(
            "check-remote-global",
            "Check the remote global name against the remoteEntry build output",
            "remote"
          );
          pushAction(
            "check-remote-entry",
            "Check that remoteEntry registers the expected container",
            "remote"
          );
          break;
        case "RUNTIME-003":
          pushAction(
            "check-manifest-url",
            "Check the manifest URL and manifest JSON response",
            "host"
          );
          pushAction(
            "check-network",
            "Check network availability, CORS, and timeout for the manifest",
            "network"
          );
          break;
        case "RUNTIME-013":
          pushAction(
            "check-manifest-url",
            "Check that the manifest response is valid Module Federation JSON",
            "remote"
          );
          break;
        case "RUNTIME-004":
          pushAction(
            "check-host-remotes",
            "Check that the requested remote exists in host remotes",
            "host"
          );
          break;
        case "RUNTIME-007":
          pushAction(
            "check-module-info",
            "Check deployment-provided __FEDERATION__.moduleInfo for the requested remote",
            "host"
          );
          pushAction(
            "check-host-remotes",
            "Check that the runtime remote name or alias matches moduleInfo",
            "host"
          );
          break;
        case "RUNTIME-014":
          pushAction(
            "check-expose",
            "Check that the requested expose exists in the remote build output",
            "remote"
          );
          break;
        case "RUNTIME-015":
          pushAction(
            "check-remote-entry",
            "Check the error thrown during remoteEntry init",
            "remote"
          );
          pushAction(
            "check-shared-provider",
            "Check share scope initialization data passed to the remote",
            "shared"
          );
          break;
        case "RUNTIME-005":
        case "RUNTIME-006":
          pushAction(
            "check-shared-provider",
            "Check that a compatible shared provider is available",
            "shared"
          );
          pushAction(
            "check-shared-version",
            "Compare requested shared version with available versions",
            "shared"
          );
          if (report.summary.error?.lifecycle === "loadShareSync" || report.shared?.reason === "sync-async-boundary" || report.shared?.eager === false) {
            pushAction(
              "check-eager-config",
              "Check eager configuration or add an async boundary before sync shared consumption",
              "shared"
            );
          }
          break;
        case "RUNTIME-008": {
          const resourceErrorType = getDiagnosisResourceErrorType(report);
          if (resourceErrorType === "network" || resourceErrorType === "timeout") {
            pushAction(
              "check-network",
              "Check remoteEntry URL, CORS, status code, and timeout",
              "network"
            );
          }
          pushAction(
            "check-remote-entry",
            resourceErrorType === "script-execution" ? "Check remoteEntry execution errors in the remote build output" : "Check that remoteEntry is reachable and serves JavaScript",
            resourceErrorType === "network" || resourceErrorType === "timeout" ? "network" : "remote"
          );
          break;
        }
        default:
          if (report.failedPhase === "manifest") {
            pushAction(
              "check-manifest-url",
              "Check manifest loading and parsing",
              "host"
            );
          }
          if (report.failedPhase === "remoteEntry") {
            pushAction(
              "check-remote-entry",
              "Check remoteEntry loading and initialization",
              "remote"
            );
          }
          if (report.failedPhase === "expose") {
            pushAction(
              "check-expose",
              "Check that the requested expose exists in the remote",
              "remote"
            );
          }
          if (report.failedPhase === "shared") {
            pushAction(
              "check-shared-provider",
              "Check shared dependency resolution",
              "shared"
            );
            if (report.shared?.requiredVersion !== void 0 || report.shared?.availableVersions?.length || report.shared?.reason === "version-mismatch") {
              pushAction(
                "check-shared-version",
                "Compare requested shared version with available versions",
                "shared"
              );
            }
            if (report.summary.error?.lifecycle === "loadShareSync" || report.shared?.reason === "sync-async-boundary" || report.shared?.eager === false) {
              pushAction(
                "check-eager-config",
                "Check eager configuration or add an async boundary before sync shared consumption",
                "shared"
              );
            }
          }
      }
      if (report.moduleInfo && !actions.some((action) => action.id === "check-module-info")) {
        pushAction(
          "check-module-info",
          "Check deployment-provided __FEDERATION__.moduleInfo for the requested remote",
          "host"
        );
      }
      if (!actions.length) {
        pushAction(
          "inspect-runtime-events",
          "Inspect the ordered observability events for the failed phase",
          ownerHint
        );
      }
      return actions;
    };
    const createFactReport = (report) => {
      const ownerHint = getDiagnosisOwnerHint(report);
      const warnings = createDiagnosisWarnings(report);
      return {
        title: getDiagnosisTitle(report),
        outcome: report.summary.outcome,
        status: report.status,
        ownerHint,
        failedPhase: report.failedPhase || report.summary.error?.failedPhase,
        errorCode: report.errorCode || report.summary.error?.errorCode,
        errorName: report.errorName || report.summary.error?.errorName,
        errorMessage: report.errorMessage || report.summary.error?.errorMessage,
        docLink: getDiagnosisDocLink(report),
        facts: createDiagnosisFacts(report, ownerHint),
        completedPhases: getCompletedPhases(report),
        pendingPhases: getPendingPhases(report),
        warnings: warnings.length ? warnings : void 0,
        actions: createDiagnosisActions(report, ownerHint)
      };
    };
    const refreshReportDerivedFields = (report) => {
      report.summary = createReportSummary2(report);
      refreshModuleInfoSummary(report);
      report.diagnosis = createFactReport(report);
    };
    const updateReport = (event) => {
      let report = reports.get(event.traceId);
      if (!report) {
        report = {
          traceId: event.traceId,
          instanceRef: event.instanceRef,
          status: event.status === "error" ? "error" : "pending",
          requestId: event.requestId,
          requestAlias: event.requestAlias,
          hostName: event.hostName,
          runtimeVersion: event.runtimeVersion,
          remote: event.remote ? { ...event.remote } : void 0,
          shared: event.shared ? copyEvent(event).shared : void 0,
          expose: event.expose,
          sanitizedUrl: event.sanitizedUrl,
          startedAt: event.timestamp,
          updatedAt: event.timestamp,
          duration: 0,
          failedPhase: event.status === "error" ? event.phase : void 0,
          errorCode: event.errorCode,
          errorName: event.errorName,
          errorMessage: event.errorMessage,
          errorStack: event.errorStack,
          ownerHint: event.ownerHint,
          retryable: event.retryable,
          errorContext: event.errorContext ? { ...event.errorContext } : void 0,
          loadedBefore: copyLoadedBeforeInfo(event.loadedBefore),
          events: [],
          summary: {
            eventCount: 0,
            recovered: false,
            loadCompleted: false,
            runtimeLoaded: false,
            sharedResolved: false,
            preloaded: false,
            componentLoaded: false,
            outcome: "pending",
            lastPhase: void 0,
            phases: {},
            shared: void 0,
            flags: createEmptyPhaseCollection().flags,
            error: void 0
          }
        };
        reports.set(event.traceId, report);
      }
      if (event.instanceRef) {
        report.instanceRef = event.instanceRef;
      }
      if (event.requestId) {
        report.requestId = event.requestId;
      }
      if (event.requestAlias) {
        report.requestAlias = event.requestAlias;
      }
      if (event.hostName) {
        report.hostName = event.hostName;
      }
      if (event.runtimeVersion) {
        report.runtimeVersion = event.runtimeVersion;
      }
      if (event.remote) {
        report.remote = { ...event.remote };
      }
      if (event.shared) {
        report.shared = copyEvent(event).shared;
      }
      if (event.expose) {
        report.expose = event.expose;
      }
      if (event.sanitizedUrl) {
        report.sanitizedUrl = event.sanitizedUrl;
      }
      if (event.errorStack) {
        report.errorStack = event.errorStack;
      }
      if (event.errorCode) {
        report.errorCode = event.errorCode;
      }
      if (event.errorName) {
        report.errorName = event.errorName;
      }
      if (event.errorMessage) {
        report.errorMessage = event.errorMessage;
      }
      if (event.ownerHint) {
        report.ownerHint = event.ownerHint;
      }
      if (event.retryable !== void 0) {
        report.retryable = event.retryable;
      }
      if (event.errorContext) {
        report.errorContext = { ...event.errorContext };
      }
      if (event.loadedBefore) {
        report.loadedBefore = copyLoadedBeforeInfo(event.loadedBefore);
      }
      report.events.push(event);
      report.updatedAt = event.timestamp;
      report.duration = Math.max(0, report.updatedAt - report.startedAt);
      const eventOutcome = getEventOutcome(event);
      if (eventOutcome === "error") {
        report.status = "error";
        if (shouldReplaceFailedPhase(report, event)) {
          report.failedPhase = event.phase;
        }
      } else if (eventOutcome === "recovered") {
        report.status = "success";
      } else if (eventOutcome === "success" && report.status !== "error") {
        report.status = "success";
      }
      refreshReportDerivedFields(report);
      latestTraceId = event.traceId;
      if (event.instanceRef) {
        latestTraceByInstance.set(event.instanceRef, event.traceId);
      }
      trimEvents(report);
      return report;
    };
    const notifyEvent = (event, report, origin) => {
      try {
        options.onEvent?.(copyEvent(event), copyReport(report), {
          origin,
          instanceRef: event.instanceRef
        });
      } catch {
      }
    };
    const notifyReport = (report, origin) => {
      if (report.events[report.events.length - 1]?.status === "start") {
        return;
      }
      try {
        options.onReport?.(copyReport(report), {
          origin,
          instanceRef: report.instanceRef
        });
      } catch {
      }
    };
    const notifyRawError = (errorValue, event, report, origin) => {
      if (!errorValue || !options.onRawError) {
        return;
      }
      try {
        options.onRawError(errorValue, {
          origin,
          instanceRef: event.instanceRef,
          event: copyEvent(event),
          report: copyReport(report)
        });
      } catch {
      }
    };
    const notifyCollector = (event, report) => {
      if (!collectorOptions) {
        return;
      }
      const fetcher = globalThis.fetch;
      if (typeof fetcher !== "function") {
        return;
      }
      try {
        const body = JSON.stringify({
          schemaVersion: 1,
          source: "browser",
          kind: "event",
          createdAt: Date.now(),
          event: copyEvent(event),
          report: copyReport(report)
        });
        void fetcher(getCollectorUrl(collectorOptions.port), {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body,
          keepalive: body.length <= 64 * 1024,
          credentials: "omit",
          mode: "cors"
        }).catch((error) => {
          logger2.debug("Failed to notify local observability collector.", error);
        });
      } catch (error) {
        logger2.debug("Failed to notify local observability collector.", error);
      }
    };
    const notifyDevtools = (event, report) => {
      if (!devtoolsOptions) {
        return;
      }
      const poster = globalThis.postMessage;
      if (typeof poster !== "function") {
        return;
      }
      try {
        poster.call(
          globalThis,
          {
            schemaVersion: 1,
            source: devtoolsOptions.source,
            kind: "event",
            createdAt: Date.now(),
            scope: browserGlobalScope || report.hostName,
            event: copyEvent(event),
            report: copyReport(report)
          },
          "*"
        );
      } catch {
      }
    };
    const createStateRemote = (value, fallbackName) => {
      if (typeof value === "string") {
        return {
          name: fallbackName || sanitizeText(value, 120) || "unknown",
          entry: sanitizeUrl(value)
        };
      }
      if (!isRecord2(value)) {
        return fallbackName ? { name: fallbackName } : void 0;
      }
      const name = sanitizeText(getObjectValue(value, "name"), 120) || sanitizeText(fallbackName, 120);
      if (!name) {
        return void 0;
      }
      return omitUndefinedFields({
        name,
        alias: sanitizeText(getObjectValue(value, "alias"), 120),
        version: sanitizeText(getObjectValue(value, "version"), 120),
        entry: sanitizeUrl(
          sanitizeText(
            getObjectValue(value, "entry") || getObjectValue(value, "remoteEntry") || getObjectValue(value, "manifestUrl"),
            320
          )
        ),
        entryGlobalName: sanitizeText(
          getObjectValue(value, "entryGlobalName") || getObjectValue(value, "globalName"),
          120
        ),
        type: sanitizeText(getObjectValue(value, "type"), 80)
      });
    };
    const getDeclaredRemotes = (origin) => {
      const remotes = origin.options?.remotes;
      const values = Array.isArray(remotes) ? remotes.map((value) => [void 0, value]) : isRecord2(remotes) ? Object.entries(remotes) : [];
      return values.map(([name, value]) => createStateRemote(value, name)).filter(
        (remote) => remote !== void 0
      );
    };
    const getLoadedProducerRemotes = (origin) => getModuleCacheEntries(origin.moduleCache).map(
      (module) => createStateRemote(
        isRecord2(module) ? getObjectValue(module, "remoteInfo") : void 0
      )
    ).filter(
      (remote) => remote !== void 0
    );
    const getShareScopeSummaries = (origin) => Object.entries(getOriginShareScopeMap(origin)).map(([name, scope]) => {
      const sharedNames = Object.keys(scope || {}).sort();
      return {
        name: sanitizeText(name, 120) || "default",
        sharedCount: sharedNames.length,
        sharedNames,
        shared: sharedNames.map((sharedName) => ({
          name: sharedName,
          versions: Object.entries(scope?.[sharedName] || {}).map(
            ([version, shared]) => omitUndefinedFields({
              version: sanitizeText(version, 120) || version,
              provider: sanitizeText(shared.from, 160),
              loaded: shared.loaded === true || void 0,
              singleton: shared.shareConfig?.singleton || void 0,
              eager: shared.shareConfig?.eager || void 0
            })
          )
        }))
      };
    });
    const getBridgeSummary = (origin) => {
      if (!isRecord2(origin.bridgeHook)) {
        return void 0;
      }
      const lifecycle = getObjectValue(origin.bridgeHook, "lifecycle");
      return {
        available: true,
        lifecycleCount: isRecord2(lifecycle) ? Object.keys(lifecycle).length : void 0
      };
    };
    const getRuntimeModuleInfo = () => {
      const moduleInfo = getFederationGlobal()?.moduleInfo || {};
      return Object.entries(moduleInfo).map(([key, value]) => {
        const record = isRecord2(value) ? value : {};
        const rawRemotes = getObjectValue(record, "remotes");
        const remoteValues = Array.isArray(rawRemotes) ? rawRemotes.map((remote) => [void 0, remote]) : isRecord2(rawRemotes) ? Object.entries(rawRemotes) : [];
        const remotes = remoteValues.map(([name, remote]) => createStateRemote(remote, name)).filter(
          (remote) => remote !== void 0
        );
        return omitUndefinedFields({
          key: sanitizeText(key, 160) || key,
          name: sanitizeText(getObjectValue(record, "name"), 120),
          version: sanitizeText(
            getObjectValue(record, "version") || getObjectValue(record, "buildVersion"),
            120
          ),
          entry: sanitizeUrl(
            sanitizeText(
              getObjectValue(record, "entry") || getObjectValue(record, "remoteEntry") || getObjectValue(record, "manifestUrl"),
              320
            )
          ),
          tag: sanitizeText(getObjectValue(record, "tag"), 120),
          remotes: remotes.length ? remotes : void 0
        });
      }).slice(0, MAX_MODULE_INFO_ENTRIES);
    };
    const getRuntimeFrame = () => {
      try {
        return typeof window === "undefined" ? void 0 : window === window.top ? "top" : "child";
      } catch {
        return "child";
      }
    };
    const getRuntimeStateSnapshot = () => {
      const activeInstances = getActiveRuntimeInstances();
      activeInstances.forEach((instance) => registerRuntimeInstance(instance));
      const moduleInfo = getRuntimeModuleInfo();
      const instanceOrigins = Array.from(instancesByRef.entries());
      const instanceDrafts = instanceOrigins.map(([instanceRef, origin]) => ({
        instanceRef,
        origin,
        name: sanitizeText(origin.name, 120) || sanitizeText(origin.options?.name, 120),
        optionsName: sanitizeText(origin.options?.name, 120),
        optionsVersion: sanitizeText(origin.options?.version, 120),
        runtimeVersion: sanitizeText(origin.version, 80),
        remotes: getDeclaredRemotes(origin),
        loadedProducers: getLoadedProducerRemotes(origin),
        consumerEvidence: [],
        producerEvidence: []
      }));
      instanceDrafts.forEach((draft) => {
        const matchingModuleInfo = moduleInfo.filter((info) => {
          const names = [draft.name, draft.optionsName].filter(
            (name) => Boolean(name)
          );
          return names.some(
            (name) => info.name === name || info.key === name || info.key.includes(name) && (!draft.optionsVersion || info.version === draft.optionsVersion || info.key.includes(draft.optionsVersion))
          );
        });
        if (draft.remotes.length) {
          draft.consumerEvidence.push("options.remotes");
        }
        if (draft.loadedProducers.length) {
          draft.consumerEvidence.push("moduleCache.remoteInfo");
        }
        if (matchingModuleInfo.some((info) => info.remotes?.length)) {
          draft.consumerEvidence.push("moduleInfo.remotes");
        }
        if (matchingModuleInfo.length) {
          draft.producerEvidence.push("moduleInfo");
        }
      });
      const relationships = [];
      instanceDrafts.forEach((consumer) => {
        consumer.loadedProducers.forEach((remote) => {
          const matchingModuleInfo = moduleInfo.filter(
            (info) => info.name === remote.name || info.key === remote.name || Boolean(remote.entry && info.entry === remote.entry) || Boolean(remote.version && info.version === remote.version)
          );
          const candidates = instanceDrafts.filter((producer) => {
            if (producer.instanceRef === consumer.instanceRef) {
              return false;
            }
            const names = new Set(
              [producer.name, producer.optionsName].filter(
                (name) => Boolean(name)
              )
            );
            const directNameMatches = names.has(remote.name) || Boolean(remote.alias && names.has(remote.alias));
            const moduleInfoMatches = matchingModuleInfo.some(
              (info) => Boolean(info.name && names.has(info.name)) || names.has(info.key) || Boolean(info.version && producer.optionsVersion === info.version)
            );
            const versionMatches = !remote.version || !producer.optionsVersion || producer.optionsVersion === remote.version;
            return (directNameMatches || moduleInfoMatches) && versionMatches;
          });
          const status = candidates.length === 1 ? "resolved" : candidates.length > 1 ? "ambiguous" : "unresolved";
          candidates.forEach((candidate) => {
            if (!candidate.producerEvidence.includes("consumer.moduleCache")) {
              candidate.producerEvidence.push("consumer.moduleCache");
            }
          });
          relationships.push(
            omitUndefinedFields({
              consumerInstanceRef: consumer.instanceRef,
              producerInstanceRef: candidates.length === 1 ? candidates[0].instanceRef : void 0,
              candidateProducerInstanceRefs: candidates.length > 1 ? candidates.map((candidate) => candidate.instanceRef) : void 0,
              remote,
              evidence: ["moduleCache.remoteInfo"],
              status
            })
          );
        });
      });
      const instances = instanceDrafts.map(
        (draft) => {
          const isConsumer = draft.consumerEvidence.length > 0;
          const isProducer = draft.producerEvidence.length > 0;
          const role = isConsumer && isProducer ? "mixed" : isConsumer ? "consumer" : isProducer ? "producer" : "unknown";
          return omitUndefinedFields({
            instanceRef: draft.instanceRef,
            name: draft.name,
            optionsName: draft.optionsName,
            optionsVersion: draft.optionsVersion,
            runtimeVersion: draft.runtimeVersion,
            role,
            roleEvidence: {
              consumer: [...draft.consumerEvidence],
              producer: [...draft.producerEvidence]
            },
            remotes: draft.remotes,
            loadedProducers: draft.loadedProducers,
            shareScopes: getShareScopeSummaries(draft.origin),
            bridge: getBridgeSummary(draft.origin),
            active: activeInstances.includes(
              draft.origin
            )
          });
        }
      );
      const hasLateBinding = lateBoundInstanceRefs.size > 0;
      const hasIncompleteHistory = hasLateBinding || historyCleared;
      const hasStableSharedRuntime = instanceDrafts.some(
        (draft) => supportsRuntimeObservability(draft.origin)
      );
      const hasSharedState = instances.some(
        (instance) => instance.shareScopes.length > 0
      );
      const hasRemoteSignals = events.some((event) => Boolean(event.remote));
      const hasSharedSignals = events.some((event) => Boolean(event.shared));
      const hasBridge = instances.some((instance) => instance.bridge?.available);
      const traceCompleteness = hasIncompleteHistory ? "partial" : "complete";
      return omitUndefinedFields({
        schemaVersion: 1,
        observedAt: Date.now(),
        scope: {
          name: browserGlobalScope || normalizeScope(options.browser?.scope),
          realm: "current",
          frame: getRuntimeFrame()
        },
        completeness: {
          currentState: "complete",
          history: hasIncompleteHistory ? "partial" : "complete",
          historyCleared,
          lateBoundInstanceRefs: Array.from(lateBoundInstanceRefs),
          recommendation: hasIncompleteHistory ? "Reload or reopen the page to capture complete runtime history." : void 0
        },
        capabilities: {
          instanceState: {
            available: true,
            completeness: "complete"
          },
          remoteTrace: {
            available: hasRemoteSignals || boundInstanceRefs.size > 0,
            completeness: traceCompleteness,
            reason: hasRemoteSignals ? void 0 : "No remote lifecycle signal has been observed yet."
          },
          sharedState: {
            available: hasSharedState,
            completeness: hasSharedState ? "complete" : "unavailable"
          },
          sharedTrace: {
            available: hasStableSharedRuntime && hasSharedSignals,
            completeness: hasStableSharedRuntime && hasSharedSignals ? traceCompleteness : "unavailable",
            reason: hasStableSharedRuntime ? hasSharedSignals ? void 0 : "No shared lifecycle signal has been observed yet." : "Shared tracing requires a stable runtime version of 2.5.0 or newer."
          },
          bridgeTrace: {
            available: false,
            completeness: "unavailable",
            reason: hasBridge ? "Bridge is present, but no complete Bridge trace signal is available." : "Bridge is not present on an observed instance."
          }
        },
        instances,
        relationships,
        moduleInfo
      });
    };
    const getEventsSnapshot = () => events.map(copyEvent);
    const getTraceIdsSnapshot = () => Array.from(reports.keys());
    const getReportTimeline = () => Array.from(reports.values()).sort((left, right) => {
      if (right.updatedAt !== left.updatedAt) {
        return right.updatedAt - left.updatedAt;
      }
      return right.startedAt - left.startedAt;
    });
    const matchesReportValue = (value, expected) => {
      if (!value || !expected) {
        return false;
      }
      const normalizedValue = value.toLowerCase();
      const normalizedExpected = expected.toLowerCase();
      return normalizedValue === normalizedExpected || normalizedValue.includes(normalizedExpected);
    };
    const matchesReportQuery = (report, query) => {
      if (query.traceId && report.traceId !== query.traceId) {
        return false;
      }
      if (query.instanceRef && report.instanceRef !== query.instanceRef) {
        return false;
      }
      if (query.status && report.status !== query.status) {
        return false;
      }
      if (query.outcome && report.summary.outcome !== query.outcome) {
        return false;
      }
      if (query.remote && ![
        report.remote?.name,
        report.remote?.alias,
        report.remote?.entry,
        report.requestId,
        report.requestAlias,
        report.sanitizedUrl
      ].some((value) => matchesReportValue(value, query.remote))) {
        return false;
      }
      if (query.expose && ![report.expose, report.requestId].some(
        (value) => matchesReportValue(value, query.expose)
      )) {
        return false;
      }
      if (query.shared && ![report.shared?.name].some(
        (value) => matchesReportValue(value, query.shared)
      )) {
        return false;
      }
      return true;
    };
    const getReportsSnapshot = (options2 = {}) => {
      const limit = normalizeQueryLimit(options2.limit);
      const timeline = getReportTimeline();
      return (limit ? timeline.slice(0, limit) : timeline).map(copyReport);
    };
    const findReportsSnapshot = (query = {}) => {
      const limit = normalizeQueryLimit(query.limit);
      const matchedReports = getReportTimeline().filter(
        (report) => matchesReportQuery(report, query)
      );
      return (limit ? matchedReports.slice(0, limit) : matchedReports).map(
        copyReport
      );
    };
    const getLatestReportSnapshot = () => {
      if (!latestTraceId) {
        return void 0;
      }
      const report = reports.get(latestTraceId);
      return report ? copyReport(report) : void 0;
    };
    const getReportSnapshot = (traceId) => {
      const report = reports.get(traceId);
      return report ? copyReport(report) : void 0;
    };
    const exportReportSnapshot = (traceId) => traceId ? getReportSnapshot(traceId) : getLatestReportSnapshot();
    const openRuntimeAdapter = createOpenRuntimeObservabilityAdapter(
      options.openRuntime,
      {
        getReports: getReportsSnapshot,
        findReports: findReportsSnapshot,
        getLatestReport: getLatestReportSnapshot,
        getReport: getReportSnapshot,
        exportReport: exportReportSnapshot,
        getRuntimeState: getRuntimeStateSnapshot
      }
    );
    const createBrowserReader = () => ({
      getEvents: getEventsSnapshot,
      getTraceIds: getTraceIdsSnapshot,
      getReports: getReportsSnapshot,
      findReports: findReportsSnapshot,
      getLatestReport: getLatestReportSnapshot,
      getReport: getReportSnapshot,
      exportReport: exportReportSnapshot,
      getRuntimeState: getRuntimeStateSnapshot
    });
    const shouldExposeBrowserGlobal = () => options.browser?.enabled === true;
    const ensureBrowserGlobal = (origin) => {
      if (!shouldExposeBrowserGlobal()) {
        return;
      }
      const federationGlobal = getFederationGlobal();
      if (!federationGlobal) {
        return;
      }
      const scope = normalizeScope(
        options.browser?.scope || origin?.options?.name || "default"
      );
      const reader = createBrowserReader();
      const readers = federationGlobal.__OBSERVABILITY__ || {};
      federationGlobal.__OBSERVABILITY__ = readers;
      browserGlobalScope = scope;
      try {
        Object.defineProperty(readers, scope, {
          value: reader,
          configurable: true,
          enumerable: true
        });
      } catch {
        readers[scope] = reader;
      }
    };
    const shouldUseConsole = () => options.console !== false;
    const shouldUseDevelopmentChannels = () => {
      if (shouldUseMinimalBrowserConsole()) {
        return false;
      }
      if (shouldForceDevelopmentChannels) {
        return true;
      }
      if (typeof process === "undefined" || !process.env) {
        return true;
      }
      return true;
    };
    const shouldNotifyCollector = () => Boolean(collectorOptions);
    const shouldNotifyDevtools = () => shouldUseDevelopmentChannels();
    const shouldUseMinimalBrowserConsole = () => options.browser?.mode === "production";
    const shouldUseStartTrace = () => options.trace?.printStart ?? (options.browser?.enabled === true && !shouldUseMinimalBrowserConsole());
    const shouldPrintStartConsole = (event) => shouldUseStartTrace() && event.status === "start" && (event.phase === "loadRemote" || event.phase === "shared") && shouldUseConsole();
    const shouldRecordStartTrace = (input) => shouldUseStartTrace() && input.status === "start" && (input.phase === "loadRemote" || input.phase === "shared");
    const shouldCollectLoadedBefore = (error) => Boolean(error) || level === "verbose" && !shouldUseMinimalBrowserConsole();
    const getBrowserReadCommand = (traceId) => {
      if (!browserGlobalScope) {
        return void 0;
      }
      return `window.__FEDERATION__.__OBSERVABILITY__[${JSON.stringify(
        browserGlobalScope
      )}].getReport(${JSON.stringify(traceId)})`;
    };
    const emitConsoleHint = (event, report, rawError) => {
      if (getEventOutcome(event) !== "error" || !shouldUseConsole() || consoleReportedTraceIds.has(report.traceId)) {
        return;
      }
      consoleReportedTraceIds.add(report.traceId);
      if (shouldUseMinimalBrowserConsole()) {
        const lines2 = [
          "[Module Federation] Observability report generated",
          `traceId: ${report.traceId}`
        ];
        if (report.errorCode) {
          lines2.push(`errorCode: ${report.errorCode}`);
        }
        try {
          console.error(lines2.join("\n"));
        } catch {
        }
        return;
      }
      const lines = [
        "[Module Federation] Observability report generated",
        `traceId: ${report.traceId}`,
        `phase: ${report.failedPhase || event.phase}`
      ];
      if (report.requestId) {
        lines.push(`requestId: ${report.requestId}`);
      }
      if (report.requestAlias) {
        lines.push(`requestAlias: ${report.requestAlias}`);
      }
      if (report.errorCode) {
        lines.push(`errorCode: ${report.errorCode}`);
      }
      if (report.shared?.name) {
        lines.push(`shared: ${report.shared.name}`);
      }
      const browserReadCommand = getBrowserReadCommand(report.traceId);
      if (browserReadCommand) {
        lines.push(`read: ${browserReadCommand}`);
      } else {
        lines.push("read: enable browser output or use onReport(report)");
      }
      const rawStack = getRawStack(rawError);
      if (options.printRawStack === true && rawStack) {
        lines.push("rawStack:", rawStack);
      }
      try {
        console.error(lines.join("\n"));
      } catch {
      }
    };
    const emitStartConsoleHint = (event, report) => {
      if (!shouldPrintStartConsole(event)) {
        return;
      }
      const startKey = [
        event.traceId,
        event.phase,
        event.requestId || event.shared?.name || event.remote?.name || "",
        event.lifecycle || ""
      ].join("|");
      if (consoleReportedStartKeys.has(startKey)) {
        return;
      }
      consoleReportedStartKeys.add(startKey);
      const lines = [
        "[Module Federation] Observability trace started",
        `traceId: ${report.traceId}`,
        `phase: ${event.phase}`
      ];
      if (event.requestId) {
        lines.push(`requestId: ${event.requestId}`);
      }
      if (event.requestAlias) {
        lines.push(`requestAlias: ${event.requestAlias}`);
      }
      if (event.remote?.name) {
        lines.push(`remote: ${event.remote.name}`);
      }
      if (event.shared?.name) {
        lines.push(`shared: ${event.shared.name}`);
      }
      if (event.lifecycle) {
        lines.push(`lifecycle: ${event.lifecycle}`);
      }
      const browserReadCommand = getBrowserReadCommand(report.traceId);
      if (browserReadCommand) {
        lines.push(`read: ${browserReadCommand}`);
      } else {
        lines.push(
          "read: enable browser output or use getReports({ limit: 10 })"
        );
      }
      try {
        console.info(lines.join("\n"));
      } catch {
      }
    };
    const prepareOutputChannels = (origin) => {
      browserGlobalScope = void 0;
      ensureBrowserGlobal(origin);
    };
    const prepareRuntimeOrigin = (origin) => {
      if (!isEnabled()) {
        return false;
      }
      lastRuntimeOrigin = origin;
      registerRuntimeInstance(origin);
      prepareOutputChannels(origin);
      return true;
    };
    const recordEvent = (input, origin) => {
      if (suppressRuntimeEvents) {
        return void 0;
      }
      const effectiveInput = {
        ...input,
        instanceRef: input.instanceRef || getInstanceRef(origin)
      };
      const traceId = resolveTraceId(effectiveInput);
      const event = normalizeEvent2(effectiveInput, traceId, origin);
      applyPhaseDuration(event);
      updateTraceMaps(event);
      if (!shouldRecordEvent(level, effectiveInput) && !shouldRecordStartTrace(effectiveInput)) {
        return void 0;
      }
      events.push(event);
      const report = updateReport(event);
      openRuntimeAdapter?.syncReport(report, {
        origin,
        instanceRef: event.instanceRef
      });
      emitStartConsoleHint(event, report);
      emitConsoleHint(event, report, input.error);
      if (shouldNotifyCollector()) {
        notifyCollector(event, report);
      }
      if (shouldNotifyDevtools()) {
        notifyDevtools(event, report);
      }
      notifyRawError(effectiveInput.error, event, report, origin);
      notifyEvent(event, report, origin);
      notifyReport(report, origin);
      return event;
    };
    const markComponentLoadedFor = (markOptions = {}, origin) => {
      if (options.enabled === false || !runtimeObservabilityEnabled) {
        return void 0;
      }
      const instanceRef = getInstanceRef(origin);
      const traceId = markOptions.traceId || (markOptions.requestId ? traceByRequest.get(
        getTraceMapKey(
          instanceRef,
          sanitizeRequestId(markOptions.requestId) || ""
        )
      ) : void 0) || (instanceRef ? latestTraceByInstance.get(instanceRef) : latestTraceId) || createTraceId({
        phase: "component",
        status: "success",
        requestId: markOptions.requestId
      });
      return recordEvent(
        {
          traceId,
          instanceRef,
          phase: "component",
          status: "success",
          requestId: markOptions.requestId,
          componentName: markOptions.componentName,
          metadata: markOptions.metadata,
          eventName: COMPONENT_BUSINESS_LOADED_EVENT,
          message: COMPONENT_BUSINESS_LOADED_EVENT,
          source: "business"
        },
        origin
      );
    };
    const markComponentLoaded = (markOptions = {}) => markComponentLoadedFor(markOptions, lastRuntimeOrigin);
    const getReactForOrigin = async (origin) => {
      const previousSuppressRuntimeEvents = suppressRuntimeEvents;
      suppressRuntimeEvents = true;
      try {
        let reactFactory;
        try {
          reactFactory = origin.loadShareSync?.("react");
        } catch {
          reactFactory = void 0;
        }
        if (typeof reactFactory !== "function") {
          reactFactory = await origin.loadShare?.("react");
        }
        if (typeof reactFactory !== "function") {
          return void 0;
        }
        return resolveReactLike(reactFactory());
      } catch {
        return void 0;
      } finally {
        suppressRuntimeEvents = previousSuppressRuntimeEvents;
      }
    };
    const getReactWrapPolicy = (loadArgs) => {
      if (options.react?.enabled === false || options.react?.injectLoadedCallback !== true) {
        return void 0;
      }
      const remoteIds = options.react.remoteIds || [];
      if (!remoteIds.length) {
        return {
          allowAnonymousComponent: false
        };
      }
      const normalizeRemoteId = (value) => value.replace(/\/\.\//g, "/").replace(/^\.\//, "");
      const expectedRemoteIds = new Set(remoteIds.map(normalizeRemoteId));
      const candidates = /* @__PURE__ */ new Set();
      const addCandidate = (value) => {
        if (!value) {
          return;
        }
        candidates.add(value);
        candidates.add(normalizeRemoteId(value));
      };
      const exposeValues = [loadArgs.expose];
      if (loadArgs.expose?.startsWith("./")) {
        exposeValues.push(loadArgs.expose.slice(2));
      }
      const remoteNames = [
        loadArgs.pkgNameOrAlias,
        loadArgs.remote?.alias,
        loadArgs.remote?.name
      ];
      addCandidate(loadArgs.id);
      addCandidate(loadArgs.expose);
      remoteNames.forEach((remoteName) => {
        exposeValues.forEach((expose) => {
          addCandidate(remoteName && expose ? `${remoteName}/${expose}` : "");
        });
      });
      const matched = Array.from(candidates).some(
        (candidate) => expectedRemoteIds.has(candidate)
      );
      return matched ? {
        allowAnonymousComponent: true
      } : void 0;
    };
    const createReactComponentWrapper = (component, loadArgs, wrapPolicy, react) => {
      const target = resolveReactComponentTarget(
        component,
        options.react?.defaultExportMode || (wrapPolicy.allowAnonymousComponent ? "component" : "preserve"),
        wrapPolicy.allowAnonymousComponent
      );
      if (!target) {
        return void 0;
      }
      const componentName = getReactComponentName(
        target.component,
        loadArgs.expose || loadArgs.id
      );
      const originalComponent = target.component;
      const ObservedRemoteComponent = (props) => {
        const incomingProps = isRecord2(props) ? props : {};
        const originalLoadedCallback = getObjectValue(
          incomingProps,
          ON_MF_REMOTE_LOADED_PROP
        );
        const onMFRemoteLoaded = (loadedOptions = {}) => {
          markComponentLoadedFor(
            {
              requestId: loadArgs.id,
              componentName: loadedOptions.componentName || componentName,
              metadata: loadedOptions.metadata
            },
            loadArgs.origin
          );
          if (typeof originalLoadedCallback === "function") {
            originalLoadedCallback(loadedOptions);
          }
        };
        const nextProps = {
          ...incomingProps,
          [ON_MF_REMOTE_LOADED_PROP]: onMFRemoteLoaded
        };
        if (react) {
          return react.createElement(originalComponent, nextProps);
        }
        return originalComponent(nextProps);
      };
      ObservedRemoteComponent.displayName = `ObservedRemote(${componentName})`;
      copyComponentStatics(
        ObservedRemoteComponent,
        originalComponent
      );
      return target.createResult(ObservedRemoteComponent);
    };
    const wrapReactComponent = async (component, loadArgs) => {
      const wrapPolicy = getReactWrapPolicy(loadArgs);
      if (!wrapPolicy) {
        return void 0;
      }
      return createReactComponentWrapper(
        component,
        loadArgs,
        wrapPolicy,
        await getReactForOrigin(loadArgs.origin)
      );
    };
    const wrapReactComponentFactory = async (factory, loadArgs) => {
      const wrapPolicy = getReactWrapPolicy(loadArgs);
      if (!wrapPolicy || typeof factory !== "function") {
        return void 0;
      }
      const react = await getReactForOrigin(loadArgs.origin);
      const originalFactory = factory;
      return (...factoryArgs) => {
        const moduleOrPromise = originalFactory(...factoryArgs);
        if (moduleOrPromise && typeof moduleOrPromise.then === "function") {
          return moduleOrPromise.then((module) => {
            return createReactComponentWrapper(module, loadArgs, wrapPolicy, react) || module;
          });
        }
        return createReactComponentWrapper(
          moduleOrPromise,
          loadArgs,
          wrapPolicy,
          react
        ) || moduleOrPromise;
      };
    };
    const legacyHooks = {
      beforeRequest(args) {
        const requestArgs = args;
        if (!prepareRuntimeOrigin(requestArgs.origin)) {
          return returnHookArgs(args);
        }
        const remote = resolveRemoteFromRequestId(
          requestArgs.id,
          requestArgs.options
        );
        recordEvent(
          {
            phase: "loadRemote",
            status: "start",
            requestId: requestArgs.id,
            remote,
            lifecycle: "beforeRequest",
            message: "remote:load-start"
          },
          requestArgs.origin
        );
        return returnHookArgs(args);
      },
      afterMatchRemote(args) {
        const matchArgs = args;
        if (!prepareRuntimeOrigin(matchArgs.origin)) {
          return;
        }
        const remote = createRemoteInfo(matchArgs.remoteInfo || matchArgs.remote);
        const hostRemotes = getHostRemotesSummary(matchArgs.options);
        recordEvent(
          {
            phase: "matchRemote",
            status: matchArgs.error ? "error" : "success",
            requestId: matchArgs.id,
            lifecycle: "afterMatchRemote",
            expose: matchArgs.expose,
            remote,
            message: matchArgs.error ? "remote:match-failed" : "remote:matched",
            error: matchArgs.error,
            errorContext: hostRemotes ? {
              hostRemotes
            } : void 0
          },
          matchArgs.origin
        );
      },
      beforeLoadRemoteSnapshot(args) {
        const snapshotArgs = args;
        prepareRuntimeOrigin(snapshotArgs.origin);
      },
      loadSnapshot(args) {
        if (!isEnabled()) {
          return returnHookArgs(args);
        }
        const snapshotArgs = args;
        const moduleRemote = createRemoteInfo(snapshotArgs.moduleInfo);
        const snapshotRemoteEntry = snapshotArgs.remoteSnapshot?.remoteEntry || snapshotArgs.remoteSnapshot?.entry;
        const manifestUrl = isManifestUrl(moduleRemote?.entry) ? moduleRemote?.entry : isManifestUrl(snapshotRemoteEntry) ? snapshotRemoteEntry : void 0;
        if (!manifestUrl) {
          return returnHookArgs(args);
        }
        const remote = createRemoteInfo({
          name: moduleRemote?.name || sanitizeText(snapshotArgs.remoteSnapshot?.name, 120),
          alias: moduleRemote?.alias,
          entry: manifestUrl,
          entryGlobalName: moduleRemote?.entryGlobalName || sanitizeText(snapshotArgs.remoteSnapshot?.entryGlobalName, 120),
          type: moduleRemote?.type || sanitizeText(snapshotArgs.remoteSnapshot?.type, 80)
        });
        if (seenManifestUrls.has(manifestUrl)) {
          recordEvent(
            {
              phase: "manifest",
              status: "success",
              requestId: manifestUrl,
              remote,
              url: manifestUrl,
              lifecycle: "loadSnapshot",
              message: "manifest:cached",
              cached: true
            },
            lastRuntimeOrigin
          );
          return returnHookArgs(args);
        }
        if (loadingManifestUrls.has(manifestUrl)) {
          return returnHookArgs(args);
        }
        loadingManifestUrls.add(manifestUrl);
        recordEvent(
          {
            phase: "manifest",
            status: "start",
            requestId: manifestUrl,
            remote,
            url: manifestUrl,
            lifecycle: "loadSnapshot",
            message: "manifest:load-start"
          },
          lastRuntimeOrigin
        );
        return returnHookArgs(args);
      },
      loadRemoteSnapshot(args) {
        if (options.enabled === false) {
          return returnHookArgs(args);
        }
        const snapshotArgs = args;
        if (snapshotArgs.from !== "manifest") {
          return returnHookArgs(args);
        }
        const manifestUrl = sanitizeUrl(snapshotArgs.manifestUrl) || sanitizeUrl(snapshotArgs.moduleInfo?.entry);
        const remote = createRemoteInfo({
          ...snapshotArgs.moduleInfo,
          entry: manifestUrl || snapshotArgs.moduleInfo?.entry
        });
        const cached = Boolean(manifestUrl && seenManifestUrls.has(manifestUrl));
        recordEvent(
          {
            phase: "manifest",
            status: "success",
            requestId: manifestUrl,
            remote,
            url: manifestUrl,
            lifecycle: "loadRemoteSnapshot",
            message: "manifest:resolved",
            cached
          },
          lastRuntimeOrigin
        );
        if (manifestUrl) {
          loadingManifestUrls.delete(manifestUrl);
          seenManifestUrls.add(manifestUrl);
        }
        return returnHookArgs(args);
      },
      afterResolve(args) {
        const resolveArgs = args;
        if (!prepareRuntimeOrigin(resolveArgs.origin)) {
          return returnHookArgs(args);
        }
        const remote = createRemoteInfo(
          resolveArgs.remoteInfo || resolveArgs.remote
        );
        if (!isManifestUrl(remote?.entry)) {
          return returnHookArgs(args);
        }
        return returnHookArgs(args);
      },
      async onLoad(args) {
        const loadArgs = args;
        if (!prepareRuntimeOrigin(loadArgs.origin)) {
          return;
        }
        const wrappedComponent = typeof loadArgs.exposeModuleFactory === "function" ? await wrapReactComponentFactory(
          loadArgs.exposeModuleFactory,
          loadArgs
        ) : await wrapReactComponent(loadArgs.exposeModule, loadArgs);
        const remote = createRemoteInfo(loadArgs.remote);
        recordEvent(
          {
            phase: "loadRemote",
            status: "success",
            requestId: loadArgs.id,
            lifecycle: "onLoad",
            expose: loadArgs.expose,
            remote,
            message: "remote:loaded",
            loadedBefore: shouldCollectLoadedBefore() ? collectLoadedBeforeInfo(remote, loadArgs.expose, loadArgs.origin) : void 0
          },
          loadArgs.origin
        );
        if (wrappedComponent) {
          return wrappedComponent;
        }
        return void 0;
      },
      errorLoadRemote(args) {
        const errorArgs = args;
        if (!prepareRuntimeOrigin(errorArgs.origin) || errorArgs.lifecycle !== "onLoad" && errorArgs.lifecycle !== "beforeRequest" && errorArgs.lifecycle !== "afterResolve") {
          return void 0;
        }
        const isManifestError = errorArgs.lifecycle === "afterResolve";
        if (isManifestError && errorArgs.id) {
          loadingManifestUrls.delete(errorArgs.id);
        }
        const remote = createRemoteInfo(errorArgs.remote);
        recordEvent(
          {
            phase: isManifestError ? "manifest" : "loadRemote",
            status: "error",
            requestId: errorArgs.id,
            lifecycle: errorArgs.lifecycle,
            expose: errorArgs.expose,
            remote,
            url: isManifestError ? errorArgs.id : void 0,
            message: isManifestError ? "manifest:failed" : errorArgs.lifecycle ? `remote:${errorArgs.lifecycle}:failed` : "remote:failed",
            error: errorArgs.error,
            loadedBefore: collectLoadedBeforeInfo(
              remote,
              errorArgs.expose,
              errorArgs.origin
            )
          },
          errorArgs.origin
        );
        return void 0;
      },
      afterLoadRemote(args) {
        const loadArgs = args;
        if (!prepareRuntimeOrigin(loadArgs.origin)) {
          return;
        }
        const remote = createRemoteInfo(loadArgs.remote);
        recordEvent(
          {
            phase: "loadRemote",
            status: "complete",
            requestId: loadArgs.id,
            lifecycle: "afterLoadRemote",
            expose: loadArgs.expose,
            remote,
            message: loadArgs.recovered ? "remote:load-recovered" : loadArgs.error ? "remote:load-failed" : "remote:load-complete",
            error: loadArgs.error,
            recovered: loadArgs.recovered,
            loadedBefore: shouldCollectLoadedBefore(loadArgs.error) ? collectLoadedBeforeInfo(remote, loadArgs.expose, loadArgs.origin) : void 0
          },
          loadArgs.origin
        );
      },
      loadEntry(args) {
        const entryArgs = args;
        if (shouldSkipRuntimeHook(entryArgs.origin) || !prepareRuntimeOrigin(entryArgs.origin)) {
          return;
        }
        const remote = createRemoteInfo(entryArgs.remoteInfo);
        recordEvent(
          {
            phase: "remoteEntry",
            status: "start",
            requestId: remote?.name,
            remote,
            url: remote?.entry,
            lifecycle: "loadEntry",
            message: "remoteEntry:load-start"
          },
          entryArgs.origin
        );
      },
      afterLoadEntry(args) {
        const entryArgs = args;
        if (shouldSkipRuntimeHook(entryArgs.origin) || !prepareRuntimeOrigin(entryArgs.origin)) {
          return;
        }
        const remote = createRemoteInfo(entryArgs.remoteInfo);
        const remoteEntryKey = getRemoteEntryKey(sanitizeRemote(remote));
        const cached = entryArgs.cached === true || Boolean(remoteEntryKey && seenRemoteEntryKeys.has(remoteEntryKey));
        recordEvent(
          {
            phase: "remoteEntry",
            status: entryArgs.error ? "error" : "success",
            requestId: remote?.name,
            remote,
            url: remote?.entry,
            lifecycle: "afterLoadEntry",
            message: entryArgs.error ? "remoteEntry:load-failed" : entryArgs.recovered ? "remoteEntry:load-recovered" : "remoteEntry:loaded",
            error: entryArgs.error,
            recovered: entryArgs.recovered,
            cached
          },
          entryArgs.origin
        );
        if (!entryArgs.error && remoteEntryKey) {
          seenRemoteEntryKeys.add(remoteEntryKey);
        }
      },
      beforeInitRemote(args) {
        const initArgs = args;
        if (shouldSkipRuntimeHook(initArgs.origin) || !prepareRuntimeOrigin(initArgs.origin)) {
          return;
        }
        const remote = createRemoteInfo(initArgs.remoteInfo);
        recordEvent(
          {
            phase: "remoteEntryInit",
            status: "start",
            requestId: initArgs.id || remote?.name,
            remote,
            lifecycle: "beforeInitRemote",
            message: "remoteEntry:init-start"
          },
          initArgs.origin
        );
      },
      afterInitRemote(args) {
        const initArgs = args;
        if (shouldSkipRuntimeHook(initArgs.origin) || !prepareRuntimeOrigin(initArgs.origin)) {
          return;
        }
        const remote = createRemoteInfo(initArgs.remoteInfo);
        recordEvent(
          {
            phase: "remoteEntryInit",
            status: initArgs.error ? "error" : "success",
            requestId: initArgs.id || remote?.name,
            remote,
            lifecycle: "afterInitRemote",
            message: initArgs.error ? "remoteEntry:init-failed" : initArgs.cached ? "remoteEntry:init-reused" : "remoteEntry:initialized",
            error: initArgs.error,
            cached: initArgs.cached
          },
          initArgs.origin
        );
      },
      beforeGetExpose(args) {
        const exposeArgs = args;
        if (shouldSkipRuntimeHook(exposeArgs.origin) || !prepareRuntimeOrigin(exposeArgs.origin)) {
          return;
        }
        recordEvent(
          {
            phase: "expose",
            status: "start",
            requestId: exposeArgs.id,
            expose: exposeArgs.expose,
            remote: createRemoteInfo(exposeArgs.moduleInfo),
            lifecycle: "beforeGetExpose",
            message: "expose:get-start"
          },
          exposeArgs.origin
        );
      },
      afterGetExpose(args) {
        const exposeArgs = args;
        if (shouldSkipRuntimeHook(exposeArgs.origin) || !prepareRuntimeOrigin(exposeArgs.origin)) {
          return;
        }
        const remote = createRemoteInfo(exposeArgs.moduleInfo);
        recordEvent(
          {
            phase: "expose",
            status: exposeArgs.error ? "error" : "success",
            requestId: exposeArgs.id,
            expose: exposeArgs.expose,
            remote,
            lifecycle: "afterGetExpose",
            message: exposeArgs.error ? "expose:get-failed" : "expose:resolved",
            error: exposeArgs.error,
            loadedBefore: shouldCollectLoadedBefore(exposeArgs.error) ? collectLoadedBeforeInfo(
              remote,
              exposeArgs.expose,
              exposeArgs.origin
            ) : void 0
          },
          exposeArgs.origin
        );
      },
      beforeExecuteFactory(args) {
        const factoryArgs = args;
        if (shouldSkipRuntimeHook(factoryArgs.origin) || !prepareRuntimeOrigin(factoryArgs.origin)) {
          return;
        }
        recordEvent(
          {
            phase: "moduleFactory",
            status: "start",
            requestId: factoryArgs.id,
            expose: factoryArgs.expose,
            remote: createRemoteInfo(factoryArgs.moduleInfo),
            lifecycle: "beforeExecuteFactory",
            message: "moduleFactory:execute-start"
          },
          factoryArgs.origin
        );
      },
      afterExecuteFactory(args) {
        const factoryArgs = args;
        if (shouldSkipRuntimeHook(factoryArgs.origin) || !prepareRuntimeOrigin(factoryArgs.origin)) {
          return;
        }
        const remote = createRemoteInfo(factoryArgs.moduleInfo);
        recordEvent(
          {
            phase: "moduleFactory",
            status: factoryArgs.error ? "error" : "success",
            requestId: factoryArgs.id,
            expose: factoryArgs.expose,
            remote,
            lifecycle: "afterExecuteFactory",
            message: factoryArgs.error ? "moduleFactory:execute-failed" : "moduleFactory:executed",
            error: factoryArgs.error,
            loadedBefore: shouldCollectLoadedBefore(factoryArgs.error) ? collectLoadedBeforeInfo(
              remote,
              factoryArgs.expose,
              factoryArgs.origin
            ) : void 0
          },
          factoryArgs.origin
        );
      },
      beforeRegisterShare(args) {
        if (shouldGuardSharedHooksByRuntimeVersion && !supportsRuntimeHookObservability(args.origin)) {
          return returnHookArgs(args);
        }
        if (!prepareRuntimeOrigin(args.origin)) {
          return returnHookArgs(args);
        }
        const shareScopeMap = getOriginShareScopeMap(args.origin);
        const hostName = sanitizeText(args.origin.options?.name, 120) || sanitizeText(args.origin.name, 120);
        getSharedScopes(args.shared).forEach((scope) => {
          const conflict = createSharedSingletonConflict({
            pkgName: args.pkgName,
            shared: args.shared,
            scope,
            shareScopeMap
          });
          if (!conflict) {
            return;
          }
          const conflictKey = getSharedConflictKey({
            hostName,
            pkgName: args.pkgName,
            conflict
          });
          if (reportedSharedConflictKeys.has(conflictKey)) {
            return;
          }
          reportedSharedConflictKeys.add(conflictKey);
          recordEvent(
            {
              phase: "shared-conflict",
              status: "complete",
              requestId: `shared:${args.pkgName}`,
              lifecycle: "beforeRegisterShare",
              shared: createSharedConflictInfo({
                pkgName: args.pkgName,
                shared: args.shared,
                conflict
              }),
              message: `shared:${SHARED_SINGLETON_MULTIPLE_VERSIONS_REASON}`,
              metadata: {
                scope,
                currentVersion: conflict.currentVersion || "",
                versions: conflict.versions.join(","),
                existingVersions: conflict.existingVersions.map((item) => item.version).join(",")
              }
            },
            args.origin
          );
        });
        return returnHookArgs(args);
      },
      beforeLoadShare(args) {
        if (shouldGuardSharedHooksByRuntimeVersion && !supportsRuntimeHookObservability(args.origin)) {
          return returnHookArgs(args);
        }
        if (!prepareRuntimeOrigin(args.origin)) {
          return returnHookArgs(args);
        }
        recordEvent(
          {
            phase: "shared",
            status: "start",
            requestId: `shared:${args.pkgName}`,
            lifecycle: "loadShare",
            shared: createSharedInfo(args),
            message: "shared:load-start"
          },
          args.origin
        );
        return returnHookArgs(args);
      },
      afterLoadShare(args) {
        if (shouldGuardSharedHooksByRuntimeVersion && !supportsRuntimeHookObservability(args.origin)) {
          return returnHookArgs(args);
        }
        if (!prepareRuntimeOrigin(args.origin)) {
          return returnHookArgs(args);
        }
        recordEvent(
          {
            phase: "shared",
            status: "success",
            requestId: `shared:${args.pkgName}`,
            lifecycle: args.lifecycle,
            shared: createSharedInfo(args),
            message: args.lifecycle === "loadShareSync" ? "shared:resolved-sync" : "shared:resolved"
          },
          args.origin
        );
        return returnHookArgs(args);
      },
      errorLoadShare(args) {
        if (shouldGuardSharedHooksByRuntimeVersion && !supportsRuntimeHookObservability(args.origin)) {
          return returnHookArgs(args);
        }
        if (!prepareRuntimeOrigin(args.origin)) {
          return returnHookArgs(args);
        }
        const handledCustomShareMiss = args.recovered === true && !args.error;
        const reason = handledCustomShareMiss ? "custom-share-info-unmatched" : getSharedErrorReason(args);
        recordEvent(
          {
            phase: "shared",
            status: handledCustomShareMiss ? "complete" : "error",
            requestId: `shared:${args.pkgName}`,
            lifecycle: args.lifecycle,
            shared: createSharedInfo(args, reason),
            message: reason ? `shared:${reason}` : void 0,
            error: handledCustomShareMiss ? void 0 : args.error,
            recovered: args.recovered
          },
          args.origin
        );
        return returnHookArgs(args);
      }
    };
    if (!shouldDisablePreloadHooks) {
      legacyHooks.generatePreloadAssets = async (args) => {
        const preloadArgs = args;
        if (!prepareRuntimeOrigin(preloadArgs.origin)) {
          return continuePreloadAssetsGeneration();
        }
        const remote = createRemoteInfo(
          preloadArgs.remoteInfo || preloadArgs.remote
        );
        const preloadConfig = preloadArgs.preloadOptions?.preloadConfig;
        recordEvent(
          {
            phase: "preload",
            status: "start",
            requestId: remote?.name || sanitizeText(preloadConfig?.nameOrAlias, 160),
            remote,
            lifecycle: "generatePreloadAssets",
            message: "preload:assets-ready",
            metadata: clipObservabilityMetadata({
              nameOrAlias: preloadConfig?.nameOrAlias,
              exposes: preloadConfig?.exposes?.join(","),
              resourceCategory: preloadConfig?.resourceCategory,
              share: preloadConfig?.share,
              depsRemote: Array.isArray(preloadConfig?.depsRemote) ? "custom" : preloadConfig?.depsRemote
            })
          },
          preloadArgs.origin
        );
        return continuePreloadAssetsGeneration();
      };
      legacyHooks.afterPreloadRemote = (args) => {
        const preloadArgs = args;
        if (!prepareRuntimeOrigin(preloadArgs.origin)) {
          return void 0;
        }
        const results = preloadArgs.results || [];
        if (results.length === 0 && preloadArgs.error) {
          recordEvent(
            {
              phase: "preload",
              status: "error",
              requestId: "preloadRemote",
              lifecycle: "afterPreloadRemote",
              message: "preload:failed",
              error: preloadArgs.error
            },
            preloadArgs.origin
          );
          return void 0;
        }
        results.forEach((preloadResult) => {
          const remote = createRemoteInfo(
            preloadResult.remoteInfo || preloadResult.remote
          );
          const requestId = sanitizeRequestId(preloadResult.id) || remote?.name || sanitizeText(preloadResult.preloadConfig?.nameOrAlias, 160);
          preloadResult.results?.forEach((assetResult) => {
            const isError = assetResult.status === "error" || assetResult.status === "timeout";
            recordEvent(
              {
                phase: "preload",
                status: isError ? "error" : "success",
                requestId,
                remote,
                url: assetResult.url,
                cached: assetResult.status === "cached",
                lifecycle: "afterPreloadRemote",
                message: `preload:${assetResult.resourceType || "resource"}:${assetResult.status || "complete"}`,
                error: isError ? assetResult.error : void 0,
                errorContext: isError ? {
                  resourceType: assetResult.resourceType,
                  initiator: assetResult.initiator,
                  status: assetResult.status,
                  id: assetResult.id
                } : void 0,
                metadata: clipObservabilityMetadata({
                  resourceType: assetResult.resourceType,
                  initiator: assetResult.initiator,
                  status: assetResult.status,
                  id: assetResult.id,
                  preloadNameOrAlias: preloadResult.preloadConfig?.nameOrAlias
                })
              },
              preloadArgs.origin
            );
          });
        });
        return void 0;
      };
    }
    const createRuntimeHooks = (boundInstance) => {
      if (!boundInstance) {
        return legacyHooks;
      }
      const boundHooks = {};
      Object.entries(legacyHooks).forEach(
        ([lifecycle, handler]) => {
          if (typeof handler !== "function") {
            return;
          }
          boundHooks[lifecycle] = (...handlerArgs) => {
            const origin = boundInstance;
            prepareRuntimeOrigin(origin);
            const [firstArg, ...remainingArgs] = handlerArgs;
            const boundFirstArg = isRecord2(firstArg) ? {
              ...firstArg,
              origin
            } : firstArg;
            return handler(
              boundFirstArg,
              ...remainingArgs
            );
          };
        }
      );
      return boundHooks;
    };
    const plugin = {
      name: pluginName,
      apply(instance) {
        const origin = instance;
        registerRuntimeInstance(
          origin,
          getActiveRuntimeInstances().some((item) => item === instance)
        );
        const instanceRef = getInstanceRef(origin);
        if (instanceRef) {
          boundInstanceRefs.add(instanceRef);
        }
        appliedRuntimeVersion = sanitizeText(instance.version, 80) || appliedRuntimeVersion;
        if (shouldAttachInstanceApi) {
          let instanceApi = attachedInstanceApis.get(instance);
          if (!instanceApi) {
            instanceApi = {
              markComponentLoaded: (markOptions) => markComponentLoadedFor(markOptions, origin)
            };
            attachedInstanceApis.set(instance, instanceApi);
          }
          instance.markComponentLoaded = instanceApi.markComponentLoaded;
        }
        prepareOutputChannels(origin);
        openRuntimeAdapter?.register();
        return createRuntimeHooks(instance);
      },
      ...legacyHooks
    };
    return {
      plugin,
      getEvents() {
        return getEventsSnapshot();
      },
      getTraceIds() {
        return getTraceIdsSnapshot();
      },
      getReports(options2) {
        return getReportsSnapshot(options2);
      },
      findReports(query) {
        return findReportsSnapshot(query);
      },
      getLatestReport() {
        return getLatestReportSnapshot();
      },
      getReport(traceId) {
        return getReportSnapshot(traceId);
      },
      exportReport(traceId) {
        return exportReportSnapshot(traceId);
      },
      getRuntimeState() {
        return getRuntimeStateSnapshot();
      },
      clear() {
        events.length = 0;
        reports.clear();
        traceByRequest.clear();
        traceByRemote.clear();
        latestTraceByInstance.clear();
        phaseStartTimes.clear();
        seenManifestUrls.clear();
        seenRemoteEntryKeys.clear();
        consoleReportedTraceIds.clear();
        consoleReportedStartKeys.clear();
        latestTraceId = void 0;
        runtimeObservabilityEnabled = false;
        effectiveMaxEvents = configuredMaxEvents;
        browserGlobalScope = void 0;
        lastRuntimeOrigin = void 0;
        historyCleared = true;
      },
      markComponentLoaded
    };
  }

  // packages/observability-plugin/src/chrome-devtool.ts
  function ChromeObservabilityPlugin(options = {}) {
    return createObservability(options, {
      pluginName: "observability-plugin:chrome-extension",
      fixedBrowserScope: "chrome_extension",
      attachInstanceApi: false,
      guardSharedHooksByRuntimeVersion: true,
      guardRuntimeHooksByRuntimeVersion: true,
      disablePreloadHooks: true,
      returnHookArgs: true,
      forceDevelopmentChannels: true
    }).plugin;
  }
  var chrome_devtool_default = ChromeObservabilityPlugin;
  return __toCommonJS(chrome_devtool_exports);
})();
