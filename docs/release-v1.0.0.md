# FileNest v1.0.0 — Local document organization

FileNest suggests filenames and folders from PDF and TXT content. Preview documents, edit suggestions, explicitly approve moves, and undo through an integrity-checked operation history.

## Features

- English interface, suggestions, and fictional samples.
- Optional subfolder scanning, progress tracking, and cooperative cancellation.
- Deterministic rules with no model or API key; optional local Qwen3 4B through Ollama.
- Optional Tesseract OCR for English scanned documents.
- PDF page and TXT previews alongside editable destinations.
- Path containment, collision detection, and source integrity checks.
- Approved organization and SQLite history with search, filters, pagination, JSON export, and undo.
- Windows launcher, automated backend/browser tests, and GitHub Actions backend/build checks.

## Try it

Follow **Get started on Windows** in the README, then run `start.cmd` and choose **Explore sample files**. Create a demo copy before trying real moves. Distribution is source code: Python, Node.js, models, and OCR tools are installed separately. No hosted service or paid API is required.

## Limitations

Analyses accept 100 documents with rules or 20 with AI, 10 MB per file, 2,000 directory entries, and 20 subfolder levels. Protected PDFs are rejected. AI and OCR need review. Cancellation waits for the current document; refreshing loses unsaved UI state. Batches are not atomic, and undo cannot recover edited or deleted content. Functional validation focuses on Windows.

See the README for current verification commands and `installation-check.md` for the historical clean-installation report and its limits.
