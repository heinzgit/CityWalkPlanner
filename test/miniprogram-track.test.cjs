const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadTrackUtils() {
  const filename = path.resolve(__dirname, "../miniprogram/utils/track.js");
  const source = fs.readFileSync(filename, "utf8");
  const sandbox = { module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(source, sandbox, { filename });
  return sandbox.module.exports;
}

const { distanceMeters, shouldAppendTrackPoint, simplifyTrackPoints } = loadTrackUtils();
const metersToLatitude = (meters) => meters / 111320;

function loadMapPage() {
  const filename = path.resolve(__dirname, "../miniprogram/pages/map/index.js");
  const source = fs.readFileSync(filename, "utf8");
  let definition;
  const sandbox = {
    Page: (pageDefinition) => {
      definition = pageDefinition;
    },
    clearTimeout,
    console,
    setTimeout,
    wx: {},
    require: (request) => {
      if (request === "../../utils/track") return { distanceMeters, shouldAppendTrackPoint, simplifyTrackPoints };
      if (request === "../../utils/coord") {
        return {
          bd09ToGcj02: (value) => value,
          gcj02ToBd09: (value) => value,
          toMapPoint: (value) => ({ longitude: value.lng, latitude: value.lat })
        };
      }
      if (request === "../../services/api") return { api: {} };
      if (request === "../../services/localWalks") return {};
      if (request === "../../services/serverRouteCache") return {};
      throw new Error(`Unexpected module: ${request}`);
    }
  };
  vm.runInNewContext(source, sandbox, { filename });
  return definition;
}

function createMapPage() {
  const definition = loadMapPage();
  const updates = [];
  return {
    page: {
      ...definition,
      data: { ...definition.data },
      setData(update, callback) {
        updates.push(update);
        callback?.();
      }
    },
    updates
  };
}

function point(northMeters, overrides = {}) {
  return {
    lng: 121.4737,
    lat: 31.2304 + metersToLatitude(northMeters),
    accuracy: 10,
    speed: 1.2,
    capturedAt: new Date(1700000000000 + northMeters * 1000).toISOString(),
    ...overrides
  };
}

test("distanceMeters returns walking-scale distances", () => {
  assert.ok(Math.abs(distanceMeters(point(0), point(100)) - 100) < 1);
});

test("track filter rejects invalid and low-quality first points", () => {
  assert.equal(shouldAppendTrackPoint([], point(0, { lng: NaN })), false);
  assert.equal(shouldAppendTrackPoint([], point(0, { accuracy: 81 })), false);
  assert.equal(shouldAppendTrackPoint([], point(0)), true);
});

test("track filter enforces the minimum time interval", () => {
  const previous = point(0);
  const tooSoon = point(20, { capturedAt: new Date(1700000019999).toISOString() });
  const afterInterval = point(20, { capturedAt: new Date(1700000020000).toISOString() });

  assert.equal(shouldAppendTrackPoint([previous], tooSoon), false);
  assert.equal(shouldAppendTrackPoint([previous], afterInterval), true);
});

test("track filter suppresses stationary drift while retaining walking movement", () => {
  const previous = point(0);
  const capturedAt = new Date(1700000020000).toISOString();

  assert.equal(shouldAppendTrackPoint([previous], point(6, { speed: 0.1, capturedAt })), false);
  assert.equal(shouldAppendTrackPoint([previous], point(6, { speed: 1.2, capturedAt })), true);
});

test("track filter adapts the distance threshold to reported accuracy", () => {
  const previous = point(0, { accuracy: 60 });
  const capturedAt = new Date(1700000020000).toISOString();

  assert.equal(shouldAppendTrackPoint([previous], point(7, { accuracy: 60, capturedAt })), false);
  assert.equal(shouldAppendTrackPoint([previous], point(10, { accuracy: 60, capturedAt })), true);
});

test("preview simplification keeps endpoints and meaningful turns", () => {
  const northbound = Array.from({ length: 301 }, (_value, index) => point(index));
  const corner = northbound[northbound.length - 1];
  const eastbound = Array.from({ length: 300 }, (_value, index) => ({
    ...point(300 + index + 1),
    lng: corner.lng + (index + 1) / (111320 * Math.cos((corner.lat * Math.PI) / 180)),
    lat: corner.lat
  }));
  const route = [...northbound, ...eastbound];
  const simplified = simplifyTrackPoints(route, { toleranceMeters: 3, maxPoints: 20 });

  assert.equal(simplified[0], route[0]);
  assert.equal(simplified[simplified.length - 1], route[route.length - 1]);
  assert.ok(simplified.includes(corner));
  assert.ok(simplified.length <= 20);
});

test("preview simplification always respects its hard point limit", () => {
  const route = Array.from({ length: 1000 }, (_value, index) => ({
    ...point(index * 2),
    lng: 121.4737 + (index % 2 === 0 ? 0 : 0.001)
  }));
  const simplified = simplifyTrackPoints(route, { toleranceMeters: 1, maxPoints: 50 });

  assert.ok(simplified.length <= 50);
  assert.equal(simplified[0], route[0]);
  assert.equal(simplified[simplified.length - 1], route[route.length - 1]);
});

test("background location events only update the in-memory buffers", () => {
  const { page, updates } = createMapPage();
  const previous = point(0, { capturedAt: new Date(Date.now() - 21000).toISOString() });
  page.trackPoints = [previous];
  page.previewTrackPoints = [previous];
  page.trackRenderTimer = null;
  page.isPageVisible = false;

  page.handleLocationChange({
    longitude: point(10).lng,
    latitude: point(10).lat,
    accuracy: 10,
    speed: 1.2
  });

  assert.equal(page.trackPoints.length, 2);
  assert.equal(page.previewTrackPoints.length, 2);
  assert.equal(updates.length, 0);
});

test("foreground preview updates only the live polyline after initialization", () => {
  const { page, updates } = createMapPage();
  const baseLine = { points: [{ longitude: 1, latitude: 1 }], color: "#000000" };
  page.isPageVisible = true;
  page.routePolylines = [baseLine];
  page.previewTrackPoints = [point(0), point(10)];
  page.data.polylines = [baseLine, { points: [] }];

  page.renderTrackPreview();

  assert.deepEqual(Object.keys(updates[0]), ["polylines[1].points"]);
  assert.equal(updates[0]["polylines[1].points"].length, 2);
});

test("route tree initially expands only first-level folders", () => {
  const { page } = createMapPage();
  const routeTree = page.buildRouteTree(
    [
      { id: "root", name: "一级目录", parentId: null, sortOrder: 0 },
      { id: "child", name: "二级目录", parentId: "root", sortOrder: 0 }
    ],
    []
  );

  assert.deepEqual(Array.from(page.mergeExpandedFolderIds(routeTree)), ["root"]);
});

test("server refresh after local sync resets expansion to first-level folders", () => {
  const { page, updates } = createMapPage();
  page.data.expandedFolderIds = ["root", "child"];

  page.applyServerRoutes(
    {
      folders: [
        { id: "root", name: "一级目录", parentId: null, sortOrder: 0 },
        { id: "child", name: "二级目录", parentId: "root", sortOrder: 0 }
      ],
      routes: []
    },
    { preserveSelectedId: true, expandRootFoldersOnly: true }
  );

  assert.deepEqual(Array.from(updates[0].expandedFolderIds), ["root"]);
});
