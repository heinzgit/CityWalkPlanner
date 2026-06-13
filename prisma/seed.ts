import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const legacyUser = await prisma.user.upsert({
    where: { username: "legacy" },
    create: {
      id: "legacy-user",
      username: "legacy",
      displayName: "历史数据",
      passwordHash: "DISABLED_LEGACY_PASSWORD"
    },
    update: {
      displayName: "历史数据"
    }
  });

  const existing = await prisma.routePlan.findFirst({ where: { userId: legacyUser.id, name: "武康路到安福路" } });
  if (existing) return;

  const folder = await prisma.folder.upsert({
    where: { id: "seed-shanghai-folder" },
    create: {
      id: "seed-shanghai-folder",
      userId: legacyUser.id,
      name: "上海示例",
      isVisible: true
    },
    update: {
      userId: legacyUser.id,
      name: "上海示例",
      isVisible: true
    }
  });

  await prisma.routePlan.create({
    data: {
      userId: legacyUser.id,
      folderId: folder.id,
      name: "武康路到安福路",
      description: "一条用于验证地图加载和图层显示的示例路线。",
      color: "#19a974",
      isVisible: true,
      pointsJson: [
        { lng: 121.438391, lat: 31.212642 },
        { lng: 121.443433, lat: 31.213181 },
        { lng: 121.449116, lat: 31.216108 }
      ]
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
