import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Load DATABASE_URL / TEST_DATABASE_URL from .env when it exists.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
