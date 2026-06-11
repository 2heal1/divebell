import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "@modern-js/runtime/router";
import "./styles.css";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/details", label: "Details" }
];

export default function Layout() {
  const location = useLocation();
  const [hydrationState, setHydrationState] = useState("server markup");

  useEffect(() => {
    setHydrationState("client hydrated");
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">OpenRuntime Modern.js SSR Demo</p>
          <h1>SSR and Hydration Status</h1>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <Link
              aria-current={location.pathname === item.to ? "page" : undefined}
              className="nav-link"
              key={item.to}
              to={item.to}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <section className="content">
        <div className="metric" data-openruntime-hydration={hydrationState}>
          <span>Hydration marker</span>
          <strong>{hydrationState}</strong>
        </div>
        <Outlet />
      </section>
    </main>
  );
}
