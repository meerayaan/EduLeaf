const COOKIE = '__Host-eduleaf_admin';
const encoder = new TextEncoder();

async function hash(value) {
  const bytes = await crypto.subtle.digest(
    'SHA-256', encoder.encode(value)
  );
  return Array.from(new Uint8Array(bytes),
    b => b.toString(16).padStart(2, '0')).join('');
}

function sessionToken(request) {
  const cookie = request.headers.get('Cookie') || '';
  return cookie.split(';').map(x => x.trim())
    .find(x => x.startsWith(COOKIE + '='))
    ?.slice(COOKIE.length + 1) || '';
}

export async function onRequest({request, env}) {
  const reply = (data, status = 200, cookie) => {
    const headers = {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    };
    if (cookie) headers['Set-Cookie'] = cookie;
    return Response.json(data, {status, headers});
  };

  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const now = Math.floor(Date.now() / 1000);

  if (!env.DB || !env.ADMIN_SECRET)
    return reply({error:'Admin unavailable'},503);

  const q = (sql,...args) =>
    env.DB.prepare(sql).bind(...args);

  const cookieBase =
    '; Path=/; Secure; HttpOnly; SameSite=Strict';

  try {
    if (request.method === 'POST' &&
        request.headers.get('Origin') !== url.origin)
      return reply({error:'Invalid origin'},403);

    if (action === 'login' && request.method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP');
      if (!ip) return reply({error:'Client unavailable'},403);

      const client = await hash(env.ADMIN_SECRET + ':' + ip);
      const window = Math.floor(now / 900) * 900;

      const limit = await q(
        `INSERT INTO admin_login_limits
         (client_hash,attempts,window_start)
         VALUES (?,1,?)
         ON CONFLICT(client_hash) DO UPDATE SET
         attempts=CASE WHEN window_start=excluded.window_start
         THEN attempts+1 ELSE 1 END,
         window_start=excluded.window_start
         RETURNING attempts`,client,window
      ).first();

      if (limit.attempts > 5)
        return reply({error:'Try again in 15 minutes'},429);

      const reader = request.body?.getReader();
      if (!reader) return reply({error:'Missing body'},400);
      let size = 0, chunks = [];
      while (true) {
        const {done,value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return reply({error:'Request too large'},413);
        }
        chunks.push(value);
      }

      let data;
      try {
        data = JSON.parse(await new Blob(chunks).text());
      } catch {
        return reply({error:'Invalid request'},400);
      }

      if (!data || typeof data.password !== 'string')
        return reply({error:'Invalid password'},400);

      const a = await hash(data.password);
      const b = await hash(env.ADMIN_SECRET);
      let diff = 0;
      for (let i=0;i<a.length;i++)
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);

      if (diff !== 0) {
        await q(
          'INSERT INTO admin_login_history(event) VALUES (?)',
          'failed_login'
        ).run();
        return reply({error:'Incorrect password'},401);
      }

      const token = Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        b=>b.toString(16).padStart(2,'0')
      ).join('');

      const ttl = data.remember === true ? 604800 : 28800;
      const previous = sessionToken(request);

      if (previous)
        await q('DELETE FROM admin_sessions WHERE token_hash=?',
          await hash(previous)).run();

      await q('DELETE FROM admin_sessions WHERE expires_at<=?',
        now).run();

      await q(
        `INSERT INTO admin_sessions
         (token_hash,created_at,expires_at,last_seen)
         VALUES (?,?,?,?)`,
        await hash(token),now,now+ttl,now
      ).run();

      await q(
        'INSERT INTO admin_login_history(event) VALUES (?)',
        'login_success'
      ).run();

      return reply({success:true},200,
        COOKIE+'='+token+cookieBase+
        (data.remember === true ? '; Max-Age='+ttl : ''));
    }

    const token = sessionToken(request);

    if (action === 'logout' && request.method === 'POST') {
      if (token)
        await q('DELETE FROM admin_sessions WHERE token_hash=?',
          await hash(token)).run();

      return reply({success:true},200,
        COOKIE+'='+cookieBase+'; Max-Age=0');
    }

    if (action === 'session' && request.method === 'GET') {
      const session = token && await q(
        'SELECT expires_at FROM admin_sessions WHERE token_hash=? AND expires_at>?',
        await hash(token),now
      ).first();

      return session
        ? reply({authenticated:true,expires_at:session.expires_at})
        : reply({authenticated:false},401);
    }

    return reply({error:'Invalid action'},400);
  } catch {
    return reply({error:'Authentication service error'},500);
  }
}
