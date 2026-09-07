# FileNest

**Um lugar para cada ficheiro.** Organizador local que lê documentos e propõe nomes e subpastas, com revisão antes de qualquer alteração.

Projeto de portefólio de Engenharia Informática. A versão **0.3** implementa análise por **regras ou IA local**, revisão, organização com aprovação explícita, histórico e desfazer. A IA opcional usa Qwen3 4B através do Ollama no próprio computador. Analisar e validar não alteram os documentos; organizar muda os caminhos apenas depois da confirmação final. Nenhum documento é enviado para serviços externos.

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

Se tinha uma versão anterior aberta, **reinicie o backend** com o mesmo comando e atualize a página. A integração usa `httpx`, já incluído nas dependências; não precisa do SDK Python do Ollama.

## IA local opcional: instalação simples

O modo **Regras locais** continua a funcionar sem instalar modelos. Para ativar a IA:

1. Instale ou abra o [Ollama para Windows](https://ollama.com/download/windows).
2. Num terminal novo, descarregue o modelo uma vez:

```powershell
ollama pull qwen3:4b
```

Se `ollama` não for reconhecido e tiver usado o instalador padrão do Windows:

```powershell
& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" pull qwen3:4b
```

3. Deixe o Ollama em execução. No FileNest, escolha **IA local · Qwen3 4B via Ollama**, clique em **Verificar Ollama** e analise a pasta ou a demonstração.

O download do modelo requer Internet e ocupa cerca de 2,5 GB; a inferência é local. A aplicação comunica apenas com `127.0.0.1:11434`, usa o modelo fixo `qwen3:4b` e recusa aliases cloud detetados. Não configura serviços pagos, contas, Docker ou WSL. [Modelo oficial](https://ollama.com/library/qwen3:4b) · [Documentação Ollama para Windows](https://docs.ollama.com/windows).

Se o serviço ou modelo faltar, a interface explica o problema e permite escolher regras. Se a IA falhar durante uma análise, os documentos restantes usam regras; a origem e o motivo são mostrados em cada resultado. Nunca são apresentados resultados de regras como se fossem IA.

![Análise dos exemplos com IA local](docs/ai-demo.png)

## Demonstração em dois minutos

1. Clique em **Experimentar demonstração**. Não precisa de chave de API.
2. Observe `scan_001.pdf` → `Financas/2026-09-01_fatura.pdf`, a partir do texto fictício.
3. Edite um nome ou subpasta e clique em **Validar plano**.
4. Experimente `../fora` como subpasta: o destino é assinalado como inválido.
5. Desmarque documentos para os excluir. **Repor sugestões** recupera o resultado inicial.
6. Explore **A rever** para ver o PDF protegido, o PDF sem texto e o TXT vazio.
7. Clique em **Criar cópia para organizar**. Será criada uma pasta separada em `.filenest/demos`; os exemplos do Git permanecem intactos.
8. Clique em **Preparar organização**, reveja a lista, assinale a autorização e escolha **Confirmar e organizar**.
9. No **Histórico local**, escolha **Desfazer**, confirme o restauro e verifique os caminhos originais. O histórico mantém-se depois de atualizar a página ou reiniciar a API.

As edições existem apenas na memória da página e perdem-se ao atualizar ou analisar outra pasta. Validar não guarda nem executa o plano. Preparar guarda uma cópia exata da revisão final no histórico, mas ainda não move ficheiros. Cancelar a confirmação deixa esse registo como «Preparado · não executado».

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
- Fornecedor opcional Qwen3 4B com saída JSON estruturada, verificação independente e identificação da origem por ficheiro.
- Verificação do serviço/modelo local e alternativa por regras visível em caso de falha durante a análise.
- Aprovação explícita de uma lista fixa de movimentos; só os ficheiros incluídos são organizados.
- Revalidação dos originais e destinos antes de executar, sem sobrescrever ficheiros existentes.
- Histórico SQLite com resultados por ficheiro e recuperação de operações interrompidas.
- Desfazer com verificação SHA-256 e identidade do ficheiro; conflitos ficam visíveis e podem ser resolvidos antes de tentar novamente.
- Testes de integridade dos exemplos e do ciclo organizar/desfazer.

## Arquitetura

```text
React + TypeScript → proxy local Vite → FastAPI
                                      ├─ extração (pypdf / UTF-8)
                                      ├─ SuggestionProvider → regras / Ollama local
                                      ├─ validação independente de destinos
                                      └─ execução aprovada + histórico SQLite
```

FastAPI/Pydantic definem contratos explícitos. O frontend guarda as edições em memória. O backend guarda os planos preparados e os resultados em SQLite, usando apenas a biblioteca padrão. Extração, sugestões, validação e execução são módulos separados. Os fornecedores devolvem a mesma estrutura de sugestão; a política de caminhos e a aprovação não dependem do modelo. O texto é tratado como dados, nunca como instruções executáveis.

O acesso por caminho permite leitura no próprio computador, sem upload pelo navegador. A API não devolve o texto completo à interface. Veja as decisões e fronteiras de confiança em [docs/architecture.md](docs/architecture.md).

## Limitações

- Apenas o primeiro nível da pasta; outros formatos e subpastas são ignorados.
- Limites: 100 documentos, 2000 entradas na pasta, 10 MB por documento, 100 páginas por PDF e 50 000 caracteres para sugestões. Uma análise de cada vez.
- A IA limita a análise a **20 documentos**, um de cada vez, e usa apenas os primeiros **6000 caracteres** de cada documento. O modelo usa contexto de 4096 tokens e até 256 tokens de resposta, sem modo de raciocínio prolongado. Não são enviados nomes/caminhos originais ao modelo; os próprios textos podem conter informação pessoal, processada localmente.
- A espera por resposta tem limite de 60 segundos por pedido. Após cerca de 180 segundos de análise não se iniciam mais pedidos ao modelo; um pedido já em curso pode prolongar esse tempo. Extração e sistema operativo não têm um limite rígido de execução. A primeira análise pode demorar mais devido ao carregamento do modelo.
- A IA pode omitir datas, propor nomes genéricos ou classificar incorretamente. Os resultados não são necessariamente idênticos entre versões e máquinas, mesmo com temperatura zero. Reveja-os sempre. O prompt reduz a influência de instruções presentes no documento, mas não constitui garantia contra manipulação semântica; o modelo não tem ferramentas nem acesso ao executor.
- TXT tem de ser UTF-8. Não existe OCR. Ausência de texto não prova que o PDF seja digitalizado; `sem_texto.pdf` é uma página vazia para demonstrar o aviso.
- PDFs protegidos são recusados; não são pedidas palavras-passe.
- Regras simples: a primeira categoria correspondente vence (Finanças, Formação, Trabalho, Pessoal, Outros). Os nomes podem ser genéricos e colidir, exigindo revisão.
- Ainda não há seletor nativo de pastas, integração com APIs externas ou OCR.
- Ligações simbólicas e junções são ignoradas na origem e recusadas nos destinos. UNC e unidades Windows de rede são recusadas. Pastas locais sincronizadas continuam sujeitas ao software de sincronização do utilizador.
- O parser PDF não está isolado num processo com limites de memória/tempo; ficheiros complexos podem consumir recursos. A execução revalida caminhos e identidade antes dos movimentos, mas não oferece proteção completa contra processos maliciosos que troquem pastas no intervalo entre a verificação e a operação. Não altere a pasta durante a execução.
- O lote não é uma transação única do sistema de ficheiros. Se houver falha a meio, os movimentos anteriores ficam registados e os seguintes não são executados. Use **Desfazer** para recuperar os ficheiros já movidos.
- O restauro não substitui backups: ficheiros alterados, substituídos, eliminados ou caminhos ocupados bloqueiam o restauro desses itens. Não há cópias de segurança dos conteúdos nem restauro forçado. Pastas vazias criadas durante a organização são mantidas.
- No Windows, os movimentos usam rename sem substituição. Em POSIX usam hard link seguido da remoção do nome antigo, exigindo suporte a hard links e o mesmo volume. A validação funcional foi feita no Windows.
- As proteções de Host/Origin reduzem pedidos de páginas externas; não autenticam programas já executados na conta local.

## Verificar

Na raiz:

```powershell
.\.venv\Scripts\python -m pytest -q
cd frontend
npm run build
npx playwright test
```

Playwright usa Microsoft Edge instalado no Windows e inicia servidores nas portas **8001 e 5174**, com dados isolados em `tmp/e2e-*`. Não reutiliza a aplicação aberta nas portas normais nem organiza documentos pessoais. O teste real de symlinks pode ser ignorado quando a conta Windows não tem o privilégio necessário; use Modo de Programador ou um ambiente com suporte.

Há testes de extração, sugestões, caminhos, colisões, limites, integridade dos exemplos, aprovação, alterações posteriores, falhas parciais, interrupções e restauro. Os testes de navegador cobrem demonstração, edição, exclusão, validação, reposição, carregamento, erros, ausência de pedidos externos, largura móvel e o ciclo completo organizar/recarregar histórico/desfazer.

Os testes normais simulam a API do Ollama: não descarregam modelos nem dependem de uma GPU. Verificam também respostas inválidas, timeouts, redirecionamentos recusados, aliases cloud, limites de texto, formatos e identificação de alternativas. O teste de navegador com modelo real é opt-in:

```powershell
# Na pasta frontend, com Ollama e qwen3:4b disponíveis:
$env:FILENEST_LIVE_AI='1'
npx playwright test
Remove-Item Env:FILENEST_LIVE_AI
```

Para comparar regras e IA exclusivamente nos documentos fictícios, na raiz:

```powershell
.\.venv\Scripts\python -X utf8 -m scripts.evaluate_local_ai
```

Numa execução local de verificação, os cinco documentos legíveis receberam sugestões de IA sem alternativa por regras, em cerca de 25 segundos. Por exemplo, as regras propuseram `documento.txt` para `ideias.txt`; o modelo propôs `Ideias-horta-receita.txt`. É uma observação dos exemplos, não um benchmark nem garantia de maior qualidade em documentos reais.

`backend/requirements.txt` declara dependências diretas; `requirements-lock.txt` fixa o ambiente verificado. `frontend/package-lock.json` fixa as dependências npm.

Os PDFs fictícios estão incluídos. Para os regenerar deliberadamente:

```powershell
.\.venv\Scripts\python scripts/create_demo.py
```

Este utilitário escreve apenas os três PDFs de demonstração em `examples/demo` e não faz parte da API.

## Roadmap

1. **Avaliação da IA:** mais documentos fictícios, critérios de qualidade e comparação sistemática com as regras.
2. **Extração isolada e OCR:** limites de execução por processo e documentos digitalizados.
3. **Histórico mais completo:** paginação, pesquisa, exportação e retenção configurável.
4. **Seletor nativo:** escolher a pasta sem introduzir o caminho.

## Dados locais e recuperação

`.filenest/history.sqlite3` contém caminhos, hashes e estados das operações, mas não o texto extraído nem os conteúdos dos documentos. `.filenest/demos` contém apenas as cópias fictícias criadas pelo utilizador. Toda a pasta `.filenest/` está ignorada pelo Git. Não apague o histórico enquanto precisar de desfazer operações. A interface mostra os últimos 50 registos; os anteriores permanecem na base, sem paginação nesta versão.

Se a API parar durante uma operação, reinicie-a e consulte o histórico. O FileNest não retoma movimentos automaticamente. Use **Desfazer**; os estados persistidos permitem verificar o que realmente mudou no disco. Resolva ficheiros ocupados ou permissões e volte a tentar quando existir um restauro parcial.

Para desenvolvimento/testes, `FILENEST_DATA_DIR` permite escolher outra pasta de dados e `FILENEST_FRONTEND_ORIGIN` autoriza uma origem local adicional. Não são necessários para a execução normal; não coloque configurações pessoais no Git.

Sem serviços pagos, telemetria, chaves de API ou publicação automática.

Uma eventual integração com APIs externas exigirá informar quais os dados e fornecedor e obter consentimento explícito antes de enviar conteúdos. Essa integração não existe nesta versão.
