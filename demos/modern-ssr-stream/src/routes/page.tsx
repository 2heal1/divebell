import { useLoaderData } from '@modern-js/runtime/router';

export default function HomePage() {
  const data = useLoaderData();
  return (
    <div className="stack">
      <section className="panel">
        <h2>Home</h2>
        <p>This page is rendered with Modern.js streaming SSR, then hydrated in the browser.</p>
        <p>Message from loader: {data.message}</p>
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
