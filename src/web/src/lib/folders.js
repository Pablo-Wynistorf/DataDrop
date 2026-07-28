// Build the set of folder paths implied by the files' folderPath values.
export function buildFolderTree(files, extraFolders = []) {
  const pathSet = new Set(["/", ...extraFolders]);
  for (const file of files) {
    const fp = file.folderPath || "/";
    if (fp === "/") continue;
    const segments = fp.split("/").filter(Boolean);
    let current = "";
    for (const seg of segments) {
      current += "/" + seg;
      pathSet.add(current);
    }
  }
  return Array.from(pathSet).sort();
}

// Direct child folders of `currentFolder`.
export function getSubfolders(allFolders, currentFolder) {
  const prefix = currentFolder === "/" ? "/" : currentFolder + "/";
  const subfolders = new Set();
  for (const folder of allFolders) {
    if (folder === currentFolder) continue;
    if (currentFolder === "/") {
      if (folder.startsWith("/") && !folder.slice(1).includes("/")) subfolders.add(folder);
    } else if (folder.startsWith(prefix)) {
      const remainder = folder.slice(prefix.length);
      if (!remainder.includes("/")) subfolders.add(folder);
    }
  }
  return Array.from(subfolders).sort();
}

export function folderFileCount(allFiles, folder) {
  return allFiles.filter(
    (f) => (f.folderPath || "/") === folder || (f.folderPath || "/").startsWith(folder + "/")
  ).length;
}
