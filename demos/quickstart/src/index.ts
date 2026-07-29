import {
  createDivebell,
  installDivebellOnWindow
} from "@divebell/core";

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

const runtime = installDivebellOnWindow(createDivebell(), window, {
  runtimeId: "runtime-divebell-quickstart",
  name: "Northstar Supply Operations",
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
      <a class="brand" href="#operations" aria-label="Northstar Supply home">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <span>
          <strong>Northstar Supply</strong>
          <small>Operations</small>
        </span>
      </a>
      <nav class="topnav" aria-label="Operations workspace">
        <button type="button" data-section="operations">Orders</button>
        <button type="button" data-section="diagnostics">Inventory</button>
        <button type="button" data-section="insights">Analytics</button>
        <button type="button" data-section="memory">Activity</button>
      </nav>
      <div class="topbar-meta">
        <span class="live-dot"><i></i> US West</span>
        <span class="user-avatar" aria-label="Signed in as Avery Stone">AS</span>
      </div>
    </header>

    <div class="workspace">
      <main class="main-column">
        <section class="hero">
          <div>
            <p class="eyebrow" id="page-eyebrow">Order management</p>
            <h1 id="page-title">Orders</h1>
            <p class="hero-copy" id="page-description">Review and fulfill incoming customer orders.</p>
          </div>
          <div class="hero-card">
            <span>Fulfillment status</span>
            <strong id="hero-workflow-status">Preparing</strong>
            <p id="hero-message">Preparing the operations workspace…</p>
          </div>
        </section>

        <section id="section-content" aria-live="polite"></section>
      </main>
    </div>
  </div>
`;

registerRuntime();
attachGlobalListeners();
render();
void boot();

function registerRuntime(): void {
  runtime.registerTarget({
    id: "app:divebell-quickstart",
    type: "quickstart.app",
    source: "quickstart",
    label: "Northstar Supply Operations",
    statuses: ["booting", "ready", "error"]
  });
  runtime.registerTarget({
    id: "page:operations",
    type: "quickstart.page",
    source: "quickstart",
    label: "Current operations page",
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
    label: "Order analytics",
    statuses: ["idle", "loading", "ready", "error"]
  });
  runtime.registerTarget({
    id: "lab:memory",
    type: "quickstart.lab",
    source: "quickstart",
    label: "Customer activity archive",
    statuses: ["idle", "retaining", "reset"]
  });

  runtime.registerAction({
    name: "quickstart.trigger-inventory-failure",
    description: "Check the selected order against the inventory service.",
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
    description: "Retry the latest inventory sync and resume fulfillment.",
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
    description: "Open the order analytics page.",
    source: "quickstart",
    risk: "safe",
    handler: () => {
      void openInsights("runtime-action");
      return { accepted: true, section: "insights" };
    }
  });

  runtime.registerAction({
    name: "quickstart.run-memory-cycle",
    description: "Load an earlier page of customer activity.",
    source: "quickstart",
    risk: "safe",
    handler: () => runMemoryCycle("runtime-action")
  });

  runtime.registerAction({
    name: "quickstart.reset",
    description: "Refresh order and inventory data.",
    source: "quickstart",
    risk: "safe",
    handler: () => {
      resetScenario();
      return { reset: true };
    }
  });

  runtime.updateSnapshot({
    id: "app:divebell-quickstart",
    status: "booting",
    data: {
      version: 1,
      purpose: "Northstar Supply Operations"
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
      id: "app:divebell-quickstart",
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
      id: "app:divebell-quickstart",
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
    }
    if (target instanceof HTMLSelectElement && target.name === "status-filter") {
      state.statusFilter = isOrderStatus(target.value) ? target.value : "all";
      renderOrderResults();
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
  state.message = "Checking inventory availability…";
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
        "x-divebell-scenario": "inventory-failure"
      }
    });
    state.lastRequestStatus = response.status;
    if (!response.ok) {
      throw new Error(`Inventory request returned ${response.status}.`);
    }
  } catch (error) {
    state.requestStatus = "error";
    state.fulfillmentStatus = "blocked";
    state.message = "Inventory service unavailable. Fulfillment is paused.";
    console.error("[Northstar Supply] Inventory request failed.", {
      attempt,
      source,
      url: state.lastRequestUrl,
      status: state.lastRequestStatus,
      error: errorMessage(error)
    });
    updateRequestSnapshot(error);
    updateFulfillmentSnapshot();
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
        "x-divebell-scenario": "inventory-recovery"
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
    console.info("[Northstar Supply] Inventory recovered.", {
      attempt,
      strategy,
      source,
      warehouse: inventory.warehouse
    });
    render();
  } catch (error) {
    state.requestStatus = "error";
    state.fulfillmentStatus = "blocked";
    state.message = "Inventory is still unavailable. Try again in a moment.";
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
  state.message = "Loading current order analytics…";
  render();
  try {
    const module = await import("./insights");
    await delay(260);
    state.insights = module.calculateOrderInsights(state.orders);
    state.message = "Analytics are up to date.";
    updateAnalysisSnapshot("ready", source);
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
  state.message = `Loaded ${cycle * 5_000} customer activity records.`;
  updateMemorySnapshot("retaining", source);
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
  state.message = "Customer activity cache cleared.";
  updateMemorySnapshot("reset", "page");
  render();
}

function resetScenario(): void {
  state.requestStatus = "idle";
  state.fulfillmentStatus = state.orders.length > 0 ? "ready" : "idle";
  state.inventoryAttempt = 0;
  state.lastRequestStatus = null;
  state.lastRequestUrl = null;
  state.message = "Order and inventory data refreshed.";
  updateRequestSnapshot();
  updateFulfillmentSnapshot();
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
  updatePageHeading();
  setText("hero-workflow-status", statusLabel(state.fulfillmentStatus));
  setText("hero-message", sectionMessage());

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
        <h2>Order queue</h2>
        <p>Search incoming orders, review customer details, and confirm inventory before fulfillment.</p>
      </div>
      <button class="secondary-button" type="button" data-action="reset">Refresh data</button>
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
  const checking = state.requestStatus === "loading";
  const selected = state.orders.find((order) => order.id === state.selectedOrderId) ?? null;
  const serviceLabel = failed
    ? "Service unavailable"
    : checking
      ? "Checking availability"
      : recovered
        ? "Operational"
        : "Ready";
  const serviceCopy = failed
    ? "The latest warehouse request failed. Pending orders are temporarily paused."
    : checking
      ? "Contacting the west-2 inventory service."
      : recovered
        ? "Inventory is responding normally and fulfillment has resumed."
        : "Inventory checks are available for the selected order.";
  content.innerHTML = `
    <section class="section-header">
      <div>
        <h2>Warehouse availability</h2>
        <p>Review the latest inventory sync before releasing orders for fulfillment.</p>
      </div>
      <span class="scenario-badge ${failed ? "error" : ""}">${serviceLabel}</span>
    </section>

    <div class="diagnostic-grid">
      <section class="content-card service-card">
        <div class="service-summary">
          <span class="service-indicator status-${state.requestStatus}" aria-hidden="true"></span>
          <div>
            <span class="kicker">West warehouse</span>
            <h3>${serviceLabel}</h3>
            <p>${serviceCopy}</p>
          </div>
        </div>
        <dl>
          <div><dt>Location</dt><dd>west-2</dd></div>
          <div><dt>Selected order</dt><dd>${selected?.id ?? "None"}</dd></div>
          <div><dt>Fulfillment</dt><dd>${state.fulfillmentStatus}</dd></div>
        </dl>
      </section>

      <section class="content-card request-card">
        <div class="request-heading">
          <div><span class="kicker">Latest sync</span><h3>Inventory service</h3></div>
          <span class="status-pill status-${state.requestStatus}">${state.requestStatus}</span>
        </div>
        <dl>
          <div><dt>Attempt</dt><dd>${state.inventoryAttempt || "—"}</dd></div>
          <div><dt>Response</dt><dd>${state.lastRequestStatus ?? "—"}</dd></div>
          <div><dt>Order</dt><dd>${selected?.id ?? "—"}</dd></div>
        </dl>
        <p class="request-url">${state.lastRequestUrl === null ? "No warehouse request yet." : escapeHtml(state.lastRequestUrl)}</p>
        <div class="button-row">
          <button class="secondary-button" type="button" data-action="trigger-failure">Check availability</button>
          <button class="primary-button" type="button" data-action="retry" ${failed ? "" : "disabled"}>Retry sync</button>
        </div>
      </section>
    </div>
  `;
}

function renderInsights(): void {
  const content = requireContent();
  if (state.insights === null) {
    content.innerHTML = `
      <section class="section-header">
        <div>
          <h2>Order analytics</h2>
          <p>Revenue and fulfillment performance across the current order queue.</p>
        </div>
      </section>
      <section class="content-card loading-card">
        <span class="loader" aria-hidden="true"></span>
        <h3>Loading analytics</h3>
        <p>Calculating revenue, regional share, and fulfillment trends.</p>
      </section>
    `;
    return;
  }

  const insights = state.insights;
  const maxRevenue = Math.max(...insights.regions.map((region) => region.revenue), 1);
  content.innerHTML = `
    <section class="section-header">
      <div>
        <h2>Order analytics</h2>
        <p>Revenue and fulfillment performance across the current order queue.</p>
      </div>
      <span class="scenario-badge">Updated just now</span>
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
        <span class="kicker">Operations</span>
        <h3>Operations notes</h3>
        <ul>${insights.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>
    </div>
  `;
}

function renderMemory(): void {
  const content = requireContent();
  const loadedRecords = state.memoryCycles * 5_000;
  content.innerHTML = `
    <section class="section-header">
      <div>
        <h2>Customer activity</h2>
        <p>Recent customer and order events from the operations archive.</p>
      </div>
      <span class="scenario-badge">Live</span>
    </section>

    <div class="memory-grid">
      <section class="content-card activity-feed">
        <div class="card-title">
          <div><span class="kicker">Today</span><h3>Recent events</h3></div>
          <em>${loadedRecords === 0 ? "Latest" : `${loadedRecords.toLocaleString()} archived`}</em>
        </div>
        <ol class="activity-list">
          <li><span class="activity-avatar">AS</span><div><strong>Avery Stone</strong><p>Order OR-1048 moved to inventory review.</p><small>2 minutes ago</small></div></li>
          <li><span class="activity-avatar">MP</span><div><strong>Mina Park</strong><p>Order OR-1049 entered the fulfillment queue.</p><small>14 minutes ago</small></div></li>
          <li><span class="activity-avatar">NW</span><div><strong>Noah Williams</strong><p>Priority delivery details were updated.</p><small>31 minutes ago</small></div></li>
          ${Array.from({ length: Math.min(state.memoryCycles, 4) }, (_, index) => `
            <li><span class="activity-avatar muted">AR</span><div><strong>Archive import</strong><p>Loaded activity page ${state.memoryCycles - index}.</p><small>Earlier today</small></div></li>
          `).join("")}
        </ol>
        <div class="activity-actions">
          <button class="primary-button" type="button" data-action="memory-cycle">Load earlier activity</button>
        </div>
      </section>

      <section class="content-card activity-summary">
        <span class="kicker">Archive cache</span>
        <h3>Activity feed</h3>
        <dl>
          <div><dt>Loaded pages</dt><dd><strong class="activity-count">${state.memoryCycles}</strong></dd></div>
          <div><dt>Cached records</dt><dd>${loadedRecords.toLocaleString()}</dd></div>
          <div><dt>Live subscriptions</dt><dd>${state.memoryCycles}</dd></div>
        </dl>
        <p>Earlier activity remains available while this workspace is open.</p>
        <button class="secondary-button full-button" type="button" data-action="memory-reset" ${state.memoryCycles === 0 ? "disabled" : ""}>Clear activity cache</button>
      </section>
    </div>
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

function updatePageHeading(): void {
  const content: Record<Section, {
    eyebrow: string;
    title: string;
    description: string;
  }> = {
    operations: {
      eyebrow: "Order management",
      title: "Orders",
      description: "Review and fulfill incoming customer orders."
    },
    diagnostics: {
      eyebrow: "Warehouse operations",
      title: "Inventory",
      description: "Monitor inventory availability across fulfillment locations."
    },
    insights: {
      eyebrow: "Business intelligence",
      title: "Analytics",
      description: "Track revenue and fulfillment performance."
    },
    memory: {
      eyebrow: "Customer operations",
      title: "Activity",
      description: "Review recent customer and order events."
    }
  };
  const current = content[state.section];
  setText("page-eyebrow", current.eyebrow);
  setText("page-title", current.title);
  setText("page-description", current.description);
}

function statusLabel(status: FulfillmentStatus): string {
  if (status === "ready") return "Ready to fulfill";
  if (status === "processing") return "Checking inventory";
  if (status === "blocked") return "Action required";
  return "Preparing";
}

function sectionMessage(): string {
  if (state.fulfillmentStatus === "blocked" || state.fulfillmentStatus === "processing") {
    return state.message;
  }
  if (state.section === "operations") {
    return `${state.orders.length} orders loaded and ready for review.`;
  }
  if (state.section === "diagnostics") {
    return state.requestStatus === "ready"
      ? "Inventory is healthy across active fulfillment locations."
      : "No inventory incidents are currently active.";
  }
  if (state.section === "insights") {
    return state.analysisStatus === "ready"
      ? "Analytics are up to date."
      : "Preparing current order analytics.";
  }
  return state.memoryCycles > 0
    ? `${state.memoryCycles * 5_000} archived activity records loaded.`
    : "Customer activity is up to date.";
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
