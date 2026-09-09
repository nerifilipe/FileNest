# Clean installation verification

Historical verification performed on **8 September 2026**, commit `b2c3952`. These results predate the English interface refresh.

## Method

Windows with Python 3.14.4, Node.js 25.9.0, and npm 11.12.1. Tracked files were exported using `git archive` into a temporary path containing spaces. A fresh virtual environment and `npm ci` installation followed the README. Development environments, local settings, documents, and `.filenest` were not copied. Package caches could be reused.

| Check | Recorded result |
| --- | --- |
| Locked Python dependencies and `pip check` | Passed; no conflicts |
| `npm ci` | Passed |
| Backend tests | 97 passed, 2 skipped |
| Frontend build | Passed |
| Browser tests | 11 passed, 2 skipped |
| Launcher requirement check | Passed |
| Launcher smoke test | Both servers responded and stopped |
| Ports after shutdown | Available |

Skipped checks required Windows symlink privileges, configured OCR, or opt-in live AI. No models or OCR were configured in the clean copy. Installation commands required no corrections.

## Limits

This was a fresh project installation on the same computer, not a fresh Windows virtual machine. Python, Node.js, Edge, and package caches already existed. It does not verify every minimum version, other operating systems, OCR installation, or initial model downloads. The launcher smoke test did not open a browser. Run the README checks for the current checkout.
