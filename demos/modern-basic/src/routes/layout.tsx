import { useEffect } from "react";
import { Link, Outlet, useLocation } from "@modern-js/runtime/router";
import { getOpenRuntimeFromWindow } from "@openruntime/core";
import "./styles.css";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/orders", label: "Orders" },
  { to: "/broken", label: "Broken" },
  { to: "/component-error", label: "Component Error" }
];

export default function Layout() {
  const location = useLocation();

  useEffect(() => {
    const runtime = getOpenRuntimeFromWindow();
    if (runtime === undefined) {
      return;
    }

    runtime.registerAction({
      name: "demo.click-orders",
      description: "Click the Orders navigation link",
      source: "demo",
      risk: "safe",
      availableWhen: {
        id: "modern:route",
        status: "ready"
      },
      handler: () => {
        const link = document.querySelector<HTMLAnchorElement>("[data-openruntime-action='orders-link']");
        if (link === null) {
          throw new Error("Orders navigation link was not found.");
        }

        link.click();
        return {
          clicked: true,
          href: link.href
        };
      }
    });

    return () => runtime.unregisterAction("demo.click-orders");
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">OpenRuntime Modern.js Demo</p>
          <h1>Modern.js Runtime Status</h1>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <Link
              aria-current={location.pathname === item.to ? "page" : undefined}
              className="nav-link"
              data-openruntime-action={item.to === "/orders" ? "orders-link" : undefined}
              key={item.to}
              to={item.to}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <section className="content">
        <Outlet />
      </section>
    </main>
  );
}
