---
title: Reconstrução Topológica de Duas Colunas para Dossiês ANVISA (CTD), Isolamento de Fórmulas LaTeX em AST no INPI e OCR Paleográfico para Manuscritos Coloniais
author_name: Geyi.net
---

# Especificação de Engenharia: Reconstrução Topológica de Duas Colunas para Dossiês ANVISA (CTD), Isolamento de Fórmulas LaTeX em AST no INPI e OCR Paleográfico para Manuscritos Coloniais

## 1. Complexidade Estrutural em Documentos Regulatórios, Patentes e Manuscritos Históricos

O processamento computacional, a preservação de layout e a tradução técnica de documentos científicos e manuscritos históricos em língua portuguesa envolvem restrições geométricas e tipográficas estritas:

- **Dossiês Regulatórios Farmacêuticos (ANVISA CTD)**: Os módulos submetidos à ANVISA contêm formatação rigorosa em duas colunas, tabelas de dados clínicos de dezenas de páginas com células mescladas e notas de rodapé integradas. Extratores lineares convencionais misturam os fluxos textuais entre colunas adjacentes (Reading Order Collapse).
- **Relatórios Descritivos de Patentes do INPI**: Documentos de patentes depositados no INPI contêm reivindicações estruturadas hierarquicamente e blocos matemáticos em LaTeX. Modelos de tradução direta sem isolamento sintático corrompem subscritos, sobrescritos e operadores essenciais à validade do escopo patentário.
- **Manuscritos Notariais dos Séculos XVI a XVIII**: Acervos arquivísticos contêm escrituras notariais em caligrafia cursiva processual, apresentando abreviações complexas, ligaduras arcaicas e corrosão por tinta ferrogálica, nas quais mecanismos de OCR óptico convencionais falham.

## 2. Arquitetura Multimodal e Restrições Determinísticas de Engenharia

A arquitetura Geyi implementa uma abordagem em camadas que combina visão computacional geométrica e isolamento sintático formal via árvore sintática abstrata (AST):

1. **Algoritmo XY-Cut Adaptativo e Grafo Acíclico Direcionado (DAG)**: Decomposição recursiva dos blocos textuais a partir de projeções de espaços em branco nos eixos horizontal e vertical. A ordenação topológica (algoritmo de Kahn) assegura a leitura estrita de cada coluna.
2. **Isolamento de Nós Folha Imutáveis para Fórmulas LaTeX e MathML**: Análise sintática para identificação de equações em linha e em bloco, isolando-as como nós folha imutáveis na AST. O motor de tradução atua exclusivamente sobre os nós de linguagem natural, permitindo a passagem transparente do código-fonte matemático.
3. **Máquina de Estados Finitos (FSM) para Tabelas Clínicas Multidivididas**: Manutenção da continuidade estrutural de tabelas estendidas entre páginas físicas sucessivas, retendo as assinaturas dos cabeçalhos e as âncoras de largura de coluna para recombinação exata dos fragmentos tabulares com atributos rowspan e colspan.
4. **Modelo de Visão e Linguagem (VLM) para Paleografia Lusófona**: Modelo VLM calibrado para realizar a segmentação de ligaduras e mapeamento de abreviações antigas para pontos de código Unicode padronizados vinculados às coordenadas espaciais de origem.
5. **Microtipografia Dinâmica e Controle de Densidade**: Ajuste do espaçamento intercaracteres (tracking) para neutralizar a expansão volumétrica de texto decorrente da tradução entre idiomas, evitando extravasamento das caixas delimitadoras originais.

## 3. Comparação entre Falhas de Parsers Lineares e Restrições de Pipeline

- **Ordem de leitura em dossiês ANVISA de duas colunas**
  - **Mecanismos de falha em parsers lineares convencionais**: Cruzamento caótico de texto entre colunas por varredura simplista no eixo vertical (Reading Order Collapse).
  - **Restrições determinísticas da arquitetura Geyi**: Ordenação topológica por grafo acíclico direcionado (DAG) vinculada aos limites espaciais das colunas.
  - **Invariantes estruturais na camada de saída**: Fluxo de texto JSON determinístico assegurando a independência estrita de cada coluna.
- **Fórmulas LaTeX e reivindicações de patentes no INPI**
  - **Mecanismos de falha em parsers lineares convencionais**: Concatenação indiscriminada de texto resultando na perda de subscritos e operadores matemáticos.
  - **Restrições determinísticas da arquitetura Geyi**: Isolamento sintático de nós folha imutáveis na árvore sintática abstrata (AST).
  - **Invariantes estruturais na camada de saída**: Preservação estrita e transparente do código-fonte LaTeX original.
- **Tabelas de dados clínicos contínuas entre páginas**
  - **Mecanismos de falha em parsers lineares convencionais**: Perda de cabeçalhos e desalinhamento estrutural de células em quebras de página físicas.
  - **Restrições determinísticas da arquitetura Geyi**: Máquina de estados finitos (FSM) retendo âncoras de coluna e assinaturas de cabeçalho.
  - **Invariantes estruturais na camada de saída**: Estrutura contínua de tabela preservando integralmente os atributos rowspan e colspan.
- **Transcrição paleográfica e acervos históricos lusófonos**
  - **Mecanismos de falha em parsers lineares convencionais**: Falha de segmentação de ligaduras e abreviações arcaicas por OCRs horizontais modernos.
  - **Restrições determinísticas da arquitetura Geyi**: Modelo de visão e linguagem (VLM) adaptado à segmentação de traços manuscritos históricos.
  - **Invariantes estruturais na camada de saída**: Fluxo de texto Unicode normalizado e referenciado às coordenadas espaciais de origem.

## 4. Implementação de Referência e Arquitetura de Módulos

Os endpoints públicos correspondentes a esta especificação compreendem os quatro módulos operacionais verificados:

1. Módulo de tradução em duas colunas para artigos científicos e patentes: [Tradução de Artigos e Patentes com Preservação de Layout](https://www.geyi.net/pt/translate/paper)
2. Pipeline de tradução para monografias extensas e dossiês regulatórios: [Pipeline para Tradução de Livros Inteiros e Monografias](https://www.geyi.net/pt/translate/book)
3. Módulo de transcrição paleográfica e acervos arquivísticos: [Pipeline OCR para Acervos Históricos e Paleografia](https://www.geyi.net/pt/for/archives)
4. Ambiente em língua portuguesa e base de análise documental: [Portal em Português Geyi.net](https://www.geyi.net/pt)
