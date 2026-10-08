import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const BUCKET_NAME = "question-audio";
const LIST_PAGE_SIZE = 100;
const SAMPLE_SIZE = 12;
const PREFIXES_TO_SCAN = [
  { key: "root", path: "" },
  { key: "wfd", path: "wfd" },
  { key: "WFD", path: "WFD" },
  { key: "true", path: "true" },
  { key: "true/wfd", path: "true/wfd" }
];
const REPORT_RELATIVE_PATH = "scripts/reports/wfd-storage-scan-report.json";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const projectRoot = path.resolve(scriptDir, "..");

function getTimestamp() {
  return new Date().toISOString();
}

function log(step, detail) {
  if (detail === undefined) {
    console.log(`[${getTimestamp()}] ${step}`);
    return;
  }
  console.log(`[${getTimestamp()}] ${step}: ${detail}`);
}

function normalizePrefix(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function getDisplayPrefix(prefix) {
  const normalized = normalizePrefix(prefix);
  return normalized || "(root)";
}

function buildChildPath(parentPrefix, itemName) {
  const normalizedParent = normalizePrefix(parentPrefix);
  const normalizedName = normalizePrefix(itemName);

  if (!normalizedParent) return normalizedName;
  if (!normalizedName) return normalizedParent;
  return `${normalizedParent}/${normalizedName}`;
}

function isFileEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.id) return true;

  const metadata = entry.metadata;
  if (metadata && typeof metadata === "object") return true;

  return false;
}

async function listDirectoryPage({ supabase, bucket, prefix, offset, limit }) {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit,
    offset,
    sortBy: { column: "name", order: "asc" }
  });

  if (error) {
    throw new Error(
      `Failed to list bucket="${bucket}" prefix="${getDisplayPrefix(prefix)}" offset=${offset}: ${error.message}`
    );
  }

  return Array.isArray(data) ? data : [];
}

async function collectFilesUnderPrefix({ supabase, bucket, prefix, listPageSize }) {
  const startPrefix = normalizePrefix(prefix);
  const queue = [startPrefix];
  const visitedDirectories = new Set();
  const filePaths = new Set();
  let listCallCount = 0;

  while (queue.length > 0) {
    const currentPrefix = queue.shift();
    const normalizedCurrentPrefix = normalizePrefix(currentPrefix);

    if (visitedDirectories.has(normalizedCurrentPrefix)) {
      continue;
    }

    visitedDirectories.add(normalizedCurrentPrefix);

    for (let offset = 0; ; offset += listPageSize) {
      const entries = await listDirectoryPage({
        supabase,
        bucket,
        prefix: normalizedCurrentPrefix,
        offset,
        limit: listPageSize
      });
      listCallCount += 1;

      if (entries.length === 0) {
        break;
      }

      for (const entry of entries) {
        const itemName = String(entry?.name || "").trim();
        if (!itemName) continue;

        const fullPath = buildChildPath(normalizedCurrentPrefix, itemName);
        if (!fullPath) continue;

        if (isFileEntry(entry)) {
          filePaths.add(fullPath);
        } else {
          queue.push(fullPath);
        }
      }

      if (entries.length < listPageSize) {
        break;
      }
    }
  }

  return {
    files: [...filePaths].sort((a, b) => a.localeCompare(b)),
    visitedDirectoryCount: visitedDirectories.size,
    listCallCount
  };
}

function getRequiredEnvValue(name, fallbackName = "") {
  const value = String(process.env[name] || "").trim();
  if (value) return value;

  if (fallbackName) {
    const fallbackValue = String(process.env[fallbackName] || "").trim();
    if (fallbackValue) {
      log("warning", `${name} is missing. Using ${fallbackName} as fallback.`);
      return fallbackValue;
    }
  }

  throw new Error(`Missing required environment variable: ${name}`);
}

function tryParseJwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddingLength = (4 - (payload.length % 4)) % 4;
    const padded = payload.padEnd(payload.length + paddingLength, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function assertServiceRoleKeyLooksValid(keyValue) {
  const token = String(keyValue || "").trim();
  if (!token) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is empty.");
  }

  if (token.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY looks like a publishable/anon key (sb_publishable_*). Use the real service role key."
    );
  }

  const payload = tryParseJwtPayload(token);
  const role = String(payload?.role || payload?.user_role || "").trim();
  if (role && role !== "service_role" && role !== "supabase_admin") {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY JWT role is "${role}", not "service_role". Use the real service role key.`
    );
  }
}

async function writeReport(reportPayload) {
  const reportPath = path.resolve(projectRoot, REPORT_RELATIVE_PATH);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(reportPayload, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  log("scan start", "Inspecting actual Storage object paths with pagination.");

  const supabaseUrl = getRequiredEnvValue("SUPABASE_URL", "VITE_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnvValue("SUPABASE_SERVICE_ROLE_KEY");
  assertServiceRoleKeyLooksValid(serviceRoleKey);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const summary = {
    generatedAt: getTimestamp(),
    bucket: BUCKET_NAME,
    listPageSize: LIST_PAGE_SIZE,
    prefixes: {},
    answers: {},
    recommendation: {
      keepPrefix: "wfd",
      reason: "Production playback path points to question-audio/wfd/... and this prefix is protected."
    }
  };

  for (const { key, path: prefixPath } of PREFIXES_TO_SCAN) {
    log("scanning prefix", key);
    const result = await collectFilesUnderPrefix({
      supabase,
      bucket: BUCKET_NAME,
      prefix: prefixPath,
      listPageSize: LIST_PAGE_SIZE
    });

    summary.prefixes[key] = {
      prefix: normalizePrefix(prefixPath),
      fileCount: result.files.length,
      visitedDirectoryCount: result.visitedDirectoryCount,
      listCallCount: result.listCallCount,
      samples: result.files.slice(0, SAMPLE_SIZE)
    };

    log(
      "prefix done",
      `${key} -> files=${result.files.length}, visitedDirectories=${result.visitedDirectoryCount}, listCalls=${result.listCallCount}`
    );
  }

  const wfdCount = summary.prefixes.wfd?.fileCount ?? 0;
  const uppercaseWfdCount = summary.prefixes.WFD?.fileCount ?? 0;
  const trueWfdCount = summary.prefixes["true/wfd"]?.fileCount ?? 0;

  summary.answers = {
    wfdHas173Files: wfdCount === 173,
    wfdFileCount: wfdCount,
    WFDFileCount: uppercaseWfdCount,
    trueWfdFileCount: trueWfdCount
  };

  console.log("");
  console.log("=== Storage Prefix File Counts ===");
  for (const { key } of PREFIXES_TO_SCAN) {
    const fileCount = summary.prefixes[key]?.fileCount ?? 0;
    console.log(`${key.padEnd(8)} -> ${fileCount}`);
  }

  console.log("");
  console.log(`wfd has exactly 173 files: ${summary.answers.wfdHas173Files ? "YES" : "NO"} (actual=${wfdCount})`);
  console.log(`WFD file count: ${uppercaseWfdCount}`);
  console.log(`true/wfd file count: ${trueWfdCount}`);
  console.log(`Recommended prefix to keep: ${summary.recommendation.keepPrefix}/`);

  console.log("");
  for (const key of ["wfd", "WFD", "true/wfd"]) {
    const samples = summary.prefixes[key]?.samples ?? [];
    console.log(`Sample files for ${key} (${samples.length} shown):`);
    if (!samples.length) {
      console.log("  (none)");
      continue;
    }
    for (const sample of samples) {
      console.log(`  - ${sample}`);
    }
  }

  const reportPath = await writeReport(summary);
  log("report saved", reportPath);
  log("scan completed");
}

main().catch((error) => {
  console.error(`[${getTimestamp()}] storage scan failed`);
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
