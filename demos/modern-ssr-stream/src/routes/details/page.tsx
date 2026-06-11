import { useLoaderData } from "@modern-js/runtime/router";

interface DetailsLoaderData {
  title?: string;
  message?: string;
}

export default function DetailsPage() {
  const data = useLoaderData() as DetailsLoaderData;

  return (
    <section className="panel">
      <h2>{data.title ?? "Details"}</h2>
      <p>Client navigation should keep the route target ready after stream hydration completes.</p>
      <p>{data.message ?? "Details route data is ready."}</p>
    </section>
  );
}
