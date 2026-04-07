漂流瓶系统 (Cloudflare Pages + Functions + D1 + KV)

这是一个基于 Cloudflare Pages Functions 的漂流瓶系统，包含前端页面和后端 API。支持：
- 扔瓶子
- 捡瓶子
- 管理端登录（密码由环境变量 ADMIN 控制）
- 自动建表（无需手动初始化 D1）

---

📂 项目结构

`
drift-bottle/
├── public/                     # 前端静态资源目录
│   ├── index.html              # 入口页面
│   ├── throw.html              # 扔瓶子页面
│   ├── pick.html               # 捡瓶子页面
│   ├── admin.html              # 管理端页面
│   └── style.css               # 公共样式
│
├── functions/                  # Cloudflare Pages Functions
│   └── api.js                  # API逻辑：扔瓶子/捡瓶子/管理端
│
├── README.md                   # 项目说明文档
`

---

⚙️ 部署步骤

1. 打包项目
- 将整个 drift-bottle/ 文件夹打包为 ZIP，或推送到 GitHub 仓库。
- 不要只打包 public 或 functions，必须整个目录一起。

2. 创建 Cloudflare Pages 项目
- 在 Cloudflare Dashboard → Pages → 创建新项目。
- 选择上传 ZIP 或绑定 GitHub 仓库。
- Pages 会自动识别：
  - public/ → 前端静态资源
  - functions/ → 后端 API

3. 配置环境变量
在 Pages 项目设置 → Environment Variables 添加：
- DB → 绑定 D1 数据库
- KV → 绑定 KV 命名空间
- ADMIN → 管理端登录密码（例如 mysecret）

4. 数据库自动建表
无需手动建表，functions/api.js 会在第一次请求时自动执行：
`sql
CREATE TABLE IF NOT EXISTS bottles (
  id TEXT PRIMARY KEY,
  content TEXT,
  createdat TIMESTAMP DEFAULT CURRENTTIMESTAMP
);
`

---

🔑 API 路由

- POST /api/throw  
  扔瓶子，body: { "content": "..." }

- GET /api/pick  
  随机捡一个瓶子

- POST /api/admin/login  
  登录管理端，body: { "password": "..." }  
  返回 token（有效期 1 小时）

- GET /api/admin/list  
  查看所有瓶子（需 Authorization: Bearer <token>）

- POST /api/admin/delete?id=xxx  
  删除瓶子（需 Authorization: Bearer <token>）

---

🎨 前端页面

- index.html → 系统入口  
- throw.html → 扔瓶子  
- pick.html → 捡瓶子  
- admin.html → 管理端（登录后可查看/删除瓶子）  
- style.css → 公共样式，统一风格  

---

🚀 使用方法

1. 打开 index.html，选择功能入口。  
2. 在 throw.html 输入内容并提交，即可扔瓶子。  
3. 在 pick.html 点击按钮，即可随机捡瓶子。  
4. 在 admin.html 输入密码（环境变量 ADMIN），登录后可查看和删除瓶子。  

---