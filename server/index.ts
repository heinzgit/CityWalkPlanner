import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT ?? 43101);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const idSchema = z.string().min(1);
const optionalIdSchema = z.string().min(1).nullable().optional();
const nameSchema = z.string().trim().min(1).max(120);
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const routePointSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90)
});

type RoutePointPayload = z.infer<typeof routePointSchema>;

function normalizeRoutePoints(pointsJson: unknown): RoutePointPayload[] {
  const parsed = z.array(routePointSchema).safeParse(pointsJson ?? []);
  return parsed.success ? parsed.data : [];
}

function serializeRoute<T extends { pointsJson: unknown }>(route: T) {
  const { pointsJson, ...rest } = route;
  return {
    ...rest,
    points: normalizeRoutePoints(pointsJson)
  };
}

async function collectDescendantFolderIds(folderId: string) {
  const descendants: string[] = [];
  const queue = [folderId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = await prisma.folder.findMany({
      where: { parentId: currentId },
      select: { id: true }
    });
    const childIds = children.map((child) => child.id);
    descendants.push(...childIds);
    queue.push(...childIds);
  }

  return descendants;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/tree", async (_req, res, next) => {
  try {
    const [folders, routes] = await Promise.all([
      prisma.folder.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.routePlan.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
    ]);

    res.json({ folders, routes: routes.map(serializeRoute) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/folders", async (req, res, next) => {
  try {
    const input = z
      .object({
        name: nameSchema,
        parentId: optionalIdSchema,
        sortOrder: z.number().int().optional()
      })
      .parse(req.body);

    const folder = await prisma.folder.create({
      data: {
        name: input.name,
        parentId: input.parentId ?? null,
        sortOrder: input.sortOrder ?? 0
      }
    });

    res.status(201).json(folder);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/folders/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const input = z
      .object({
        name: nameSchema.optional(),
        parentId: optionalIdSchema,
        sortOrder: z.number().int().optional()
      })
      .parse(req.body);

    const folder = await prisma.folder.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {})
      }
    });

    res.json(folder);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/folders/:id/visibility", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const input = z.object({ isVisible: z.boolean() }).parse(req.body);
    const descendantIds = await collectDescendantFolderIds(id);
    const folderIds = [id, ...descendantIds];

    await prisma.$transaction([
      prisma.folder.updateMany({ where: { id: { in: folderIds } }, data: { isVisible: input.isVisible } }),
      prisma.routePlan.updateMany({ where: { folderId: { in: folderIds } }, data: { isVisible: input.isVisible } })
    ]);

    res.json({ folderIds, isVisible: input.isVisible });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/folders/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    await prisma.folder.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/routes", async (req, res, next) => {
  try {
    const input = z
      .object({
        name: nameSchema,
        folderId: optionalIdSchema,
        color: colorSchema.optional(),
        sortOrder: z.number().int().optional()
      })
      .parse(req.body);

    const route = await prisma.routePlan.create({
      data: {
        name: input.name,
        folderId: input.folderId ?? null,
        color: input.color ?? "#1677ff",
        pointsJson: [],
        sortOrder: input.sortOrder ?? 0
      }
    });

    res.status(201).json(serializeRoute(route));
  } catch (error) {
    next(error);
  }
});

app.get("/api/routes/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const route = await prisma.routePlan.findUnique({
      where: { id }
    });

    if (!route) {
      res.status(404).json({ message: "Route not found" });
      return;
    }

    res.json(serializeRoute(route));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/routes/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const input = z
      .object({
        name: nameSchema.optional(),
        folderId: optionalIdSchema,
        description: z.string().nullable().optional(),
        color: colorSchema.optional(),
        mapLng: z.number().nullable().optional(),
        mapLat: z.number().nullable().optional(),
        mapZoom: z.number().nullable().optional(),
        sortOrder: z.number().int().optional()
      })
      .parse(req.body);

    const route = await prisma.routePlan.update({
      where: { id },
      data: input
    });

    res.json(serializeRoute(route));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/routes/:id/visibility", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const input = z.object({ isVisible: z.boolean() }).parse(req.body);
    const route = await prisma.routePlan.update({
      where: { id },
      data: { isVisible: input.isVisible }
    });

    res.json(serializeRoute(route));
  } catch (error) {
    next(error);
  }
});

app.post("/api/routes/:id/copy", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const source = await prisma.routePlan.findUnique({
      where: { id }
    });

    if (!source) {
      res.status(404).json({ message: "Route not found" });
      return;
    }

    const route = await prisma.routePlan.create({
      data: {
        folderId: source.folderId,
        name: `${source.name} 副本`,
        description: source.description,
        color: source.color,
        isVisible: source.isVisible,
        pointsJson: normalizeRoutePoints(source.pointsJson),
        mapLng: source.mapLng,
        mapLat: source.mapLat,
        mapZoom: source.mapZoom,
        sortOrder: source.sortOrder + 1
      }
    });

    res.status(201).json(serializeRoute(route));
  } catch (error) {
    next(error);
  }
});

app.put("/api/routes/:id/points", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const input = z
      .object({
        points: z.array(routePointSchema)
      })
      .parse(req.body);

    const route = await prisma.routePlan.update({
      where: { id },
      data: { pointsJson: input.points },
    });

    res.json(serializeRoute(route));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/routes/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    await prisma.routePlan.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: "Invalid request", issues: error.issues });
    return;
  }

  console.error(error);
  const statusCode =
    typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : 500;
  res.status(statusCode).json({ message: error instanceof Error ? error.message : "Internal server error" });
});

app.listen(port, () => {
  console.log(`CityWalk Planner API listening on http://localhost:${port}`);
});
