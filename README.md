# CityWalk Planner

一个使用百度地图渲染 citywalk 路线的全栈 MVP。路线像文件一样存放在多层文件夹中，文件夹和路线都支持显示/隐藏；系统加载后会把所有显示状态的路线绘制到地图上。

## 技术栈

- Vite + React + TypeScript
- Express + Prisma
- MySQL，默认连接本地 `localhost:3306/citywalk_codex`
- 百度地图 JavaScript API GL

## 本地启动

1. 安装依赖

   ```bash
   npm install
   ```

2. 创建 `.env`

   ```bash
   cp .env.template .env
   ```

   然后填写：

   ```env
   DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/citywalk_codex"
   VITE_BAIDU_MAP_AK="your-baidu-map-ak"
   PORT=43101
   SESSION_COOKIE_SECURE=false
   CORS_ORIGIN_CHECK_ENABLED=false
   CORS_ALLOWED_ORIGINS=""
   ```

3. 同步数据库表结构

   ```bash
   npm run prisma:push
   ```

   如果是在已有数据库上开启多用户支持，先手动执行用户表、会话表和 `userId` 字段的 DDL，再运行：

   ```bash
   npm run prisma:generate
   ```

4. 可选：写入示例路线

   ```bash
   npm run seed
   ```

5. 启动开发服务

   ```bash
   npm run dev
   ```

   前端默认在 `http://localhost:5173`，如果被占用 Vite 会自动使用下一个端口；后端默认在 `http://localhost:43101`。

## 当前能力

- 多层文件夹管理路线
- 文件夹递归显示/隐藏，子项单独切换后上级显示半选状态
- 加载时绘制所有可见路线
- Web 端和小程序端账号密码登录，多用户路线隔离
- 选中路线后编辑名称、描述、颜色和点位
- 点击地图新增点位，点位可删除和调整顺序
- 路线和点位保存到 MySQL

## Docker 生产部署

生产镜像只包含应用本身，不包含 MySQL，也不会自动建库、建表或执行 Prisma migrate。请先在已有 MySQL 数据库中执行 `prisma/mysql-schema.sql`。

准备部署环境变量：

```bash
cp deploy.env.example deploy.env
```

编辑 `deploy.env`，填写生产数据库连接等运行时配置。

如果直接通过 `http://服务器IP:43101` 访问，`deploy.env` 中需要设置 `SESSION_COOKIE_SECURE=false`。如果前面有 HTTPS 反向代理，则设置为 `true`。

构建镜像：

```bash
docker build \
  --build-arg VITE_BAIDU_MAP_AK="your-baidu-map-ak" \
  -t citywalk-planner:latest .
```

运行容器：

```bash
docker run -d \
  --name citywalk-planner \
  --restart unless-stopped \
  -p "${APP_PORT:-43101}:43101" \
  --env-file deploy.env \
  citywalk-planner:latest
```

生产服务默认监听容器内 `43101` 端口，并由 Express 同时提供 `/api/*` 和前端静态页面。
