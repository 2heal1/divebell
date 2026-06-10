import { useEffect, useState } from "react";
import { getOpenRuntimeFromWindow } from "@openruntime/core";
import {
  markOpenRuntimeReady,
  markOpenRuntimeReadyError,
  registerOpenRuntimeReady
} from "@openruntime/modern-plugin";

type ReadyStatus = "pending" | "ready" | "error";

export default function HomePage() {
  const [readyStatus, setReadyStatus] = useState<ReadyStatus>("pending");

  useEffect(() => {
    const runtime = getOpenRuntimeFromWindow();
    if (runtime === undefined) {
      return;
    }

    registerOpenRuntimeReady({
      runtime,
      id: "modern-demo",
      label: "Modern.js demo business ready",
      data: {
        screen: "home"
      }
    });

    const timer = window.setTimeout(() => {
      markOpenRuntimeReady(runtime, "modern-demo", {
        screen: "home",
        message: "business ready"
      });
      setReadyStatus("ready");
    }, 300);

    return () => window.clearTimeout(timer);
  }, []);

  const markError = () => {
    const runtime = getOpenRuntimeFromWindow();
    if (runtime === undefined) {
      return;
    }

    markOpenRuntimeReadyError(runtime, "manual business error", "modern-demo");
    setReadyStatus("error");
  };

  return (
    <div className="stack">
      <section className="panel">
        <h2>Home</h2>
        <p>Orders are ready for review. Runtime status updates after the app settles.</p>
      </section>

      <section className="status-grid">
        <div className="metric">
          <span>Status</span>
          <strong>{readyStatus}</strong>
        </div>
        <div className="metric">
          <span>Business target</span>
          <strong>business:ready:modern-demo</strong>
        </div>
      </section>

      <button className="danger-button" onClick={markError} type="button">
        Mark error
      </button>
    </div>
  );
}
