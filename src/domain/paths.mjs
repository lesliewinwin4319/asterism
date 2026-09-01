import { lstat, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, parse, relative, resolve } from "node:path";
import { AsterismError } from "./errors.mjs";

function isInside(rootPath, candidatePath) {
  const relation = relative(rootPath, candidatePath);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

export async function validateProjectRoot(rootInput) {
  if (typeof rootInput !== "string" || rootInput.trim() === "") {
    throw new AsterismError("INVALID_PROJECT_ROOT", "An explicit project root is required.");
  }

  const resolved = resolve(rootInput);
  let rootStats;
  try {
    rootStats = await stat(resolved);
  } catch {
    throw new AsterismError("PROJECT_ROOT_NOT_FOUND", `Project root does not exist: ${resolved}`);
  }

  if (!rootStats.isDirectory()) {
    throw new AsterismError("INVALID_PROJECT_ROOT", `Project root is not a directory: ${resolved}`);
  }

  const canonical = await realpath(resolved);
  if (canonical === parse(canonical).root) {
    throw new AsterismError("PROJECT_ROOT_TOO_BROAD", "The filesystem root cannot be an Asterism project.");
  }

  return canonical;
}

export async function resolveProjectPath(projectRoot, relativePath, options = {}) {
  if (typeof relativePath !== "string" || relativePath.trim() === "" || isAbsolute(relativePath)) {
    throw new AsterismError("UNSAFE_PATH", "Project file paths must be non-empty relative paths.");
  }

  const canonicalRoot = await validateProjectRoot(projectRoot);
  const candidate = resolve(canonicalRoot, relativePath);
  if (!isInside(canonicalRoot, candidate)) {
    throw new AsterismError("PATH_ESCAPE", `Path escapes the project root: ${relativePath}`);
  }

  let existingAncestor = candidate;
  let candidateExists = true;
  try {
    await lstat(candidate);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    candidateExists = false;
    if (options.mustExist) {
      throw new AsterismError("FILE_NOT_FOUND", `Project file does not exist: ${relativePath}`);
    }
    existingAncestor = dirname(candidate);
    while (true) {
      try {
        await lstat(existingAncestor);
        break;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        const parent = dirname(existingAncestor);
        if (parent === existingAncestor) throw error;
        existingAncestor = parent;
      }
    }
  }

  const canonicalExistingPath = await realpath(candidateExists ? candidate : existingAncestor);
  if (!isInside(canonicalRoot, canonicalExistingPath)) {
    throw new AsterismError("SYMLINK_ESCAPE", `Path resolves outside the project root: ${relativePath}`);
  }

  return candidate;
}
