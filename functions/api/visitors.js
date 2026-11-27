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
      if (
        request.headers.get("Origin") !==
        new URL(request.url).origin
      ) {
        return reply({ error: "Forbidden" }, 403);
      }

      const length = Number(
        request.headers.get("Content-Length")
      );

      if (
        !Number.isSafeInteger(length) ||
        length < 1 ||
        length > 512
      ) {
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

      const visitorId = id.toLowerCase();

      const existing = await env.DB.prepare(
        "SELECT visitor_id FROM site_visitors WHERE visitor_id = ?"
      ).bind(visitorId).first();

      if (!existing) {
        const ip = request.headers.get("CF-Connecting-IP");

        if (!ip || !env.ADMIN_SECRET) {
          return reply({ error: "Service unavailable" }, 503);
        }

        const encoder = new TextEncoder();

        const key = await crypto.subtle.importKey(
          "raw",
          encoder.encode(env.ADMIN_SECRET),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );

        const digest = await crypto.subtle.sign(
          "HMAC",
          key,
          encoder.encode("visitor-rate:" + ip)
        );

        const hash = Array.from(new Uint8Array(digest))
          .map(b => b.toString(16).padStart(2, "0"))
          .join("");

        const hour = Math.floor(Date.now() / 3600000);

        const limit = await env.DB.prepare(`
          INSERT INTO visitor_rate_limits
          (client_hash, window_start, attempts)
          VALUES (?, ?, 1)
          ON CONFLICT(client_hash, window_start)
          DO UPDATE SET attempts = attempts + 1
          WHERE attempts < 5
          RETURNING attempts
        `).bind(hash, hour).first();

        if (!limit) {
          return reply({ error: "Rate limit exceeded" }, 429);
        }

        await env.DB.prepare(
          "INSERT OR IGNORE INTO site_visitors (visitor_id) VALUES (?)"
        ).bind(visitorId).run();

        if (limit.attempts === 1) {
          await env.DB.prepare(
            "DELETE FROM visitor_rate_limits WHERE window_start < ?"
          ).bind(hour - 48).run();
        }
      }

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
