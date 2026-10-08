import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const BUCKET_NAME = "question-audio";
const LEGACY_PREFIXES_TO_DELETE = ["WFD", "true/wfd"];
const PROTECTED_PREFIXES = ["wfd"];
const DRY_RUN = false;
const LIST_PAGE_SIZE = 100;
const DELETE_BATCH_SIZE = 100;
const SAMPLE_SIZE = 20;
const REPORT_RELATIVE_PATH = "scripts/reports/wfd-storage-cleanup-report.json";

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

function normalizeObjectPath(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
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

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function isPathUnderPrefix(objectPath, prefix) {
  const normalizedPath = normalizeObjectPath(objectPath);
  const normalizedPrefix = normalizePrefix(prefix);
  if (!normalizedPrefix) return false;
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
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

function validatePrefixSafety() {
  const normalizedDeletePrefixes = LEGACY_PREFIXES_TO_DELETE.map((value) => normalizePrefix(value));
  const normalizedProtectedPrefixes = PROTECTED_PREFIXES.map((value) => normalizePrefix(value));

  for (const deletePrefix of normalizedDeletePrefixes) {
    for (const protectedPrefix of normalizedProtectedPrefixes) {
      if (!deletePrefix || !protectedPrefix) continue;
      if (deletePrefix === protectedPrefix || deletePrefix.startsWith(`${protectedPrefix}/`)) {
        throw new Error(
          `Unsafe configuration: delete prefix "${deletePrefix}" overlaps protected prefix "${protectedPrefix}".`
        );
      }
    }
  }
}

async function writeReport(reportPayload) {
  const reportPath = path.resolve(projectRoot, REPORT_RELATIVE_PATH);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(reportPayload, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  validatePrefixSafety();

  log("cleanup start", DRY_RUN ? "DRY RUN (no file will be deleted)." : "REAL DELETE mode.");
  log(
    "safe guard",
    `Protected prefixes: ${PROTECTED_PREFIXES.map((item) => `${normalizePrefix(item)}/`).join(", ")}`
  );

  const supabaseUrl = getRequiredEnvValue("SUPABASE_URL", "VITE_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnvValue("SUPABASE_SERVICE_ROLE_KEY");
  assertServiceRoleKeyLooksValid(serviceRoleKey);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const filesByPrefix = {};
  const allLegacyFilesSet = new Set();

  for (const prefix of LEGACY_PREFIXES_TO_DELETE) {
    const normalizedPrefix = normalizePrefix(prefix);
    log("scanning legacy prefix", normalizedPrefix);

    const result = await collectFilesUnderPrefix({
      supabase,
      bucket: BUCKET_NAME,
      prefix: normalizedPrefix,
      listPageSize: LIST_PAGE_SIZE
    });

    filesByPrefix[normalizedPrefix] = {
      count: result.files.length,
      samples: result.files.slice(0, SAMPLE_SIZE),
      listCallCount: result.listCallCount,
      visitedDirectoryCount: result.visitedDirectoryCount,
      files: result.files
    };

    for (const filePath of result.files) {
      allLegacyFilesSet.add(filePath);
    }

    log(
      "legacy prefix done",
      `${normalizedPrefix} -> files=${result.files.length}, visitedDirectories=${result.visitedDirectoryCount}, listCalls=${result.listCallCount}`
    );
  }

  const allLegacyFiles = [...allLegacyFilesSet].sort((a, b) => a.localeCompare(b));

  for (const filePath of allLegacyFiles) {
    for (const protectedPrefix of PROTECTED_PREFIXES) {
      if (isPathUnderPrefix(filePath, protectedPrefix)) {
        throw new Error(
          `Safety stop: matched protected path "${filePath}". Script never deletes "${normalizePrefix(protectedPrefix)}/".`
        );
      }
    }
  }

  console.log("");
  console.log("=== Legacy File Match Summary ===");
  for (const prefix of LEGACY_PREFIXES_TO_DELETE) {
    const normalizedPrefix = normalizePrefix(prefix);
    const count = filesByPrefix[normalizedPrefix]?.count ?? 0;
    console.log(`${normalizedPrefix.padEnd(8)} -> ${count}`);
  }
  console.log(`total legacy files matched -> ${allLegacyFiles.length}`);

  console.log("");
  for (const prefix of LEGACY_PREFIXES_TO_DELETE) {
    const normalizedPrefix = normalizePrefix(prefix);
    const samples = filesByPrefix[normalizedPrefix]?.samples ?? [];
    console.log(`Sample files for ${normalizedPrefix} (${samples.length} shown):`);
    if (!samples.length) {
      console.log("  (none)");
      continue;
    }
    for (const sample of samples) {
      console.log(`  - ${sample}`);
    }
  }

  const execution = {
    dryRun: DRY_RUN,
    totalMatched: allLegacyFiles.length,
    batchSize: DELETE_BATCH_SIZE,
    attemptedBatches: 0,
    successfulBatches: 0,
    deletedCount: 0,
    failedBatches: []
  };

  if (!DRY_RUN && allLegacyFiles.length > 0) {
    const batches = chunkArray(allLegacyFiles, DELETE_BATCH_SIZE);
    execution.attemptedBatches = batches.length;

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      log("removing batch", `${index + 1}/${batches.length}, size=${batch.length}`);

      const { data, error } = await supabase.storage.from(BUCKET_NAME).remove(batch);
      if (error) {
        execution.failedBatches.push({
          batch: index + 1,
          size: batch.length,
          message: error.message
        });
        log("batch failed", `batch=${index + 1}, message=${error.message}`);
        continue;
      }

      const deletedInBatch = Array.isArray(data) ? data.length : batch.length;
      execution.successfulBatches += 1;
      execution.deletedCount += deletedInBatch;
      log("batch removed", `batch=${index + 1}, deleted=${deletedInBatch}`);
    }
  } else if (DRY_RUN) {
    log(
      "dry run summary",
      `No deletion executed. Change DRY_RUN to false in this file to perform real deletion.`
    );
  }

  const reportPayload = {
    generatedAt: getTimestamp(),
    bucket: BUCKET_NAME,
    config: {
      dryRun: DRY_RUN,
      listPageSize: LIST_PAGE_SIZE,
      deleteBatchSize: DELETE_BATCH_SIZE,
      legacyPrefixesToDelete: LEGACY_PREFIXES_TO_DELETE.map((item) => normalizePrefix(item)),
      protectedPrefixes: PROTECTED_PREFIXES.map((item) => normalizePrefix(item))
    },
    matched: {
      total: allLegacyFiles.length,
      byPrefix: Object.fromEntries(
        Object.entries(filesByPrefix).map(([prefix, payload]) => [prefix, payload.count])
      ),
      samplesByPrefix: Object.fromEntries(
        Object.entries(filesByPrefix).map(([prefix, payload]) => [prefix, payload.samples])
      )
    },
    execution
  };

  const reportPath = await writeReport(reportPayload);
  log("report saved", reportPath);
  log("cleanup completed", DRY_RUN ? "DRY RUN complete." : "REAL DELETE run complete.");
  log("reminder", "Never delete wfd/ because production audio path depends on it.");
}

main().catch((error) => {
  console.error(`[${getTimestamp()}] storage cleanup failed`);
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
