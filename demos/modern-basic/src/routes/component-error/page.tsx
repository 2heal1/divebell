throw new Error("route component module failed");

export default function ComponentErrorPage() {
  return (
    <section className="panel">
      <h2>Component Error</h2>
      <p>This route should never render because the route module fails while loading.</p>
    </section>
  );
}
