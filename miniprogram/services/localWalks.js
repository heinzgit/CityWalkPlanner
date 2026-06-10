const STORAGE_KEY = "citywalk.localWalks.v1";

function createLocalWalkId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readLocalWalks() {
  const walks = wx.getStorageSync(STORAGE_KEY);
  return Array.isArray(walks) ? walks : [];
}

function writeLocalWalks(walks) {
  wx.setStorageSync(STORAGE_KEY, walks);
}

function listLocalWalks() {
  return readLocalWalks().sort((a, b) => {
    const left = new Date(a.createdAt || 0).getTime();
    const right = new Date(b.createdAt || 0).getTime();
    return right - left;
  });
}

function saveLocalWalk(input) {
  const now = new Date().toISOString();
  const walk = {
    id: createLocalWalkId(),
    name: input.name,
    description: input.description || null,
    points: input.points,
    createdAt: now,
    updatedAt: now,
    syncStatus: "pending",
    serverRouteId: null,
    lastSyncError: null
  };

  writeLocalWalks([walk, ...readLocalWalks()]);
  return walk;
}

function updateLocalWalk(id, patch) {
  const walks = readLocalWalks();
  const nextWalks = walks.map((walk) =>
    walk.id === id
      ? {
          ...walk,
          ...patch,
          updatedAt: new Date().toISOString()
        }
      : walk
  );

  writeLocalWalks(nextWalks);
  return nextWalks.find((walk) => walk.id === id) || null;
}

function deleteLocalWalk(id) {
  writeLocalWalks(readLocalWalks().filter((walk) => walk.id !== id));
}

module.exports = {
  deleteLocalWalk,
  listLocalWalks,
  saveLocalWalk,
  updateLocalWalk
};
