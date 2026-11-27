export async function onRequest({ request, env }) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };

  const reply = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers
    });

  try {
    if (request.method === "POST") {
      const origin = request.headers.get("Origin");

      if (origin !== new URL(request.url).origin) {
        return reply({ error: "Forbidden" }, 403);
      }

      const length = Number(
        request.headers.get("Content-Length")
      );

      if (!length || length > 512) {
        return reply({ error: "Invalid request size" }, 400);
      }

      let data;

      try {
        data = await request.json();
      } catch {
        return reply({ error: "Invalid JSON" }, 400);
      }

      const id = data?.visitor_id;

      if (
        typeof id !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)
      ) {
        return reply({ error: "Invalid visitor ID" }, 400);
      }

      await env.DB.prepare(
        "INSERT OR IGNORE INTO site_visitors (visitor_id) VALUES (?)"
      ).bind(id.toLowerCase()).run();

    } else if (request.method !== "GET") {
      return reply({ error: "Method not allowed" }, 405);
    }

    const result = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM site_visitors"
    ).first();

    return reply({
      total_visitors: Number(result?.total || 0)
    });

  } catch (error) {
    console.error("Visitor counter:", error);
    return reply({ error: "Service unavailable" }, 500);
  }
}
