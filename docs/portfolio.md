# Portfolio notes

## Project description

FileNest is a local document organizer built with Python, FastAPI, React, TypeScript, and SQLite. It extracts PDF/TXT content, suggests English filenames and folders through deterministic rules or local Ollama, and supports document preview, editable plans, explicit approval, and integrity-checked undo.

## CV text

Built FileNest, a local document organizer with FastAPI and React/TypeScript, integrating Ollama and Tesseract. Implemented path and collision validation, resource-limited document workers, approved file operations, SQLite history, integrity-checked undo, automated tests, and GitHub Actions CI.

## Interview talking points

- Separating extraction from suggestion providers makes rules and AI interchangeable.
- Model output is untrusted: validated schemas and paths constrain suggestions, while explicit approval controls execution.
- Hashes and file identities detect changed or replaced files before moves and undo.
- Filesystem batches are not atomic; persisted states make partial failures visible and recoverable.
- Loopback processing avoids external document transfers. Resource limits contain excessive processing but are not a full security sandbox.
- Deterministic fictional samples demonstrate success and failure states without paid services.

Describe measured results accurately. Do not claim that AI always categorizes correctly, undo replaces backups, or this source distribution is a standalone desktop installer.
