#!/usr/bin/env python3
"""Avaliação simples do Queen em casos nunca vistos."""
from __future__ import annotations
import argparse, json, re
from pathlib import Path
import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer

FORBIDDEN_OVERCLAIMS = [
    r"causa raiz (?:é|foi|comprovad)",
    r"comprovadamente",
    r"sem dúvida",
    r"certamente foi",
]

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--model", default="/content/queen_training/queen_qwen25_05b_merged")
    p.add_argument("--test", default="/content/data/queen_sft_test_v1.jsonl")
    p.add_argument("--limit", type=int, default=200)
    p.add_argument("--out", default="/content/queen_training/test_predictions.jsonl")
    a=p.parse_args()

    tok=AutoTokenizer.from_pretrained(a.model, use_fast=True)
    model=AutoModelForCausalLM.from_pretrained(
        a.model,
        device_map="auto",
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
    )
    ds=load_dataset("json", data_files=a.test, split="train")
    ds=ds.select(range(min(a.limit,len(ds))))
    Path(a.out).parent.mkdir(parents=True,exist_ok=True)

    bad=0
    with open(a.out,"w",encoding="utf-8") as f:
        for ex in ds:
            msgs=ex["messages"]
            prompt=tok.apply_chat_template(msgs[:-1], tokenize=False, add_generation_prompt=True)
            inp=tok(prompt,return_tensors="pt").to(model.device)
            with torch.inference_mode():
                out=model.generate(**inp,max_new_tokens=220,do_sample=False,repetition_penalty=1.08)
            gen=tok.decode(out[0][inp["input_ids"].shape[1]:],skip_special_tokens=True).strip()
            overclaim=any(re.search(pat,gen,re.I) for pat in FORBIDDEN_OVERCLAIMS)
            bad += int(overclaim)
            f.write(json.dumps({
                "input": msgs[-2]["content"],
                "reference": msgs[-1]["content"],
                "prediction": gen,
                "overclaim_flag": overclaim,
            },ensure_ascii=False)+"\n")
    print(f"Casos avaliados: {len(ds)}")
    print(f"Flags de extrapolação: {bad} ({bad/max(1,len(ds)):.1%})")
    print("Predições:",a.out)

if __name__=="__main__":
    main()
