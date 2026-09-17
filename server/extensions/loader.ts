import { readdir } from "node:fs/promises";
import { extname } from "node:path";
import type { BackendPlugin, BackendPluginContext } from "./plugin.js";

export async function loadBackendPlugins(context: BackendPluginContext) {
  const pluginsDirectory = new URL("../plugins/", import.meta.url);
  let entries;

  try {
    entries = await readdir(pluginsDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const loadedNames = new Set<string>();
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || ![".js", ".mjs", ".ts"].includes(extname(entry.name))) {
      continue;
    }

    const moduleUrl = new URL(entry.name, pluginsDirectory);
    const imported = (await import(moduleUrl.href)) as {
      default?: BackendPlugin;
    };
    const plugin = imported.default;
    if (!plugin?.name || typeof plugin.setup !== "function") {
      throw new Error(`Invalid backend plugin: ${entry.name}`);
    }
    if (loadedNames.has(plugin.name)) {
      throw new Error(`Duplicate backend plugin name: ${plugin.name}`);
    }

    loadedNames.add(plugin.name);
    await plugin.setup(context);
  }

  return [...loadedNames];
}
