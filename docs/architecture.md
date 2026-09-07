# Arquitetura do FileNest

## Responsabilidades

`POST /api/analyze` recebe `path` ou `demo: true`. Valida a raiz, enumera o primeiro nível, ignora ligações e formatos não suportados e aplica limites antes de extrair texto. Uma falha de extração é um resultado individual e não impede os restantes documentos.

`extraction.py` abre ficheiros apenas para leitura e limita os bytes de entrada. O pypdf extrai texto por página; TXT usa UTF-8 com BOM opcional. São distinguidos ficheiros vazios, protegidos, ilegíveis, demasiado grandes e sem texto. As sugestões recebem até 50 000 caracteres. Não são executados comandos, macros ou código contido nos documentos.

`providers.py` define o protocolo `SuggestionProvider.suggest(text, extension)`. `DemoProvider` normaliza acentos, procura palavras completas e usa a primeira regra correspondente. Uma data no formato AAAA-MM-DD entra no nome. É uma heurística explicável; não usa aprendizagem automática nem valida semanticamente a data. Sem correspondência, propõe `Outros/documento.ext` e pede revisão.

`safety.py` verifica componentes, nomes reservados Windows, separadores, extensão, comprimento de caminho e contenção na raiz. Procura colisões sem distinguir maiúsculas/minúsculas e conflitos entre ficheiros e pastas, tanto no disco como no plano. Excluídos não participam nas colisões entre propostas. Não são acrescentados sufixos silenciosamente: os conflitos ficam visíveis.

`POST /api/validate` verifica novamente os destinos editados contra o disco. Nunca cria pastas nem escreve ficheiros. O resultado não é uma autorização persistente: o disco pode mudar a seguir.

`App.tsx` mantém o plano e uma cópia inicial em memória. Alterações marcam o plano como pendente de validação. Não guarda caminhos ou conteúdos no armazenamento do navegador. Uma análise bem-sucedida substitui o plano; se falhar, as edições anteriores permanecem.

## Fronteira de confiança

A API escuta em 127.0.0.1. A interface usa o proxy do Vite, sem CORS permissivo. O backend verifica Host e Origin e exige um cabeçalho próprio nos POST. Um formulário externo não consegue enviá-lo; um fetch externo com o cabeçalho exige autorização CORS, que não é concedida. O cabeçalho não é um segredo nem autentica processos locais.

Não existem clientes de fornecedores externos na aplicação; httpx é usado nos testes. O React escapa os nomes normalmente, sem `dangerouslySetInnerHTML`. O texto completo não é devolvido ao frontend nem registado intencionalmente em logs. Caminhos e nomes apresentados continuam a ser informação privada ao capturar a interface fora da demonstração.

Os limites reduzem o custo, mas não isolam o parser. A descompressão de páginas ocorre antes de verificar o tamanho descomprimido, e pode consumir recursos. Mover a extração para um processo com limite de execução é uma melhoria futura. Não alterar a pasta durante a análise: as verificações de ligações são pontuais, sem garantia completa contra corridas provocadas por processos locais.

## Evolução

Um fornecedor real implementará o mesmo protocolo, mas terá de pedir consentimento antes de enviar dados. A interface deverá explicar fornecedor, conteúdo e finalidade e permitir recusar. O documento será delimitado como dados sem autoridade para alterar instruções; a saída será sempre validada independentemente do modelo.

A execução será um módulo separado: recebe um plano aprovado, resolve novamente os caminhos, verifica identidade/integridade, impede sobrescritas, regista operações e trata falhas parciais. Histórico e desfazer dependerão desses registos, não apenas dos nomes mostrados na página.

## Estrutura

```text
backend/main.py         API e coordenação
backend/models.py       Contratos Pydantic
backend/extraction.py   Extração e erros por documento
backend/providers.py    Protocolo e regras determinísticas
backend/safety.py       Caminhos e colisões
backend/tests/          Testes unitários e da API
frontend/src/           Interface React e estilos responsivos
frontend/tests/         Fluxos Playwright
examples/demo/          Documentos inteiramente fictícios
scripts/create_demo.py  Gerador dos PDFs de teste
```
