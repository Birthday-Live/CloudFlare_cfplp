export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 自动建表，增加 image_base64 字段
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS bottles (
      id TEXT PRIMARY KEY,
      content TEXT,
      image_base64 TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 扔瓶子
  if (url.pathname === "/api/throw" && request.method === "POST") {
    const formData = await request.formData();
    const content = formData.get("content");
    const image = formData.get("image");

    let imageBase64 = null;
    if (image) {
      const arrayBuffer = await image.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      imageBase64 = btoa(String.fromCharCode(...buffer));
    }

    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO bottles (id, content, image_base64) VALUES (?, ?, ?)")
      .bind(id, content, imageBase64)
      .run();
    await env.KV.put(`bottle:${id}`, "1");

    return new Response("瓶子已扔出！");
  }

  // 捡瓶子
  if (url.pathname === "/api/pick") {
    const list = await env.KV.list({ prefix: "bottle:" });
    if (list.keys.length === 0) return new Response("海里没有瓶子了");

    const randomKey = list.keys[Math.floor(Math.random() * list.keys.length)].name;
    const id = randomKey.split(":")[1];
    const row = await env.DB.prepare("SELECT content, image_base64, created_at FROM bottles WHERE id = ?")
      .bind(id)
      .first();

    if (!row) return new Response("瓶子丢失了");

    return new Response(JSON.stringify(row), { headers: { "Content-Type": "application/json" } });
  }

  // 管理端登录
  if (url.pathname === "/api/admin/login" && request.method === "POST") {
    const { password } = await request.json();
    if (password === env.ADMIN) {
      const token = crypto.randomUUID();
      await env.KV.put(`admin:${token}`, "1", { expirationTtl: 3600 });
      return new Response(token);
    }
    return new Response("Unauthorized", { status: 401 });
  }

  // 管理端列表（不删除数据）
  if (url.pathname === "/api/admin/list") {
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
    const token = auth.split(" ")[1];
    const valid = await env.KV.get(`admin:${token}`);
    if (!valid) return new Response("Unauthorized", { status: 401 });

    const rows = await env.DB.prepare("SELECT id, content, image_base64, created_at FROM bottles").all();
    return new Response(JSON.stringify(rows.results), { headers: { "Content-Type": "application/json" } });
  }

  // 管理端清理（只删除两年前的数据）
  if (url.pathname === "/api/admin/cleanup" && request.method === "POST") {
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
    const token = auth.split(" ")[1];
    const valid = await env.KV.get(`admin:${token}`);
    if (!valid) return new Response("Unauthorized", { status: 401 });

    await env.DB.prepare(`
      DELETE FROM bottles WHERE created_at < datetime('now', '-2 years')
    `).run();

    return new Response("已清理两年前的瓶子数据");
  }

  return new Response("Not Found", { status: 404 });
}