export async function onRequestPost({ request, env }) {
  const reply = (body, status = 200) =>
    Response.json(body, {
      status,
      headers: { "Cache-Control": "no-store" }
    });

  if (!env.DB || !env.FILES) {
    return reply({ error: "Storage not configured." }, 503);
  }
if (
  !env.UPLOAD_TEST_KEY ||
  request.headers.get("X-Upload-Test-Key") !== env.UPLOAD_TEST_KEY
) {
  return reply({ error: "Unauthorized request." }, 403);
}
  if (env.UPLOADS_ENABLED !== "true") {
    return reply({ error: "Uploads are temporarily disabled." }, 503);
  }

  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return reply({ error: "Invalid request." }, 403);
  }

  const maxSize = 10 * 1024 * 1024;

  if (Number(request.headers.get("Content-Length")) > maxSize + 65536) {
    return reply({ error: "File too large." }, 413);
  }

  let key;

  try {
    const form = await request.formData();
    const file = form.get("file");

    const get = (name, limit = 200) =>
      String(form.get(name) || "").trim().slice(0, limit);

    const batch = get("batch");
    const semester = Number(get("semester"));
    const category = get("category");
    const subject = get("subject");
    const type = get("type");
    const details = get("details", 1000);
    const contributor = get("contributor", 100);

    if (
      !["2024", "2025", "2026"].includes(batch) ||
      !Number.isInteger(semester) ||
      semester < 1 || semester > 8 ||
      !category || !subject || !type ||
      !form.get("permission")
    ) {
      return reply({ error: "Invalid submission details." }, 400);
    }

    if (!(file instanceof File) ||
        !file.size || file.size > maxSize) {
      return reply({ error: "Choose a file up to 10 MB." }, 400);
    }

    const ext = file.name.split(".").pop().toLowerCase();

    const signatures = {
      pdf: [37, 80, 68, 70, 45],
      jpg: [255, 216, 255],
      jpeg: [255, 216, 255],
      png: [137, 80, 78, 71, 13, 10, 26, 10],
      docx: [80, 75, 3, 4]
    };

    const signature = signatures[ext];

    if (!Array.isArray(signature)) {
      return reply({ error: "Unsupported file type." }, 400);
    }

    const bytes = await file.arrayBuffer();
    const view = new Uint8Array(bytes);

    if (!signature.every((v, i) => view[i] === v)) {
      return reply({ error: "Invalid file format." }, 400);
    }

    key = "pending/" + crypto.randomUUID() + "." + ext;

    await env.FILES.put(key, bytes);

    const result = await env.DB.prepare(`
      INSERT INTO submissions (
        batch, semester, category, subject,
        material_type, description, contributor,
        file_name, file_key, file_size, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).bind(
      batch, semester, category, subject,
      type, details, contributor,
      file.name.slice(0, 200), key, file.size
    ).run();

    return reply({
      ok: true,
      id: result.meta.last_row_id,
      message: "Submitted for review."
    }, 201);

  } catch (error) {
    if (key) {
      try {
        await env.FILES.delete(key);
      } catch {}
    }

    return reply({
      error: "Unable to save submission. Please try again."
    }, 500);
  }
      }
