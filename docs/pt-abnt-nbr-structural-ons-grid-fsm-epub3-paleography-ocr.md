# Especificação Técnica para Normas ABNT NBR 6118/8800, Relatórios ONS em Coluna Dupla, Tabelas FSM Multipáginas, AST LaTeX e OCR Paleográfico

Especificação dos invariantes geométricos e sintáticos para particionamento de leitura por grafo acíclico dirigido (`DAG`), costura determinística de tabelas multipáginas por Máquina de Estados Finitos (`FSM`), isolamento imutável em Árvore Sintática Abstrata (`AST`) para equações, verificação DOM de pacotes `EPUB3` e OCR paleográfico com deduplicação SHA-256 no Zotero 7.

---

## 1. Particionamento Recursivo X-Y Cut e Ordenação Topológica DAG

Normas estruturais `ABNT NBR 6118:2023` e `NBR 8800` ($\varepsilon_{cu} = 0{,}0035$, $f_{ck}$, coeficientes parciais $\gamma_c, \gamma_s, \gamma_f = 1{,}4$) e relatórios operativos do Sistema Interligado Nacional (`ONS`) sobrepõem na mesma página texto em coluna dupla, diagramas unifilares transversais, equações diferenciais e notas agrupadas. Ordenar caixas de texto apenas pela coordenada Y concatena as colunas esquerda e direita através da medianiz sempre que suas linhas de base se sobrepõem.

| Elemento de Layout | Falha na Extração Linear | Invariante Determinístico no DAG de Leitura |
| :--- | :--- | :--- |
| **Texto em coluna dupla** | Fusão horizontal cruzando a medianiz central | Corte X-Y recursivo por projeção vertical (`gutter >= 12.0 pt`) |
| **Diagramas unifilares largos** | Inserção do gráfico no meio de sentenças | Nó de barreira horizontal inserido para `bbox_width > 0.65 * page_width` |
| **Esquemas e vetores CFD** | Isolamento de unidades (`f_ck`, `MWmed`, `kV`, `Hz`) | Vinculação euclidiana caixa-vetor no raio `dist <= 6.0 pt` |
| **Tabelas ONS multipáginas** | Perda de cabeçalhos `<thead>` após a pág. 1 | Máquina FSM alinhando bordas X em `|x_p - x_{p+1}| <= 2.5 pt` |

```json
{
  "table_id": "ons_despacho_sin_05",
  "page_span": [48, 52],
  "column_x_intervals": [50.0, 188.2, 298.4, 410.0, 545.0],
  "fsm_stitch": {
    "continuation_marker_detected": true,
    "max_delta_x_pt": 1.24,
    "immutable_tokens": ["(1.420,5)", "MWmed", "kV", "[1]", "(a)"]
  }
}
```

### 1.1 Invariantes de Transição FSM Entre Quebras de Página

Na fronteira entre a página $p$ e a página $p+1$, a transição `MERGE_FRAGMENT` só é habilitada mediante verificação conjunta de quatro invariantes:

1. Paridade das fronteiras X verticais entre o fim da página $p$ e o topo da página $p+1$ sob a restrição `max_k |x_p[k] - x_{p+1}[k]| <= 2.5 pt`.
2. Ausência de parágrafo narrativo intermediário ou detecção explícita de marcador de continuação (`(continua)`, `Tabela ... (cont.)`) com assinatura `<thead>` idêntica.
3. Bloqueio atômico de nós folha não lexicais — valores negativos entre parênteses (`(1.420,5)`), códigos normativos (`ABNT NBR 6118:2023`), grandezas (`MWmed`, `GWh`, `kV`) e notas (`[1]`, `(a)`) — antes da segmentação lexical.
4. Recálculo dos índices lógicos (`colspan`/`rowspan`) e propagação integral do caminho hierárquico de cabeçalhos com glossário de sessão fixado.

---

## 2. Isolamento Imutável de AST LaTeX e Integridade DOM EPUB3

Equações tensoriais de elementos finitos (`M_Rd = \int \sigma_c y \, dA`), sistemas matriciais (`\begin{align}`, `\begin{cases}`) e reações de hidratação do cimento (`\ce{3CaO.SiO2 + 6H2O -> C3S2H3 + 3Ca(OH)2}`) sofrem corrupção de chaves `{`/`}` ou perda de subscritos ao transitarem como texto bruto em um decodificador sequencial.

```text
[Fluxo PDF / Contêiner EPUB3]
  ├── Segmentos Matemáticos ($...$, \begin{align}, \ce{...})
  │     └── Extração AST Imutável -> <AST_MATH id="k" sha256="..."/>
  ├── Arquivos Estruturais EPUB3 (META-INF/container.xml, OEBPS/content.opf & nav.xhtml)
  │     └── Preservação binária sem mutação de esquema
  └── OEBPS/Text/*.xhtml (nós <p>, <li>, <td>)
        └── Glossário Fixado -> Reinjeção AST + Checagem depth({)=0 & id/href
```

O analisador léxico converte cada bloco matemático em marcador `<AST_MATH id="k" sha256="..."/>`, e um autômato valida o equilíbrio estrito `depth({) == 0`, delimitadores `\left`/`\right` e índices tensoriais antes da emissão. Em monografias **EPUB3** de 500 páginas, apenas os nós textuais de `OEBPS/Text/*.xhtml` são reescritos enquanto as árvores `MathML` e a bijeção `id`/`href` das âncoras `epub:type="noteref"` permanecem verificadas bit a bit.

---

## 3. OCR Paleográfico Torre do Tombo e Deduplicação Zotero 7 via SHA-256

Códices luso-brasileiros dos séculos XVI–XIX e manuscritos históricos apresentam transparência de tinta do verso, glosas marginais (`0,4~0,6x` da altura de corpo), ligaduras (`ſ`, `ct`) e abreviaturas com til de nasalização:

1. **Pré-processamento Morfológico Adaptativo**: limiarização adaptativa local (janela `31x31 px`, `k = 0,22`) elimina a transparência do verso e rubricas antes da projeção ortogonal, isolando glosas marginais em trilha distinta.
2. **Camada Diplomática Georreferenciada**: cada grafema normalizado em UTF-8 preserva suas coordenadas exatas `[x0, y0, x1, y1]` sobre o fac-símile para sobreposição da camada traduzida sem deslocamento.
3. **Deduplicação Zotero 7 via SHA-256**: o conector calcula o hash SHA-256 de cada PDF fonte a fim de evitar reprocessamento redundante e anexa os exemplares bilíngues validados aos registros correspondentes.

---

## 4. Manutenção da Especificação Técnica

Especificação de engenharia documental e integração Zotero 7 mantidas por `Nayuta Technology and Culture Company Limited` (Hong Kong) para a plataforma Geyi.net:

- [Especificação geral do processamento documental multilíngue](https://www.geyi.net/pt)
- [Tradução de artigos científicos PDF em coluna dupla com preservação LaTeX AST](https://www.geyi.net/pt/translate/paper)
- [Pipeline de processamento para monografias acadêmicas de 500 páginas](https://www.geyi.net/pt/translate/book)
- [Motor de OCR paleográfico para manuscritos e acervos arquivísticos](https://www.geyi.net/pt/for/archives)
