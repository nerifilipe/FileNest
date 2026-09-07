# Apresentar o FileNest

## Guião de dois minutos

1. Explique o problema: documentos com nomes pouco úteis, organizados com revisão humana e processamento local.
2. Use **Explorar exemplo**, sem serviços externos. Compare `scan_001.pdf` com o destino sugerido. Mostre a identificação **Regras locais**.
3. Edite uma subpasta para `../fora`, valide e mostre a recusa. Corrija e exclua um documento.
4. Com OCR instalado, ative-o e repita a demonstração: `digitalizado.pdf` passa a ter texto reconhecido. O PDF protegido e a página vazia continuam assinalados.
5. Crie uma cópia para organizar, prepare, reveja e confirme. Mostre o histórico, a pesquisa e a exportação JSON.
6. Desfaça com aprovação. Os conteúdos não mudam; os caminhos originais regressam. Uma alteração posterior no documento bloqueia o restauro desse item.
7. Opcionalmente, selecione IA local com Ollama. Compare as sugestões e explique que a validação dos destinos é independente do modelo.

## Decisões para explicar numa entrevista

- Extração, sugestões e execução têm contratos separados: trocar o modelo não lhe dá autoridade para mover ficheiros.
- Processos separados limitam tempo e memória dos parsers; OCR é opcional por ser mais lento e sujeito a erros.
- A aprovação refere uma lista persistida e fixa. O backend verifica novamente hashes, identidade e colisões antes de executar.
- SQLite regista cada movimento antes e depois: permite identificar falhas parciais e tentar o restauro sem sobrescrever documentos.
- Não existe uma transação única entre SQLite e o sistema de ficheiros. Recuperação explícita e estados intermédios tornam essa limitação visível.
- Os testes usam documentos fictícios e pastas separadas. OCR e IA reais são verificações opcionais quando as dependências locais estão disponíveis.

Use apenas a demonstração nas capturas públicas. Uma exportação de histórico real contém caminhos privados.
