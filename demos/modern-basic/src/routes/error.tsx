import { useRouteError } from "@modern-js/runtime/router";

export default function ErrorBoundary() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error);

  return (
    <section className="panel error-panel">
      <h2>Route error</h2>
      <p>{message}</p>
    </section>
  );
}
