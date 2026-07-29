import {
  createDivebell,
  installDivebellOnWindow
} from "@divebell/core";
import "./styles.css";

const runtime = createDivebell();
installDivebellOnWindow(runtime);

const state = {
  orders: 3
};

document.querySelector("#root")!.innerHTML = `
  <main class="shell">
    <section class="hero">
      <p class="eyebrow">Divebell Demo</p>
      <h1>Bridge readonly runtime</h1>
      <p class="summary">A Rsbuild page exposing targets, snapshot, events, and actions to the local Bridge.</p>
    </section>

    <section class="status-grid" aria-label="Runtime status">
      <article class="panel">
        <span class="label">App</span>
        <strong id="app-status">ready</strong>
      </article>
      <article class="panel">
        <span class="label">Route</span>
        <strong id="route-status">ready</strong>
      </article>
      <article class="panel">
        <span class="label">Orders</span>
        <strong id="orders-status">ready</strong>
      </article>
    </section>

    <section class="toolbar" aria-label="Runtime controls">
      <button type="button" data-action="ready">Ready</button>
      <button type="button" data-action="loading">Loading</button>
      <button type="button" data-action="error">Error</button>
      <button type="button" data-action="order">Add order</button>
    </section>

    <section class="runtime-view" aria-label="Current snapshot">
      <div>
        <h2>Snapshot</h2>
        <pre id="snapshot-output"></pre>
      </div>
      <div>
        <h2>Events</h2>
        <pre id="events-output"></pre>
      </div>
    </section>
  </main>
`;

runtime.registerTarget({
  id: "app:bridge-readonly-demo",
  type: "demo.app",
  source: "demo",
  label: "Bridge readonly demo app",
  statuses: ["booting", "ready", "error"]
});

runtime.registerTarget({
  id: "route:/bridge-readonly",
  type: "demo.route",
  source: "demo",
  label: "Bridge readonly route",
  statuses: ["loading", "ready", "error"]
});

runtime.registerTarget({
  id: "business:orders",
  type: "demo.business",
  source: "demo",
  label: "Orders panel",
  statuses: ["idle", "ready", "blocked", "error"]
});

runtime.registerAction({
  name: "demo.refresh-orders",
  description: "Refresh the orders panel",
  source: "demo",
  risk: "safe",
  availableWhen: {
    id: "business:orders",
    status: "ready"
  },
  inputSchema: {
    type: "object",
    properties: {
      amount: {
        type: "number",
        description: "Number of orders to add"
      },
      source: {
        type: "string",
        enum: ["cli", "demo"]
      }
    },
    additionalProperties: false
  },
  handler: (payload) => {
    const input = isRecord(payload) ? payload : {};
    const amount = typeof input.amount === "number" && Number.isFinite(input.amount)
      ? Math.max(1, Math.floor(input.amount))
      : 1;
    const source = input.source === "cli" || input.source === "demo" ? input.source : "cli";
    state.orders += amount;
    setReady(source);
    return {
      orders: state.orders,
      amount,
      source
    };
  }
});

runtime.updateSnapshot({
  id: "app:bridge-readonly-demo",
  status: "ready",
  data: {
    title: "Bridge readonly demo"
  }
});
setReady();

document.querySelector('[data-action="ready"]')?.addEventListener("click", setReady);
document.querySelector('[data-action="loading"]')?.addEventListener("click", setLoading);
document.querySelector('[data-action="error"]')?.addEventListener("click", setError);
document.querySelector('[data-action="order"]')?.addEventListener("click", () => {
  state.orders += 1;
  setReady();
});

render();

function setReady(updatedBy = "demo"): void {
  runtime.updateSnapshot({
    id: "route:/bridge-readonly",
    status: "ready",
    data: {
      path: "/bridge-readonly"
    }
  });
  runtime.updateSnapshot({
    id: "business:orders",
    status: "ready",
    dependsOn: ["route:/bridge-readonly"],
    data: {
      orders: state.orders,
      updatedBy
    }
  });
  render();
}

function setLoading(): void {
  runtime.updateSnapshot({
    id: "route:/bridge-readonly",
    status: "loading",
    data: {
      path: "/bridge-readonly"
    }
  });
  runtime.updateSnapshot({
    id: "business:orders",
    status: "blocked",
    dependsOn: ["route:/bridge-readonly"],
    data: {
      orders: state.orders
    }
  });
  render();
}

function setError(): void {
  runtime.updateSnapshot({
    id: "route:/bridge-readonly",
    status: "error",
    error: {
      message: "Demo route failed intentionally.",
      code: "demo_route_error"
    }
  });
  runtime.updateSnapshot({
    id: "business:orders",
    status: "blocked",
    dependsOn: ["route:/bridge-readonly"],
    data: {
      orders: state.orders
    }
  });
  render();
}

function render(): void {
  const snapshot = runtime.getSnapshot();
  const events = runtime.getEvents({ limit: 8 });

  setText("app-status", snapshot.targets["app:bridge-readonly-demo"]?.status ?? "missing");
  setText("route-status", snapshot.targets["route:/bridge-readonly"]?.status ?? "missing");
  setText("orders-status", snapshot.targets["business:orders"]?.status ?? "missing");
  setText("snapshot-output", JSON.stringify(snapshot, null, 2));
  setText("events-output", JSON.stringify(events, null, 2));
}

function setText(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element !== null) {
    element.textContent = value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
