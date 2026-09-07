# FileNest

**Um lugar para cada ficheiro.** Organizador local que lê documentos e propõe nomes e subpastas, com revisão antes de qualquer alteração.

Projeto de portefólio de Engenharia Informática. Esta versão implementa **análise e pré-visualização por regras determinísticas**. Não usa IA, não envia conteúdos para serviços externos e **não move, renomeia nem apaga documentos**.

![Interface com documentos fictícios](docs/demo-desktop.png)

## Executar no Windows

Requisitos: Python **3.11+**, Node.js **22.12+** e npm. Verificado com Python 3.14 e Node 25. A instalação inicial das dependências requer Internet; a aplicação não requer serviços externos.

Abra o PowerShell na raiz do repositório.

**Terminal 1 — API:**

```powershell
py -m venv .venv
.\.venv\Scripts\python -m pip install -r backend/requirements-lock.txt
.\.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Não precisa de ativar o ambiente virtual nem alterar a política de execução do PowerShell. Se `py` não existir, use `python` no primeiro comando.

**Terminal 2 — interface, também a partir da raiz:**

```powershell
cd frontend
npm ci
npm run dev
```

Abra [FileNest local](http://127.0.0.1:5173). Pare com `Ctrl+C` em cada terminal. As portas 8000 e 5173 têm de estar disponíveis. Os servidores destinam-se a uso local individual; não os exponha na rede.

## Demonstração em dois minutos

1. Clique em **Experimentar demonstração**. Não precisa de chave de API.
2. Observe `scan_001.pdf` → `Financas/2026-09-01_fatura.pdf`, a partir do texto fictício.
3. Edite um nome ou subpasta e clique em **Validar plano**.
4. Experimente `../fora` como subpasta: o destino é assinalado como inválido.
5. Desmarque documentos para os excluir. **Repor sugestões** recupera o resultado inicial.
6. Explore **A rever** para ver o PDF protegido, o PDF sem texto e o TXT vazio.

As edições existem apenas na memória da página e perdem-se ao atualizar ou analisar outra pasta. Validar não guarda nem executa o plano.

Para documentos próprios, introduza um caminho absoluto sem aspas, como `C:\Users\OSeuNome\Documents\Por organizar`. Prefira uma pasta fora do repositório para não adicionar documentos pessoais ao Git.

## Implementado

- PDFs com texto e TXT UTF-8, incluindo BOM.
- Categoria, nome atual, nome proposto, subpasta e justificação por documento.
- Edição de nomes e subpastas, exclusão e reposição das sugestões.
- Validação de nomes Windows, extensões, caminhos e colisões entre propostas e destinos existentes, incluindo conflitos ficheiro/pasta.
- Estados de carregamento, pasta vazia, caminho inválido, falta de acesso, servidor indisponível e erros individuais de extração.
- Identificação de PDFs protegidos e PDFs sem texto que podem necessitar de OCR.
- Interface responsiva em português de Portugal, com comparação origem/destino.
- Demonstração fictícia sem API, identificada explicitamente como regras locais.
- Nenhuma escrita nos documentos; teste de integridade por SHA-256.

## Arquitetura

```text
React + TypeScript → proxy local Vite → FastAPI
                                      ├─ extração (pypdf / UTF-8)
                                      ├─ SuggestionProvider → DemoProvider
                                      └─ validação independente de destinos
```

FastAPI/Pydantic definem contratos explícitos. O frontend guarda o plano em memória; não há base de dados. Extração, sugestões e validação são módulos separados: um futuro fornecedor de IA poderá substituir as regras, mantendo a política de caminhos. O texto é tratado como dados, nunca como instruções executáveis.

O acesso por caminho permite leitura no próprio computador, sem upload pelo navegador. A API não devolve o texto completo à interface. Veja as decisões e fronteiras de confiança em [docs/architecture.md](docs/architecture.md).

## Limitações

- Apenas o primeiro nível da pasta; outros formatos e subpastas são ignorados.
- Limites: 100 documentos, 2000 entradas na pasta, 10 MB por documento, 100 páginas por PDF e 50 000 caracteres para sugestões. Uma análise de cada vez.
- TXT tem de ser UTF-8. Não existe OCR. Ausência de texto não prova que o PDF seja digitalizado; `sem_texto.pdf` é uma página vazia para demonstrar o aviso.
- PDFs protegidos são recusados; não são pedidas palavras-passe.
- Regras simples: a primeira categoria correspondente vence (Finanças, Formação, Trabalho, Pessoal, Outros). Os nomes podem ser genéricos e colidir, exigindo revisão.
- Ainda não há seletor nativo de pastas, IA real, aplicação das alterações, histórico ou desfazer.
- Ligações simbólicas e junções são ignoradas na origem e recusadas nos destinos. UNC e unidades Windows de rede são recusadas. Pastas locais sincronizadas continuam sujeitas ao software de sincronização do utilizador.
- O parser PDF não está isolado num processo com limites de memória/tempo; ficheiros complexos podem consumir recursos. Não há proteção completa contra alterações concorrentes maliciosas no sistema de ficheiros. Um futuro executor terá de revalidar imediatamente antes de escrever.
- As proteções de Host/Origin reduzem pedidos de páginas externas; não autenticam programas já executados na conta local.

## Verificar

Na raiz:

```powershell
.\.venv\Scripts\python -m pytest -q
cd frontend
npm run build
npx playwright test
```

Playwright usa Microsoft Edge instalado no Windows e inicia os servidores automaticamente. Feche instâncias antigas para testar a versão atual. O teste real de symlinks pode ser ignorado quando a conta Windows não tem o privilégio necessário; use Modo de Programador ou um ambiente com suporte.

Há testes de extração, sugestões, caminhos, colisões, limites, integridade dos exemplos e proteções da API. Os testes de navegador cobrem demonstração, edição, exclusão, validação, reposição, carregamento, erros, ausência de pedidos externos e largura móvel.

`backend/requirements.txt` declara dependências diretas; `requirements-lock.txt` fixa o ambiente verificado. `frontend/package-lock.json` fixa as dependências npm.

Os PDFs fictícios estão incluídos. Para os regenerar deliberadamente:

```powershell
.\.venv\Scripts\python scripts/create_demo.py
```

Este utilitário escreve apenas os três PDFs de demonstração em `examples/demo` e não faz parte da API.

## Roadmap

1. **IA real:** novo fornecedor, saída estruturada e consentimento explícito antes de enviar conteúdos; mostrar os dados e o fornecedor e permitir permanecer local.
2. **Organização com aprovação:** confirmação do plano, revalidação e execução sem sobrescritas.
3. **Histórico:** registo local de operações e falhas parciais.
4. **Desfazer:** operações inversas com verificação de integridade e conflitos.

Sem serviços pagos, telemetria, chaves de API ou publicação automática.
