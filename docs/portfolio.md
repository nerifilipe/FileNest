# Textos de apresentação do FileNest

Textos preparados para revisão e publicação manual. Não pressupõem uma release já publicada.

## Descrição curta para o GitHub

Organizador local de PDF/TXT com IA opcional via Ollama, OCR, revisão de sugestões, organização aprovada e histórico para desfazer. Python/FastAPI + React/TypeScript.

Tópicos sugeridos: `python`, `fastapi`, `react`, `typescript`, `ollama`, `ocr`, `file-organizer`, `local-first`, `portfolio`.

## LinkedIn

Como projeto de portefólio de finalista de Engenharia Informática, desenvolvi o FileNest: uma aplicação local que ajuda a organizar documentos a partir do seu conteúdo.

O fluxo é simples: escolher uma pasta, analisar os documentos, rever nomes e destinos e aprovar a organização. É possível consultar o PDF ou TXT ao lado da sugestão e desfazer os movimentos através do histórico.

Quis trabalhar um problema que envolve mais do que gerar sugestões com IA. Separei a extração de texto, a geração de sugestões e a execução dos movimentos. O modelo não tem ferramentas para modificar ficheiros; os destinos são validados pelo backend e a organização exige aprovação explícita.

O FileNest funciona por regras sem configurar serviços externos. Opcionalmente, usa IA local com Ollama e OCR com Tesseract. Inclui análise de subpastas, progresso e cancelamento, deteção de colisões e verificação de alterações nos ficheiros antes de organizar ou desfazer.

Usei Python/FastAPI, React/TypeScript e SQLite, com testes automatizados e GitHub Actions. O projeto inclui documentos fictícios e instruções de arranque no Windows para quem o quiser experimentar.

Código e documentação: https://github.com/nerifilipe/FileNest

#EngenhariaInformática #Python #React #TypeScript #Portfolio

## CV — português

**FileNest — Organizador local de documentos** | Projeto de portefólio  
Python, FastAPI, React, TypeScript, SQLite, Ollama, Tesseract, pytest, Playwright, GitHub Actions  
https://github.com/nerifilipe/FileNest

- Desenvolvi uma aplicação para analisar PDF/TXT, gerar sugestões por regras ou IA local e rever documentos antes de organizar ficheiros.
- Implementei validação de caminhos e colisões, aprovação explícita, histórico SQLite e restauro com verificação de integridade e identidade dos ficheiros.
- Separei extração, sugestões e execução; acrescentei OCR, processos com limites de recursos, testes automatizados e CI.

## CV — English

**FileNest — Local document organizer** | Portfolio project  
Python, FastAPI, React, TypeScript, SQLite, Ollama, Tesseract, pytest, Playwright, GitHub Actions  
https://github.com/nerifilipe/FileNest

- Built an application to analyze PDF/TXT documents, generate rule-based or local AI suggestions, and review documents before organizing files.
- Implemented path and collision validation, explicit approval, SQLite operation history, and undo with file integrity and identity checks.
- Separated extraction, suggestion generation, and execution; added OCR, resource-limited worker processes, automated tests, and CI.

## Resposta curta para entrevista

“O FileNest ajuda a organizar documentos, mas o foco técnico foi controlar como as sugestões se tornam alterações no disco. O modelo só sugere; a aplicação valida os destinos e guarda uma lista de movimentos para aprovação. Antes de mover ou desfazer, verifica a identidade e o conteúdo dos ficheiros. Como SQLite e o sistema de ficheiros não partilham uma transação, registo estados intermédios para permitir recuperar de falhas parciais. Mantive o processamento local e incluí uma demonstração sem IA para tornar o projeto fácil de experimentar.”

Para a explicação técnica detalhada, consulte `architecture.md`. Numa entrevista, distinga sempre o que implementou, o que os testes verificam e o que continua fora das garantias do projeto.
