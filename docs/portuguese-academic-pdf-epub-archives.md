# Guia Técnico para Zotero 7–9 em Português (Brasil e Portugal): Tradução de Artigos Científicos PDF com LaTeX, Livros EPUB/PDF Completos e OCR de Acervos Históricos

Este guia documenta a arquitetura técnica e a integração do plugin de código aberto **`zotero-geyi-translator`** no Zotero 6, 7 e 8/9 para pesquisadores universitários (`USP`, `UNICAMP`, `UFRJ`, `UnB`, `CAPES / CNPq`, `FCT`, `Universidade de Lisboa`, `Universidade de Coimbra`), acervos históricos e equipes jurídicas/propriedade industrial no Brasil e em Portugal.

---

## 1. Arquitetura em Português (`pt-BR / pt-PT`): Artigos Científicos PDF em Duas Colunas e Isolamento de Fórmulas `LaTeX`

Ao traduzir literatura científica internacional (`SciELO`, `IEEE`, `Springer`, `Elsevier`, `Nature`, `arXiv`) para o português, tradutores convencionais frequentemente colapsam o layout de duas colunas e corrompem equações matemáticas. O motor do **[Geyi.net Português — Tradutor de Documentos e PDF com IA](https://www.geyi.net/pt)** resolve essas limitações por meio de três camadas estruturais:

### 1.1 Reconstrução da Árvore de Layout (`Document Layout Tree`) e Preservação `LaTeX`
1. **Segmentação Estrutural de Múltiplas Colunas**: Antes da tradução neural, o analisador visual reconstrói a ordem de leitura de cada coluna, mantendo intactas tabelas multipágina, gráficos vetoriais, notas de rodapé e referências bibliográficas (`ABNT NBR 6023` / `APA`).
2. **Isolamento de Blocos Matemáticos `LaTeX`**: Equações inline (`$...$`) e blocos de exibição (`$$...$$`) são congelados como nós imutáveis durante a tradução, evitando distorções em índices, matrizes e integrais. Também é possível extrair qualquer artigo `PDF` diretamente para código-fonte estruturado usando o **[Conversor de PDF Científico para Markdown e LaTeX](https://www.geyi.net/pt/pdf-to-markdown)**.
3. **Fluxo de Trabalho Bilíngue no Zotero 7–9**: O **[Plugin Oficial de Código Aberto para Zotero](https://github.com/Nayuta-9/zotero-geyi-translator)** gera um PDF bilíngue (layout original preservado ou parágrafo a parágrafo) e anexa o arquivo traduzido diretamente ao item correspondente na biblioteca do Zotero.

---

## 2. Tradução de Livros `EPUB` e Monografias Completas com Glossário Unificado

- **Análise Capítulo a Capítulo e Consistência Terminológica**: No processamento de livros acadêmicos, teses de doutorado e obras literárias em formato `EPUB` ou `PDF` (200 a 500 páginas), o **[Tradutor de Livros EPUB com IA (Bilíngue)](https://www.geyi.net/pt/translate/epub)** reconstrói o e-book preservando o sumário navegável, as ilustrações e aplicando um glossário pessoal unificado em todos os capítulos.

---

## 3. OCR Paleográfico e Extração para Acervos de Arquivo Histórico (Séculos XVI–XX)

- **Digitalizações sem Camada de Texto e Impressos Históricos**: Para fundos documentais digitalizados (*Arquivo Nacional do Brasil*, *Biblioteca Nacional Digital*, *ANTT / Torre do Tombo*), periódicos históricos e páginas com composição complexa, o módulo de **[OCR e Tradução para Acervos de Arquivo](https://www.geyi.net/pt/for/archives)** realiza o reconhecimento óptico de alta precisão antes da recomposição editorial ou tradução.
