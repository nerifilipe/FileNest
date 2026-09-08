# FileNest v1.0.0 — Organização de documentos com processamento local

[Release v1.0.0 no GitHub](https://github.com/nerifilipe/FileNest/releases/tag/v1.0.0).

## Descrição

O FileNest analisa PDFs e ficheiros TXT e sugere nomes e subpastas a partir do conteúdo. O utilizador pode consultar o documento, editar as sugestões e aprovar uma lista de movimentos. O histórico permite desfazer, desde que os ficheiros não tenham sido alterados ou substituídos e os caminhos originais estejam disponíveis.

O processamento é local. A demonstração funciona com regras determinísticas, sem modelos ou chave de API. A IA opcional usa Qwen3 4B através do Ollama; as sugestões de IA e as alternativas por regras estão identificadas na interface.

### Funcionalidades

- Seleção de pasta e análise opcional de subpastas.
- PDF com texto e TXT UTF-8; OCR opcional em português e inglês com Tesseract.
- Progresso por documento e cancelamento após o documento em curso, conservando os resultados concluídos.
- Pré-visualização de páginas PDF e TXT junto às sugestões editáveis.
- Validação de nomes, contenção dos destinos na pasta selecionada e deteção de colisões.
- Organização com aprovação explícita e revalidação dos originais antes de executar.
- Histórico SQLite com pesquisa, filtros, paginação, exportação JSON e restauro.
- Arranque simplificado no Windows com `start.cmd`, após instalação das dependências.
- Demonstração com documentos fictícios e CI para testes backend e build frontend.

### Experimentar

Consulte a secção **Get started on Windows** do README para instalar Python/Node e as dependências. Depois, execute `start.cmd` e clique em **Explorar exemplo**. Para experimentar movimentos reais, use **Criar cópia para organizar**; os exemplos versionados permanecem intactos.

A distribuição é em código-fonte. Não inclui instalador, Python, Node.js, Tesseract ou modelos Ollama. Não existe serviço alojado nem é necessário configurar uma API paga.

### Validação

A instalação limpa do commit `b2c3952`, num caminho com espaços, passou com 97 testes backend e 11 de navegador, além do build e do arranque/encerramento dos servidores. Foram ignorados dois testes em cada conjunto: symlinks/OCR no backend e IA real/OCR no navegador, conforme o ambiente. Consulte `docs/installation-check.md` para o método e os limites da verificação. Estes números referem-se a essa verificação, não a uma garantia sobre todas as máquinas.

### Limitações

- Até 100 documentos por análise (20 com IA), 10 MB por documento, 2000 entradas e 20 níveis de subpastas.
- PDFs protegidos são recusados. OCR e IA podem produzir erros e requerem revisão.
- Cancelar aguarda o documento em curso; atualizar a página perde o acompanhamento da análise.
- Não existe uma transação única para o lote. Falhas parciais ficam registadas para recuperação explícita.
- Desfazer não recupera conteúdos editados ou apagados e não substitui backups.
- Validação funcional centrada em Windows; não existe instalador nem suporte a outros formatos.
