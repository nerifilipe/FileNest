# Arquitetura do FileNest

## Responsabilidades

`POST /api/analyze` recebe `path` ou `demo: true`. Valida a raiz, enumera o primeiro nível, ignora ligações e formatos não suportados e aplica limites antes de extrair texto. Uma falha de extração é um resultado individual e não impede os restantes documentos.

`extraction.py` abre ficheiros apenas para leitura e limita os bytes de entrada. O pypdf extrai texto por página; TXT usa UTF-8 com BOM opcional. São distinguidos ficheiros vazios, protegidos, ilegíveis, demasiado grandes e sem texto. As sugestões recebem até 50 000 caracteres. Não são executados comandos, macros ou código contido nos documentos.

`providers.py` define o protocolo `SuggestionProvider.suggest(text, extension)`. `DemoProvider` normaliza acentos, procura palavras completas e usa a primeira regra correspondente. Uma data no formato AAAA-MM-DD entra no nome. É uma heurística explicável; não usa aprendizagem automática nem valida semanticamente a data. Sem correspondência, propõe `Outros/documento.ext` e pede revisão.

`safety.py` verifica componentes, nomes reservados Windows, separadores, extensão, comprimento de caminho e contenção na raiz. Procura colisões sem distinguir maiúsculas/minúsculas e conflitos entre ficheiros e pastas, tanto no disco como no plano. Excluídos não participam nas colisões entre propostas. Não são acrescentados sufixos silenciosamente: os conflitos ficam visíveis.

`POST /api/validate` verifica novamente os destinos editados contra o disco. Nunca cria pastas nem escreve ficheiros. O resultado não é uma autorização persistente: o disco pode mudar a seguir.

`App.tsx` mantém o plano e uma cópia inicial em memória. Alterações marcam o plano como pendente de validação. Não guarda caminhos ou conteúdos no armazenamento do navegador. Uma análise bem-sucedida substitui o plano; se falhar, as edições anteriores permanecem.

`OperationsPanel.tsx` apresenta uma lista final imutável, uma autorização desmarcada por defeito e o botão de confirmação. Uma edição no plano invalida a confirmação apresentada. A aplicação só envia a execução depois dessa autorização. O mesmo fluxo confirma o restauro, e o histórico é carregado novamente após reiniciar a página.

## Execução e histórico

`operations.py` concentra as escritas e usa SQLite da biblioteca padrão. `POST /api/operations/prepare` revalida o plano, verifica origens únicas e compara SHA-256, volume e identificador do ficheiro com os valores da análise. Guarda a lista exata de movimentos e a identidade da pasta; devolve um ID de operação. Identificadores de ficheiro são transportados como strings porque IDs de 64 bits do Windows podem exceder a precisão numérica do JavaScript.

`POST /api/operations/{id}/apply` exige `approved: true` e usa exclusivamente o plano guardado, sem aceitar destinos novos. Verifica todo o lote antes do primeiro movimento e repete as verificações para cada ficheiro. Um bloqueio de ficheiro do sistema operativo serializa as mutações entre processos que partilham a mesma pasta de dados. O bloqueio é libertado quando o processo termina.

Antes de mover, persiste `moving`; depois persiste `moved`. O rename do Windows falha se o destino existir. Em POSIX, criar um hard link também não substitui destinos; só depois é removido o nome antigo. Uma interrupção nesse intervalo pode deixar dois nomes para o mesmo inode. Não se usa `shutil.move`, que pode sobrescrever ou recorrer a cópia entre volumes.

O lote passa por `prepared → applying → completed`, ou `partial` se uma operação falhar. Não há rollback automático: o histórico identifica movimentos realizados e o utilizador decide desfazer. Repetir um pedido de execução com o mesmo ID não executa novamente. Uma interrupção abrupta pode deixar `applying`; a recuperação é feita através do restauro, sem continuar automaticamente a organização.

`POST /api/operations/{id}/undo` exige aprovação e percorre as ações por ordem inversa. Verifica a identidade e o hash no destino antes de repor o nome original, recusando substituir outros ficheiros. Persiste `restoring` antes de mover e `undone` depois. Se a operação foi interrompida, reconcilia ambos os caminhos com as identidades guardadas. Um duplicado só é removido se for comprovadamente outro hard link do mesmo ficheiro. Itens com conflitos são mantidos e os restantes podem ser restaurados; repetir o pedido tenta os itens ainda pendentes. Pastas vazias permanecem no disco.

`POST /api/operations/history` devolve os últimos 50 registos, incluindo listas e erros. É POST para exigir o mesmo cabeçalho local dos restantes pedidos com dados privados. Os registos permanecem em `.filenest/history.sqlite3`, ignorado pelo Git. Contêm caminhos, estados e hashes, não conteúdos. Planos cuja confirmação foi cancelada mantêm-se como preparados, sem movimentos. Não existe ainda política de retenção ou paginação.

`POST /api/demo-copy` cria uma pasta única em `.filenest/demos` com os exemplos fictícios. Organizar diretamente `examples/demo` é recusado pelo backend; a cópia permite verificar o fluxo real mantendo os exemplos versionados intactos.

## Fronteira de confiança

A API escuta em 127.0.0.1. A interface usa o proxy do Vite, sem CORS permissivo. O backend verifica Host e Origin e exige um cabeçalho próprio nos POST. Um formulário externo não consegue enviá-lo; um fetch externo com o cabeçalho exige autorização CORS, que não é concedida. O cabeçalho não é um segredo nem autentica processos locais.

Não existem clientes de fornecedores externos na aplicação; httpx é usado nos testes. O React escapa os nomes normalmente, sem `dangerouslySetInnerHTML`. O texto completo não é devolvido ao frontend nem registado intencionalmente em logs. Caminhos e nomes apresentados continuam a ser informação privada ao capturar a interface fora da demonstração.

Os limites reduzem o custo, mas não isolam o parser. A descompressão de páginas ocorre antes de verificar o tamanho descomprimido, e pode consumir recursos. Mover a extração para um processo com limite de execução é uma melhoria futura. Não alterar a pasta durante a análise: as verificações de ligações são pontuais, sem garantia completa contra corridas provocadas por processos locais.

## Evolução

Um fornecedor real implementará o mesmo protocolo, mas terá de pedir consentimento antes de enviar dados. A interface deverá explicar fornecedor, conteúdo e finalidade e permitir recusar. O documento será delimitado como dados sem autoridade para alterar instruções; a saída será sempre validada independentemente do modelo.

A execução atual protege contra colisões, alterações verificadas e falhas recuperáveis, mas não é uma sandbox do sistema de ficheiros. Processos maliciosos na mesma conta, corrupção da base ou perda física do disco ficam fora dessa garantia. O histórico não substitui backups e não recupera conteúdos posteriormente alterados ou apagados. O parser PDF deverá ganhar isolamento num processo separado.

## Estrutura

```text
backend/main.py         API e coordenação
backend/models.py       Contratos Pydantic
backend/extraction.py   Extração e erros por documento
backend/providers.py    Protocolo e regras determinísticas
backend/safety.py       Caminhos e colisões
backend/operations.py   Execução aprovada, histórico e restauro
backend/tests/          Testes unitários e da API
frontend/src/           Interface React e estilos responsivos
frontend/src/api.ts     Cliente HTTP local comum
frontend/tests/         Fluxos Playwright
examples/demo/          Documentos inteiramente fictícios
scripts/create_demo.py  Gerador dos PDFs de teste
```
