import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createGoogleTtsRestClient, formatErrorDetails } from "./google-tts-rest.js";

const EXPECTED_QUESTION_COUNT = 61;
const DEFAULT_LANGUAGE_CODE = "en-AU";
const DEFAULT_VOICE = "en-AU-Neural2-B";
const DEFAULT_SPEAKING_RATE = 0.88;
const DEFAULT_AUDIO_ENCODING = "MP3";
const DEFAULT_TIMEOUT_MS = Math.max(1, Number(process.env.RTS_TTS_REQUEST_TIMEOUT_MS) || 60000);

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

function getArgValue(args, key, defaultValue) {
  if (args[key] === undefined || args[key] === null || args[key] === "") {
    return defaultValue;
  }
  return args[key];
}

function parseNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function normalizeQuestionText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumberedQuestions(markdown) {
  const questions = [];
  const lines = String(markdown || "").split(/\r?\n/);
  let currentQuestion = null;

  const pushCurrentQuestion = () => {
    if (!currentQuestion) return;
    questions.push({
      sourceNumber: currentQuestion.sourceNumber,
      text: normalizeQuestionText(currentQuestion.lines.join(" "))
    });
  };

  for (const rawLine of lines) {
    const line = String(rawLine || "");
    const questionStartMatch = line.match(/^\s*(\d+)\.\s*(.*)$/);

    if (questionStartMatch) {
      pushCurrentQuestion();
      currentQuestion = {
        sourceNumber: Number(questionStartMatch[1]),
        lines: []
      };

      const firstLineContent = normalizeQuestionText(questionStartMatch[2]);
      if (firstLineContent) {
        currentQuestion.lines.push(firstLineContent);
      }
      continue;
    }

    if (!currentQuestion) {
      continue;
    }

    const continuationLine = normalizeQuestionText(line);
    if (continuationLine) {
      currentQuestion.lines.push(continuationLine);
    }
  }

  pushCurrentQuestion();
  return questions;
}

function getDesktopPath(fileName) {
  const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir();
  return path.join(homeDir, "Desktop", fileName);
}

function formatQuestionId(orderNumber) {
  return `RTS_Q${String(orderNumber).padStart(3, "0")}`;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const inputFilePath = path.resolve(
    String(getArgValue(args, "inputFile", getDesktopPath("RTS题目.md")))
  );
  const outputDirPath = path.resolve(String(getArgValue(args, "outDir", getDesktopPath("RTS_audio"))));
  const voiceName = String(getArgValue(args, "voice", DEFAULT_VOICE)).trim() || DEFAULT_VOICE;
  const speakingRate = parseNumber(getArgValue(args, "speakingRate", DEFAULT_SPEAKING_RATE), DEFAULT_SPEAKING_RATE);
  const audioEncoding =
    String(getArgValue(args, "audioEncoding", DEFAULT_AUDIO_ENCODING)).trim().toUpperCase() ||
    DEFAULT_AUDIO_ENCODING;

  const markdownContent = await fs.readFile(inputFilePath, "utf8");
  const questions = parseNumberedQuestions(markdownContent);

  if (questions.length !== EXPECTED_QUESTION_COUNT) {
    throw new Error(
      `Parsed question count mismatch. Expected ${EXPECTED_QUESTION_COUNT}, got ${questions.length}. Input: ${inputFilePath}`
    );
  }

  await fs.mkdir(outputDirPath, { recursive: true });
  const manifestPath = path.join(outputDirPath, "rts_tts_manifest.json");

  const manifestItems = [];
  const skippedEmptyItems = [];
  let successCount = 0;
  let failedCount = 0;

  const ttsClient = await createGoogleTtsRestClient();

  try {
    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      const orderNumber = index + 1;
      const id = formatQuestionId(orderNumber);
      const filename = `${id}.mp3`;
      const outputPath = path.join(outputDirPath, filename);
      const text = normalizeQuestionText(question.text);

      const manifestItemBase = {
        id,
        source_number: question.sourceNumber,
        filename,
        output_path: outputPath,
        text,
        voice: voiceName,
        speakingRate,
        audioEncoding
      };

      if (!text) {
        skippedEmptyItems.push({
          id,
          sourceNumber: question.sourceNumber
        });
        manifestItems.push({
          ...manifestItemBase,
          status: "skipped_empty"
        });
        console.warn(`[${orderNumber}/${questions.length}] ${id} skipped (empty text)`);
        continue;
      }

      try {
        const audioContent = await ttsClient.synthesizeSpeech({
          text,
          voice: {
            languageCode: DEFAULT_LANGUAGE_CODE,
            name: voiceName
          },
          audioConfig: {
            audioEncoding,
            speakingRate
          },
          timeoutMs: DEFAULT_TIMEOUT_MS
        });

        await fs.writeFile(outputPath, Buffer.from(audioContent, "base64"));
        successCount += 1;

        manifestItems.push({
          ...manifestItemBase,
          status: "success"
        });
        console.log(`[${orderNumber}/${questions.length}] ${id} done`);
      } catch (error) {
        failedCount += 1;
        const message = error instanceof Error ? error.message : String(error);

        manifestItems.push({
          ...manifestItemBase,
          status: "failed",
          error: message
        });
        console.error(`[${orderNumber}/${questions.length}] ${id} failed: ${message}`);
      }
    }
  } finally {
    await ttsClient.close();
  }

  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        inputFile: inputFilePath,
        outputDir: outputDirPath,
        totalQuestions: questions.length,
        expectedQuestionCount: EXPECTED_QUESTION_COUNT,
        successCount,
        failedCount,
        skippedEmptyCount: skippedEmptyItems.length,
        languageCode: DEFAULT_LANGUAGE_CODE,
        items: manifestItems
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log("RTS TTS generation finished");
  console.log(`Total questions: ${questions.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`Skipped empty: ${skippedEmptyItems.length}`);
  if (skippedEmptyItems.length > 0) {
    console.log(
      `Skipped empty IDs: ${skippedEmptyItems
        .map((item) => `${item.id}(source:${item.sourceNumber})`)
        .join(", ")}`
    );
  }
  console.log(`Output directory: ${outputDirPath}`);
  console.log(`Manifest path: ${manifestPath}`);
}

main().catch((error) => {
  console.error("RTS TTS generation failed");
  console.error("message:", error?.message || error);
  if (error?.stack) {
    console.error(error.stack);
  }
  try {
    console.error("details:", formatErrorDetails(error));
  } catch {}
  process.exitCode = 1;
});