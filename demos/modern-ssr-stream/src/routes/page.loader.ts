export const loader = async () => {
  const data = { message: 'hello world' };
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; utf-8',
    },
  });
};

export default loader;