# MANIX PCM Android

APK Android para inferência local da MANIX via GGUF/llama.cpp.

## Funções da versão 0.1
- Importa um modelo `.gguf` pelo seletor de arquivos do Android.
- Copia o modelo para o armazenamento privado do app.
- Executa inferência local/streaming via binding Android oficial do `llama.cpp`.
- Importa base PCM em `.txt` ou `.csv` e indexa localmente em SQLite.
- Faz recuperação lexical local de contexto antes de enviar a pergunta ao modelo.
- Não depende de servidor durante a conversa.

## Modelo esperado
`manix-1.5b-q4_k_m.gguf`

## Build
O workflow `.github/workflows/build-manix-android.yml` clona `ggml-org/llama.cpp`, instala SDK/NDK necessários e gera o APK debug.
