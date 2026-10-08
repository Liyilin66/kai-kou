import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const EXPECTED_COUNT = 126;
const DEFAULT_TARGET_URL = "https://www.fireflyau.com/ptehome/prediction-list";
const DEFAULT_SOURCE = "firefly_weekly_prediction";
const DEFAULT_TYPE = "RS";
const NPX_COMMAND = "npx";

const LOGIN_PHONE_LABEL = "\u8bf7\u8f93\u5165\u624b\u673a\u53f7\u7801";
const LOGIN_PASSWORD_LABEL = "\u5bc6\u7801";
const LOGIN_BUTTON_LABEL = "\u767b\u5f55";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const projectRoot = path.resolve(scriptDir, "..");

function getTimestamp() {
  return new Date().toISOString();
}

function log(message) {
  console.log(`[firefly-rs] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function getArgValue(args, key, defaultValue) {
  if (args[key] === undefined || args[key] === null || args[key] === "") {
    return defaultValue;
  }
  return args[key];
}

function resolveProjectPath(filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(projectRoot, filePath);
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/[\u00A0\u200B-\u200D\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSentence(rawValue) {
  let value = String(rawValue || "");

  value = value.split(/\r?\n/)[0] || "";
  value = value.replace(/[\u2018\u2019]/g, "'");
  value = value.replace(/[\u201C\u201D]/g, "\"");
  value = value.replace(/[\u3400-\u9FFF]/g, " ");
  value = value.replace(/^\s*(?:RS\s*)?(?:Q\s*)?\d{1,4}\s*[-:.)]?\s*/i, "");
  value = value.replace(/^\s*\d{1,4}\s+/i, "");
  value = value.replace(/[^\x20-\x7E]/g, " ");
  value = normalizeWhitespace(value);
  value = value.replace(/\s+([,.;:!?])/g, "$1").trim();

  return value;
}

function buildDedupKey(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"");
}

function isProbablyEnglishSentence(value) {
  const text = normalizeWhitespace(value);
  if (!text) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (/[\u3400-\u9FFF]/.test(text)) return false;

  const allowedChars = text.match(/[A-Za-z0-9\s,.;:'"!?()[\]{}\-/%&]/g) || [];
  return allowedChars.length / text.length >= 0.7;
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function toCsv(rows) {
  const header = ["type", "order", "text", "source", "scraped_at"];
  const lines = [header.join(",")];

  for (const row of rows) {
    lines.push(
      [
        escapeCsvValue(row.type),
        escapeCsvValue(row.order),
        escapeCsvValue(row.text),
        escapeCsvValue(row.source),
        escapeCsvValue(row.scraped_at)
      ].join(",")
    );
  }

  return `${lines.join("\n")}\n`;
}

async function ensureDirectoryForFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function parsePackageJsonDependencies(packageJsonContent) {
  try {
    const packageJson = JSON.parse(packageJsonContent);
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};

    return {
      hasPlaywrightDependency: Boolean(
        dependencies.playwright ||
          dependencies["playwright-core"] ||
          devDependencies.playwright ||
          devDependencies["playwright-core"]
      )
    };
  } catch {
    return {
      hasPlaywrightDependency: false
    };
  }
}

function quoteWindowsArg(value) {
  const text = String(value ?? "").replace(/[\r\n]+/g, " ");

  if (!text) {
    return "\"\"";
  }

  if (!/[\s"&^<>|]/.test(text)) {
    return text;
  }

  return `"${text.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\+)$/g, "$1$1")}"`;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const spawnCommand = isWindows ? "cmd.exe" : command;
    const spawnArgs = isWindows ? ["/d", "/s", "/c", [command, ...args].map(quoteWindowsArg).join(" ")] : args;

    const child = spawn(spawnCommand, spawnArgs, {
      cwd: options.cwd || projectRoot,
      env: options.env || process.env,
      stdio: options.captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    if (options.captureOutput) {
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({
          stdout,
          stderr,
          code
        });
        return;
      }

      const error = new Error(
        `${command} ${args.join(" ")} failed with exit code ${code}${stderr ? `\n${stderr.trim()}` : ""}`
      );
      error.stdout = stdout;
      error.stderr = stderr;
      error.exitCode = code;
      reject(error);
    });
  });
}

async function ensureNpxAvailable() {
  await runProcess(NPX_COMMAND, ["--version"], {
    captureOutput: true
  });
}

async function runPlaywrightCli(sessionName, cliArgs, options = {}) {
  const args = ["--yes", "--package", "@playwright/cli", "playwright-cli", `-s=${sessionName}`, ...cliArgs];

  return runProcess(NPX_COMMAND, args, {
    captureOutput: Boolean(options.captureOutput)
  });
}

function parseSnapshotOutput(output) {
  const text = String(output || "");
  const url = text.match(/^- Page URL: (.+)$/m)?.[1]?.trim() || "";
  const title = text.match(/^- Page Title: (.+)$/m)?.[1]?.trim() || "";
  const yamlMatch = text.match(/### Snapshot\s*```yaml\s*([\s\S]*?)```/);
  const yaml = yamlMatch ? yamlMatch[1] : "";

  return {
    rawOutput: text,
    url,
    title,
    yaml
  };
}

async function captureSnapshot(sessionName) {
  const result = await runPlaywrightCli(sessionName, ["snapshot"], {
    captureOutput: true
  });

  return parseSnapshotOutput(result.stdout);
}

async function waitForSnapshot(sessionName, predicate, options = {}) {
  const attempts = options.attempts ?? 6;
  const delayMs = options.delayMs ?? 3000;
  const label = options.label ?? "condition";
  let lastSnapshot = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) {
      await sleep(delayMs);
    }

    lastSnapshot = await captureSnapshot(sessionName);
    if (predicate(lastSnapshot)) {
      return lastSnapshot;
    }
  }

  const lastUrl = lastSnapshot?.url || "unknown";
  throw new Error(`Timed out waiting for ${label}. Last URL: ${lastUrl}`);
}

function collectRefLines(yaml, matcher) {
  const lines = String(yaml || "").split(/\r?\n/);
  const matches = [];

  for (const line of lines) {
    const refMatch = line.match(/\[ref=(e\d+)\]/);
    if (!refMatch) continue;
    if (!matcher(line)) continue;

    matches.push({
      ref: refMatch[1],
      line
    });
  }

  return matches;
}

function findTextRef(yaml, text) {
  const candidates = collectRefLines(yaml, (line) => line.includes(text));
  return candidates[0]?.ref || "";
}

function findLoginButtonRef(yaml) {
  const candidates = collectRefLines(
    yaml,
    (line) => line.includes(LOGIN_BUTTON_LABEL) && /\[cursor=pointer\]/.test(line)
  );

  const preferred =
    candidates.find((item) => /\bgeneric\b/.test(item.line) && new RegExp(`:\\s*${LOGIN_BUTTON_LABEL}\\s*$`).test(item.line)) ||
    candidates.find((item) => /\bbutton\b/.test(item.line) && item.line.includes(LOGIN_BUTTON_LABEL)) ||
    candidates[candidates.length - 1];

  return preferred?.ref || "";
}

function hasRsTab(yaml) {
  return /RS\(\d+\)/.test(String(yaml || ""));
}

function findRsTabRef(yaml) {
  const candidates = collectRefLines(
    yaml,
    (line) => /RS\(\d+\)/.test(line) && /\[cursor=pointer\]/.test(line)
  );

  const preferred =
    candidates.find((item) => /\bgeneric\b/.test(item.line) && /:\s*RS\(\d+\)\s*$/.test(item.line)) ||
    candidates[candidates.length - 1];

  return preferred?.ref || "";
}

function extractTaskTabs(yaml) {
  const matches = String(yaml || "").match(/\b(?:RA|RS|DI|RL|ASQ|SGD|RTS)\(\d+\)\b/g) || [];
  return [...new Set(matches)];
}

function extractHeadings(yaml) {
  return [...String(yaml || "").matchAll(/heading "([^"]+)"/g)].map((match) => match[1]);
}

function extractRawTitles(yaml) {
  const matches = [...String(yaml || "").matchAll(/^\s*-\s+generic\s+\[ref=e\d+\]:\s*(\d+\.[A-Za-z][^\n]*)$/gm)];
  return matches.map((match) => normalizeWhitespace(match[1]));
}

function hasPagination(yaml) {
  return /\.el-pagination|\[ref=.*pagination/i.test(String(yaml || "")) || /pagination/i.test(String(yaml || ""));
}

async function collectFireflyRsData(config) {
  const sessionName = `firefly-rs-${Date.now()}`;

  log("opening page...");
  await runPlaywrightCli(sessionName, ["open", config.targetUrl]);

  try {
    const initialSnapshot = await waitForSnapshot(sessionName, (snapshot) => Boolean(snapshot.url), {
      attempts: 3,
      delayMs: 2500,
      label: "initial page load"
    });

    const loginRequired = initialSnapshot.url.includes("/login");
    let predictionSnapshot = initialSnapshot;

    if (loginRequired) {
      if (!config.phone || !config.password) {
        throw new Error("Login is required. Pass --phone/--password or set FIREFLY_PHONE/FIREFLY_PASSWORD.");
      }

      const loginSnapshot = await waitForSnapshot(
        sessionName,
        (snapshot) => {
          const yaml = snapshot.yaml;
          return Boolean(findTextRef(yaml, LOGIN_PHONE_LABEL) && findTextRef(yaml, LOGIN_PASSWORD_LABEL) && findLoginButtonRef(yaml));
        },
        {
          attempts: 4,
          delayMs: 2000,
          label: "login form"
        }
      );

      const phoneRef = findTextRef(loginSnapshot.yaml, LOGIN_PHONE_LABEL);
      const passwordRef = findTextRef(loginSnapshot.yaml, LOGIN_PASSWORD_LABEL);
      const loginRef = findLoginButtonRef(loginSnapshot.yaml);

      await runPlaywrightCli(sessionName, ["fill", phoneRef, config.phone]);
      await runPlaywrightCli(sessionName, ["fill", passwordRef, config.password]);
      await runPlaywrightCli(sessionName, ["click", loginRef]);

      predictionSnapshot = await waitForSnapshot(
        sessionName,
        (snapshot) => snapshot.url.includes("/prediction-list") && hasRsTab(snapshot.yaml),
        {
          attempts: 8,
          delayMs: 3500,
          label: "prediction page after login"
        }
      );
    } else if (!hasRsTab(predictionSnapshot.yaml)) {
      predictionSnapshot = await waitForSnapshot(sessionName, (snapshot) => hasRsTab(snapshot.yaml), {
        attempts: 6,
        delayMs: 3000,
        label: "prediction page with task tabs"
      });
    }

    const rsTabRef = findRsTabRef(predictionSnapshot.yaml);
    const rsTabLabel = extractTaskTabs(predictionSnapshot.yaml).find((item) => item.startsWith("RS(")) || "";

    if (!rsTabRef) {
      throw new Error("Unable to locate the RS tab in the prediction page snapshot.");
    }

    log(`found RS section${rsTabLabel ? `: ${rsTabLabel}` : ""}`);
    await runPlaywrightCli(sessionName, ["click", rsTabRef]);

    const rsSnapshot = await waitForSnapshot(sessionName, (snapshot) => extractRawTitles(snapshot.yaml).length > 0, {
      attempts: 6,
      delayMs: 3000,
      label: "RS content"
    });

    return {
      currentUrl: rsSnapshot.url,
      documentTitle: rsSnapshot.title,
      meta: {
        loginRequired,
        rsTabLabel,
        finalUrl: rsSnapshot.url,
        hasPagination: hasPagination(rsSnapshot.yaml)
      },
      taskTabs: extractTaskTabs(rsSnapshot.yaml),
      headings: extractHeadings(rsSnapshot.yaml),
      rawTitles: extractRawTitles(rsSnapshot.yaml)
    };
  } finally {
    await runPlaywrightCli(sessionName, ["close"]).catch(() => {});
  }
}

function buildReportMarkdown(report) {
  const reachedExpectedCount = report.actualCount === EXPECTED_COUNT;
  const reasons = report.countMismatchReasons.length
    ? report.countMismatchReasons.map((reason) => `- ${reason}`).join("\n")
    : "- Current page matched the expected 126 RS English sentences.";

  const importSuggestions = [
    "Keep `type=RS` and `source=firefly_weekly_prediction` so the rows can map cleanly into the Supabase `questions` table.",
    "Treat `text` as the primary dedupe key before import, and consider case-insensitive duplicate checks on the database side.",
    "The CSV column order is `type,order,text,source,scraped_at`, which is ready for batch import with explicit column mapping if needed.",
    "This script does not write to Supabase and does not modify any existing WFD, RA, WE, RTS, or DI business logic."
  ];

  return `# Firefly RS Predictions Scrape Report

- Generated at: ${report.generatedAt}
- Target URL: ${report.targetUrl}
- Final page URL: ${report.finalPageUrl || "N/A"}
- Expected count: ${EXPECTED_COUNT}

## 1. Actual scraped count

- Actual scraped count: ${report.actualCount}

## 2. Raw count before dedupe

- Raw count before dedupe: ${report.rawCount}

## 3. Count after dedupe

- Count after dedupe: ${report.dedupedCount}

## 4. Filtered suspected non-English rows

- Filtered suspected non-English rows: ${report.filteredNonEnglishCount}

## 5. Did the scraper reach 126 rows?

- Reached 126 rows: ${reachedExpectedCount ? "yes" : "no"}

${reasons}

## 6. Page structure summary

- Unauthenticated access redirects to the login page and then returns to the same prediction URL.
- The prediction page uses same-page tabs: speaking/writing/reading/listening, then task tabs like RA/RS/DI/RL/ASQ/SGD/RTS.
- The RS sentences are rendered in '.list-content .content-detail-list .title'.
- Pagination was ${report.hasPagination ? "detected" : "not detected"} on the current RS page.
- Login required: ${report.loginRequired ? "yes" : "no"}
- Detected RS tab label: ${report.rsTabLabel || "N/A"}
- Visible task tabs: ${report.taskTabs.join(", ") || report.rsTabLabel || "N/A"}

## 7. Failure details

- Status: ${report.failureReason ? "failed" : "success"}
- Failure reason: ${report.failureReason || "none"}

## 8. Supabase import suggestions

${importSuggestions.map((item) => `- ${item}`).join("\n")}
`;
}

async function writeArtifacts(config, rows, reportMarkdown) {
  await Promise.all([
    ensureDirectoryForFile(config.jsonOutputPath),
    ensureDirectoryForFile(config.csvOutputPath),
    ensureDirectoryForFile(config.reportOutputPath)
  ]);

  await fs.writeFile(config.jsonOutputPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  await fs.writeFile(config.csvOutputPath, toCsv(rows), "utf8");
  await fs.writeFile(config.reportOutputPath, reportMarkdown, "utf8");
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const timestamp = getTimestamp();
  const packageJsonContent = await fs.readFile(path.join(projectRoot, "package.json"), "utf8");
  const dependencyInfo = parsePackageJsonDependencies(packageJsonContent);

  const config = {
    targetUrl: String(getArgValue(args, "url", DEFAULT_TARGET_URL)).trim() || DEFAULT_TARGET_URL,
    phone: String(getArgValue(args, "phone", process.env.FIREFLY_PHONE || "")).trim(),
    password: String(getArgValue(args, "password", process.env.FIREFLY_PASSWORD || "")).trim(),
    jsonOutputPath: resolveProjectPath(String(getArgValue(args, "json", "data/firefly-rs-predictions.json")).trim()),
    csvOutputPath: resolveProjectPath(String(getArgValue(args, "csv", "data/firefly-rs-predictions.csv")).trim()),
    reportOutputPath: resolveProjectPath(
      String(getArgValue(args, "report", "data/firefly-rs-predictions.report.md")).trim()
    )
  };

  if (!dependencyInfo.hasPlaywrightDependency) {
    log("local playwright dependency not found in package.json; using npx @playwright/cli for this scraper.");
    log("if you want to pin Playwright in this repo, run: npm i -D playwright");
  }

  await ensureNpxAvailable();

  let extraction = null;
  let failureReason = "";

  try {
    extraction = await collectFireflyRsData(config);
  } catch (error) {
    failureReason = error instanceof Error ? error.message : String(error);
  }

  const rawTitles = Array.isArray(extraction?.rawTitles) ? extraction.rawTitles : [];
  const cleanedCandidates = rawTitles.map((value) => ({
    raw: value,
    cleaned: cleanSentence(value)
  }));

  const filteredOut = cleanedCandidates.filter((item) => !isProbablyEnglishSentence(item.cleaned));
  const englishCandidates = cleanedCandidates.filter((item) => isProbablyEnglishSentence(item.cleaned));
  const dedupedRows = [];
  const seenKeys = new Set();
  let duplicateCount = 0;

  for (const candidate of englishCandidates) {
    const key = buildDedupKey(candidate.cleaned);
    if (!key) continue;

    if (seenKeys.has(key)) {
      duplicateCount += 1;
      continue;
    }

    seenKeys.add(key);
    dedupedRows.push(candidate.cleaned);
  }

  const rows = dedupedRows.map((text, index) => ({
    source: DEFAULT_SOURCE,
    type: DEFAULT_TYPE,
    text,
    order: index + 1,
    scraped_at: timestamp
  }));

  const rsTabLabel = String(extraction?.meta?.rsTabLabel || "").trim();
  const inferredRsTabLabel = rsTabLabel || (rawTitles.length ? `RS(${rawTitles.length})` : "");
  const pageAdvertisedCountMatch = rsTabLabel.match(/\((\d+)\)/);
  const pageAdvertisedCount = pageAdvertisedCountMatch ? Number(pageAdvertisedCountMatch[1]) : null;
  const countMismatchReasons = [];

  if (failureReason) {
    countMismatchReasons.push(`Scrape flow failed: ${failureReason}`);
  }
  if (pageAdvertisedCount !== null && pageAdvertisedCount !== EXPECTED_COUNT) {
    countMismatchReasons.push(
      `The page tab shows ${pageAdvertisedCount} RS rows instead of the expected ${EXPECTED_COUNT}.`
    );
  }
  if (!failureReason && rawTitles.length !== EXPECTED_COUNT) {
    countMismatchReasons.push(
      `The RS title snapshot returned ${rawTitles.length} rows before cleaning, not the expected ${EXPECTED_COUNT}.`
    );
  }
  if (filteredOut.length > 0) {
    countMismatchReasons.push(`Cleaning filtered ${filteredOut.length} rows as suspected non-English content.`);
  }
  if (duplicateCount > 0) {
    countMismatchReasons.push(`Dedupe removed ${duplicateCount} duplicate rows.`);
  }
  if (!failureReason && rows.length !== EXPECTED_COUNT && countMismatchReasons.length === 0) {
    countMismatchReasons.push(
      `The final result produced ${rows.length} rows instead of ${EXPECTED_COUNT}, but no explicit filter or dedupe mismatch was detected.`
    );
  }

  const report = {
    generatedAt: timestamp,
    targetUrl: config.targetUrl,
    finalPageUrl: extraction?.currentUrl || extraction?.meta?.finalUrl || "",
    actualCount: rows.length,
    rawCount: rawTitles.length,
    dedupedCount: rows.length,
    filteredNonEnglishCount: filteredOut.length,
    duplicateCount,
    countMismatchReasons,
    loginRequired: Boolean(extraction?.meta?.loginRequired),
    hasPagination: Boolean(extraction?.meta?.hasPagination),
    rsTabLabel: inferredRsTabLabel,
    headings: Array.isArray(extraction?.headings) ? extraction.headings : [],
    taskTabs: Array.isArray(extraction?.taskTabs) ? extraction.taskTabs : [],
    failureReason
  };

  log(`extracted raw count: ${rawTitles.length}`);
  log(`final count: ${rows.length}`);

  const reportMarkdown = buildReportMarkdown(report);
  await writeArtifacts(config, rows, reportMarkdown);
  log("wrote json/csv/report");

  if (failureReason) {
    throw new Error(failureReason);
  }
}

main().catch((error) => {
  console.error("[firefly-rs] scrape failed");
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
