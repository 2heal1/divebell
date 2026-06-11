import type { LoaderFunction } from "@modern-js/runtime/router";

const loader: LoaderFunction = async () => {
  await new Promise((resolve) => setTimeout(resolve, 250));

  return {
    orders: [
      { id: "A-1024", owner: "Ada", status: "ready" },
      { id: "B-2048", owner: "Lin", status: "queued" },
      { id: "C-4096", owner: "Kai", status: "ready" }
    ],
    loadedAt: new Date().toISOString()
  };
};

export default loader;
