#!/usr/bin/env node

// Starts the built server, rebuilding web + server only when the source tree
// changed since the last build. Pass --rebuild to force a build; any other
// arguments are forwarded to the server.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dirname, "..");
const serverDir = join(repoRoot, "apps/server");
const stampPath = join(serverDir, "dist/.fork-build-stamp");
const sourcePaths = ["apps/web", "apps/server", "packages"];

const git = (...args: string[]) =>
  spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).stdout;

const sourceFingerprint = () =>
  createHash("sha256")
    .update(git("rev-parse", "HEAD"))
    .update(git("status", "--porcelain", "--", ...sourcePaths))
    .update(git("diff", "HEAD", "--", ...sourcePaths))
    .digest("hex");

const run = (command: string, args: string[], cwd: string) => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const args = process.argv.slice(2);
const forceRebuild = args.includes("--rebuild");
const serverArgs = args.filter((arg) => arg !== "--rebuild");

const fingerprint = sourceFingerprint();
const builtFingerprint = existsSync(stampPath) ? readFileSync(stampPath, "utf8") : null;
const isBuilt =
  existsSync(join(serverDir, "dist/bin.mjs")) && existsSync(join(serverDir, "dist/client"));

if (forceRebuild || !isBuilt || builtFingerprint !== fingerprint) {
  console.log("[fork:serve] Sources changed since last build; rebuilding web + server.");
  run("vp", ["run", "--filter", "t3", "build"], repoRoot);
  writeFileSync(stampPath, fingerprint);
} else {
  console.log("[fork:serve] Build is up to date; skipping rebuild (use --rebuild to force).");
}

run(process.execPath, ["dist/bin.mjs", ...serverArgs], serverDir);
