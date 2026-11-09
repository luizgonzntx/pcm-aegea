QUEEN REAL + TERESINA — TESTE LOCAL

Este pacote usa EXATAMENTE o queen_v1_base treinado hoje (DAPT + SFT).
Não usa o Qwen 0.5B como cérebro principal quando o servidor local está ativo.

1. No Google Drive, localize:
   Queen/queen_v1_base

2. Baixe ou sincronize essa pasta no PC.
   Ela deve conter config.json, tokenizer.json e os dois arquivos model-*.safetensors.

3. Extraia este pacote em uma pasta qualquer.

4. Dê duplo clique em:
   iniciar-queen-teresina.bat

5. Na primeira execução ele instala as dependências Python.
   Depois abre:
   http://127.0.0.1:8765

6. O Teresina será carregado normalmente, mas as perguntas da Queen irão para
   o modelo 1.5B treinado hoje.

OBSERVAÇÕES
- Se houver GPU NVIDIA/CUDA disponível no PyTorch, ela é usada automaticamente.
- Sem GPU, funciona em CPU, porém a resposta pode ser lenta.
- O primeiro pedido carrega os ~3 GB de pesos na memória.
- O servidor escuta apenas 127.0.0.1, portanto não fica exposto na rede.
