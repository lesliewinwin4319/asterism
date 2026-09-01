import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { AsterismError } from "./errors.mjs";

export async function readJson(path, options = {}) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT" && options.allowMissing) return null;
    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new AsterismError("CORRUPT_STATE", `State file is not valid JSON: ${path}`, {
      cause: error.message
    });
  }
}

export async function atomicWriteJson(path, value) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });

  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  JSON.parse(serialized);

  const temporaryPath = join(directory, `.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, serialized, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}
