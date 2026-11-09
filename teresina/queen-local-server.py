#!/usr/bin/env python3
import argparse
import json
import os
import threading
import urllib.request
from urllib.parse import urljoin

import torch
import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from transformers import AutoTokenizer, AutoModelForCausalLM

SITE_BASE = "https://luizgonzntx.github.io/pcm-aegea/teresina/"

parser = argparse.ArgumentParser(description="Queen real + Teresina local")
parser.add_argument("--model", required=True, help="Pasta queen_v1_base")
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", type=int, default=8765)
args = parser.parse_args()

MODEL_PATH = os.path.abspath(args.model)
if not os.path.isdir(MODEL_PATH):
    raise SystemExit(f"Modelo não encontrado: {MODEL_PATH}")
if not os.path.isfile(os.path.join(MODEL_PATH, "config.json")):
    raise SystemExit("config.json não encontrado na pasta do Queen.")
if not any(name.endswith(".safetensors") for name in os.listdir(MODEL_PATH)):
    raise SystemExit("Pesos .safetensors não encontrados na pasta do Queen.")

app = FastAPI(title="Queen Local")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_lock = threading.Lock()
_tokenizer = None
_model = None
_device = None
_dtype = None

def load_queen():
    global _tokenizer, _model, _device, _dtype
    if _model is not None:
        return
    with _lock:
        if _model is not None:
            return
        if torch.cuda.is_available():
            _device = "cuda"
            _dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        else:
            _device = "cpu"
            _dtype = torch.float32

        print("\nCarregando Queen real...")
        print("Modelo:", MODEL_PATH)
        print("Dispositivo:", _device)
        print("Dtype:", _dtype)

        _tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, trust_remote_code=True)
        kwargs = {
            "trust_remote_code": True,
            "low_cpu_mem_usage": True,
            "torch_dtype": _dtype,
        }
        if _device == "cuda":
            kwargs["device_map"] = "auto"

        _model = AutoModelForCausalLM.from_pretrained(MODEL_PATH, **kwargs)
        if _device == "cpu":
            _model.to("cpu")
        _model.eval()
        print("✅ Queen real carregada.\n")

@app.get("/health")
def health():
    return {
        "ok": True,
        "queen_real": True,
        "model": "Queen 1.5B treinada · DAPT + SFT",
        "loaded": _model is not None,
        "device": _device or ("cuda" if torch.cuda.is_available() else "cpu"),
    }

@app.post("/api/chat")
async def chat(request: Request):
    body = await request.json()
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages:
        raise HTTPException(400, "messages inválido")

    safe = []
    for m in messages[-9:]:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        content = m.get("content")
        if role in {"system", "user", "assistant"} and isinstance(content, str):
            safe.append({"role": role, "content": content[:6000]})
    if not safe:
        raise HTTPException(400, "Pergunta vazia")

    load_queen()

    prompt = _tokenizer.apply_chat_template(
        safe,
        tokenize=False,
        add_generation_prompt=True,
    )
    inputs = _tokenizer(prompt, return_tensors="pt")
    if _device == "cuda":
        inputs = {k: v.to(_model.device) for k, v in inputs.items()}

    max_new_tokens = int(body.get("max_new_tokens", 260))
    max_new_tokens = max(64, min(max_new_tokens, 420))

    with torch.inference_mode():
        out = _model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            repetition_penalty=1.02,
            pad_token_id=_tokenizer.eos_token_id,
            eos_token_id=_tokenizer.eos_token_id,
        )

    new_tokens = out[0][inputs["input_ids"].shape[-1]:]
    text = _tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
    return {"text": text, "model": "Queen 1.5B treinada · DAPT + SFT"}

def proxy(path: str):
    target = urljoin(SITE_BASE, path or "")
    req = urllib.request.Request(target, headers={"User-Agent": "QueenLocal/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
            ctype = r.headers.get("Content-Type", "application/octet-stream")
            return Response(
                content=data,
                media_type=ctype.split(";")[0],
                headers={"Cache-Control": "no-store"},
            )
    except Exception as e:
        return Response(
            content=f"Falha ao carregar o Teresina: {e}",
            status_code=502,
            media_type="text/plain",
        )

@app.get("/")
def root():
    return proxy("")

@app.get("/{path:path}")
def site_proxy(path: str):
    if path.startswith("api/") or path == "health":
        return JSONResponse({"detail": "rota inválida"}, status_code=404)
    return proxy(path)

if __name__ == "__main__":
    print("=" * 72)
    print("QUEEN REAL · TERESINA LOCAL")
    print("Abra: http://127.0.0.1:%d" % args.port)
    print("O primeiro pedido carrega o Queen na memória.")
    print("=" * 72)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
