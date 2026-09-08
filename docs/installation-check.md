# Verificação de instalação limpa

Verificação realizada em 8 de setembro de 2026 sobre o commit `b2c3952`.

## Ambiente e método

- Windows, Python 3.14.4, Node.js 25.9.0 e npm 11.12.1.
- Exportação dos ficheiros versionados com `git archive`, para uma pasta temporária cujo caminho contém espaços.
- Ambiente `.venv` criado de novo e dependências frontend instaladas com `npm ci`.
- Sem copiar `.venv`, `node_modules`, `.filenest`, configurações ou documentos locais da instalação de desenvolvimento.
- Usados os comandos de instalação do README. Pip e npm puderam reutilizar os caches de pacotes do computador; as dependências foram instaladas de novo na cópia.

## Resultados

| Verificação | Resultado |
| --- | --- |
| Instalação de `backend/requirements-lock.txt` | Passou |
| `python -m pip check` | Sem incompatibilidades |
| `npm ci` | Passou |
| `python -m pytest -q -ra` | 97 passaram; 2 ignorados |
| `npm run build` | Passou |
| `npx playwright test` | 11 passaram; 2 ignorados |
| `scripts/start.ps1 -CheckOnly` | Requisitos e portas disponíveis |
| `scripts/launch.py --smoke-test` | Ambos os servidores responderam e terminaram |
| Portas após encerramento | Livres |

Os testes ignorados foram symlinks sem privilégios Windows e OCR sem os idiomas configurados no backend; no navegador, OCR real e IA real opcional. Os testes por regras, pré-visualização PDF/TXT, subpastas, progresso/cancelamento, organização, histórico e restauro passaram. Não foram configurados modelos nem OCR para esta cópia. Os avisos de depreciação de Starlette/httpx nos testes não impediram a execução.

Não foram necessárias correções nos comandos de instalação ou no código para concluir esta verificação.

## Limites desta verificação

Foi uma instalação limpa do projeto no mesmo computador, não uma máquina virtual Windows recém-instalada. Python, Node.js, Microsoft Edge e os caches de pacotes já existiam no sistema. A verificação não comprova todas as versões mínimas suportadas, outros sistemas operativos, o instalador de OCR ou o download inicial do modelo. O teste do launcher verificou os servidores sem abrir o navegador.
