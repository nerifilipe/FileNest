# FileNest

**A place for every file.** A local document organizer that suggests file names and folders based on document content. Review the suggestions, approve the changes, and undo them through the operation history.

Built as a Computer Engineering portfolio project with **Python, FastAPI, React, TypeScript, and SQLite**. Optional AI runs locally through Ollama. The interface, sample documents, and generated suggestions are in **English**.

![FileNest showing fictional sample documents](docs/demo-desktop.png)

[Releases](https://github.com/nerifilipe/FileNest/releases) · [Architecture](docs/architecture.md) · [Installation verification](docs/installation-check.md)

## Features

- Analyze PDF and UTF-8 TXT files, with optional subfolder scanning.
- Generate suggestions using deterministic rules or local AI with Qwen3 4B.
- Read scanned PDFs with optional Tesseract OCR in English.
- Preview documents alongside editable names and destination folders.
- Track analysis progress and cancel while keeping completed results.
- Validate paths, detect collisions, and exclude files before approval.
- Organize files with explicit approval and inspect, search, or export the operation history.
- Undo moves after checking file integrity and the availability of original paths.

Analysis and preview do not modify the original documents. File contents are processed locally, without external AI APIs, telemetry, or API keys. Rule-based suggestions are clearly distinguished from AI results.

## Get started on Windows

Requires **Python 3.11+**, **Node.js 22.12+**, and npm. Installation has been verified with Python 3.14 and Node.js 25. Internet access is needed to install dependencies; models and OCR are optional.

Clone the repository or download its source code, then open PowerShell in the project folder:

```powershell
py -m venv .venv
.\.venv\Scripts\python -m pip install -r backend/requirements-lock.txt
cd frontend
npm ci
cd ..
.\start.cmd
```

If `py` is unavailable, use `python` for the first command. You do not need to activate the virtual environment.

After installation, double-click **`start.cmd`** to launch FileNest. It checks dependencies and ports, starts both local servers, and opens [http://127.0.0.1:5173](http://127.0.0.1:5173). Keep its window open; press **Q** or **Ctrl+C** to stop the servers it started. Finish any organization or undo operation before closing it.

Ports **8000** and **5173** must be available. Logs are stored in `.filenest/logs/`. The launcher reports missing dependencies but does not install them automatically.

<details>
<summary>Run the servers manually</summary>

Backend, from the repository root:

```powershell
.\.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Frontend, in a second terminal:

```powershell
cd frontend
npm run dev
```

Stop each server with `Ctrl+C`. Keep both servers bound to localhost.

</details>

## Try the demo

1. Open the app and choose the sample demonstration. No model or API key is required.
2. Preview a document, edit a suggested name or folder, and validate the plan.
3. Create a demo copy to try organizing files without changing the versioned samples.
4. Prepare the organization, review the final paths, and approve the moves.
5. Open the history and confirm an undo operation to restore the original paths.

The samples include readable documents, a scanned PDF, a protected PDF, and empty files so you can explore both successful results and error states.

## Optional local AI and OCR

### AI with Ollama

Install [Ollama](https://ollama.com/download/windows), then download the model:

```powershell
ollama pull qwen3:4b
```

Keep Ollama running and select the local AI option in FileNest. The app uses `127.0.0.1:11434`. If a model request fails during analysis, remaining suggestions fall back to rules with an explicit explanation. Review all suggestions: AI can produce incorrect or generic names.

### OCR with Tesseract

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup_ocr.ps1
```

The script installs Tesseract through winget if needed and downloads English language data. Enable local OCR in the app and analyze again. OCR reads pages without extractable text and does not rewrite the original PDF. Recognition quality depends on the document.

## Design and limitations

Extraction, suggestion generation, path validation, and file operations are separate modules. The AI model can suggest names but cannot execute file operations. The backend validates destinations independently and rechecks file hashes and identity before moving or restoring files. PDF extraction and preview run in separate processes with time and memory limits.

| Scope | Limit |
| --- | --- |
| Documents per analysis | 100 with rules; 20 with AI |
| File size | 10 MB per document |
| Folder traversal | 2,000 entries total; up to 20 subfolder levels |
| PDF length | 100 pages; up to 20 pages requiring OCR |
| Text used for suggestions | 50,000 extracted characters; first 6,000 for AI |

- Only PDF and UTF-8 TXT are supported. Protected PDFs, network drives, symbolic links, and junctions are not supported.
- Subfolder scanning is opt-in. Destinations are relative to the selected root folder, and existing destinations are reported as collisions.
- Cancellation waits for the current document to finish. Refreshing the page loses unsaved edits and progress tracking without cancelling the backend job.
- PDF previews are page images, without active links or text selection. Changed or moved documents require a new analysis.
- A batch is not a single filesystem transaction. Interrupted or partial operations remain in the history for explicit recovery.
- **Undo is not a backup.** Edited, replaced, deleted, or conflicting files can block restoration. Empty folders are retained. Avoid changing the selected folder during an operation.
- Functional validation focuses on Windows. Distribution is source code, not a standalone installer.

History, demo copies, OCR language data, and launcher logs live in `.filenest/`, which is ignored by Git. History stores paths, hashes, and operation states rather than document contents. Keep it while you need undo, and review exported history before sharing it: exports contain local paths.

## Tests and CI

From the repository root:

```powershell
.\.venv\Scripts\python -m pytest -q -ra
cd frontend
npm run build
npx playwright test
```

Browser tests use Microsoft Edge on Windows, separate servers on ports **8001/5174**, and fictional documents. OCR tests are skipped if the required local tools are unavailable. To include the real Ollama browser test, set `$env:FILENEST_LIVE_AI='1'` before running Playwright.

Test screenshots are saved under `frontend/test-results/`. To deliberately refresh the images used in this README, set `$env:FILENEST_UPDATE_SCREENSHOTS='1'` before running Playwright, then remove that variable afterwards.

[GitHub Actions](.github/workflows/ci.yml) runs backend tests on Windows and the TypeScript/frontend build on every push and pull request. Browser tests run locally; CI does not install models or publish the application.

See the [clean installation report](docs/installation-check.md) for recorded results and the [architecture notes](docs/architecture.md) for implementation details.

## Roadmap

- Process larger folders in batches.
- Broaden the fictional test set for AI and OCR quality evaluation.
- Add configurable history retention and a standalone installer.

## License

[MIT](LICENSE). Dependencies, external tools, and models retain their own licenses.
