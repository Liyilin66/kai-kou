import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import xlsx from "xlsx";

const TRUE_VALUES = new Set(["1", "true", "yes", "y", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "n", "off"]);

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const projectRoot = path.resolve(scriptDir, "..");

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

function parseOptionalBoolean(value) {
  if (value === undefined || value === null || value === "") return null;
  return parseBoolean(value, null);
}

function normalizeAudioPath(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function normalizeTaskType(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function resolveProjectPath(filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(projectRoot, filePath);
}

function hasHeaderColumn(headerRow, expectedColumnName) {
  const expected = String(expectedColumnName || "")
    .trim()
    .toLowerCase();
  return headerRow.some((columnName) => String(columnName || "").trim().toLowerCase() === expected);
}

function buildHeaders(headerRow, rows) {
  const normalizedHeaders = [];
  const seen = new Set();

  for (const header of headerRow) {
    const key = String(header || "").trim();
    if (!key || seen.has(key)) continue;
    normalizedHeaders.push(key);
    seen.add(key);
  }

  for (const row of rows) {
    for (const key of Object.keys(row || {})) {
      if (!seen.has(key)) {
        normalizedHeaders.push(key);
        seen.add(key);
      }
    }
  }

  return normalizedHeaders;
}

async function ensureDirectoryForFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function saveOutputTable(rows, sheetName, outputFilePath, headerRow) {
  const headers = buildHeaders(headerRow, rows);
  const outputSheet = xlsx.utils.json_to_sheet(rows, {
    header: headers,
    skipHeader: false
  });

  const extension = path.extname(outputFilePath).toLowerCase();
  if (extension === ".csv") {
    const csv = xlsx.utils.sheet_to_csv(outputSheet);
    await ensureDirectoryForFile(outputFilePath);
    await fs.writeFile(outputFilePath, csv, "utf8");
    return;
  }

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, outputSheet, sheetName);
  await ensureDirectoryForFile(outputFilePath);
  xlsx.writeFile(workbook, outputFilePath);
}

function normalizeSheetName(workbook, expectedSheetName) {
  if (expectedSheetName && workbook.Sheets[expectedSheetName]) {
    return expectedSheetName;
  }

  const [firstSheet] = workbook.SheetNames;
  if (!firstSheet) {
    throw new Error("Input workbook has no sheet.");
  }
  return firstSheet;
}

function buildStoragePath(storagePrefix, audioPath) {
  const normalizedPrefix = normalizeAudioPath(storagePrefix);
  const normalizedAudioPath = normalizeAudioPath(audioPath);
  if (!normalizedPrefix) return normalizedAudioPath;
  return normalizeAudioPath(path.posix.join(normalizedPrefix, normalizedAudioPath));
}

async function main() {
  const argv = parseCliArgs(process.argv.slice(2));

  const config = {
    inputFile: String(
      getFirstDefinedValue(argv, ["inputFile", "input-file"]) ??
        process.env.WFD_UPLOAD_INPUT_FILE ??
        "WFD_with_generated_audio.xlsx"
    ).trim(),
    sheetName: String(
      getFirstDefinedValue(argv, ["sheetName", "sheet-name"]) ?? process.env.WFD_UPLOAD_SHEET_NAME ?? "WFD"
    ).trim(),
    audioDir: String(
      getFirstDefinedValue(argv, ["audioDir", "audio-dir"]) ?? process.env.WFD_UPLOAD_AUDIO_DIR ?? "generated-audio"
    ).trim(),
    bucket: String(
      getFirstDefinedValue(argv, ["bucket"]) ?? process.env.WFD_UPLOAD_BUCKET ?? "question-audio"
    ).trim(),
    storagePrefix: String(
      getFirstDefinedValue(argv, ["storagePrefix", "storage-prefix"]) ??
        process.env.WFD_UPLOAD_STORAGE_PREFIX ??
        ""
    ).trim(),
    upsert: parseBoolean(getFirstDefinedValue(argv, ["upsert"]) ?? process.env.WFD_UPLOAD_UPSERT, true),
    updateAudioPath: parseBoolean(
      getFirstDefinedValue(argv, ["updateAudioPath", "update-audio-path"]) ?? process.env.WFD_UPLOAD_UPDATE_AUDIO_PATH,
      false
    ),
    skipMissing: parseBoolean(
      getFirstDefinedValue(argv, ["skipMissing", "skip-missing"]) ?? process.env.WFD_UPLOAD_SKIP_MISSING,
      true
    ),
    outputQuestionFile: String(
      getFirstDefinedValue(argv, ["outputQuestionFile", "output-question-file"]) ??
        process.env.WFD_UPLOAD_OUTPUT_QUESTION_FILE ??
        "WFD_with_uploaded_audio.xlsx"
    ).trim(),
    reportFile: String(
      getFirstDefinedValue(argv, ["reportFile", "report-file"]) ??
        process.env.WFD_UPLOAD_REPORT_FILE ??
        "tts_upload_report.json"
    ).trim()
  };

  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL (or VITE_SUPABASE_URL) in environment variables.");
  }
  if (!supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in environment variables.");
  }

  const inputFilePath = resolveProjectPath(config.inputFile);
  const audioDirPath = resolveProjectPath(config.audioDir);
  const outputQuestionFilePath = resolveProjectPath(config.outputQuestionFile);
  const reportFilePath = resolveProjectPath(config.reportFile);

  if (!existsSync(inputFilePath)) {
    throw new Error(`Input file not found: ${inputFilePath}`);
  }
  if (!existsSync(audioDirPath)) {
    throw new Error(`Audio directory not found: ${audioDirPath}`);
  }
  if (path.resolve(inputFilePath).toLowerCase() === path.resolve(outputQuestionFilePath).toLowerCase()) {
    throw new Error("Output question file cannot be the same as input file.");
  }

  const workbook = xlsx.readFile(inputFilePath);
  const actualSheetName = normalizeSheetName(workbook, config.sheetName);
  const targetSheet = workbook.Sheets[actualSheetName];

  const rows = xlsx.utils.sheet_to_json(targetSheet, { defval: "" });
  const headerRows = xlsx.utils.sheet_to_json(targetSheet, { header: 1, defval: "", blankrows: false });
  const headerRow = Array.isArray(headerRows[0]) ? headerRows[0] : [];
  const hasIsActive = hasHeaderColumn(headerRow, "is_active");

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const stats = {
    totalRows: rows.length,
    eligibleRows: 0,
    uploadedCount: 0,
    skippedInactiveCount: 0,
    skippedMissingFileCount: 0,
    failedCount: 0
  };
  const failedItems = [];
  const uploadedItems = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;
    const taskType = normalizeTaskType(row.task_type ?? row.taskType);

    if (taskType !== "WFD") {
      continue;
    }

    if (hasIsActive) {
      const isActive = parseOptionalBoolean(row.is_active ?? row.isActive);
      if (isActive === false) {
        stats.skippedInactiveCount += 1;
        continue;
      }
    }

    stats.eligibleRows += 1;

    const id = String(row.id || "").trim();
    let audioPath = normalizeAudioPath(row.audio_path ?? row.audioPath);
    if (!audioPath) {
      if (!id) {
        stats.failedCount += 1;
        failedItems.push({
          rowNumber,
          id: "",
          reason: "Missing both audio_path and id."
        });
        continue;
      }
      audioPath = `wfd/${id}.mp3`;
    }

    const localAudioFilePath = path.resolve(audioDirPath, ...audioPath.split("/"));
    if (!existsSync(localAudioFilePath)) {
      if (config.skipMissing) {
        stats.skippedMissingFileCount += 1;
        continue;
      }

      stats.failedCount += 1;
      failedItems.push({
        rowNumber,
        id,
        reason: `Local audio file not found: ${localAudioFilePath}`
      });
      continue;
    }

    const storagePath = buildStoragePath(config.storagePrefix, audioPath);

    try {
      const audioBuffer = await fs.readFile(localAudioFilePath);
      const { error: uploadError } = await supabase.storage.from(config.bucket).upload(storagePath, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: config.upsert
      });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data } = supabase.storage.from(config.bucket).getPublicUrl(storagePath);
      const publicUrl = String(data?.publicUrl || "").trim();

      if (config.updateAudioPath) {
        row.audio_path = storagePath;
      } else {
        row.audio_path = audioPath;
      }

      row.audio_url = publicUrl;

      stats.uploadedCount += 1;
      uploadedItems.push({
        id,
        storagePath,
        publicUrl
      });
    } catch (error) {
      stats.failedCount += 1;
      failedItems.push({
        rowNumber,
        id,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  await saveOutputTable(rows, actualSheetName, outputQuestionFilePath, headerRow);

  const report = {
    uploadedAt: new Date().toISOString(),
    inputFile: inputFilePath,
    audioDir: audioDirPath,
    bucket: config.bucket,
    storagePrefix: config.storagePrefix,
    outputQuestionFile: outputQuestionFilePath,
    reportFile: reportFilePath,
    config,
    summary: stats,
    failedIds: failedItems.map((item) => item.id).filter(Boolean),
    failedItems,
    uploadedItems
  };

  await ensureDirectoryForFile(reportFilePath);
  await fs.writeFile(reportFilePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("WFD audio upload completed.");
  console.log(`Bucket: ${config.bucket}`);
  console.log(`Output question file: ${outputQuestionFilePath}`);
  console.log(`Report file: ${reportFilePath}`);
  console.log(
    `Summary -> total:${stats.totalRows}, eligible:${stats.eligibleRows}, uploaded:${stats.uploadedCount}, skippedMissing:${stats.skippedMissingFileCount}, skippedInactive:${stats.skippedInactiveCount}, failed:${stats.failedCount}`
  );
}

main().catch((error) => {
  console.error("WFD audio upload failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
