# Queen Maintenance — treino do Qwen2.5-0.5B

O runtime do painel permanece **CPU/RAM via WebAssembly**. A GPU é usada apenas para treinamento no Colab.

## Dados

Não publique os datasets no GitHub. Coloque estes arquivos em `/content/data/` no Colab:

- `queen_domain_corpus_v1.jsonl`
- `queen_sft_train_v1.jsonl`
- `queen_sft_validation_v1.jsonl`
- `queen_sft_test_v1.jsonl`

Antes do treino definitivo, faça a revisão de PII em texto livre.

## Instalação no Colab

```bash
pip install -U transformers datasets accelerate peft trl safetensors sentencepiece
```

## Primeiro ensaio

Para validar o pipeline sem gastar uma execução inteira, use somente 10 mil relatos no DAPT:

```bash
python training/train_queen_qwen25_05b.py --domain-limit 10000
```

Se loss/eval estiverem estáveis, rode o conjunto completo:

```bash
python training/train_queen_qwen25_05b.py
```

A sequência é:

1. **DAPT/continual pretraining** em linguagem real de manutenção;
2. merge do adapter;
3. **SFT** nos casos QUEST + ICM;
4. merge final em `queen_qwen25_05b_merged`.

O SFT usa loss nos tokens do assistente, conforme o formato conversacional.

## Avaliação

```bash
python training/evaluate_queen.py --limit 200
```

Não promover o modelo apenas por loss. Revisar amostras do conjunto de teste procurando:

- causa cadastrada tratada como causa raiz;
- medida cadastrada tratada como serviço comprovado;
- invenção de peça, falha, OS ou número;
- confusão entre relato técnico e cadastro;
- respostas conceituais absurdas para MTTR, MTBF, disponibilidade, confiabilidade etc.

## Depois do aceite

Mesclar o modelo, converter para ONNX e quantizar para q8. O Transformers.js suporta modelos customizados em ONNX; o painel deve continuar usando WASM/CPU.

Referências atuais: TRL SFTTrainer + PEFT/LoRA e Transformers.js custom models/ONNX.
