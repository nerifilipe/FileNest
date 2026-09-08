# Arquitetura do FileNest

## Responsabilidades

`preview.py` emite referências aleatórias para os documentos encontrados na análise, limitadas a 200 entradas e uma hora. `/api/preview` recebe apenas essa referência e a página; nunca um caminho arbitrário. Verifica a raiz, componentes e fingerprint antes e depois da leitura. `preview_worker.py` renderiza PDFs com PDFium em processo limitado a 30 segundos/768 MB; apenas imagens PNG são devolvidas, sem entregar PDF ativo ao navegador. TXT é devolvido como texto limitado e escapado por React. Respostas usam `Cache-Control: no-store`; não há ficheiros de cache. Uma única renderização é admitida de cada vez.

Com `background: true`, `/api/analyze` devolve um identificador imediatamente. `analysis_jobs.py` gere uma única tarefa numa thread, com estado protegido por lock e retenção apenas da última tarefa. A interface consulta `/api/analysis/{id}/status` a cada 400 ms e pede cancelamento por POST em `/cancel`; ambos exigem o cabeçalho local. O cancelamento é cooperativo entre documentos: a operação corrente termina, os resultados completos são validados e devolvidos com aviso de plano parcial. Progresso conta documentos concluídos, incluindo os que deram erro. A API síncrona mantém compatibilidade. Não é necessária uma fila externa ou base de dados adicional.

`POST /api/analyze` recebe `path` ou `demo: true` e `recursive` opcional, falso por defeito. `scanning.py` enumera o primeiro nível ou percorre até 20 níveis de subpastas com uma pilha explícita. Ignora ligações e formatos não suportados, revalida ancestrais antes de abrir cada pasta e aplica limites globais de entradas e documentos antes de extrair texto. Uma pasta inacessível interrompe a análise; uma falha de extração é um resultado individual e não impede os restantes documentos. `id` e `current_path` usam o caminho relativo completo com `/`, distinguindo nomes repetidos. Os destinos continuam relativos à raiz selecionada. Preparação, execução e restauro validam cada componente do caminho de origem; o histórico preserva as subpastas originais.

`extraction.py` abre ficheiros apenas para leitura e limita os bytes de entrada. O pypdf extrai texto por página; TXT usa UTF-8 com BOM opcional. São distinguidos ficheiros vazios, protegidos, ilegíveis, demasiado grandes e sem texto. As sugestões recebem até 50 000 caracteres. Não são executados comandos, macros ou código contido nos documentos.

`providers.py` define o protocolo `SuggestionProvider.suggest(text, extension)`. `DemoProvider` normaliza acentos, procura palavras completas e usa a primeira regra correspondente. Uma data no formato AAAA-MM-DD entra no nome. É uma heurística explicável; não usa aprendizagem automática nem valida semanticamente a data. Sem correspondência, propõe `Outros/documento.ext` e pede revisão.

`ollama_provider.py` implementa o mesmo contrato através de `httpx`, sem SDK adicional. Usa exclusivamente `http://127.0.0.1:11434`, com proxies do ambiente e redirecionamentos desativados. O nome do modelo é fixo (`qwen3:4b`). Antes de enviar texto, `/api/show` confirma a instalação e recusa metadados de alias remoto. O backend não descarrega modelos automaticamente.

A chamada `/api/chat` separa instruções do sistema de um objeto JSON que contém extensão e texto como dados não fiáveis. Não envia o caminho/nome original e não disponibiliza ferramentas ao modelo. Usa um esquema Pydantic com categorias/pastas enumeradas e comprimentos limitados. O código valida novamente a resposta, verifica a coerência categoria/pasta e acrescenta a extensão original quando o modelo devolve apenas o nome. A validação normal de destinos e colisões aplica-se a seguir, tal como às regras. [Saídas estruturadas do Ollama](https://docs.ollama.com/capabilities/structured-outputs) · [API de chat](https://docs.ollama.com/api/chat).

O modelo recebe até 6000 caracteres, contexto de 4096 tokens e até 256 tokens de saída. `think: false` evita raciocínio prolongado e `temperature: 0` reduz variabilidade, sem garantir determinismo. Uma análise de IA aceita até 20 documentos. Após falha de resposta/validação ou esgotamento do orçamento de tempo, um circuit breaker evita voltar a chamar o modelo para os restantes documentos desse lote. As regras produzem a alternativa, com `suggestion_source` e `provider_note` explícitos. O campo `Plan.provider` representa o modo pedido; a origem efetiva é sempre a de cada ficheiro.

Serviço/modelo indisponível na verificação inicial produz um erro compreensível sem enviar texto. O utilizador pode escolher regras. `/api/ai/status` verifica a disponibilidade sem ler documentos. `ProviderSelector.tsx` mantém as regras como opção inicial e informa o que será processado localmente ao selecionar IA.

`safety.py` verifica componentes, nomes reservados Windows, separadores, extensão, comprimento de caminho e contenção na raiz. Procura colisões sem distinguir maiúsculas/minúsculas e conflitos entre ficheiros e pastas, tanto no disco como no plano. Excluídos não participam nas colisões entre propostas. Não são acrescentados sufixos silenciosamente: os conflitos ficam visíveis.

`POST /api/validate` verifica novamente os destinos editados contra o disco. Nunca cria pastas nem escreve ficheiros. O resultado não é uma autorização persistente: o disco pode mudar a seguir.

`App.tsx` mantém o plano e uma cópia inicial em memória. Alterações marcam o plano como pendente de validação. Não guarda caminhos ou conteúdos no armazenamento do navegador. Uma análise bem-sucedida substitui o plano; se falhar, as edições anteriores permanecem.

`OperationsPanel.tsx` apresenta uma lista final imutável, uma autorização desmarcada por defeito e o botão de confirmação. Uma edição no plano invalida a confirmação apresentada. A aplicação só envia a execução depois dessa autorização. O mesmo fluxo confirma o restauro, e o histórico é carregado novamente após reiniciar a página.

`ocr.py` combina renderização PDFium (pypdfium2/Pillow) e Tesseract local apenas nas páginas sem texto extraível. São limitadas a 20 páginas por documento, 16 milhões de píxeis por página e 25 segundos por chamada. O texto reconhecido segue o mesmo fornecedor e validação. `extraction_method` e `extraction_notes` tornam a origem e leituras parciais visíveis. O OCR nunca grava texto no PDF original.

`POST /api/folders/pick` abre um diálogo Tk num processo separado, com limite de 180 segundos e exclusão mútua. Cancelar devolve um caminho nulo. A introdução manual continua disponível quando Tk não existe ou o diálogo falha.

## Execução e histórico

`operations.py` concentra as escritas e usa SQLite da biblioteca padrão. `POST /api/operations/prepare` revalida o plano, verifica origens únicas e compara SHA-256, volume e identificador do ficheiro com os valores da análise. Guarda a lista exata de movimentos e a identidade da pasta; devolve um ID de operação. Identificadores de ficheiro são transportados como strings porque IDs de 64 bits do Windows podem exceder a precisão numérica do JavaScript.

`POST /api/operations/{id}/apply` exige `approved: true` e usa exclusivamente o plano guardado, sem aceitar destinos novos. Verifica todo o lote antes do primeiro movimento e repete as verificações para cada ficheiro. Um bloqueio de ficheiro do sistema operativo serializa as mutações entre processos que partilham a mesma pasta de dados. O bloqueio é libertado quando o processo termina.

Antes de mover, persiste `moving`; depois persiste `moved`. O rename do Windows falha se o destino existir. Em POSIX, criar um hard link também não substitui destinos; só depois é removido o nome antigo. Uma interrupção nesse intervalo pode deixar dois nomes para o mesmo inode. Não se usa `shutil.move`, que pode sobrescrever ou recorrer a cópia entre volumes.

O lote passa por `prepared → applying → completed`, ou `partial` se uma operação falhar. Não há rollback automático: o histórico identifica movimentos realizados e o utilizador decide desfazer. Repetir um pedido de execução com o mesmo ID não executa novamente. Uma interrupção abrupta pode deixar `applying`; a recuperação é feita através do restauro, sem continuar automaticamente a organização.

`POST /api/operations/{id}/undo` exige aprovação e percorre as ações por ordem inversa. Verifica a identidade e o hash no destino antes de repor o nome original, recusando substituir outros ficheiros. Persiste `restoring` antes de mover e `undone` depois. Se a operação foi interrompida, reconcilia ambos os caminhos com as identidades guardadas. Um duplicado só é removido se for comprovadamente outro hard link do mesmo ficheiro. Itens com conflitos são mantidos e os restantes podem ser restaurados; repetir o pedido tenta os itens ainda pendentes. Pastas vazias permanecem no disco.

`POST /api/operations/history` mantém compatibilidade com a versão anterior. A interface usa `/api/operations/search`: pesquisa parametrizada por caminhos sem distinguir acentos/maiúsculas, filtro por estado e páginas de 10 registos. `/api/operations/export` exporta todos os resultados filtrados, até 10 000. Contagem e leitura partilham uma transação SQLite. Os endpoints exigem o mesmo cabeçalho local dos restantes POST. Os registos permanecem em `.filenest/history.sqlite3`, ignorado pelo Git. Contêm caminhos, estados e hashes, não conteúdos. Planos cuja confirmação foi cancelada mantêm-se como preparados, sem movimentos. Não existe política de retenção automática.

`POST /api/demo-copy` cria uma pasta única em `.filenest/demos` com os exemplos fictícios. Organizar diretamente `examples/demo` é recusado pelo backend; a cópia permite verificar o fluxo real mantendo os exemplos versionados intactos.

## Fronteira de confiança

A API escuta em 127.0.0.1. A interface usa o proxy do Vite, sem CORS permissivo. O backend verifica Host e Origin e exige um cabeçalho próprio nos POST. Um formulário externo não consegue enviá-lo; um fetch externo com o cabeçalho exige autorização CORS, que não é concedida. O cabeçalho não é um segredo nem autentica processos locais.

Não existem clientes de fornecedores externos na aplicação; httpx serve apenas o Ollama em loopback e os testes. O React escapa nomes e texto normalmente, sem `dangerouslySetInnerHTML`. A análise não devolve o texto extraído ao frontend nem o regista intencionalmente em logs. A pré-visualização, pedida explicitamente, devolve texto TXT limitado ou uma imagem da página PDF. Conteúdo, caminhos e nomes apresentados são informação privada ao capturar a interface fora da demonstração. O serviço Ollama instalado é uma dependência local de confiança; o FileNest não administra os seus logs ou outras configurações.

`processes.py` inicia um processo por documento e impõe um prazo de 30 segundos (90 com OCR). No Windows, um Job Object limita a memória agregada a 768 MB e termina os descendentes quando fechado; em POSIX usam-se limites de endereçamento e grupos de processos. O worker só recebe os dados depois de associado ao Job Object. O processo principal gere a pasta temporária e remove-a mesmo quando o worker excede o prazo. Isto limita recursos, mas não é uma sandbox de permissões do sistema operativo. Não alterar a pasta durante a análise: as verificações de ligações são pontuais, sem garantia completa contra corridas provocadas por processos locais.

## Evolução

Um futuro fornecedor externo exigirá consentimento explícito antes de enviar dados para fora do computador. A interface deverá explicar fornecedor, conteúdo e finalidade e permitir recusar. O fornecedor local atual não acrescenta esse envio externo. Delimitar dados no prompt não resolve por si só prompt injection: a defesa operacional continua a ser ausência de ferramentas, validação independente e aprovação de uma lista fixa de movimentos.

A execução atual protege contra colisões, alterações verificadas e falhas recuperáveis, mas não é uma sandbox do sistema de ficheiros. Processos maliciosos na mesma conta, corrupção da base ou perda física do disco ficam fora dessa garantia. O histórico não substitui backups e não recupera conteúdos posteriormente alterados ou apagados.

## Estrutura

```text
backend/main.py         API e coordenação
backend/models.py       Contratos Pydantic
backend/extraction.py   Extração e erros por documento
backend/processes.py    Workers com limites de recursos
backend/ocr.py          Reconhecimento local com Tesseract
backend/folder_picker.py Diálogo nativo de seleção
backend/providers.py    Protocolo e regras determinísticas
backend/ollama_provider.py IA local e validação da resposta
backend/safety.py       Caminhos e colisões
backend/operations.py   Execução aprovada, histórico e restauro
backend/tests/          Testes unitários e da API
frontend/src/           Interface React e estilos responsivos
frontend/src/api.ts     Cliente HTTP local comum
frontend/tests/         Fluxos Playwright
examples/demo/          Documentos inteiramente fictícios
scripts/create_demo.py  Gerador dos PDFs de teste
```
