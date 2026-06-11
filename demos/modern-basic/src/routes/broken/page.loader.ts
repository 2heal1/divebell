import type { LoaderFunction } from "@modern-js/runtime/router";

const loader: LoaderFunction = async () => {
  await new Promise((resolve) => setTimeout(resolve, 150));
  throw new Error("broken route loader");
};

export default loader;
