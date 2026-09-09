# FileNest architecture

## Analysis and suggestions

FastAPI coordinates independent modules for scanning, extraction, suggestions, validation, preview, and approved file operations. React holds the editable plan in memory; refreshing loses unsaved edits. No document content or paths are persisted in browser storage.

`scanning.py` supports opt-in recursion with an explicit stack, a 20-level depth limit and a 2,000-entry budget. Paths are relative to the selected root, so repeated names in different subfolders remain distinct. Links and unsupported formats are skipped. An inaccessible folder stops scanning; extraction errors are reported per document.

`extraction.py` reads PDF and UTF-8 TXT without modifying originals. It distinguishes protected, empty, unreadable, oversized, and image-only files. Workers in `processes.py` limit time and memory: 30 seconds per document, 90 with OCR, and 768 MB. Windows Job Objects clean up descendants; POSIX uses resource limits and process groups. These are resource controls, not an operating-system permission sandbox.

`providers.py` defines `SuggestionProvider.suggest(text, extension)`. Deterministic rules match whole keywords, normalize accents, and optionally include an ISO-style date in a suggested name. Outputs use English categories and names. Legacy Portuguese keywords are also recognized as document data. Unmatched text produces `Other/document.ext` for review. Date matching does not validate calendar semantics.

`ollama_provider.py` implements the same contract using httpx against `127.0.0.1:11434`. Redirects and environment proxies are disabled. FileNest checks that `qwen3:4b` is installed locally and rejects remote model aliases. It does not download models automatically. The prompt requests English output, treats document text as untrusted data, and exposes no tools or original file paths. Pydantic validates the JSON response, category/folder agreement, and lengths before normal path validation.

AI receives at most 6,000 characters, with a 4,096-token context and 256-token output budget. Temperature zero reduces variation without guaranteeing determinism. AI analyses accept 20 documents; rules accept 100. A failed request or exhausted time budget switches remaining documents to rules, with explicit per-file source labels. Initial service unavailability produces an error and lets the user choose rules.

`analysis_jobs.py` runs one background analysis at a time and retains only the latest job. The frontend polls every 400 ms. Cancellation is cooperative between documents and returns completed results as a partial plan; it does not interrupt the current extraction. The synchronous API remains available.

## Preview and OCR

`preview.py` issues random document references, limited to 200 entries and one hour. Preview requests accept a reference and page number, never an arbitrary path. Root, path components, identity, and hash are checked before and after reading. PDFium renders PNG pages in a limited worker; the browser never receives active PDF content. TXT is bounded and escaped by React. Responses use `Cache-Control: no-store`; only one render runs at once.

`ocr.py` runs local Tesseract with English language data only on pages without extractable text. Limits are 20 OCR pages, 16 million pixels per page, and 25 seconds per Tesseract call. Recognition notes and partial results remain visible. The PDF itself is never rewritten.

The native folder picker uses Tk in a separate process with a 180-second limit. Manual path entry remains available if Tk is missing or the dialog fails.

## Validation, approval, and undo

`safety.py` validates Windows reserved names, components, separators, extensions, path lengths, root containment, and case-insensitive collisions. It checks both existing files and proposed destinations, including file/folder conflicts. Excluded proposals do not collide with included ones. Validation creates no directories and grants no lasting approval: the disk may change afterwards.

`operations.py` stores approved plans and history in SQLite. Preparing an operation checks unique sources, SHA-256 hashes, file identities, and root identity. File IDs are strings to avoid JavaScript integer precision loss. The UI presents an immutable final list and an unchecked authorization checkbox. Editing the plan invalidates that confirmation.

Applying an operation requires `approved: true` and uses the stored plan. It rechecks the entire batch and each individual file. An OS file lock serializes mutations across processes sharing the data directory. State is persisted before and after moves. Windows rename refuses existing destinations; POSIX uses a hard link followed by unlinking the original name. Repeating an apply request does not repeat completed moves.

Batches transition through `prepared`, `applying`, and `completed`, or remain partial after a failure. There is no single filesystem transaction or automatic rollback. Undo requires explicit approval, checks identity and hash, and restores in reverse order without replacing other files. Interrupted operations reconcile the two recorded paths. A duplicate is removed only when verified as another hard link to the same file. Conflicting items remain pending; empty folders remain on disk.

History supports parameterized, accent-insensitive path search, status filters, pages of ten records, and JSON export of up to 10,000 filtered operations. Counts and results share a database transaction. `.filenest/history.sqlite3` stores paths, hashes, and states, not document contents. There is no automatic retention policy. Existing history and user filenames are not translated.

Demo copies are created under `.filenest/demos`. Direct organization of the versioned `examples/demo` folder is refused.

## Trust boundary

Both servers bind to loopback. Vite proxies the API; FastAPI validates Host and Origin and requires a custom header for POST requests. The header prevents ordinary cross-origin form requests; it is not a secret or authentication against other local processes. No permissive CORS is enabled.

React escapes document text and filenames. Analysis does not return extracted text to the frontend; explicit preview returns bounded text or page images. There are no external AI APIs or telemetry. Installed Ollama is a trusted local dependency whose logs and configuration FileNest does not manage. A future external provider must explain the transfer and obtain consent first.

Resource limits and path checks cannot guarantee protection against malicious concurrent local processes, disk failure, or database corruption. Avoid changing a folder during an operation. Undo is not a backup and cannot recover edited or deleted content.

## Frontend presentation

The English interface uses a dark navigation rail, a light workspace, violet accents, responsive cards, and system fonts without external requests. `styles.css` provides layout primitives; `theme.css` applies the visual theme. Reduced-motion preferences and visible keyboard focus are supported. Summary counts reflect the current plan and selection.
