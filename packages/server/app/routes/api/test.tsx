export function loader({ params }) {
  return new Response(JSON.stringify({ test: "ok" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
