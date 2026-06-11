export const loader = async () => {
  await new Promise((resolve) => setTimeout(resolve, 120));
  return {
    title: "Streaming details",
    message: "Details route data loaded during stream SSR."
  };
};
