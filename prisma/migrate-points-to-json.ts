import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const routes = await prisma.routePlan.findMany({
    include: { points: { orderBy: { orderIndex: "asc" } } }
  });

  for (const route of routes) {
    const existingJson = Array.isArray(route.pointsJson) ? route.pointsJson : [];
    if (existingJson.length > 0 || route.points.length === 0) continue;

    await prisma.routePlan.update({
      where: { id: route.id },
      data: {
        pointsJson: route.points.map((point) => ({
          lng: point.lng,
          lat: point.lat
        }))
      }
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
