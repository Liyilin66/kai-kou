import fs from "node:fs/promises";
import path from "node:path";

import { createGoogleTtsRestClient, formatErrorDetails } from "./google-tts-rest.js";

const TEST_TEXT =
  "Classical mechanics is sometimes considered as a branch of applied mathematics.";
const OUTPUT_FILE_PATH = "D:/PTE/wfd/debug_tts/test_rest.mp3";
const REQUEST_TIMEOUT_MS = 60000;

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

async function main() {
  let ttsClient;
  logWithTimestamp("script started");

  logWithTimestamp("client init start");
  ttsClient = await createGoogleTtsRestClient();
  logWithTimestamp("client init done");
  logWithTimestamp("quota project", ttsClient.config.quotaProject);
  logWithTimestamp("proxy enabled", ttsClient.config.proxyEnabled);
  logWithTimestamp("proxy source", ttsClient.config.proxyEnvKey || "<none>");
  logWithTimestamp("proxy value", ttsClient.config.proxyMaskedUrl || "<none>");
  logWithTimestamp("credentials path", ttsClient.config.credentialsPath || "<unset>");
  logWithTimestamp("endpoint", ttsClient.config.endpoint);

  const voice = {
    languageCode: process.env.WFD_TTS_TEST_REST_LANGUAGE_CODE || "en-AU",
    name: process.env.WFD_TTS_TEST_REST_VOICE_NAME || "en-AU-Standard-C"
  };
  const audioConfig = {
    audioEncoding: "MP3",
    speakingRate: 0.92
  };

  logWithTimestamp("using REST fallback test");
  logWithTimestamp("request start");
  const audioContent = await ttsClient.synthesizeSpeech({
    text: TEST_TEXT,
    voice,
    audioConfig,
    timeoutMs: REQUEST_TIMEOUT_MS
  });
  logWithTimestamp("request done");

  const audioBuffer = Buffer.from(audioContent, "base64");

  logWithTimestamp("file write start", OUTPUT_FILE_PATH);
  await fs.mkdir(path.dirname(OUTPUT_FILE_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_FILE_PATH, audioBuffer);
  logWithTimestamp("file write done", OUTPUT_FILE_PATH);

  await ttsClient.close();
}

main().catch((error) => {
  console.error(`[${getTimestamp()}] test-google-tts-rest failed`);
  console.error(formatErrorDetails(error));
  process.exitCode = 1;
});

