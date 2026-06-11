export default function HomePage() {
  return (
    <div className="stack">
      <section className="panel">
        <h2>Home</h2>
        <p>This page is rendered by Modern.js SSR, then hydrated in the browser.</p>
      </section>
      <section className="status-grid">
        <div className="metric">
          <span>Expected target</span>
          <strong>modern:ssr</strong>
        </div>
        <div className="metric">
          <span>Expected target</span>
          <strong>modern:hydration</strong>
        </div>
      </section>
    </div>
  );
}
