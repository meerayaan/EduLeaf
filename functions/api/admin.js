export async function onRequest({ request, env }) {
  const reply = (body, status = 200) =>
    Response.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });

  if (!env.DB || !env.FILES || !env.ADMIN_SECRET) {
    return reply({ error: "Admin unavailable." }, 503);
  }

  const token = request.headers.get("Authorization");

  if (token !== `Bearer ${env.ADMIN_SECRET}`) {
    return reply({ error: "Unauthorized." }, 401);
  }

  if (request.method !== "GET") {
    return reply({ error: "Method not allowed." }, 405);
  }

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "list";

    if (action === "list") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM submissions ORDER BY id DESC LIMIT 100"
      ).all();

      return reply({
        ok: true,
        submissions: results
      });
    }

    if (action === "download") {
      const id = Number(url.searchParams.get("id"));

      if (!Number.isSafeInteger(id) || id < 1) {
        return reply({ error: "Invalid ID." }, 400);
      }

      const row = await env.DB.prepare(
        "SELECT file_key FROM submissions WHERE id = ?"
      ).bind(id).first();

      if (!row || !row.file_key) {
        return reply({ error: "File not found." }, 404);
      }

      const file = await env.FILES.get(
        row.file_key, "arrayBuffer"
      );

      if (!file) {
        return reply({ error: "File not found." }, 404);
      }

      return new Response(file, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": "attachment",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    return reply({ error: "Invalid action." }, 400);

  } catch {
    return reply({ error: "Admin request failed." }, 500);
  }
    }
