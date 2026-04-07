export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // --- 1. 静态资源与主页放行 ---GitHub根深地固
  // 如果访问的是根目录，或者路径包含点（如 .html, .css, .js, .png）
  // 则跳过后端逻辑，直接去 public 文件夹找文件
  if (path === "/" || path.includes(".")) {
    return context.next();
  }

  // --- 2. 数据库初始化 (自动建表) ---
  // 每次请求都会尝试检查表是否存在，确保数据库准备就绪
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS bottles (
        id TEXT PRIMARY KEY,
        content TEXT,
        image_base64 TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch (e) {
    return new Response(JSON.stringify({ error: "数据库连接失败，请检查 Cloudflare D1 绑定", details: e.message }), { 
      status: 500, 
      headers: { "Content-Type": "application/json" } 
    });
  }

  // --- 3. 路由逻辑 ---

  // 【接口：扔瓶子】
  if (path === "/api/throw" && request.method === "POST") {
    try {
      const formData = await request.formData();
      const content = formData.get("content");
      const image = formData.get("image");

      let imageBase64 = null;
      if (image && image.size > 0) {
        const arrayBuffer = await image.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        // 将图片转为 Base64 字符串存储
        imageBase64 = btoa(String.fromCharCode(...buffer));
      }

      const id = crypto.randomUUID();
      // 写入 D1 数据库
      await env.DB.prepare("INSERT INTO bottles (id, content, image_base64) VALUES (?, ?, ?)")
        .bind(id, content, imageBase64)
        .run();
      // 在 KV 中存入索引，方便随机抽取
      await env.KV.put(`bottle:${id}`, "1");

      return new Response("瓶子已扔向大海！", { status: 200 });
    } catch (e) {
      return new Response("扔瓶子失败: " + e.message, { status: 500 });
    }
  }

  // 【接口：捡瓶子】
  if (path === "/api/pick") {
    try {
      // 从 KV 获取所有瓶子的 Key
      const list = await env.KV.list({ prefix: "bottle:" });
      if (list.keys.length === 0) {
        return new Response(JSON.stringify({ content: "海里现在空荡荡的，没有瓶子。" }), { 
          headers: { "Content-Type": "application/json" } 
        });
      }

      // 随机选一个 ID
      const randomKey = list.keys[Math.floor(Math.random() * list.keys.length)].name;
      const id = randomKey.split(":")[1];

      // 从 D1 查询详细内容
      const row = await env.DB.prepare("SELECT content, image_base64, created_at FROM bottles WHERE id = ?")
        .bind(id)
        .first();

      if (!row) {
        return new Response(JSON.stringify({ content: "瓶子在深海中飘走了..." }), { 
          status: 404,
          headers: { "Content-Type": "application/json" } 
        });
      }

      return new Response(JSON.stringify(row), { 
        headers: { "Content-Type": "application/json" } 
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "捡瓶子失败", details: e.message }), { 
        status: 500,
        headers: { "Content-Type": "application/json" } 
      });
    }
  }

  // 【接口：管理端登录】
  if (path === "/api/admin/login" && request.method === "POST") {
    try {
      const { password } = await request.json();
      if (password === env.ADMIN) {
        const token = crypto.randomUUID();
        // Token 存入 KV，有效期 1 小时
        await env.KV.put(`admin:${token}`, "1", { expirationTtl: 3600 });
        return new Response(token);
      }
      return new Response("密码错误", { status: 401 });
    } catch (e) {
      return new Response("登录异常", { status: 500 });
    }
  }

  // 【接口：管理端获取列表】
  if (path === "/api/admin/list") {
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) return new Response("未授权", { status: 401 });
    const token = auth.split(" ")[1];
    const valid = await env.KV.get(`admin:${token}`);
    if (!valid) return new Response("登录已过期", { status: 401 });

    const rows = await env.DB.prepare("SELECT id, content, image_base64, created_at FROM bottles ORDER BY created_at DESC").all();
    return new Response(JSON.stringify(rows.results), { 
      headers: { "Content-Type": "application/json" } 
    });
  }

  // 【接口：清理旧数据】
  if (path === "/api/admin/cleanup" && request.method === "POST") {
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) return new Response("未授权", { status: 401 });
    const token = auth.split(" ")[1];
    const valid = await env.KV.get(`admin:${token}`);
    if (!valid) return new Response("登录已过期", { status: 401 });

    await env.DB.prepare("DELETE FROM bottles WHERE created_at < datetime('now', '-2 years')").run();
    return new Response("清理完成");
  }

  // --- 4. 兜底处理 ---
  // 如果既不是静态文件，也不是上面定义的 API，则尝试交给 Pages 默认处理器
  return context.next();
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
