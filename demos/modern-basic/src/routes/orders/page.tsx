import { useLoaderData } from "@modern-js/runtime/router";

interface OrdersData {
  orders: Array<{
    id: string;
    owner: string;
    status: string;
  }>;
  loadedAt: string;
}

export default function OrdersPage() {
  const data = useLoaderData() as OrdersData;

  return (
    <div className="stack">
      <section className="panel">
        <h2>Orders</h2>
        <p className="timestamp">Loaded at {data.loadedAt}</p>
      </section>
      <div className="table">
        {data.orders.map((order) => (
          <div className="row" key={order.id}>
            <span>{order.id}</span>
            <span>{order.owner}</span>
            <strong>{order.status}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
