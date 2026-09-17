import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { FastifyInstance } from "fastify";
import type { BackendHooks } from "./hooks.js";

export interface BackendPluginContext {
  app: FastifyInstance;
  sql: NeonQueryFunction<false, false>;
  hooks: BackendHooks;
  apiOnly: boolean;
  runtime: Readonly<Record<string, unknown>>;
}

export interface BackendPlugin {
  name: string;
  setup(context: BackendPluginContext): void | Promise<void>;
}

export function defineBackendPlugin(plugin: BackendPlugin) {
  return plugin;
}
