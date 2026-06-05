import type { Folder, RoutePlan, TreeFolderNode, TreeNode, TreeRouteNode, VisibilityState } from "./types";

function foldVisibility(states: VisibilityState[]): VisibilityState {
  if (states.length === 0) return "hidden";
  if (states.every((state) => state === "visible")) return "visible";
  if (states.every((state) => state === "hidden")) return "hidden";
  return "mixed";
}

function sortNodes(nodes: TreeNode[]) {
  return nodes.sort((a, b) => {
    const orderDelta = a.sortOrder - b.sortOrder;
    if (orderDelta !== 0) return orderDelta;
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, "zh-CN");
  });
}

export function buildTree(folders: Folder[], routes: RoutePlan[]) {
  const folderMap = new Map<string, TreeFolderNode>();
  const rootNodes: TreeNode[] = [];

  folders.forEach((folder) => {
    folderMap.set(folder.id, {
      ...folder,
      type: "folder",
      children: [],
      visibilityState: folder.isVisible ? "visible" : "hidden"
    });
  });

  folderMap.forEach((folder) => {
    if (folder.parentId && folderMap.has(folder.parentId)) {
      folderMap.get(folder.parentId)!.children.push(folder);
    } else {
      rootNodes.push(folder);
    }
  });

  routes.forEach((route) => {
    const routeNode: TreeRouteNode = {
      ...route,
      type: "route",
      visibilityState: route.isVisible ? "visible" : "hidden"
    };

    if (route.folderId && folderMap.has(route.folderId)) {
      folderMap.get(route.folderId)!.children.push(routeNode);
    } else {
      rootNodes.push(routeNode);
    }
  });

  function hydrateFolder(folder: TreeFolderNode): VisibilityState {
    sortNodes(folder.children);
    const childStates = folder.children.map((child) => (child.type === "folder" ? hydrateFolder(child) : child.visibilityState));
    folder.visibilityState = childStates.length > 0 ? foldVisibility(childStates) : folder.isVisible ? "visible" : "hidden";
    return folder.visibilityState;
  }

  rootNodes.forEach((node) => {
    if (node.type === "folder") hydrateFolder(node);
  });

  return sortNodes(rootNodes);
}

export function findRoute(routes: RoutePlan[], id: string | null) {
  if (!id) return null;
  return routes.find((route) => route.id === id) ?? null;
}

export function getNextVisibility(state: VisibilityState) {
  return state === "visible" ? false : true;
}
