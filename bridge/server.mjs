import { createServer } from "node:http";
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  buildCodexPrompt,
  normalizeBridgeResponse,
} from "../src/codex-bridge-contract.mjs";

const port = Number(process.env.PORT || process.env.CODEX_BRIDGE_PORT || 8788);
const host = process.env.HOST || "127.0.0.1";
const codexCommand = resolveCodexCommand();

createServer(async (request, response) => {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const body = await readJson(request);
    const prompt = buildCodexPrompt(body);
    const message = await runCodex(prompt);
    sendJson(response, 200, normalizeBridgeResponse(message));
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Codex bridge failed.",
    });
  }
}).listen(port, host, () => {
  console.log(`Codex bridge listening on http://${host}:${port}`);
});

async function runCodex(prompt) {
  const workdir = await mkdtemp(join(tmpdir(), "codex-bridge-"));
  const outputFile = join(workdir, "response.txt");

  try {
    const child = spawn(
      codexCommand,
      [
        "exec",
        "--skip-git-repo-check",
        "--ephemeral",
        "--sandbox",
        "read-only",
        "--output-last-message",
        outputFile,
        "-",
      ],
      {
        cwd: workdir,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.stdin.end(prompt);
    const [code] = await once(child, "exit");

    if (code !== 0) {
      throw new Error(Buffer.concat(stderr).toString("utf8").trim());
    }

    return readFile(outputFile, "utf8");
  } finally {
    await rm(workdir, { force: true, recursive: true });
  }
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function resolveCodexCommand() {
  if (process.env.CODEX_COMMAND) return process.env.CODEX_COMMAND;
  if (process.platform !== "win32") return "codex";

  const root = join(
    process.env.LOCALAPPDATA || "",
    "OpenAI",
    "Codex",
    "bin",
  );

  if (!existsSync(root)) return "codex.cmd";

  const candidates = readdirSync(root)
    .map((folder) => join(root, folder, "codex.exe"))
    .filter(existsSync)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  return candidates[0] || "codex.cmd";
}
