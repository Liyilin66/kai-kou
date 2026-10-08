import "dotenv/config";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import xlsx from "xlsx";

const TRUE_VALUES = new Set(["1", "true", "yes", "y", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "n", "off"]);

const CANDIDATE_QUESTION_COLUMNS = [
  "id",
  "task_type",
  "content",
  "audio_path",
  "audio_url",
  "difficulty",
  "word_count",
  "is_active",
  "audio_duration_seconds",
  "audio_file_size_bytes"
];

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const projectRoot = path.resolve(scriptDir, "..");

function getTimestamp() {
  return new Date().toISOString();
}

function logWithTimestamp(step, detail) {
  if (detail === undefined) {
    console.log(`[${getTimestamp()}] ${step}`);
    return;
  }
  console.log(`[${getTimestamp()}] ${step}: ${detail}`);
}

function parseCliArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

    const normalized = token.slice(2).trim();
    if (!normalized) continue;

    const equalIndex = normalized.indexOf("=");
    if (equalIndex >= 0) {
      const key = normalized.slice(0, equalIndex);
      const value = normalized.slice(equalIndex + 1);
      args[key] = value;
      continue;
    }

    const nextValue = argv[index + 1];
    if (nextValue && !nextValue.startsWith("--")) {
      args[normalized] = nextValue;
      index += 1;
    } else {
      args[normalized] = true;
    }
  }

  return args;
}

function getFirstDefinedValue(source, keys) {
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
}

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return defaultValue;
}

function parseOptionalBoolean(value, defaultValue = null) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return parseBoolean(value, defaultValue);
}

function parseOptionalInteger(value, defaultValue = null) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseOptionalNumber(value, defaultValue = null) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parsePositiveInteger(value, defaultValue) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}

function normalizeTaskType(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeAudioPath(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function normalizeSheetName(workbook, expectedSheetName) {
  if (expectedSheetName && workbook.Sheets[expectedSheetName]) {
    return expectedSheetName;
  }

  const [firstSheetName] = workbook.SheetNames;
  if (!firstSheetName) {
    throw new Error("Input workbook has no sheet.");
  }
  return firstSheetName;
}

function resolveProjectPath(filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(projectRoot, filePath);
}

async function ensureDirectoryForFile(filePath) {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function normalizeAudioPathForWfd(id, rawAudioPath, strictAudioPathPrefix) {
  const expectedFileName = String(id || "").toLowerCase().endsWith(".mp3") ? String(id) : `${id}.mp3`;
  const normalized = normalizeAudioPath(rawAudioPath);

  if (!normalized) {
    return `wfd/${expectedFileName}`;
  }

  if (/^https?:\/\//i.test(normalized)) {
    try {
      const fileName = path.posix.basename(new URL(normalized).pathname) || expectedFileName;
      return `wfd/${fileName}`;
    } catch {
      return `wfd/${expectedFileName}`;
    }
  }

  if (!strictAudioPathPrefix || normalized.toLowerCase().startsWith("wfd/")) {
    return normalized;
  }

  const normalizedFileName = path.posix.basename(normalized) || expectedFileName;
  return normalizeAudioPath(`wfd/${normalizedFileName}`);
}

function pickWritableColumns(discoveredColumns) {
  if (!discoveredColumns.size) {
    return [...CANDIDATE_QUESTION_COLUMNS];
  }
  return CANDIDATE_QUESTION_COLUMNS.filter((columnName) => discoveredColumns.has(columnName));
}

function buildPayloadRow(sourceRow, writableColumns) {
  const payload = {};
  for (const columnName of writableColumns) {
    if (!(columnName in sourceRow)) continue;
    const value = sourceRow[columnName];
    if (value === undefined) continue;
    payload[columnName] = value;
  }
  return payload;
}

function chooseInputFile(preferredInputFile, fallbackInputFile) {
  const preferredExists = preferredInputFile ? fs.existsSync(preferredInputFile) : false;
  const fallbackExists = fallbackInputFile ? fs.existsSync(fallbackInputFile) : false;

  if (preferredExists) {
    return {
      filePath: preferredInputFile,
      source: "preferred"
    };
  }

  if (fallbackExists) {
    return {
      filePath: fallbackInputFile,
      source: "fallback"
    };
  }

  throw new Error(
    `No input file found. preferred="${preferredInputFile}" fallback="${fallbackInputFile}".`
  );
}

async function main() {
  const argv = parseCliArgs(process.argv.slice(2));
  const config = {
    preferredInputFile: resolveProjectPath(
      String(
        getFirstDefinedValue(argv, ["preferredInputFile", "preferred-input-file"]) ??
          process.env.WFD_UPSERT_PREFERRED_INPUT_FILE ??
          "D:/PTE/wfd/WFD_cleaned_with_wordcount_difficulty.xlsx"
      ).trim()
    ),
    fallbackInputFile: resolveProjectPath(
      String(
        getFirstDefinedValue(argv, ["fallbackInputFile", "fallback-input-file"]) ??
          process.env.WFD_UPSERT_FALLBACK_INPUT_FILE ??
          "D:/Desktop/WFD_cleaned_with_wordcount_difficulty.csv"
      ).trim()
    ),
    sheetName: String(
      getFirstDefinedValue(argv, ["sheetName", "sheet-name"]) ?? process.env.WFD_UPSERT_SHEET_NAME ?? "WFD"
    ).trim(),
    dryRun: parseBoolean(
      getFirstDefinedValue(argv, ["dryRun", "dry-run"]) ?? process.env.WFD_UPSERT_DRY_RUN,
      true
    ),
    clearAudioUrl: parseBoolean(
      getFirstDefinedValue(argv, ["clearAudioUrl", "clear-audio-url"]) ?? process.env.WFD_UPSERT_CLEAR_AUDIO_URL,
      true
    ),
    strictAudioPathPrefix: parseBoolean(
      getFirstDefinedValue(argv, ["strictAudioPathPrefix", "strict-audio-path-prefix"]) ??
        process.env.WFD_UPSERT_STRICT_AUDIO_PATH_PREFIX,
      true
    ),
    chunkSize: parsePositiveInteger(
      getFirstDefinedValue(argv, ["chunkSize", "chunk-size"]) ?? process.env.WFD_UPSERT_CHUNK_SIZE,
      200
    ),
    verifyAfterWrite: parseBoolean(
      getFirstDefinedValue(argv, ["verifyAfterWrite", "verify-after-write"]) ??
        process.env.WFD_UPSERT_VERIFY_AFTER_WRITE,
      true
    ),
    reportFile: resolveProjectPath(
      String(
        getFirstDefinedValue(argv, ["reportFile", "report-file"]) ??
          process.env.WFD_UPSERT_REPORT_FILE ??
          "D:/PTE/wfd/wfd_upsert_report.json"
      ).trim()
    )
  };

  logWithTimestamp("script start");
  logWithTimestamp("dry run", config.dryRun);

  const selectedInput = chooseInputFile(config.preferredInputFile, config.fallbackInputFile);
  logWithTimestamp("input file", selectedInput.filePath);
  logWithTimestamp("input source", selectedInput.source);

  const workbook = xlsx.readFile(selectedInput.filePath);
  const actualSheetName = normalizeSheetName(workbook, config.sheetName);
  const targetSheet = workbook.Sheets[actualSheetName];
  const allRows = xlsx.utils.sheet_to_json(targetSheet, { defval: "" });

  const sourceStats = {
    totalRows: allRows.length,
    sourceWfdRows: 0,
    skippedNonWfdCount: 0,
    skippedMissingIdCount: 0,
    skippedMissingContentCount: 0,
    duplicateIdCount: 0
  };

  const duplicateIds = [];
  const normalizedById = new Map();

  for (const row of allRows) {
    const taskType = normalizeTaskType(row.task_type ?? row.taskType);
    if (taskType !== "WFD") {
      sourceStats.skippedNonWfdCount += 1;
      continue;
    }

    sourceStats.sourceWfdRows += 1;

    const id = String(row.id || "").trim();
    if (!id) {
      sourceStats.skippedMissingIdCount += 1;
      continue;
    }

    const content = String(row.content || "").trim();
    if (!content) {
      sourceStats.skippedMissingContentCount += 1;
      continue;
    }

    if (normalizedById.has(id)) {
      sourceStats.duplicateIdCount += 1;
      duplicateIds.push(id);
    }

    normalizedById.set(id, {
      id,
      task_type: "WFD",
      content,
      audio_path: normalizeAudioPathForWfd(id, row.audio_path ?? row.audioPath, config.strictAudioPathPrefix),
      audio_url: config.clearAudioUrl ? null : String(row.audio_url ?? row.audioUrl ?? "").trim() || null,
      difficulty: parseOptionalInteger(row.difficulty, null),
      word_count: parseOptionalInteger(row.word_count ?? row.wordCount, null),
      is_active: parseOptionalBoolean(row.is_active ?? row.isActive, true),
      audio_duration_seconds: parseOptionalNumber(row.audio_duration_seconds ?? row.audioDurationSeconds, null),
      audio_file_size_bytes: parseOptionalInteger(row.audio_file_size_bytes ?? row.audioFileSizeBytes, null)
    });
  }

  const preparedRows = Array.from(normalizedById.values());
  logWithTimestamp("source rows", sourceStats.totalRows);
  logWithTimestamp("WFD rows from source", sourceStats.sourceWfdRows);
  logWithTimestamp("prepared unique WFD rows", preparedRows.length);

  if (!preparedRows.length) {
    throw new Error("No valid WFD rows prepared for upsert.");
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const anonKey = String(process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  if (!config.dryRun && !serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY. Real upsert requires service role credentials.");
  }

  const supabaseKey = serviceRoleKey || anonKey;
  const keyType = serviceRoleKey ? "service_role" : anonKey ? "anon" : "missing";
  const canConnectSupabase = Boolean(supabaseUrl && supabaseKey);

  if (!canConnectSupabase && !config.dryRun) {
    throw new Error(
      "Missing Supabase credentials. Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  let supabase = null;
  if (canConnectSupabase) {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    logWithTimestamp("supabase auth key type", keyType);
  } else {
    logWithTimestamp("warning", "Supabase credentials missing. Running local preparation only.");
  }

  let existingWfdRows = [];
  const discoveredColumns = new Set();
  let existingRowsFetchError = "";
  let schemaProbeError = "";

  if (supabase) {
    const { data: existingRowsData, error: existingRowsError } = await supabase
      .from("questions")
      .select("*")
      .eq("task_type", "WFD");

    if (existingRowsError) {
      existingRowsFetchError = existingRowsError.message;
      logWithTimestamp("warning", `Failed to fetch existing WFD rows: ${existingRowsError.message}`);
    } else {
      existingWfdRows = Array.isArray(existingRowsData) ? existingRowsData : [];
      for (const row of existingWfdRows) {
        Object.keys(row || {}).forEach((columnName) => discoveredColumns.add(columnName));
      }
      logWithTimestamp("existing WFD rows in database", existingWfdRows.length);
    }

    if (!discoveredColumns.size) {
      const { data: schemaProbeRows, error: schemaProbeQueryError } = await supabase
        .from("questions")
        .select("*")
        .limit(1);

      if (schemaProbeQueryError) {
        schemaProbeError = schemaProbeQueryError.message;
        logWithTimestamp("warning", `Failed to probe questions schema: ${schemaProbeQueryError.message}`);
      } else {
        const probeRow = Array.isArray(schemaProbeRows) ? schemaProbeRows[0] : null;
        Object.keys(probeRow || {}).forEach((columnName) => discoveredColumns.add(columnName));
      }
    }
  }

  const writableColumns = pickWritableColumns(discoveredColumns);
  if (!writableColumns.includes("id")) writableColumns.unshift("id");
  if (!writableColumns.includes("task_type")) writableColumns.push("task_type");
  if (!writableColumns.includes("content")) writableColumns.push("content");
  logWithTimestamp("writable columns used", writableColumns.join(", "));

  const payloadRows = preparedRows.map((row) => buildPayloadRow(row, writableColumns));
  const invalidPayloadRows = payloadRows.filter((row) => !row.id || !row.task_type || !row.content);
  if (invalidPayloadRows.length) {
    throw new Error(`Prepared payload has ${invalidPayloadRows.length} invalid rows (missing id/task_type/content).`);
  }

  const existingIdSet = new Set(
    existingWfdRows
      .map((row) => String(row?.id || "").trim())
      .filter(Boolean)
  );
  const expectedUpdateCount = existingIdSet.size
    ? payloadRows.filter((row) => existingIdSet.has(String(row.id || "").trim())).length
    : null;
  const expectedInsertCount = existingIdSet.size
    ? payloadRows.filter((row) => !existingIdSet.has(String(row.id || "").trim())).length
    : null;

  if (expectedUpdateCount !== null && expectedInsertCount !== null) {
    logWithTimestamp("expected update count", expectedUpdateCount);
    logWithTimestamp("expected insert count", expectedInsertCount);
  }

  const execution = {
    attempted: false,
    batchCount: 0,
    upsertedCount: 0,
    failedBatchCount: 0,
    failedBatches: []
  };

  if (!config.dryRun && supabase) {
    execution.attempted = true;

    const batches = chunkArray(payloadRows, config.chunkSize);
    execution.batchCount = batches.length;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];
      logWithTimestamp("upsert batch", `${batchIndex + 1}/${batches.length}, rows=${batch.length}`);

      const { error } = await supabase.from("questions").upsert(batch, {
        onConflict: "id",
        ignoreDuplicates: false
      });

      if (error) {
        execution.failedBatchCount += 1;
        execution.failedBatches.push({
          batchIndex: batchIndex + 1,
          rowCount: batch.length,
          message: error.message
        });
        logWithTimestamp("batch failed", `batch=${batchIndex + 1}, message=${error.message}`);
        continue;
      }

      execution.upsertedCount += batch.length;
    }
  }

  const verification = {
    attempted: false,
    totalWfdRows: null,
    emptyAudioPathCount: null,
    nonWfdPrefixAudioPathCount: null,
    nonEmptyAudioUrlCount: null,
    sampleProblemIds: [],
    error: ""
  };

  if (supabase && config.verifyAfterWrite) {
    verification.attempted = true;

    const selectColumns = ["id", "audio_path"];
    if (writableColumns.includes("audio_url")) {
      selectColumns.push("audio_url");
    }

    const { data: verifyRows, error: verifyError } = await supabase
      .from("questions")
      .select(selectColumns.join(","))
      .eq("task_type", "WFD")
      .order("id", { ascending: true });

    if (verifyError) {
      verification.error = verifyError.message;
      logWithTimestamp("verification failed", verifyError.message);
    } else {
      const rows = Array.isArray(verifyRows) ? verifyRows : [];
      const emptyAudioPathRows = [];
      const nonWfdPrefixRows = [];
      const nonEmptyAudioUrlRows = [];

      for (const row of rows) {
        const id = String(row?.id || "").trim();
        const audioPath = normalizeAudioPath(row?.audio_path || "");
        const audioUrl = String(row?.audio_url || "").trim();

        if (!audioPath) {
          emptyAudioPathRows.push(id);
        } else if (!audioPath.toLowerCase().startsWith("wfd/")) {
          nonWfdPrefixRows.push(id);
        }

        if (audioUrl) {
          nonEmptyAudioUrlRows.push(id);
        }
      }

      verification.totalWfdRows = rows.length;
      verification.emptyAudioPathCount = emptyAudioPathRows.length;
      verification.nonWfdPrefixAudioPathCount = nonWfdPrefixRows.length;
      verification.nonEmptyAudioUrlCount = nonEmptyAudioUrlRows.length;
      verification.sampleProblemIds = [...emptyAudioPathRows, ...nonWfdPrefixRows, ...nonEmptyAudioUrlRows].slice(0, 20);
    }
  }

  const report = {
    generatedAt: getTimestamp(),
    config: {
      preferredInputFile: config.preferredInputFile,
      fallbackInputFile: config.fallbackInputFile,
      selectedInputFile: selectedInput.filePath,
      selectedInputSource: selectedInput.source,
      sheetName: actualSheetName,
      dryRun: config.dryRun,
      clearAudioUrl: config.clearAudioUrl,
      strictAudioPathPrefix: config.strictAudioPathPrefix,
      chunkSize: config.chunkSize,
      verifyAfterWrite: config.verifyAfterWrite,
      reportFile: config.reportFile
    },
    environment: {
      hasSupabaseUrl: Boolean(supabaseUrl),
      keyType
    },
    sourceStats,
    preparedStats: {
      preparedRowCount: payloadRows.length,
      duplicateIds,
      writableColumns,
      expectedUpdateCount,
      expectedInsertCount
    },
    execution,
    verification,
    errors: {
      existingRowsFetchError,
      schemaProbeError
    }
  };

  await ensureDirectoryForFile(config.reportFile);
  await fsPromises.writeFile(config.reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  logWithTimestamp("report file", config.reportFile);
  logWithTimestamp(
    "summary",
    `prepared=${payloadRows.length}, expectedUpdate=${expectedUpdateCount ?? "unknown"}, expectedInsert=${expectedInsertCount ?? "unknown"}, upserted=${execution.upsertedCount}, failedBatches=${execution.failedBatchCount}`
  );

  if (!config.dryRun && execution.failedBatchCount > 0) {
    throw new Error(`Upsert completed with ${execution.failedBatchCount} failed batch(es).`);
  }
}

main().catch((error) => {
  console.error(`[${getTimestamp()}] WFD upsert failed`);
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
