export async function onRequestPost({ request, env }) {
  const reply = (body, status = 200) =>
    Response.json(body, {
      status,
      headers: { "Cache-Control": "no-store" }
    });

  if (!env.DB || !env.FILES) {
    return reply({ error: "Storage not configured." }, 503);
  }
  if (env.UPLOADS_ENABLED !== "true") {
    return reply({ error: "Uploads are temporarily disabled." }, 503);
  }

  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return reply({ error: "Invalid request." }, 403);
  }

  const maxSize = 10 * 1024 * 1024;

  const length = Number(request.headers.get("Content-Length"));

  if (!Number.isSafeInteger(length) || length <= 0) {
    return reply({ error: "Invalid request size." }, 411);
  }

  if (length > maxSize + 65536) {
    return reply({ error: "File too large." }, 413);
  }

  let key;

  try {
    const setting = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = 'public_uploads'").first();
    if (setting?.value !== "true") {
      return reply({ error: "Uploads are temporarily disabled." }, 503);
    }

    
    if (!request.body) {
      return reply({ error: "Empty request." }, 400);
    }

    const reader = request.body.getReader();
    const chunks = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;

      if (total > maxSize + 65536) {
        await reader.cancel();
        return reply({ error: "Request too large." }, 413);
      }

      chunks.push(value);
    }

    const form = await new Response(
      new Blob(chunks),
      {
        headers: {
          "Content-Type":
            request.headers.get("Content-Type") || ""
        }
      }
    ).formData();


    if (!env.TURNSTILE_SECRET_KEY) {
      return reply({ error: "Security service unavailable." }, 503);
    }

    const token = form.get("cf-turnstile-response");

    if (typeof token !== "string" ||
        !token || token.length > 2048) {
      return reply({ error: "Complete security verification." }, 403);
    }

    const verification = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET_KEY,
          response: token
        })
      }
    );

    const check = await verification.json();

    if (!verification.ok ||
        check.success !== true ||
        check.hostname !== "eduleaf.pages.dev" ||
        check.action !== "upload") {
      return reply({ error: "Security verification failed." }, 403);
    }


    const ip = request.headers.get("CF-Connecting-IP");

    if (!ip) {
      return reply({ error: "Invalid client." }, 403);
    }

    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        env.TURNSTILE_SECRET_KEY + ":" + ip
      )
    );

    const client = Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    const windowStart = Math.floor(Date.now() / 3600000);

    const rate = await env.DB.prepare(`
      INSERT INTO upload_rate_limits
        (client_hash, window_start, attempts)
      VALUES (?, ?, 1)
      ON CONFLICT(client_hash, window_start)
      DO UPDATE SET attempts = attempts + 1
      WHERE attempts < 5
      RETURNING attempts
    `).bind(client, windowStart).first();

    if (!rate) {
      return reply({
        error: "Upload limit reached. Try again later."
      }, 429);
    }


    const day = Math.floor(Date.now() / 86400000);

    const daily = await env.DB.prepare(`
      INSERT INTO upload_daily_limits (day, attempts)
      VALUES (?, 1)
      ON CONFLICT(day)
      DO UPDATE SET attempts = attempts + 1
      WHERE attempts < 50
      RETURNING attempts
    `).bind(day).first();

    if (!daily) {
      return reply({
        error: "Daily upload limit reached. Try again tomorrow."
      }, 429);
    }


    if (daily.attempts === 1) {
      await env.DB.batch([
        env.DB.prepare(
          "DELETE FROM upload_rate_limits WHERE window_start < ?"
        ).bind(windowStart - 48),
        env.DB.prepare(
          "DELETE FROM upload_daily_limits WHERE day < ?"
        ).bind(day - 7)
      ]);
    }

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
      form.get("permission") !== "on"
    ) {
      return reply({ error: "Invalid submission details." }, 400);
    }

    if (!(file instanceof File) ||
        !file.size || file.size > maxSize) {
      return reply({ error: "Choose a file up to 10 MB." }, 400);
    }


    const allowedTypes = [
      "Study Notes",
      "Previous Year Question Papers",
      "Solved Papers",
      "Important Questions",
      "Other"
    ];

    if (!allowedTypes.includes(type)) {
      return reply({ error: "Invalid material type." }, 400);
    }

    const catalogueResponse = await fetch(
      new URL("/courses.json", request.url)
    );

    if (!catalogueResponse.ok) {
      return reply({ error: "Course catalogue unavailable." }, 503);
    }

    const courses = await catalogueResponse.json();

    const groups = {
      MAJOR: "Major",
      MINOR: "Minor",
      MULTIDISCIPLINARY: "MDC",
      ABILITY: "AEC",
      SKILL: "SEC",
      VALUE: "VAC"
    };

    const valid = courses.some(x => {
      const g = groups[x.category.split(" ")[0]] || "Other";
      const n = x.semester.startsWith("Ist")
        ? "1" : x.semester.match(/^\d+/)?.[0];

      return x.batch === batch &&
        Number(n) === semester &&
        g === category &&
        x.name + " | " + x.code === subject;
    });

    if (!valid) {
      return reply({ error: "Invalid course selection." }, 400);
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

    const currentSetting = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = 'public_uploads'").first();
    if (currentSetting?.value !== "true") {
      return reply({ error: "Uploads are temporarily disabled." }, 503);
    }
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
