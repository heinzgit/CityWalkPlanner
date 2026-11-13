import cors from "cors";
import crypto from "node:crypto";
import path from "node:path";
import dotenv from "dotenv";
import express from "express";
import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT ?? 43101);
const host = process.env.HOST ?? "0.0.0.0";
const sessionCookieName = "citywalk_session";
const sessionDurationMs = 30 * 24 * 60 * 60 * 1000;
const miniProgramDefaultUsername = "heinz";
const isProduction = process.env.NODE_ENV === "production";
const isSessionCookieSecure =
  process.env.SESSION_COOKIE_SECURE === undefined ? isProduction : process.env.SESSION_COOKIE_SECURE === "true";
const isCorsOriginCheckEnabled = process.env.CORS_ORIGIN_CHECK_ENABLED === "true";
const corsAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!isCorsOriginCheckEnabled || !origin) {
        callback(null, true);
        return;
      }

      callback(null, corsAllowedOrigins.includes(origin));
    }
  })
);
app.use(express.json({ limit: "2mb" }));

const idSchema = z.string().min(1);
const optionalIdSchema = z.string().min(1).nullable().optional();
const nameSchema = z.string().trim().min(1).max(120);
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-zA-Z0-9_.-]+$/);
const passwordSchema = z.string().min(8).max(128);
const travelModeSchema = z.enum(["walking", "vehicle"]);
const dateOnlyTextSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Invalid calendar date");
const dateOnlySchema = dateOnlyTextSchema.transform((value) => new Date(`${value}T00:00:00.000Z`));
const routePointSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90)
});

type RoutePointPayload = z.infer<typeof routePointSchema>;
type AuthenticatedRequest = Request & {
  user: {
    id: string;
    username: string;
    displayName: string | null;
  };
  sessionToken?: string;
};

function parseCookies(header: string | undefined) {
  const cookies = new Map<string, string>();
  if (!header) return cookies;

  header.split(";").forEach((part) => {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) return;
    cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
  });

  return cookies;
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, expectedHash] = storedHash.split(":");
  if (scheme !== "scrypt" || !salt || !expectedHash) return false;

  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSessionCookieSecure,
    path: "/",
    expires: expiresAt
  });
}

function clearSessionCookie(res: Response) {
  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSessionCookieSecure,
    path: "/"
  });
}

function serializeUser(user: { id: string; username: string; displayName: string | null }) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName
  };
}

async function createSession(userId: string, res: Response) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDurationMs);

  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt
    }
  });

  setSessionCookie(res, token, expiresAt);
  return token;
}

async function getMiniProgramDefaultUser() {
  return prisma.user.upsert({
    where: { username: miniProgramDefaultUsername },
    update: {},
    create: {
      username: miniProgramDefaultUsername,
      displayName: miniProgramDefaultUsername,
      passwordHash: hashPassword(crypto.randomBytes(32).toString("base64url"))
    },
    select: {
      id: true,
      username: true,
      displayName: true
    }
  });
}

async function authenticate(req: Request, res: Response, next: express.NextFunction) {
  try {
    const authorization = req.header("authorization");
    const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    const cookieToken = parseCookies(req.header("cookie")).get(sessionCookieName);
    const token = bearerToken || cookieToken;

    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const session = await prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true
          }
        }
      }
    });

    if (!session || session.expiresAt <= new Date()) {
      if (session) {
        await prisma.authSession.delete({ where: { id: session.id } }).catch(() => undefined);
      }
      clearSessionCookie(res);
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    (req as AuthenticatedRequest).user = session.user;
    (req as AuthenticatedRequest).sessionToken = token;
    next();
  } catch (error) {
    next(error);
  }
}

function userIdOf(req: Request) {
  return (req as AuthenticatedRequest).user.id;
}

function normalizeRoutePoints(pointsJson: unknown): RoutePointPayload[] {
  const parsed = z.array(routePointSchema).safeParse(pointsJson ?? []);
  return parsed.success ? parsed.data : [];
}

function serializeDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function serializeRoute<T extends { pointsJson: unknown; completedOn?: Date | null }>(route: T) {
  const { pointsJson, ...rest } = route;
  return {
    ...rest,
    completedOn: route.completedOn ? serializeDateOnly(route.completedOn) : null,
    points: normalizeRoutePoints(pointsJson)
  };
}

async function collectDescendantFolderIds(userId: string, folderId: string) {
  const descendants: string[] = [];
  const queue = [folderId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = await prisma.folder.findMany({
      where: { userId, parentId: currentId },
      select: { id: true }
    });
    const childIds = children.map((child) => child.id);
    descendants.push(...childIds);
    queue.push(...childIds);
  }

  return descendants;
}

async function ensureFolderBelongsToUser(userId: string, folderId: string | null | undefined) {
  if (!folderId) return;

  const folder = await prisma.folder.findFirst({
    where: { id: folderId, userId },
    select: { id: true }
  });

  if (!folder) {
    const error = new Error("Folder not found");
    (error as Error & { statusCode: number }).statusCode = 404;
    throw error;
  }
}

function validationError(message: string) {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = 400;
  return error;
}

/** Routes are organized as: first-level directory → second-level directory → route. */
async function ensureTwoLevelFolderParent(userId: string, parentId: string | null | undefined) {
  if (!parentId) return;

  const parent = await prisma.folder.findFirst({
    where: { id: parentId, userId },
    select: { parentId: true }
  });

  if (!parent) throw validationError("Folder not found");
  if (parent.parentId) {
    throw validationError("Only two folder levels are supported");
  }
}

async function collectAncestorFolderIds(userId: string, folderId: string | null | undefined) {
  const ancestorIds: string[] = [];
  let currentId = folderId ?? null;

  while (currentId) {
    const folder = await prisma.folder.findFirst({
      where: { id: currentId, userId },
      select: { id: true, parentId: true }
    });
    if (!folder) break;
    ancestorIds.push(folder.id);
    currentId = folder.parentId;
  }

  return ancestorIds;
}

async function ensureRouteBelongsToUser(userId: string, routeId: string) {
  const route = await prisma.routePlan.findFirst({
    where: { id: routeId, userId }
  });

  if (!route) {
    const error = new Error("Route not found");
    (error as Error & { statusCode: number }).statusCode = 404;
    throw error;
  }

  return route;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const input = z
      .object({
        username: usernameSchema.transform((value) => value.toLowerCase()),
        password: passwordSchema,
        displayName: z.string().trim().min(1).max(120).optional()
      })
      .parse(req.body);

    const user = await prisma.user.create({
      data: {
        username: input.username,
        displayName: input.displayName ?? input.username,
        passwordHash: hashPassword(input.password)
      },
      select: {
        id: true,
        username: true,
        displayName: true
      }
    });

    const token = await createSession(user.id, res);
    res.status(201).json({ user: serializeUser(user), token });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      res.status(409).json({ message: "Username already exists" });
      return;
    }
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const input = z
      .object({
        username: usernameSchema.transform((value) => value.toLowerCase()),
        password: passwordSchema
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({
      where: { username: input.username }
    });

    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      res.status(401).json({ message: "Invalid username or password" });
      return;
    }

    const token = await createSession(user.id, res);
    res.json({ user: serializeUser(user), token });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/miniprogram/default-user", async (_req, res, next) => {
  try {
    const user = await getMiniProgramDefaultUser();
    const token = await createSession(user.id, res);
    res.json({ user: serializeUser(user), token });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", authenticate, (req, res) => {
  res.json({ user: serializeUser((req as AuthenticatedRequest).user) });
});

app.post("/api/auth/logout", authenticate, async (req, res, next) => {
  try {
    const token = (req as AuthenticatedRequest).sessionToken;
    if (token) {
      await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
    }
    clearSessionCookie(res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/tree", authenticate, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const [folders, routes] = await Promise.all([
      prisma.folder.findMany({ where: { userId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.routePlan.findMany({ where: { userId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
    ]);

    res.json({ folders, routes: routes.map(serializeRoute) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/stats/travel", authenticate, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const filters = z
      .object({
        from: dateOnlySchema.optional(),
        to: dateOnlySchema.optional(),
        travelMode: travelModeSchema.optional()
      })
      .parse(req.query);

    if (filters.from && filters.to && filters.from > filters.to) {
      throw validationError("Start date must not be after end date");
    }

    const routes = await prisma.routePlan.findMany({
      where: {
        userId,
        completedOn: {
          not: null,
          ...(filters.from ? { gte: filters.from } : {}),
          ...(filters.to ? { lte: filters.to } : {})
        },
        distanceMeters: { not: null },
        travelMode: filters.travelMode ?? { in: travelModeSchema.options }
      },
      select: {
        id: true,
        name: true,
        completedOn: true,
        distanceMeters: true,
        travelMode: true
      },
      orderBy: [{ completedOn: "desc" }, { name: "asc" }]
    });

    const items = routes.flatMap((route) => {
      const mode = travelModeSchema.safeParse(route.travelMode);
      if (!route.completedOn || route.distanceMeters === null || !mode.success) return [];
      return [{
        routeId: route.id,
        name: route.name,
        completedOn: serializeDateOnly(route.completedOn),
        distanceMeters: route.distanceMeters,
        travelMode: mode.data
      }];
    });
    const dailyMap = new Map<
      string,
      {
        date: string;
        tripCount: number;
        walkingDistanceMeters: number;
        vehicleDistanceMeters: number;
      }
    >();
    const monthlyMap = new Map<string, { month: string; tripCount: number; distanceMeters: number }>();
    let walkingDistanceMeters = 0;
    let vehicleDistanceMeters = 0;

    items.forEach((item) => {
      if (item.travelMode === "walking") walkingDistanceMeters += item.distanceMeters;
      if (item.travelMode === "vehicle") vehicleDistanceMeters += item.distanceMeters;

      const dailyBucket = dailyMap.get(item.completedOn) ?? {
        date: item.completedOn,
        tripCount: 0,
        walkingDistanceMeters: 0,
        vehicleDistanceMeters: 0
      };
      dailyBucket.tripCount += 1;
      if (item.travelMode === "walking") dailyBucket.walkingDistanceMeters += item.distanceMeters;
      if (item.travelMode === "vehicle") dailyBucket.vehicleDistanceMeters += item.distanceMeters;
      dailyMap.set(item.completedOn, dailyBucket);

      const month = item.completedOn.slice(0, 7);
      const bucket = monthlyMap.get(month) ?? { month, tripCount: 0, distanceMeters: 0 };
      bucket.tripCount += 1;
      bucket.distanceMeters += item.distanceMeters;
      monthlyMap.set(month, bucket);
    });

    res.json({
      summary: {
        tripCount: items.length,
        totalDistanceMeters: walkingDistanceMeters + vehicleDistanceMeters,
        walkingDistanceMeters,
        vehicleDistanceMeters
      },
      daily: [...dailyMap.values()].sort((left, right) => left.date.localeCompare(right.date)),
      monthly: [...monthlyMap.values()].sort((left, right) => right.month.localeCompare(left.month)),
      items
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/folders", authenticate, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const input = z
      .object({
        name: nameSchema,
        parentId: optionalIdSchema,
        sortOrder: z.number().int().optional()
      })
      .parse(req.body);

    await ensureFolderBelongsToUser(userId, input.parentId ?? null);
    await ensureTwoLevelFolderParent(userId, input.parentId ?? null);

    const folder = await prisma.folder.create({
      data: {
        userId,
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

app.patch("/api/folders/reorder", authenticate, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const input = z
      .object({
        parentId: optionalIdSchema,
        folderIds: z.array(idSchema).min(1)
      })
      .parse(req.body);
    const parentId = input.parentId ?? null;

    if (new Set(input.folderIds).size !== input.folderIds.length) {
      throw validationError("Folder IDs must be unique");
    }
    await ensureFolderBelongsToUser(userId, parentId);

    const folders = await prisma.folder.findMany({
      where: { userId, id: { in: input.folderIds } },
      select: { id: true, parentId: true }
    });
    if (folders.length !== input.folderIds.length || folders.some((folder) => folder.parentId !== parentId)) {
      throw validationError("Folders must belong to the same directory");
    }

    await prisma.$transaction(
      input.folderIds.map((id, sortOrder) => prisma.folder.update({ where: { id }, data: { sortOrder } }))
    );
    const orderedFolders = await prisma.folder.findMany({
      where: { userId, id: { in: input.folderIds } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });
    res.json(orderedFolders);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/folders/:id", authenticate, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const id = idSchema.parse(req.params.id);
    const input = z
      .object({
        name: nameSchema.optional(),
        parentId: optionalIdSchema,
        sortOrder: z.number().int().optional()
      })
      .parse(req.body);

    await ensureFolderBelongsToUser(userId, id);
    await ensureFolderBelongsToUser(userId, input.parentId ?? null);

    if (input.parentId !== undefined) {
      if (input.parentId === id) throw validationError("A folder cannot be its own parent");
      const parentAncestors = await collectAncestorFolderIds(userId, input.parentId);
      if (parentAncestors.includes(id)) throw validationError("A folder cannot be moved into its own descendant");
      await ensureTwoLevelFolderParent(userId, input.parentId);

      const descendantIds = await collectDescendantFolderIds(userId, id);
      if (descendantIds.length > 0 && input.parentId) {
        throw validationError("A folder with subdirectories cannot be moved to the second level");
      }
    }

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

app.patch("/api/folders/:id/visibility", authenticate, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const id = idSchema.parse(req.params.id);
    const input = z.object({ isVisible: z.boolean() }).parse(req.body);
    await ensureFolderBelongsToUser(userId, id);
    const descendantIds = await collectDescendantFolderIds(userId, id);
    const folderIds = [id, ...descendantIds];

    await prisma.$transaction([
      prisma.folder.updateMany({ where: { userId, id: { in: folderIds } }, data: { isVisible: input.isVisible } }),
      prisma.routePlan.updateMany({ where: { userId, folderId: { in: folderIds } }, data: { isVisible: input.isVisible } })
    ]);

    res.json({ folderIds, isVisible: input.isVisible });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/folders/:id", authenticate, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const id = idSchema.parse(req.params.id);
    await ensureFolderBelongsToUser(userId, id);
    await prisma.folder.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/routes", authenticate, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const input = z
      .object({
        name: nameSchema,
        folderId: optionalIdSchema,
        color: colorSchema.optional(),
        sortOrder: z.number().int().optional()
      })
      .parse(req.body);

    await ensureFolderBelongsToUser(userId, input.folderId ?? null);

    const route = await prisma.routePlan.create({
      data: {
        userId,
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

app.post("/api/routes/from-walk", authenticate, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const input = z
      .object({
        name: nameSchema,
        description: z.string().nullable().optional(),
        folderId: optionalIdSchema,
        color: colorSchema.optional(),
        points: z.array(routePointSchema).min(2)
      })
      .parse(req.body);

    await ensureFolderBelongsToUser(userId, input.folderId ?? null);

    const route = await prisma.routePlan.create({
      data: {
        userId,
        name: input.name,
        description: input.description ?? null,
        folderId: input.folderId ?? null,
        color: input.color ?? "#f59e0b",
        pointsJson: input.points
      }
    });

    res.status(201).json(serializeRoute(route));
  } catch (error) {
    next(error);
  }
});

app.get("/api/routes/:id", authenticate, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const id = idSchema.parse(req.params.id);
    const route = await prisma.routePlan.findFirst({ where: { id, userId } });

    if (!route) {
      res.status(404).json({ message: "Route not found" });
      return;
    }

    res.json(serializeRoute(route));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/routes/reorder", authenticate, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const input = z
      .object({
        folderId: optionalIdSchema,
        routeIds: z.array(idSchema).min(1)
      })
      .parse(req.body);

    if (new Set(input.routeIds).size !== input.routeIds.length) {
      res.status(400).json({ message: "Duplicate route ids are not allowed" });
      return;
    }

    await ensureFolderBelongsToUser(userId, input.folderId ?? null);

    const routeCount = await prisma.routePlan.count({
      where: {
        userId,
        id: { in: input.routeIds }
      }
    });

    if (routeCount !== input.routeIds.length) {
      res.status(404).json({ message: "Route not found" });
      return;
    }

    const updatedRoutes = await prisma.$transaction(
      input.routeIds.map((routeId, index) =>
        prisma.routePlan.update({
          where: { id: routeId },
          data: {
            folderId: input.folderId ?? null,
            sortOrder: index
          }
        })
      )
    );

    res.json(updatedRoutes.map(serializeRoute));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/routes/:id", authenticate, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
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
        sortOrder: z.number().int().optional(),
        completedOn: dateOnlySchema.nullable().optional(),
        distanceMeters: z.number().int().min(1).max(4_294_967_295).nullable().optional(),
        travelMode: travelModeSchema.nullable().optional()
      })
      .parse(req.body);

    const currentRoute = await ensureRouteBelongsToUser(userId, id);
    if (input.folderId !== undefined) {
      await ensureFolderBelongsToUser(userId, input.folderId);
    }

    const nextCompletedOn = input.completedOn === undefined ? currentRoute.completedOn : input.completedOn;
    const nextDistanceMeters = input.distanceMeters === undefined ? currentRoute.distanceMeters : input.distanceMeters;
    const nextTravelMode = input.travelMode === undefined ? currentRoute.travelMode : input.travelMode;
    const completionFields = [nextCompletedOn, nextDistanceMeters, nextTravelMode];
    const hasAnyCompletionField = completionFields.some((value) => value !== null);
    const hasEveryCompletionField = completionFields.every((value) => value !== null);

    if (hasAnyCompletionField && !hasEveryCompletionField) {
      throw validationError("Completion date, distance, and travel mode must be saved together");
    }
    if (hasEveryCompletionField && normalizeRoutePoints(currentRoute.pointsJson).length < 2) {
      throw validationError("A completed route must contain at least two points");
    }

    const route = await prisma.routePlan.update({
      where: { id },
      data: input
    });

    res.json(serializeRoute(route));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/routes/:id/visibility", authenticate, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const id = idSchema.parse(req.params.id);
    const input = z.object({ isVisible: z.boolean() }).parse(req.body);
    await ensureRouteBelongsToUser(userId, id);
    const route = await prisma.routePlan.update({
      where: { id },
      data: { isVisible: input.isVisible }
    });

    res.json(serializeRoute(route));
  } catch (error) {
    next(error);
  }
});

app.post("/api/routes/:id/copy", authenticate, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const id = idSchema.parse(req.params.id);
    const source = await ensureRouteBelongsToUser(userId, id);

    const route = await prisma.routePlan.create({
      data: {
        userId,
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

app.put("/api/routes/:id/points", authenticate, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const id = idSchema.parse(req.params.id);
    const input = z
      .object({
        points: z.array(routePointSchema)
      })
      .parse(req.body);

    const currentRoute = await ensureRouteBelongsToUser(userId, id);
    if (currentRoute.completedOn && input.points.length < 2) {
      throw validationError("A completed route must contain at least two points");
    }

    const route = await prisma.routePlan.update({
      where: { id },
      data: { pointsJson: input.points },
    });

    res.json(serializeRoute(route));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/routes/:id", authenticate, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const id = idSchema.parse(req.params.id);
    await ensureRouteBelongsToUser(userId, id);
    await prisma.routePlan.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

if (isProduction) {
  const staticDir = path.resolve(process.cwd(), process.env.STATIC_DIR ?? "dist");

  app.use(express.static(staticDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }

    res.sendFile(path.join(staticDir, "index.html"));
  });
}

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

app.listen(port, host, () => {
  console.log(`CityWalk Planner API listening on http://${host}:${port}`);
  console.log(`Session cookie secure mode: ${isSessionCookieSecure ? "enabled" : "disabled"}`);
});
