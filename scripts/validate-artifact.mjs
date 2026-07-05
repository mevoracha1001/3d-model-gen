import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workerPath = resolve("dist/server/index.js");

if (!existsSync(workerPath)) {
  throw new Error("Missing Worker entry: dist/server/index.js");
}

const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set("validation", `${process.pid}-${Date.now()}`);
const worker = await import(workerUrl.href);

if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error(
    "dist/server/index.js must have an ESM default export with fetch(request, env, ctx)",
  );
}

console.log("Build artifact valid: ESM Worker default.fetch present.");
