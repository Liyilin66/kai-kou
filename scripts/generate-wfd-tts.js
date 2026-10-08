import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseBuffer } from "music-metadata";
import xlsx from "xlsx";
import { createGoogleTtsRestClient, formatErrorDetails, isTimeoutLikeError } from "./google-tts-rest.js";

const TRUE_VALUES = new Set(["1", "true", "yes", "y", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "n", "off"]);

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const projectRoot = path.resolve(scriptDir, "..");
const DEFAULT_SYNTH_TIMEOUT_MS = 60000;
const FIRST_ROW_STUCK_DIAGNOSTIC_MS = 30000;

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

function getErrorStack(error) {
  return formatErrorDetails(error);
}

function isTimeoutError(error) {
  return isTimeoutLikeError(error);
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

function parseOptionalBoolean(value) {
  if (value === undefined || value === null || value === "") return null;
  return parseBoolean(value, null);
}

function parseNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function normalizeAudioPath(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
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

function normalizeTaskType(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

async function getAudioDurationSeconds(filePath) {
  try {
    const buffer = await fs.readFile(filePath);
    const metadata = await parseBuffer(buffer, undefined, { duration: true });
    const duration = metadata?.format?.duration;
    if (!Number.isFinite(duration)) return "";
    return Number(duration.toFixed(3));
  } catch {
    return "";
  }
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

async function main() {
  logWithTimestamp("script start");
  const argv = parseCliArgs(process.argv.slice(2));

  const config = {
    languageCode: String(
      getFirstDefinedValue(argv, ["languageCode", "language-code"]) ??
        process.env.WFD_TTS_LANGUAGE_CODE ??
        "en-AU"
    ).trim(),
    voiceName: String(
      getFirstDefinedValue(argv, ["voiceName", "voice-name"]) ??
        process.env.WFD_TTS_VOICE_NAME ??
        "en-AU-Standard-C"
    ).trim(),
    ssmlGender: String(
      getFirstDefinedValue(argv, ["ssmlGender", "ssml-gender"]) ??
        process.env.WFD_TTS_SSML_GENDER ??
        "FEMALE"
    )
      .trim()
      .toUpperCase(),
    speakingRate: parseNumber(
      getFirstDefinedValue(argv, ["speakingRate", "speaking-rate"]) ?? process.env.WFD_TTS_SPEAKING_RATE,
      0.92
    ),
    pitch: parseNumber(getFirstDefinedValue(argv, ["pitch"]) ?? process.env.WFD_TTS_PITCH, 0),
    audioEncoding: String(
      getFirstDefinedValue(argv, ["audioEncoding", "audio-encoding"]) ??
        process.env.WFD_TTS_AUDIO_ENCODING ??
        "MP3"
    )
      .trim()
      .toUpperCase(),
    outputDir: String(
      getFirstDefinedValue(argv, ["outputDir", "output-dir"]) ?? process.env.WFD_TTS_OUTPUT_DIR ?? "generated-audio"
    ).trim(),
    inputFile: String(
      getFirstDefinedValue(argv, ["inputFile", "input-file"]) ??
        process.env.WFD_TTS_INPUT_FILE ??
        "WFD_cleaned_with_wordcount_difficulty.xlsx"
    ).trim(),
    sheetName: String(
      getFirstDefinedValue(argv, ["sheetName", "sheet-name"]) ?? process.env.WFD_TTS_SHEET_NAME ?? "WFD"
    ).trim(),
    skipExisting: parseBoolean(
      getFirstDefinedValue(argv, ["skipExisting", "skip-existing"]) ?? process.env.WFD_TTS_SKIP_EXISTING,
      true
    ),
    outputQuestionFile: String(
      getFirstDefinedValue(argv, ["outputQuestionFile", "output-question-file"]) ??
        process.env.WFD_TTS_OUTPUT_QUESTION_FILE ??
        "WFD_with_generated_audio.xlsx"
    ).trim(),
    reportFile: String(
      getFirstDefinedValue(argv, ["reportFile", "report-file"]) ??
        process.env.WFD_TTS_REPORT_FILE ??
        "tts_generation_report.json"
    ).trim(),
    requestTimeoutMs: Math.max(
      1,
      parseNumber(
        getFirstDefinedValue(argv, ["requestTimeoutMs", "request-timeout-ms"]) ??
          process.env.WFD_TTS_REQUEST_TIMEOUT_MS,
        DEFAULT_SYNTH_TIMEOUT_MS
      )
    )
  };

  const inputFilePath = resolveProjectPath(config.inputFile);
  const outputDirPath = resolveProjectPath(config.outputDir);
  const outputQuestionFilePath = resolveProjectPath(config.outputQuestionFile);
  const reportFilePath = resolveProjectPath(config.reportFile);
  logWithTimestamp("input file resolved path", inputFilePath);

  const inputFileExists = existsSync(inputFilePath);
  logWithTimestamp("input file exists", inputFileExists);
  if (!inputFileExists) {
    throw new Error(`Input file not found: ${inputFilePath}`);
  }

  if (path.resolve(inputFilePath).toLowerCase() === path.resolve(outputQuestionFilePath).toLowerCase()) {
    throw new Error("Output question file cannot be the same as input file.");
  }

  await fs.mkdir(outputDirPath, { recursive: true });

  logWithTimestamp("input file read start");
  const workbook = xlsx.readFile(inputFilePath);
  logWithTimestamp("input file read done");
  const actualSheetName = normalizeSheetName(workbook, config.sheetName);
  const targetSheet = workbook.Sheets[actualSheetName];

  const rows = xlsx.utils.sheet_to_json(targetSheet, { defval: "" });
  const headerRows = xlsx.utils.sheet_to_json(targetSheet, { header: 1, defval: "", blankrows: false });
  const headerRow = Array.isArray(headerRows[0]) ? headerRows[0] : [];
  const hasIsActive = hasHeaderColumn(headerRow, "is_active");
  const filteredWfdRows = rows.filter((row) => normalizeTaskType(row.task_type ?? row.taskType) === "WFD");
  const filteredWfdRowsCount = filteredWfdRows.length;
  logWithTimestamp("rows parsed count", rows.length);
  logWithTimestamp("filtered WFD rows count", filteredWfdRowsCount);
  if (filteredWfdRowsCount > 0) {
    const firstRow = filteredWfdRows[0];
    logWithTimestamp(
      "first row preview",
      JSON.stringify({
        id: String(firstRow.id || "").trim(),
        content: String(firstRow.content || "")
          .trim()
          .slice(0, 50)
      })
    );
  } else {
    logWithTimestamp("first row preview", "none");
  }

  const stats = {
    totalRows: rows.length,
    eligibleRows: 0,
    successCount: 0,
    generatedCount: 0,
    skippedInactiveCount: 0,
    skippedNoContentCount: 0,
    skippedExistingCount: 0,
    failedCount: 0
  };
  const failedItems = [];

  logWithTimestamp("google client init start");
  const client = await createGoogleTtsRestClient();
  logWithTimestamp("google client init done");
  logWithTimestamp("quota project", client.config.quotaProject);
  logWithTimestamp("proxy enabled", client.config.proxyEnabled);
  logWithTimestamp("proxy source", client.config.proxyEnvKey || "<none>");
  logWithTimestamp("proxy value", client.config.proxyMaskedUrl || "<none>");
  logWithTimestamp("credentials path", client.config.credentialsPath || "<unset>");
  logWithTimestamp("endpoint", client.config.endpoint);

  let processedWfdRows = 0;
  let firstEligibleRowCompleted = false;
  const firstRowStuckTimer = setTimeout(() => {
    if (!firstEligibleRowCompleted) {
      logWithTimestamp("stuck before first audio generated");
    }
  }, FIRST_ROW_STUCK_DIAGNOSTIC_MS);

  const markFirstEligibleRowCompleted = () => {
    if (!firstEligibleRowCompleted) {
      firstEligibleRowCompleted = true;
      clearTimeout(firstRowStuckTimer);
    }
  };

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;
    const taskType = normalizeTaskType(row.task_type ?? row.taskType);

    if (taskType !== "WFD") {
      continue;
    }
    processedWfdRows += 1;
    logWithTimestamp(`[${processedWfdRows}/${filteredWfdRowsCount}]`, `row ${rowNumber}`);

    if (hasIsActive) {
      const isActive = parseOptionalBoolean(row.is_active ?? row.isActive);
      if (isActive === false) {
        stats.skippedInactiveCount += 1;
        continue;
      }
    }

    stats.eligibleRows += 1;

    const id = String(row.id || "").trim();
    const content = String(row.content || "").trim();
    let audioPath = normalizeAudioPath(row.audio_path ?? row.audioPath);

    if (!content) {
      stats.skippedNoContentCount += 1;
      markFirstEligibleRowCompleted();
      continue;
    }

    if (!audioPath) {
      if (!id) {
        stats.failedCount += 1;
        failedItems.push({
          rowNumber,
          id: "",
          reason: "Missing both audio_path and id."
        });
        markFirstEligibleRowCompleted();
        continue;
      }
      audioPath = `wfd/${id}.mp3`;
    }

    const outputAudioFilePath = path.resolve(outputDirPath, ...audioPath.split("/"));

    try {
      await ensureDirectoryForFile(outputAudioFilePath);

      if (config.skipExisting && existsSync(outputAudioFilePath)) {
        stats.skippedExistingCount += 1;
      } else {
        const request = {
          voice: {
            languageCode: config.languageCode,
            ...(config.voiceName ? { name: config.voiceName } : {}),
            ...(config.ssmlGender ? { ssmlGender: config.ssmlGender } : {})
          },
          audioConfig: {
            audioEncoding: config.audioEncoding,
            speakingRate: config.speakingRate,
            pitch: config.pitch
          }
        };

        logWithTimestamp(`before synthesize row ${id || rowNumber}`);
        const audioContent = await client.synthesizeSpeech({
          text: content,
          voice: request.voice,
          audioConfig: request.audioConfig,
          timeoutMs: config.requestTimeoutMs
        });
        logWithTimestamp(`after synthesize row ${id || rowNumber}`);
        const audioBuffer = Buffer.from(audioContent, "base64");

        await fs.writeFile(outputAudioFilePath, audioBuffer);
        logWithTimestamp("file written {path}", outputAudioFilePath);
        stats.generatedCount += 1;
      }

      const fileStats = await fs.stat(outputAudioFilePath);
      const durationSeconds = await getAudioDurationSeconds(outputAudioFilePath);

      row.audio_path = audioPath;
      row.audio_file_size_bytes = fileStats.size;
      if (durationSeconds !== "") {
        row.audio_duration_seconds = durationSeconds;
      }

      stats.successCount += 1;
    } catch (error) {
      if (isTimeoutError(error)) {
        logWithTimestamp("row id", id || `row ${rowNumber}`);
        logWithTimestamp("timeout", `${config.requestTimeoutMs}ms`);
        logWithTimestamp("continue next row");
      } else {
        logWithTimestamp("row failed", `${id || `row ${rowNumber}`}: ${getErrorStack(error)}`);
      }
      stats.failedCount += 1;
      failedItems.push({
        rowNumber,
        id,
        reason: error instanceof Error ? error.message : String(error)
      });
    } finally {
      markFirstEligibleRowCompleted();
    }
  }
  clearTimeout(firstRowStuckTimer);

  await saveOutputTable(rows, actualSheetName, outputQuestionFilePath, headerRow);

  const report = {
    generatedAt: new Date().toISOString(),
    inputFile: inputFilePath,
    outputAudioDir: outputDirPath,
    outputQuestionFile: outputQuestionFilePath,
    reportFile: reportFilePath,
    config,
    summary: stats,
    failedIds: failedItems.map((item) => item.id).filter(Boolean),
    failedItems
  };

  await ensureDirectoryForFile(reportFilePath);
  await fs.writeFile(reportFilePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  logWithTimestamp("WFD TTS generation completed");
  logWithTimestamp("input sheet", actualSheetName);
  logWithTimestamp("audio directory", outputDirPath);
  logWithTimestamp("output question file", outputQuestionFilePath);
  logWithTimestamp("report file", reportFilePath);
  logWithTimestamp(
    "final summary",
    `Summary -> total:${stats.totalRows}, eligible:${stats.eligibleRows}, success:${stats.successCount}, generated:${stats.generatedCount}, skippedExisting:${stats.skippedExistingCount}, skippedNoContent:${stats.skippedNoContentCount}, skippedInactive:${stats.skippedInactiveCount}, failed:${stats.failedCount}`
  );

  await client.close();
}

main().catch((error) => {
  console.error(`[${getTimestamp()}] WFD TTS generation failed`);
  console.error(getErrorStack(error));
  process.exitCode = 1;
});

