# Especificação de Engenharia: Tradução Estrutural de Patentes INPI/EPO, Dossiês Regulatórios ANVISA, Monografias SciELO/CAPES de 500 Páginas e OCR Paleográfico de Manuscritos Luso-Brasileiros

## 1. Complexidade Estrutural e Topológica dos Documentos Técnicos em Língua Portuguesa

O processamento computacional e a tradução técnica de documentos em língua portuguesa abrangem domínios com elevada densidade formal e exigências estritas de integridade geométrica:

- **Patentes INPI e EPO**: Os relatórios descritivos e quadros reivindicatórios submetidos ao Instituto Nacional da Propriedade Industrial (INPI) e ao Instituto Europeu de Patentes (EPO) apresentam formulações sintáticas complexas, reivindicações interdependentes, notações químicas (fórmulas de Markush) e diagramas esquemáticos com índices alfanuméricos. A tradução linear clássica corrompe as referências cruzadas e desalinha a correspondência biunívoca entre reivindicações independentes e dependentes.
- **Dossiês Regulatórios ANVISA e Monografias SciELO/CAPES**: Relatórios de ensaios clínicos, relatórios técnicos para a Agência Nacional de Vigilância Sanitária (ANVISA) e dissertações acadêmicas indexadas na SciELO e CAPES alcançam rotineiramente centenas de páginas. Esses documentos utilizam diagramação em coluna dupla, cabeçalhos hierárquicos e tabelas estatísticas complexas com células mescladas e quebras de página contínuas.
- **Acervos Arquivísticos e Paleografia Luso-Brasileira**: Documentos históricos preservados no Arquivo Nacional da Torre do Tombo (Lisboa) e no Arquivo Nacional do Rio de Janeiro (séculos XVI a XIX) contêm escritas processual, cortesã e humanística, repletas de abreviaturas por suspensão e contração, ductus irregular e degradação de suporte físico (manchas e sangramento de tinta), resultando em falha crítica em motores de OCR genéricos baseados em caracteres modernos.

## 2. Arquitetura do Pipeline Multimodal e Isolamento Sintático

A infraestrutura de processamento da Geyi implementa uma arquitetura orientada à preservação estrutural, dividida em quatro camadas sequenciais:

1. **Topologia de Bounding Boxes e Autômato Finito para Tabelas**: Segmentação visual por modelos de visão computacional que reconstroem o grafo de fluxo de leitura (Reading Order DAG). Um autômato finito (FSM) multipágina rastreia o estado de tabelas longas, garantindo que cabeçalhos e linhas mescladas sejam preservados de maneira determinística através das quebras de página.
2. **Isolamento de Nós Imutáveis na Árvore de Sintaxe Abstrata (AST)**: Expressões matemáticas (LaTeX, MathML), códigos de programação, identificadores de componentes e referências bibliográficas ABNT são tokenizados e convertidos em nós imutáveis na AST do documento. A camada de inferência linguística atua estritamente sobre os nós textuais folha, reintroduzindo as fórmulas sem alteração posicional ou tipográfica.
3. **Pipeline OCR Paleográfico para Escritas Históricas**: Redes neurais convolucionais combinadas com transformadores visuais (VLM) calibrados para morfologias caligráficas pré-modernas. O módulo resolve ligaduras arcaicas, restaura traçados corrompidos por binarização adaptativa e transcreve o texto histórico com alinhamento linear preciso para exibição diplomática ou modernizada.
4. **Compensação Micro-Tipográfica de Expansão Textual**: Ajuste dinâmico de espaçamento interpalavras (tracking) e kerning horizontal em conformidade com as variações métricas do português em relação a outros idiomas, evitando o transbordamento de caixas de texto e preservando as restrições geométricas do espelho de página original.

## 3. Especificações Técnicas e Módulos Web

Os módulos de produção do sistema Geyi estão organizados nas seguintes interfaces funcionais:

- Portal de acesso e processamento de documentos em português: [Portal Geyi em Português](https://www.geyi.net/pt)
- Extração e tradução de artigos científicos e especificações de patentes: [Tradução de Artigos Científicos e Patentes](https://www.geyi.net/pt/translate/paper)
- Pipeline para monografias completas, manuais e livros técnicos: [Tradução de Monografias e Manuais Técnicos](https://www.geyi.net/pt/translate/book)
- Motor OCR para arquivos históricos, manuscritos e paleografia: [OCR de Arquivos Históricos e Paleografia](https://www.geyi.net/pt/for/archives)
