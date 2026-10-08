import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const EXPECTED_COUNT = 61;
const DEFAULT_PAD_MS = 350;

function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2).trim();
    if (!key) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function defaultDesktopDir(name) {
  const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir();
  return path.join(homeDir, "Desktop", name);
}

function formatId(index) {
  return `RTS_Q${String(index).padStart(3, "0")}`;
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stderr });
        return;
      }
      reject(new Error(`${command} exited with code ${code}. ${stderr.trim()}`.trim()));
    });
  });
}

async function ensureFfmpegReady() {
  await runProcess("ffmpeg", ["-version"]);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const inputDir = path.resolve(String(args.inputDir || defaultDesktopDir("RTS_audio")));
  const outputDir = path.resolve(String(args.outDir || path.join(path.dirname(inputDir), `${path.basename(inputDir)}_padded`)));
  const padMs = Math.max(0, Math.round(parseNumber(args.durationMs, DEFAULT_PAD_MS)));
  const overwrite = parseBoolean(args.overwrite, false);
  const dryRun = parseBoolean(args.dryRun, false);

  await ensureFfmpegReady();
  await fs.mkdir(outputDir, { recursive: true });

  const results = [];
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (let i = 1; i <= EXPECTED_COUNT; i += 1) {
    const id = formatId(i);
    const filename = `${id}.mp3`;
    const inputPath = path.join(inputDir, filename);
    const outputPath = path.join(outputDir, filename);

    try {
      await fs.access(inputPath);
    } catch {
      failedCount += 1;
      results.push({ id, status: "missing_input", inputPath, outputPath });
      console.error(`[${i}/${EXPECTED_COUNT}] ${id} missing input`);
      continue;
    }

    if (!overwrite) {
      try {
        await fs.access(outputPath);
        skippedCount += 1;
        results.push({ id, status: "skipped_exists", inputPath, outputPath });
        console.log(`[${i}/${EXPECTED_COUNT}] ${id} skipped (exists)`);
        continue;
      } catch {
        // continue
      }
    }

    if (dryRun) {
      skippedCount += 1;
      results.push({ id, status: "dry_run", inputPath, outputPath, padMs });
      console.log(`[${i}/${EXPECTED_COUNT}] ${id} dry-run`);
      continue;
    }

    const ffmpegArgs = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-af",
      `adelay=${padMs}:all=true`,
      "-ar",
      "24000",
      "-ac",
      "1",
      "-b:a",
      "64k",
      outputPath
    ];

    try {
      await runProcess("ffmpeg", ffmpegArgs);
      successCount += 1;
      results.push({ id, status: "success", inputPath, outputPath, padMs });
      console.log(`[${i}/${EXPECTED_COUNT}] ${id} done`);
    } catch (error) {
      failedCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      results.push({ id, status: "failed", inputPath, outputPath, error: message });
      console.error(`[${i}/${EXPECTED_COUNT}] ${id} failed: ${message}`);
    }
  }

  const reportPath = path.join(outputDir, "rts_audio_pad_report.json");
  await fs.writeFile(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        inputDir,
        outputDir,
        padMs,
        expectedCount: EXPECTED_COUNT,
        successCount,
        failedCount,
        skippedCount,
        items: results
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log("RTS leading silence padding finished");
  console.log(`Expected: ${EXPECTED_COUNT}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Report path: ${reportPath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error("RTS leading silence padding failed");
  console.error(message);
  process.exitCode = 1;
});
