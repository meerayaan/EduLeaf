export async function onRequest({ request, env }) {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };

  const reply = (body, status = 200) =>
    Response.json(body, { status, headers });

  if (request.method !== "GET") {
    return reply({ error: "Method not allowed." }, 405);
  }

  if (!env.DB || !env.FILES) {
    return reply({ error: "Service unavailable." }, 503);
  }

  if (env.MATERIALS_PUBLIC !== "true") {
    return reply({
      error: "Publishing is temporarily disabled."
    }, 503);
  }

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "list";

    if (action === "list") {
      const batch = url.searchParams.get("batch") || "";
      const semester = Number(url.searchParams.get("semester"));
      const category = (url.searchParams.get("category") || "").trim();
      const subject = (url.searchParams.get("subject") || "").trim();
      const type = (url.searchParams.get("type") || "").trim();

      if (
        !["2024", "2025", "2026"].includes(batch) ||
        !Number.isInteger(semester) ||
        semester < 1 || semester > 8 ||
        !category || !subject || !type ||
        [category, subject, type].some(v => v.length > 200)
      ) {
        return reply({ error: "Invalid parameters." }, 400);
      }

      const { results } = await env.DB.prepare(`
        SELECT id, batch, semester, category,
               subject, material_type, description,
               file_name, file_size
        FROM submissions
        WHERE status = 'approved'
          AND batch = ?
          AND semester = ?
          AND category = ?
          AND subject = ?
          AND material_type = ?
        ORDER BY id DESC
        LIMIT 100
      `).bind(
        batch, semester, category, subject, type
      ).all();

      return reply({
        ok: true,
        materials: results.map(row => ({
          ...row,
          download_url:
            "/api/materials?action=download&id=" + row.id
        }))
      });
    }

    if (action === "download") {
      const id = Number(url.searchParams.get("id"));

      if (!Number.isSafeInteger(id) || id < 1) {
        return reply({ error: "Invalid ID." }, 400);
      }

      const row = await env.DB.prepare(`
        SELECT file_key, file_name
        FROM submissions
        WHERE id = ? AND status = 'approved'
      `).bind(id).first();

      if (!row || !row.file_key) {
        return reply({ error: "File not found." }, 404);
      }

      const file = await env.FILES.get(
        row.file_key, "arrayBuffer"
      );

      if (!file) {
        return reply({ error: "File not found." }, 404);
      }

      const ext = row.file_key.split(".").pop().toLowerCase();

      const mimeTypes = {
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      };

      if (!Object.hasOwn(mimeTypes, ext)) {
        return reply({ error: "Unsupported file." }, 415);
      }

      const filename = "EduLeaf-" + id + "." + ext;

      return new Response(file, {
        headers: {
          ...headers,
          "Content-Type": mimeTypes[ext],
          "Content-Disposition":
            'attachment; filename="' + filename + '"',
          "Content-Security-Policy": "default-src 'none'; sandbox"
        }
      });
    }

    return reply({ error: "Invalid action." }, 400);

  } catch {
    return reply({
      error: "Unable to load materials."
    }, 500);
  }
}
