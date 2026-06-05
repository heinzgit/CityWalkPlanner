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
   ```

3. 同步数据库表结构

   ```bash
   npm run prisma:push
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
- 选中路线后编辑名称、描述、颜色和点位
- 点击地图新增点位，点位可删除和调整顺序
- 路线和点位保存到 MySQL
