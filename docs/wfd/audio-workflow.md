# WFD Audio Workflow

This document covers the local batch workflow for generating and uploading WFD audio.
Generated audio, exported workbooks, and run reports should remain local artifacts and should not be committed.

## Runtime Mapping

The WFD frontend resolves audio in this order:

1. `audio_path` mapped to the public storage URL:
   `https://<supabase-url>/storage/v1/object/public/question-audio/<audio_path>`
2. `audio_url` when `audio_path` is missing
3. fallback by id:
   `https://<supabase-url>/storage/v1/object/public/question-audio/wfd/<id>.mp3`

Use stable paths such as `wfd/WFD_001.mp3` in question data when uploaded files use the same storage key.

## Prerequisites

1. Enable Google Cloud billing.
2. Enable the Cloud Text-to-Speech API.
3. Create a service account with TTS access and download a JSON key.
4. Set `GOOGLE_APPLICATION_CREDENTIALS` to the local key path.
5. Prepare a source workbook such as `WFD_cleaned_with_wordcount_difficulty.xlsx` with sheet `WFD`.

## Generate Audio

From ``:

```bash
npm run wfd:tts:generate -- --inputFile "d:\Desktop\WFD_cleaned_with_wordcount_difficulty.xlsx" --sheetName WFD --outputDir "d:\PTE\wfd\audio" --outputQuestionFile "d:\PTE\wfd\WFD_with_generated_audio.xlsx" --reportFile "d:\PTE\wfd\tts_generation_report.json" --skipExisting true
```

Expected local outputs:

1. MP3 files under the chosen output directory.
2. A generated workbook such as `WFD_with_generated_audio.xlsx`.
3. `tts_generation_report.json` with success and failure counts.

## Upload Audio To Supabase

Required server-side env:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Run:

```bash
npm run wfd:audio:upload -- --inputFile "d:\PTE\wfd\WFD_with_generated_audio.xlsx" --audioDir "d:\PTE\wfd\audio" --bucket question-audio --storagePrefix "" --outputQuestionFile "d:\PTE\wfd\WFD_with_uploaded_audio.xlsx" --reportFile "d:\PTE\wfd\tts_upload_report.json"
```

The upload script:

1. Uploads local MP3 files to Supabase Storage.
2. Fills `audio_url` in the exported workbook.
3. Keeps `audio_path` by default.
4. Generates `tts_upload_report.json`.

## Verification

1. Confirm report JSON has `failedCount = 0`, or inspect failed ids.
2. Confirm the exported workbook has `audio_path`, `audio_file_size_bytes`, and `audio_duration_seconds`.
3. Confirm uploaded objects are visible in bucket `question-audio`.
4. Confirm WFD pages can play audio by question id or path.
