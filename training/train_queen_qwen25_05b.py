#!/usr/bin/env python3
"""
Queen Maintenance - treinamento em duas etapas para Qwen2.5-0.5B-Instruct.

Etapa 1 (DAPT/continual pretraining):
  Aprende linguagem real de manutenção a partir de queen_domain_corpus_v1.jsonl.

Etapa 2 (SFT):
  Aprende a responder distinguindo relato técnico de campos cadastrados.

Os dados NÃO devem ser commitados no repositório público.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig, PeftModel, get_peft_model
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    DataCollatorForLanguageModeling,
    Trainer,
    TrainingArguments,
)
from trl import SFTConfig, SFTTrainer

BASE_MODEL = "Qwen/Qwen2.5-0.5B-Instruct"

LORA = dict(
    r=32,
    lora_alpha=64,
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
)


def dtype_kwargs():
    if not torch.cuda.is_available():
        raise RuntimeError("Treinamento requer GPU. A inferência final continuará CPU/RAM no navegador.")
    major, _ = torch.cuda.get_device_capability()
    # Ampere+ prefere bf16; T4 e anteriores usam fp16.
    if major >= 8:
        return {"torch_dtype": torch.bfloat16}, True, False
    return {"torch_dtype": torch.float16}, False, True


def load_base(model_name: str):
    kw, bf16, fp16 = dtype_kwargs()
    tokenizer = AutoTokenizer.from_pretrained(model_name, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        device_map="auto",
        low_cpu_mem_usage=True,
        **kw,
    )
    model.config.use_cache = False
    return model, tokenizer, bf16, fp16


def merge_adapter(base_model: str, adapter_dir: str, out_dir: str):
    kw, _, _ = dtype_kwargs()
    base = AutoModelForCausalLM.from_pretrained(
        base_model,
        device_map="cpu",
        low_cpu_mem_usage=True,
        **kw,
    )
    model = PeftModel.from_pretrained(base, adapter_dir)
    merged = model.merge_and_unload()
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(out_dir, safe_serialization=True, max_shard_size="2GB")
    tok = AutoTokenizer.from_pretrained(base_model, use_fast=True)
    tok.save_pretrained(out_dir)


def train_dapt(args):
    model, tokenizer, bf16, fp16 = load_base(args.base_model)
    model = get_peft_model(model, LoraConfig(**LORA))
    model.print_trainable_parameters()

    ds = load_dataset("json", data_files=args.domain, split="train")
    if args.domain_limit:
        ds = ds.select(range(min(args.domain_limit, len(ds))))

    def tokenize(batch):
        return tokenizer(
            batch["text"],
            truncation=True,
            max_length=args.dapt_max_length,
            padding=False,
        )

    tok = ds.map(tokenize, batched=True, remove_columns=ds.column_names)
    collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)

    out = Path(args.output) / "dapt_adapter"
    training = TrainingArguments(
        output_dir=str(out),
        num_train_epochs=args.dapt_epochs,
        per_device_train_batch_size=args.dapt_batch,
        gradient_accumulation_steps=args.dapt_grad_accum,
        learning_rate=args.dapt_lr,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        weight_decay=0.01,
        logging_steps=25,
        save_strategy="steps",
        save_steps=500,
        save_total_limit=2,
        bf16=bf16,
        fp16=fp16,
        gradient_checkpointing=True,
        report_to="none",
        remove_unused_columns=False,
        seed=args.seed,
    )
    trainer = Trainer(
        model=model,
        args=training,
        train_dataset=tok,
        data_collator=collator,
    )
    trainer.train()
    trainer.save_model(str(out))
    tokenizer.save_pretrained(str(out))

    merged = Path(args.output) / "dapt_merged"
    merge_adapter(args.base_model, str(out), str(merged))
    return str(merged)


def train_sft(args, model_name: str):
    model, tokenizer, bf16, fp16 = load_base(model_name)
    peft = LoraConfig(**LORA)

    train = load_dataset("json", data_files=args.train, split="train")
    valid = load_dataset("json", data_files=args.validation, split="train")

    out = Path(args.output) / "sft_adapter"
    cfg = SFTConfig(
        output_dir=str(out),
        num_train_epochs=args.sft_epochs,
        per_device_train_batch_size=args.sft_batch,
        per_device_eval_batch_size=args.sft_eval_batch,
        gradient_accumulation_steps=args.sft_grad_accum,
        learning_rate=args.sft_lr,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        weight_decay=0.01,
        logging_steps=10,
        eval_strategy="steps",
        eval_steps=100,
        save_strategy="steps",
        save_steps=100,
        save_total_limit=3,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        max_length=args.sft_max_length,
        packing=False,
        assistant_only_loss=True,
        bf16=bf16,
        fp16=fp16,
        gradient_checkpointing=True,
        report_to="none",
        seed=args.seed,
    )

    trainer = SFTTrainer(
        model=model,
        args=cfg,
        train_dataset=train,
        eval_dataset=valid,
        processing_class=tokenizer,
        peft_config=peft,
    )
    trainer.train()
    trainer.save_model(str(out))
    tokenizer.save_pretrained(str(out))

    merged = Path(args.output) / "queen_qwen25_05b_merged"
    merge_adapter(model_name, str(out), str(merged))

    summary = {
        "base_model": args.base_model,
        "sft_base": model_name,
        "domain_file": args.domain,
        "train_file": args.train,
        "validation_file": args.validation,
        "test_file": args.test,
        "output_model": str(merged),
        "runtime_target": "Transformers.js / ONNX / CPU-WASM q8",
    }
    (Path(args.output) / "training_run.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return str(merged)


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--base-model", default=BASE_MODEL)
    p.add_argument("--domain", default="/content/data/queen_domain_corpus_v1.jsonl")
    p.add_argument("--train", default="/content/data/queen_sft_train_v1.jsonl")
    p.add_argument("--validation", default="/content/data/queen_sft_validation_v1.jsonl")
    p.add_argument("--test", default="/content/data/queen_sft_test_v1.jsonl")
    p.add_argument("--output", default="/content/queen_training")

    p.add_argument("--skip-dapt", action="store_true")
    p.add_argument("--domain-limit", type=int, default=0)
    p.add_argument("--dapt-epochs", type=float, default=1.0)
    p.add_argument("--dapt-max-length", type=int, default=512)
    p.add_argument("--dapt-batch", type=int, default=8)
    p.add_argument("--dapt-grad-accum", type=int, default=4)
    p.add_argument("--dapt-lr", type=float, default=1e-4)

    p.add_argument("--sft-epochs", type=float, default=3.0)
    p.add_argument("--sft-max-length", type=int, default=768)
    p.add_argument("--sft-batch", type=int, default=4)
    p.add_argument("--sft-eval-batch", type=int, default=4)
    p.add_argument("--sft-grad-accum", type=int, default=4)
    p.add_argument("--sft-lr", type=float, default=1e-4)
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


def main():
    args = parse_args()
    Path(args.output).mkdir(parents=True, exist_ok=True)

    if args.skip_dapt:
        sft_base = args.base_model
    else:
        sft_base = train_dapt(args)

    final_model = train_sft(args, sft_base)
    print("\nTREINAMENTO CONCLUÍDO")
    print("Modelo mesclado:", final_model)
    print("Próximo passo: avaliação no conjunto de teste e exportação ONNX q8.")


if __name__ == "__main__":
    main()
