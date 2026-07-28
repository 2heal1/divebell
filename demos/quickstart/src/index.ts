import {
  createOpenRuntime,
  installOpenRuntimeOnWindow
} from "@openruntime/core";

import type { OrderInsights } from "./insights";
import "./styles.css";

type Section = "operations" | "diagnostics" | "insights" | "memory";
type OrderStatus = "ready" | "queued" | "review" | "processed";
type RequestStatus = "idle" | "loading" | "ready" | "error";
type FulfillmentStatus = "idle" | "ready" | "processing" | "blocked";

interface Order {
  id: string;
  customer: string;
  region: string;
  total: number;
  items: number;
  status: OrderStatus;
  priority: "normal" | "high";
}

interface OrdersResponse {
  generatedAt: string;
  orders: Order[];
}

interface InventoryResponse {
  status: string;
  warehouse: string;
  checkedAt: string;
  items: Record<string, number>;
}

interface AppState {
  section: Section;
  orders: Order[];
  selectedOrderId: string | null;
  search: string;
  statusFilter: "all" | OrderStatus;
  requestStatus: RequestStatus;
  fulfillmentStatus: FulfillmentStatus;
  inventoryAttempt: number;
  lastRequestStatus: number | null;
  lastRequestUrl: string | null;
  message: string;
  insights: OrderInsights | null;
  analysisStatus: RequestStatus;
  memoryCycles: number;
  memoryRetainedBytes: number;
}

const runtime = installOpenRuntimeOnWindow(createOpenRuntime(), window, {
  runtimeId: "runtime-openruntime-quickstart",
  name: "OpenRuntime Quick Start",
  source: "quickstart"
});

const state: AppState = {
  section: sectionFromHash(),
  orders: [],
  selectedOrderId: null,
  search: "",
  statusFilter: "all",
  requestStatus: "idle",
  fulfillmentStatus: "idle",
  inventoryAttempt: 0,
  lastRequestStatus: null,
  lastRequestUrl: null,
  message: "Preparing the operations workspace…",
  insights: null,
  analysisStatus: "idle",
  memoryCycles: 0,
  memoryRetainedBytes: 0
};

const retainedMemory: Array<{
  records: Array<{ id: string; label: string; payload: string }>;
  nodes: HTMLElement[];
  listener: EventListener;
}> = [];

document.querySelector("#root")!.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#operations" aria-label="OpenRuntime Quick Start home">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <span>
          <strong>OpenRuntime</strong>
          <small>Quick Start playground</small>
        </span>
      </a>
      <div class="topbar-meta">
        <span class="live-dot"><i></i> Public demo</span>
      </div>
    </header>

    <div class="workspace">
      <aside class="sidebar" aria-label="Playground sections">
        <div class="sidebar-heading">
          <span>Operations desk</span>
          <strong>Northstar Supply</strong>
        </div>
        <nav>
          <button type="button" data-section="operations">
            <span class="nav-icon">01</span>
            <span><strong>Orders</strong><small>Operate the page</small></span>
          </button>
          <button type="button" data-section="diagnostics">
            <span class="nav-icon">02</span>
            <span><strong>Diagnostics</strong><small>Inspect a failure</small></span>
          </button>
          <button type="button" data-section="insights">
            <span class="nav-icon">03</span>
            <span><strong>Insights</strong><small>Load an async view</small></span>
          </button>
          <button type="button" data-section="memory">
            <span class="nav-icon">04</span>
            <span><strong>Memory lab</strong><small>Run a repeatable cycle</small></span>
          </button>
        </nav>
        <div class="sidebar-note">
          <span class="kicker">Runtime Core</span>
          <p>The page declares stable state and safe actions. Browser evidence remains independent.</p>
        </div>
      </aside>

      <main class="main-column">
        <section class="hero">
          <div>
            <p class="eyebrow">Interactive operations workspace</p>
            <h1>See the page.<br><em>Know what happened.</em></h1>
            <p class="hero-copy">Operate a realistic order workflow, inspect browser evidence, and ask the application for facts the browser cannot reliably infer.</p>
          </div>
          <div class="hero-card">
            <span>Current workflow</span>
            <strong id="hero-workflow-status">Preparing</strong>
            <p id="hero-message">Preparing the operations workspace…</p>
          </div>
        </section>

        <section id="section-content" aria-live="polite"></section>
      </main>

      <aside class="evidence-rail" aria-label="Live OpenRuntime evidence">
        <div class="rail-heading">
          <div>
            <p class="eyebrow">Live evidence</p>
            <h2>What the Agent can read</h2>
          </div>
          <span class="pulse" aria-hidden="true"></span>
        </div>

        <div class="evidence-card">
          <div class="evidence-row">
            <span>App</span>
            <strong id="app-status" data-tone="loading">booting</strong>
          </div>
          <div class="evidence-row">
            <span>Inventory request</span>
            <strong id="request-status" data-tone="muted">idle</strong>
          </div>
          <div class="evidence-row">
            <span>Fulfillment</span>
            <strong id="fulfillment-status" data-tone="muted">idle</strong>
          </div>
          <div class="evidence-row">
            <span>Code insights</span>
            <strong id="analysis-status" data-tone="muted">idle</strong>
          </div>
        </div>

        <ol class="journey-list">
          <li data-step="operate"><span>1</span><div><strong>Operate</strong><small>Search, filter, and select an order.</small></div></li>
          <li data-step="observe"><span>2</span><div><strong>Observe</strong><small>Read the page, Console, and Network.</small></div></li>
          <li data-step="understand"><span>3</span><div><strong>Understand</strong><small>Inspect targets, snapshots, and events.</small></div></li>
          <li data-step="act"><span>4</span><div><strong>Act safely</strong><small>Run a declared retry and wait for recovery.</small></div></li>
          <li data-step="analyze"><span>5</span><div><strong>Analyze deeper</strong><small>Compare code execution and memory.</small></div></li>
        </ol>

        <div class="command-card">
          <span class="kicker">Try asking your Agent</span>
          <p>“Use OpenRuntime to complete this Quick Start and explain the evidence.”</p>
        </div>
      </aside>
    </div>
  </div>
`;

registerRuntime();
attachGlobalListeners();
render();
void boot();

function registerRuntime(): void {
  runtime.registerTarget({
    id: "app:openruntime-quickstart",
    type: "quickstart.app",
    source: "quickstart",
    label: "OpenRuntime Quick Start",
    statuses: ["booting", "ready", "error"]
  });
  runtime.registerTarget({
    id: "page:operations",
    type: "quickstart.page",
    source: "quickstart",
    label: "Current playground section",
    statuses: ["ready"]
  });
  runtime.registerTarget({
    id: "request:inventory",
    type: "quickstart.request",
    source: "quickstart",
    label: "Inventory availability request",
    statuses: ["idle", "loading", "ready", "error"]
  });
  runtime.registerTarget({
    id: "business:fulfillment",
    type: "quickstart.workflow",
    source: "quickstart",
    label: "Order fulfillment workflow",
    statuses: ["idle", "ready", "processing", "blocked"]
  });
  runtime.registerTarget({
    id: "analysis:code-usage",
    type: "quickstart.analysis",
    source: "quickstart",
    label: "Lazy-loaded order insights",
    statuses: ["idle", "loading", "ready", "error"]
  });
  runtime.registerTarget({
    id: "lab:memory",
    type: "quickstart.lab",
    source: "quickstart",
    label: "Controlled memory retention lab",
    statuses: ["idle", "retaining", "reset"]
  });

  runtime.registerAction({
    name: "quickstart.trigger-inventory-failure",
    description: "Run the controlled inventory failure used by the diagnostics walkthrough.",
    source: "quickstart",
    risk: "safe",
    handler: () => {
      const nextAttempt = state.inventoryAttempt + 1;
      void triggerInventoryFailure("runtime-action");
      return {
        accepted: true,
        nextAttempt
      };
    }
  });

  runtime.registerAction({
    name: "quickstart.retry-inventory",
    description: "Retry inventory through a healthy endpoint and resume fulfillment.",
    source: "quickstart",
    risk: "safe",
    availableWhen: {
      id: "business:fulfillment",
      status: "blocked"
    },
    inputSchema: {
      type: "object",
      properties: {
        strategy: {
          type: "string",
          enum: ["origin", "cache"],
          description: "Select the declared recovery strategy."
        }
      },
      additionalProperties: false
    },
    getInputOptions: (inputName) => inputName === "strategy"
      ? [
          { value: "origin", description: "Refresh inventory from the healthy static endpoint." },
          { value: "cache", description: "Use the playground's known-good cached response." }
        ]
      : [],
    handler: (payload) => {
      const input = isRecord(payload) ? payload : {};
      const strategy = input.strategy === "cache" ? "cache" : "origin";
      const nextAttempt = state.inventoryAttempt + 1;
      void retryInventory(strategy, "runtime-action");
      return {
        accepted: true,
        strategy,
        nextAttempt
      };
    }
  });

  runtime.registerAction({
    name: "quickstart.open-insights",
    description: "Open the lazy-loaded insights view for code-usage analysis.",
    source: "quickstart",
    risk: "safe",
    handler: () => {
      void openInsights("runtime-action");
      return { accepted: true, section: "insights" };
    }
  });

  runtime.registerAction({
    name: "quickstart.run-memory-cycle",
    description: "Run one controlled memory-retention cycle. Reloading or resetting clears it.",
    source: "quickstart",
    risk: "safe",
    handler: () => runMemoryCycle("runtime-action")
  });

  runtime.registerAction({
    name: "quickstart.reset",
    description: "Reset the controlled Quick Start scenario.",
    source: "quickstart",
    risk: "safe",
    handler: () => {
      resetScenario();
      return { reset: true };
    }
  });

  runtime.updateSnapshot({
    id: "app:openruntime-quickstart",
    status: "booting",
    data: {
      version: 1,
      purpose: "OpenRuntime Quick Start"
    }
  });
  updatePageSnapshot();
  updateRequestSnapshot();
  updateFulfillmentSnapshot();
  updateAnalysisSnapshot("idle");
  updateMemorySnapshot("idle");
}

async function boot(): Promise<void> {
  try {
    const response = await fetch(assetUrl("data/orders.json"), {
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`Orders request returned ${response.status}.`);
    }
    const payload = await response.json() as OrdersResponse;
    state.orders = payload.orders;
    state.selectedOrderId = payload.orders[0]?.id ?? null;
    state.fulfillmentStatus = "ready";
    state.message = `${payload.orders.length} orders loaded. The workspace is ready.`;
    runtime.updateSnapshot({
      id: "app:openruntime-quickstart",
      status: "ready",
      data: {
        version: 1,
        orderCount: state.orders.length,
        generatedAt: payload.generatedAt
      }
    });
    updateFulfillmentSnapshot();
    render();
  } catch (error) {
    state.message = errorMessage(error);
    runtime.updateSnapshot({
      id: "app:openruntime-quickstart",
      status: "error",
      error: {
        code: "quickstart_boot_failed",
        message: state.message
      }
    });
    render();
  }
}

function attachGlobalListeners(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-section]").forEach((button) => {
    button.addEventListener("click", () => {
      const section = button.dataset.section;
      if (!isSection(section)) return;
      if (section === "insights") {
        void openInsights("page");
      } else {
        setSection(section);
      }
    });
  });

  window.addEventListener("hashchange", () => {
    const section = sectionFromHash();
    if (section === "insights") {
      void openInsights("hash");
    } else {
      state.section = section;
      updatePageSnapshot();
      render();
    }
  });

  document.querySelector("#section-content")?.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-action],[data-order-id]")
      : null;
    if (target === null) return;

    const orderId = target.dataset.orderId;
    if (orderId !== undefined) {
      state.selectedOrderId = orderId;
      state.message = `${orderId} selected for review.`;
      markJourneyStep("operate");
      updateFulfillmentSnapshot();
      render();
      return;
    }

    switch (target.dataset.action) {
      case "trigger-failure":
        void triggerInventoryFailure("page");
        break;
      case "retry":
        void retryInventory("origin", "page");
        break;
      case "open-insights":
        void openInsights("page");
        break;
      case "memory-cycle":
        runMemoryCycle("page");
        break;
      case "memory-reset":
        resetMemoryLab();
        break;
      case "reset":
        resetScenario();
        break;
    }
  });

  document.querySelector("#section-content")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-order-id]")
      : null;
    if (row?.dataset.orderId === undefined) return;
    event.preventDefault();
    row.click();
  });

  document.querySelector("#section-content")?.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.name === "order-search") {
      state.search = target.value;
      renderOrderResults();
      markJourneyStep("operate");
    }
    if (target instanceof HTMLSelectElement && target.name === "status-filter") {
      state.statusFilter = isOrderStatus(target.value) ? target.value : "all";
      renderOrderResults();
      markJourneyStep("operate");
    }
  });
}

async function triggerInventoryFailure(source: string): Promise<void> {
  const attempt = state.inventoryAttempt + 1;
  state.inventoryAttempt = attempt;
  state.requestStatus = "loading";
  state.fulfillmentStatus = "processing";
  state.lastRequestStatus = null;
  state.lastRequestUrl = assetUrl(`data/inventory-missing.json?attempt=${attempt}`);
  state.message = "Checking inventory through the controlled failing endpoint…";
  if (state.section !== "diagnostics") {
    state.section = "diagnostics";
    history.pushState(null, "", "#diagnostics");
    updatePageSnapshot();
  }
  updateRequestSnapshot();
  updateFulfillmentSnapshot();
  render();

  try {
    const response = await fetch(state.lastRequestUrl, {
      cache: "no-store",
      headers: {
        "x-openruntime-scenario": "inventory-failure"
      }
    });
    state.lastRequestStatus = response.status;
    if (!response.ok) {
      throw new Error(`Inventory request returned ${response.status}.`);
    }
  } catch (error) {
    state.requestStatus = "error";
    state.fulfillmentStatus = "blocked";
    state.message = "Inventory failed. Fulfillment is blocked until a declared retry succeeds.";
    console.error("[OpenRuntime Quick Start] Inventory request failed.", {
      attempt,
      source,
      url: state.lastRequestUrl,
      status: state.lastRequestStatus,
      error: errorMessage(error)
    });
    updateRequestSnapshot(error);
    updateFulfillmentSnapshot();
    markJourneyStep("observe");
    markJourneyStep("understand");
    render();
  }
}

async function retryInventory(strategy: "origin" | "cache", source: string): Promise<void> {
  const attempt = state.inventoryAttempt + 1;
  state.inventoryAttempt = attempt;
  state.requestStatus = "loading";
  state.fulfillmentStatus = "processing";
  state.lastRequestStatus = null;
  state.lastRequestUrl = assetUrl(`data/inventory.json?attempt=${attempt}&strategy=${strategy}`);
  state.message = `Retry ${attempt} accepted. Waiting for inventory…`;
  updateRequestSnapshot();
  updateFulfillmentSnapshot();
  render();

  await delay(420);

  try {
    const response = await fetch(state.lastRequestUrl, {
      cache: "no-store",
      headers: {
        "x-openruntime-scenario": "inventory-recovery"
      }
    });
    state.lastRequestStatus = response.status;
    if (!response.ok) {
      throw new Error(`Inventory retry returned ${response.status}.`);
    }
    const inventory = await response.json() as InventoryResponse;
    state.requestStatus = "ready";
    state.fulfillmentStatus = "ready";
    state.message = `Inventory recovered from ${inventory.warehouse}. Fulfillment is ready.`;
    updateRequestSnapshot(undefined, inventory);
    updateFulfillmentSnapshot();
    markJourneyStep("act");
    console.info("[OpenRuntime Quick Start] Inventory recovered.", {
      attempt,
      strategy,
      source,
      warehouse: inventory.warehouse
    });
    render();
  } catch (error) {
    state.requestStatus = "error";
    state.fulfillmentStatus = "blocked";
    state.message = "The retry failed. Inspect the latest Network and Runtime evidence.";
    updateRequestSnapshot(error);
    updateFulfillmentSnapshot();
    render();
  }
}

async function openInsights(source: string): Promise<void> {
  setSection("insights", source !== "hash");
  if (state.insights !== null) {
    updateAnalysisSnapshot("ready", source);
    render();
    return;
  }

  updateAnalysisSnapshot("loading", source);
  state.message = "Loading the analytics chunk and calculating order insights…";
  render();
  try {
    const module = await import("./insights");
    await delay(260);
    state.insights = module.calculateOrderInsights(state.orders);
    state.message = "Insights loaded from an on-demand code chunk.";
    updateAnalysisSnapshot("ready", source);
    markJourneyStep("analyze");
    render();
  } catch (error) {
    state.message = errorMessage(error);
    updateAnalysisSnapshot("error", source, error);
    render();
  }
}

function runMemoryCycle(source: string): {
  cycle: number;
  retainedBytes: number;
  retainedNodes: number;
} {
  const cycle = state.memoryCycles + 1;
  const payload = `${cycle}-${"retained-data-".repeat(24)}`;
  const records = Array.from({ length: 5_000 }, (_, index) => ({
    id: `${cycle}-${index}`,
    label: `Customer audit record ${index}`,
    payload
  }));
  const nodes = Array.from({ length: 8 }, (_, index) => {
    const node = document.createElement("article");
    node.textContent = `Detached customer card ${cycle}-${index} ${payload}`;
    return node;
  });
  const listener: EventListener = () => records[0]?.id;
  window.addEventListener(`quickstart-memory-${cycle}`, listener);
  retainedMemory.push({ records, nodes, listener });
  state.memoryCycles = cycle;
  state.memoryRetainedBytes += records.length * payload.length;
  state.message = `Memory lab retained cycle ${cycle}. Reload or reset the lab to clear it.`;
  updateMemorySnapshot("retaining", source);
  markJourneyStep("analyze");
  render();
  return {
    cycle,
    retainedBytes: state.memoryRetainedBytes,
    retainedNodes: retainedMemory.reduce((total, entry) => total + entry.nodes.length, 0)
  };
}

function resetMemoryLab(): void {
  for (let index = 0; index < retainedMemory.length; index += 1) {
    const entry = retainedMemory[index];
    if (entry === undefined) continue;
    window.removeEventListener(`quickstart-memory-${index + 1}`, entry.listener);
  }
  retainedMemory.length = 0;
  state.memoryCycles = 0;
  state.memoryRetainedBytes = 0;
  state.message = "The controlled memory lab was reset.";
  updateMemorySnapshot("reset", "page");
  render();
}

function resetScenario(): void {
  state.requestStatus = "idle";
  state.fulfillmentStatus = state.orders.length > 0 ? "ready" : "idle";
  state.inventoryAttempt = 0;
  state.lastRequestStatus = null;
  state.lastRequestUrl = null;
  state.message = "The diagnostic scenario was reset.";
  updateRequestSnapshot();
  updateFulfillmentSnapshot();
  document.querySelectorAll("[data-step]").forEach((step) => step.classList.remove("complete"));
  render();
}

function updatePageSnapshot(): void {
  runtime.updateSnapshot({
    id: "page:operations",
    status: "ready",
    data: {
      section: state.section,
      hash: `#${state.section}`,
      selectedOrderId: state.selectedOrderId
    }
  });
}

function updateRequestSnapshot(error?: unknown, inventory?: InventoryResponse): void {
  runtime.updateSnapshot({
    id: "request:inventory",
    status: state.requestStatus,
    data: {
      attempt: state.inventoryAttempt,
      url: state.lastRequestUrl,
      httpStatus: state.lastRequestStatus,
      warehouse: inventory?.warehouse ?? null
    },
    ...(error === undefined
      ? {}
      : {
          error: {
            code: "inventory_request_failed",
            message: errorMessage(error)
          }
        })
  });
}

function updateFulfillmentSnapshot(): void {
  runtime.updateSnapshot({
    id: "business:fulfillment",
    status: state.fulfillmentStatus,
    data: {
      attempt: state.inventoryAttempt,
      orderCount: state.orders.length,
      selectedOrderId: state.selectedOrderId,
      message: state.message
    },
    ...(state.fulfillmentStatus === "blocked"
      ? { dependsOn: ["request:inventory"] }
      : {})
  });
}

function updateAnalysisSnapshot(
  status: "idle" | "loading" | "ready" | "error",
  source = "page",
  error?: unknown
): void {
  state.analysisStatus = status;
  runtime.updateSnapshot({
    id: "analysis:code-usage",
    status,
    data: {
      section: "insights",
      loaded: state.insights !== null,
      source,
      regionCount: state.insights?.regions.length ?? 0
    },
    ...(error === undefined
      ? {}
      : {
          error: {
            code: "insights_load_failed",
            message: errorMessage(error)
          }
        })
  });
}

function updateMemorySnapshot(
  status: "idle" | "retaining" | "reset",
  source = "page"
): void {
  runtime.updateSnapshot({
    id: "lab:memory",
    status,
    data: {
      cycles: state.memoryCycles,
      retainedBytes: state.memoryRetainedBytes,
      retainedNodes: retainedMemory.reduce((total, entry) => total + entry.nodes.length, 0),
      source
    }
  });
}

function setSection(section: Section, updateHash = true): void {
  state.section = section;
  if (updateHash && window.location.hash !== `#${section}`) {
    history.pushState(null, "", `#${section}`);
  }
  updatePageSnapshot();
  render();
}

function render(): void {
  updateNavigation();
  setText("hero-workflow-status", statusLabel(state.fulfillmentStatus));
  setText("hero-message", state.message);
  setStatus("app-status", state.orders.length > 0 ? "ready" : "booting");
  setStatus("request-status", state.requestStatus);
  setStatus("fulfillment-status", state.fulfillmentStatus);
  setStatus("analysis-status", state.analysisStatus);

  if (state.section === "operations") renderOperations();
  if (state.section === "diagnostics") renderDiagnostics();
  if (state.section === "insights") renderInsights();
  if (state.section === "memory") renderMemory();
}

function renderOperations(): void {
  const content = requireContent();
  const orders = filteredOrders();
  const selected = state.orders.find((order) => order.id === state.selectedOrderId) ?? null;
  content.innerHTML = `
    <section class="section-header">
      <div>
        <p class="eyebrow">Browser interaction</p>
        <h2>Order queue</h2>
        <p>Search, filter, and select an order. Every control is available to the Agent through the page snapshot.</p>
      </div>
      <button class="secondary-button" type="button" data-action="reset">Reset scenario</button>
    </section>

    <div class="operations-grid">
      <section class="content-card order-card">
        <div class="filters">
          <label>
            <span>Search orders</span>
            <input name="order-search" type="search" value="${escapeHtml(state.search)}" placeholder="Order or customer" />
          </label>
          <label>
            <span>Status</span>
            <select name="status-filter">
              ${statusOption("all", "All orders")}
              ${statusOption("ready", "Ready")}
              ${statusOption("queued", "Queued")}
              ${statusOption("review", "Review")}
              ${statusOption("processed", "Processed")}
            </select>
          </label>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th></tr>
            </thead>
            <tbody id="order-results">
              ${orders.length === 0
                ? `<tr><td colspan="4" class="empty-row">No orders match this view.</td></tr>`
                : orders.map(orderRow).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <aside class="content-card detail-card" id="order-detail">
        ${selected === null
          ? `<div class="empty-detail"><span>↗</span><p>Select an order to inspect its details.</p></div>`
          : orderDetail(selected)}
      </aside>
    </div>

    <div class="next-step">
      <div><span>Next</span><p>Move to Diagnostics and trigger a controlled inventory failure.</p></div>
      <button class="primary-button" type="button" data-section-jump="diagnostics" data-action="trigger-failure">Trigger failure</button>
    </div>
  `;
}

function renderOrderResults(): void {
  const results = document.querySelector<HTMLTableSectionElement>("#order-results");
  const detail = document.querySelector<HTMLElement>("#order-detail");
  if (results === null || detail === null) {
    renderOperations();
    return;
  }
  const orders = filteredOrders();
  const selected = state.orders.find((order) => order.id === state.selectedOrderId) ?? null;
  results.innerHTML = orders.length === 0
    ? `<tr><td colspan="4" class="empty-row">No orders match this view.</td></tr>`
    : orders.map(orderRow).join("");
  detail.innerHTML = selected === null
    ? `<div class="empty-detail"><span>↗</span><p>Select an order to inspect its details.</p></div>`
    : orderDetail(selected);
}

function renderDiagnostics(): void {
  const content = requireContent();
  const failed = state.requestStatus === "error";
  const recovered = state.requestStatus === "ready" && state.inventoryAttempt > 1;
  content.innerHTML = `
    <section class="section-header">
      <div>
        <p class="eyebrow">Browser evidence + Runtime facts</p>
        <h2>Inventory recovery</h2>
        <p>Trigger a real 404 request, inspect Network and Console, then use the page-declared retry action.</p>
      </div>
      <span class="scenario-badge">${recovered ? "Recovered" : failed ? "Failure captured" : "Ready to run"}</span>
    </section>

    <div class="diagnostic-grid">
      <section class="content-card diagnostic-flow">
        <div class="flow-node ${state.inventoryAttempt > 0 ? "active" : ""}">
          <span>01</span>
          <div><strong>Check inventory</strong><small>Fetch the controlled endpoint</small></div>
          <em>${state.inventoryAttempt > 0 ? `Attempt ${state.inventoryAttempt}` : "Waiting"}</em>
        </div>
        <div class="flow-line"></div>
        <div class="flow-node ${failed ? "error" : recovered ? "success" : ""}">
          <span>02</span>
          <div><strong>Read the evidence</strong><small>Network, Console, Snapshot</small></div>
          <em>${failed ? "404 found" : recovered ? "Evidence retained" : "Waiting"}</em>
        </div>
        <div class="flow-line"></div>
        <div class="flow-node ${recovered ? "success" : ""}">
          <span>03</span>
          <div><strong>Verify recovery</strong><small>Wait for fulfillment=ready</small></div>
          <em>${recovered ? "Verified" : "Waiting"}</em>
        </div>
      </section>

      <section class="content-card request-card">
        <div class="request-heading">
          <div><span class="kicker">Latest request</span><h3>Inventory availability</h3></div>
          <span class="status-pill status-${state.requestStatus}">${state.requestStatus}</span>
        </div>
        <dl>
          <div><dt>Attempt</dt><dd>${state.inventoryAttempt || "—"}</dd></div>
          <div><dt>HTTP status</dt><dd>${state.lastRequestStatus ?? "—"}</dd></div>
          <div><dt>Workflow</dt><dd>${state.fulfillmentStatus}</dd></div>
        </dl>
        <p class="request-url">${state.lastRequestUrl === null ? "No request captured yet." : escapeHtml(state.lastRequestUrl)}</p>
        <div class="button-row">
          <button class="danger-button" type="button" data-action="trigger-failure">Trigger 404</button>
          <button class="primary-button" type="button" data-action="retry" ${failed ? "" : "disabled"}>Retry safely</button>
        </div>
      </section>
    </div>

    <section class="content-card evidence-explainer">
      <div><span>Browser</span><strong>Network + Console</strong><p>Shows the failed URL, status code, and emitted error.</p></div>
      <div><span>Runtime Core</span><strong>State + dependency</strong><p>Shows fulfillment is blocked by the inventory request.</p></div>
      <div><span>Declared action</span><strong>Retry + wait</strong><p>Runs an allowed recovery and waits for a new ready state.</p></div>
    </section>
  `;
}

function renderInsights(): void {
  const content = requireContent();
  if (state.insights === null) {
    content.innerHTML = `
      <section class="section-header">
        <div>
          <p class="eyebrow">Code Usage</p>
          <h2>Order insights</h2>
          <p>This view lives in an on-demand JavaScript chunk. Open it while coverage is running to compare execution stages.</p>
        </div>
      </section>
      <section class="content-card loading-card">
        <span class="loader" aria-hidden="true"></span>
        <h3>Loading the insights chunk</h3>
        <p>Calculating revenue, regional share, and fulfillment recommendations.</p>
      </section>
    `;
    return;
  }

  const insights = state.insights;
  const maxRevenue = Math.max(...insights.regions.map((region) => region.revenue), 1);
  content.innerHTML = `
    <section class="section-header">
      <div>
        <p class="eyebrow">Lazy-loaded analysis</p>
        <h2>Order insights</h2>
        <p>The additional application code has loaded. A staged coverage recording can now show exactly what changed.</p>
      </div>
      <span class="scenario-badge">Async chunk loaded</span>
    </section>

    <div class="metric-grid">
      ${metricCard("Revenue", money(insights.revenue), "Across the current queue")}
      ${metricCard("Average order", money(insights.averageOrder), "Gross order value")}
      ${metricCard("Ready share", percent(insights.readyShare), "Ready for fulfillment")}
      ${metricCard("Priority revenue", money(insights.priorityRevenue), "High-priority orders")}
    </div>

    <div class="insights-grid">
      <section class="content-card chart-card">
        <div class="card-title"><div><span class="kicker">Regional mix</span><h3>Revenue by region</h3></div><em>${insights.regions.length} regions</em></div>
        <div class="bar-chart">
          ${insights.regions.map((region) => `
            <div class="bar-row">
              <span>${escapeHtml(region.name)}</span>
              <div><i style="width:${Math.round((region.revenue / maxRevenue) * 100)}%"></i></div>
              <strong>${money(region.revenue)}</strong>
            </div>
          `).join("")}
        </div>
      </section>

      <section class="content-card recommendation-card">
        <span class="kicker">Recommended next moves</span>
        <h3>Operations notes</h3>
        <ul>${insights.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>
    </div>
  `;
}

function renderMemory(): void {
  const content = requireContent();
  content.innerHTML = `
    <section class="section-header">
      <div>
        <p class="eyebrow">Extension scenario</p>
        <h2>Controlled memory lab</h2>
        <p>Each cycle intentionally retains objects, detached DOM nodes, and a listener. It exists only to make a repeatable Extension report.</p>
      </div>
      <span class="scenario-badge warning">Intentional growth</span>
    </section>

    <div class="memory-grid">
      <section class="content-card memory-visual">
        <div class="memory-orbit">
          <div><strong>${state.memoryCycles}</strong><span>retained cycles</span></div>
          ${Array.from({ length: Math.min(state.memoryCycles, 7) }, (_, index) =>
            `<i style="--orbit:${index + 1}"></i>`).join("")}
        </div>
        <div class="button-row centered">
          <button class="primary-button" type="button" data-action="memory-cycle">Retain one cycle</button>
          <button class="secondary-button" type="button" data-action="memory-reset">Reset lab</button>
        </div>
      </section>

      <section class="content-card memory-stats">
        <span class="kicker">Page-declared lab state</span>
        <h3>Current retained data</h3>
        <dl>
          <div><dt>Estimated payload</dt><dd>${formatBytes(state.memoryRetainedBytes)}</dd></div>
          <div><dt>Detached nodes</dt><dd>${state.memoryCycles * 8}</dd></div>
          <div><dt>Event listeners</dt><dd>${state.memoryCycles}</dd></div>
        </dl>
        <p>Use the memory Extension for the actual browser measurements. The values above only describe what this lab intentionally retained.</p>
      </section>
    </div>

    <section class="content-card memory-note">
      <span>Why repeat?</span>
      <p>A single high reading is not a leak. The Extension warms the page, repeats this same cycle, requests garbage collection, and looks for sustained growth.</p>
    </section>
  `;
}

function filteredOrders(): Order[] {
  const query = state.search.trim().toLocaleLowerCase();
  return state.orders.filter((order) => {
    const matchesStatus = state.statusFilter === "all" || order.status === state.statusFilter;
    const matchesSearch = query.length === 0
      || order.id.toLocaleLowerCase().includes(query)
      || order.customer.toLocaleLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });
}

function orderRow(order: Order): string {
  const selected = order.id === state.selectedOrderId;
  return `
    <tr class="${selected ? "selected" : ""}" data-order-id="${order.id}" tabindex="0">
      <td><strong>${order.id}</strong><small>${order.items} items · ${order.region}</small></td>
      <td>${escapeHtml(order.customer)}</td>
      <td><span class="order-status status-${order.status}">${order.status}</span></td>
      <td>${money(order.total)}</td>
    </tr>
  `;
}

function orderDetail(order: Order): string {
  return `
    <div class="detail-topline"><span class="kicker">Selected order</span><span class="priority priority-${order.priority}">${order.priority}</span></div>
    <h3>${order.id}</h3>
    <p class="detail-customer">${escapeHtml(order.customer)}</p>
    <dl>
      <div><dt>Region</dt><dd>${escapeHtml(order.region)}</dd></div>
      <div><dt>Items</dt><dd>${order.items}</dd></div>
      <div><dt>Total</dt><dd>${money(order.total)}</dd></div>
      <div><dt>Status</dt><dd>${order.status}</dd></div>
    </dl>
    <button class="primary-button full-button" type="button" data-action="trigger-failure">Check inventory</button>
  `;
}

function metricCard(label: string, value: string, description: string): string {
  return `<article class="metric-card"><span>${label}</span><strong>${value}</strong><p>${description}</p></article>`;
}

function statusOption(value: AppState["statusFilter"], label: string): string {
  return `<option value="${value}" ${state.statusFilter === value ? "selected" : ""}>${label}</option>`;
}

function updateNavigation(): void {
  document.querySelectorAll<HTMLElement>("[data-section]").forEach((button) => {
    const active = button.dataset.section === state.section;
    button.classList.toggle("active", active);
    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function markJourneyStep(step: string): void {
  document.querySelector(`[data-step="${step}"]`)?.classList.add("complete");
}

function setStatus(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element === null) return;
  element.textContent = value;
  element.dataset.tone = statusTone(value);
}

function statusTone(value: string): string {
  if (["ready", "processed"].includes(value)) return "success";
  if (["error", "blocked"].includes(value)) return "error";
  if (["loading", "processing", "booting"].includes(value)) return "loading";
  return "muted";
}

function statusLabel(status: FulfillmentStatus): string {
  if (status === "ready") return "Ready to fulfill";
  if (status === "processing") return "Checking inventory";
  if (status === "blocked") return "Action required";
  return "Preparing";
}

function sectionFromHash(): Section {
  const value = window.location.hash.replace(/^#/, "");
  return isSection(value) ? value : "operations";
}

function isSection(value: unknown): value is Section {
  return ["operations", "diagnostics", "insights", "memory"].includes(String(value));
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return ["ready", "queued", "review", "processed"].includes(String(value));
}

function assetUrl(relative: string): string {
  return new URL(relative, document.baseURI).href;
}

function requireContent(): HTMLElement {
  const content = document.querySelector<HTMLElement>("#section-content");
  if (content === null) throw new Error("Quick Start content root is missing.");
  return content;
}

function setText(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element !== null) element.textContent = value;
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function percent(value: number): string {
  return new Intl.NumberFormat("en", {
    style: "percent",
    maximumFractionDigits: 0
  }).format(value);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
