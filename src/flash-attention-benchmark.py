#!/usr/bin/env python3
"""
Comprehensive Flash Attention Benchmark
Tests different attention implementations across prefill and token generation scenarios
"""

import torch
import torch.nn.functional as F
import time
import gc
import sys
import json
from datetime import datetime
from typing import Optional, Dict, List

# Try importing optional libraries
try:
    from flash_attn import flash_attn_func
    FLASH_ATTN_AVAILABLE = True
except ImportError:
    FLASH_ATTN_AVAILABLE = False

try:
    from xformers.ops import memory_efficient_attention
    XFORMERS_AVAILABLE = True
except ImportError:
    XFORMERS_AVAILABLE = False

try:
    import triton
    import triton.language as tl
    TRITON_AVAILABLE = True
except ImportError:
    TRITON_AVAILABLE = False

print("=" * 70)
print("Flash Attention Comprehensive Benchmark")
print("=" * 70)

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
if not torch.cuda.is_available():
    print("❌ CUDA/ROCm not available")
    sys.exit(1)

print(f"\nDevice: {device}")
print(f"GPU: {torch.cuda.get_device_name(0)}")
print(f"PyTorch version: {torch.__version__}")
print(f"Flash Attention: {'✅ Available' if FLASH_ATTN_AVAILABLE else '❌ Not available'}")
print(f"Triton: {'✅ Available' if TRITON_AVAILABLE else '❌ Not available'}")
print(f"xFormers: {'✅ Available' if XFORMERS_AVAILABLE else '❌ Not available'}")
print(f"PyTorch SDPA: ✅ Available (built-in)")
print(f"torch.compile: {'✅ Available' if hasattr(torch, 'compile') else '❌ Not available'}")

# Configuration
CONFIGS = [
    # Prefill scenarios (long context)
    {"name": "Prefill - Small Batch", "batch": 1, "seq_len": 2048, "scenario": "prefill"},
    {"name": "Prefill - Medium Batch", "batch": 4, "seq_len": 2048, "scenario": "prefill"},
    {"name": "Prefill - Long Context", "batch": 1, "seq_len": 4096, "scenario": "prefill"},
    {"name": "Prefill - Very Long", "batch": 1, "seq_len": 8192, "scenario": "prefill"},
    
    # Token generation scenarios (short context, incremental)
    {"name": "Generation - Single Token", "batch": 1, "seq_len": 1, "kv_len": 2048, "scenario": "generation"},
    {"name": "Generation - Batch 4", "batch": 4, "seq_len": 1, "kv_len": 2048, "scenario": "generation"},
    {"name": "Generation - Batch 8", "batch": 8, "seq_len": 1, "kv_len": 2048, "scenario": "generation"},
    {"name": "Generation - Long Context", "batch": 1, "seq_len": 1, "kv_len": 4096, "scenario": "generation"},
]

# Attention parameters
NUM_HEADS = 32
HEAD_DIM = 128
WARMUP_ITERS = 3
BENCH_ITERS = 10


def manual_attention(q: torch.Tensor, k: torch.Tensor, v: torch.Tensor) -> torch.Tensor:
    """
    Manual attention implementation: O = softmax(QK^T / sqrt(d)) V
    """
    scale = 1.0 / (q.size(-1) ** 0.5)
    attn = torch.matmul(q, k.transpose(-2, -1)) * scale
    attn = torch.softmax(attn, dim=-1)
    out = torch.matmul(attn, v)
    return out


def pytorch_sdpa(q: torch.Tensor, k: torch.Tensor, v: torch.Tensor) -> torch.Tensor:
    """
    PyTorch's scaled_dot_product_attention (may use Flash Attention internally if available)
    """
    return torch.nn.functional.scaled_dot_product_attention(q, k, v)


def flash_attention(q: torch.Tensor, k: torch.Tensor, v: torch.Tensor) -> torch.Tensor:
    """
    Flash Attention 2 implementation
    Expects: (batch, seqlen, nheads, headdim)
    """
    if not FLASH_ATTN_AVAILABLE:
        raise RuntimeError("Flash Attention not available")
    return flash_attn_func(q, k, v)


def xformers_attention(q: torch.Tensor, k: torch.Tensor, v: torch.Tensor) -> torch.Tensor:
    """
    xFormers memory-efficient attention
    Expects: (batch, seqlen, nheads, headdim)
    """
    if not XFORMERS_AVAILABLE:
        raise RuntimeError("xFormers not available")
    return xformers.ops.memory_efficient_attention(q, k, v)


def triton_flash_attention(q: torch.Tensor, k: torch.Tensor, v: torch.Tensor) -> torch.Tensor:
    """
    Triton-based Flash Attention implementation
    Expects: (batch, seqlen, nheads, headdim)
    Note: This may fail with newer Triton versions due to API changes
    """
    if not TRITON_AVAILABLE:
        raise RuntimeError("Triton not available")
    try:
        from flash_attn.flash_attn_triton import flash_attn_func as triton_flash_attn_func
        # Triton flash attention takes positional args only
        return triton_flash_attn_func(q, k, v)
    except (ImportError, AttributeError):
        raise RuntimeError("Triton Flash Attention kernel not available or incompatible")


# Compiled versions - create once and reuse
_compiled_manual = None
_compiled_sdpa = None

def compiled_manual_attention(q: torch.Tensor, k: torch.Tensor, v: torch.Tensor) -> torch.Tensor:
    """Compiled version of manual attention"""
    global _compiled_manual
    if _compiled_manual is None:
        _compiled_manual = torch.compile(manual_attention, mode="max-autotune")
    return _compiled_manual(q, k, v)


def compiled_pytorch_sdpa(q: torch.Tensor, k: torch.Tensor, v: torch.Tensor) -> torch.Tensor:
    """Compiled version of PyTorch SDPA"""
    global _compiled_sdpa
    if _compiled_sdpa is None:
        _compiled_sdpa = torch.compile(pytorch_sdpa, mode="max-autotune")
    return _compiled_sdpa(q, k, v)


def benchmark_impl(
    name: str,
    impl_func,
    q: torch.Tensor,
    k: torch.Tensor,
    v: torch.Tensor,
    warmup: int = WARMUP_ITERS,
    iters: int = BENCH_ITERS
) -> Optional[Dict]:
    """
    Benchmark a single attention implementation
    """
    try:
        # Warmup
        for _ in range(warmup):
            _ = impl_func(q, k, v)
        
        torch.cuda.synchronize()
        
        # Benchmark
        start = time.time()
        for _ in range(iters):
            out = impl_func(q, k, v)
        torch.cuda.synchronize()
        elapsed = time.time() - start
        
        avg_time_ms = (elapsed / iters) * 1000
        
        # Calculate throughput metrics
        batch = q.shape[0]
        seq_len = q.shape[1]
        total_tokens = batch * seq_len
        tokens_per_sec = (total_tokens * iters) / elapsed
        
        # Memory usage
        memory_allocated = torch.cuda.max_memory_allocated() / (1024 ** 3)
        
        return {
            "name": name,
            "time_ms": avg_time_ms,
            "tokens_per_sec": tokens_per_sec,
            "memory_gb": memory_allocated,
            "success": True
        }
    except Exception as e:
        print(f"  ⚠️  {name} failed: {str(e)}")
        return {
            "name": name,
            "success": False,
            "error": str(e)
        }


def run_config(config: Dict) -> List[Dict]:
    """
    Run all attention implementations for a single configuration
    """
    print(f"\n{'=' * 70}")
    print(f"Configuration: {config['name']}")
    print(f"{'=' * 70}")
    
    batch = config["batch"]
    seq_len = config["seq_len"]
    kv_len = config.get("kv_len", seq_len)  # For generation scenarios
    
    print(f"Batch size: {batch}")
    print(f"Query seq length: {seq_len}")
    print(f"Key/Value seq length: {kv_len}")
    print(f"Num heads: {NUM_HEADS}")
    print(f"Head dim: {HEAD_DIM}")
    print(f"Scenario: {config['scenario']}")
    
    # Create input tensors
    # Flash Attention and xFormers expect: (batch, seqlen, nheads, headdim)
    # PyTorch SDPA expects: (batch, nheads, seqlen, headdim)
    
    # Generate for Flash Attention / xFormers format
    q_flash = torch.randn(batch, seq_len, NUM_HEADS, HEAD_DIM, device=device, dtype=torch.float16)
    k_flash = torch.randn(batch, kv_len, NUM_HEADS, HEAD_DIM, device=device, dtype=torch.float16)
    v_flash = torch.randn(batch, kv_len, NUM_HEADS, HEAD_DIM, device=device, dtype=torch.float16)
    
    # Transpose for PyTorch SDPA and manual: (batch, nheads, seqlen, headdim)
    q_torch = q_flash.transpose(1, 2).contiguous()
    k_torch = k_flash.transpose(1, 2).contiguous()
    v_torch = v_flash.transpose(1, 2).contiguous()
    
    results = []
    
    # Benchmark each implementation
    implementations = []
    
    if FLASH_ATTN_AVAILABLE:
        implementations.append(("Flash Attention 2", lambda q, k, v: flash_attention(q, k, v), q_flash, k_flash, v_flash))
    
    if TRITON_AVAILABLE and FLASH_ATTN_AVAILABLE:
        implementations.append(("Triton Flash Attention", lambda q, k, v: triton_flash_attention(q, k, v), q_flash, k_flash, v_flash))
    
    if XFORMERS_AVAILABLE:
        implementations.append(("xFormers", lambda q, k, v: xformers_attention(q, k, v), q_flash, k_flash, v_flash))
    
    implementations.append(("PyTorch SDPA", lambda q, k, v: pytorch_sdpa(q, k, v), q_torch, k_torch, v_torch))
    implementations.append(("Manual (Naive)", lambda q, k, v: manual_attention(q, k, v), q_torch, k_torch, v_torch))
    
    # Add compiled versions if torch.compile is available
    if hasattr(torch, 'compile'):
        implementations.append(("PyTorch SDPA (compiled)", lambda q, k, v: compiled_pytorch_sdpa(q, k, v), q_torch, k_torch, v_torch))
        implementations.append(("Manual (compiled)", lambda q, k, v: compiled_manual_attention(q, k, v), q_torch, k_torch, v_torch))
    
    for impl_name, impl_func, q_input, k_input, v_input in implementations:
        print(f"\nBenchmarking {impl_name}...")
        # Kick off a one-shot warmup so things like torch.compile finish tracing
        try:
            if torch.cuda.is_available():
                torch.cuda.reset_peak_memory_stats()
                torch.cuda.synchronize()
            _ = impl_func(q_input, k_input, v_input)
            if torch.cuda.is_available():
                torch.cuda.synchronize()
        except Exception as warmup_err:
            print(f"  ⚠️  {impl_name} warmup failed: {warmup_err}")
            results.append({
                "name": impl_name,
                "success": False,
                "error": str(warmup_err),
                "config": config["name"],
                "batch": batch,
                "seq_len": seq_len,
                "kv_len": kv_len,
                "scenario": config["scenario"]
            })
            continue

        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()

        result = benchmark_impl(impl_name, impl_func, q_input, k_input, v_input)
        if result and result["success"]:
            print(f"  ✅ {result['time_ms']:.2f} ms | {result['tokens_per_sec']:.0f} tokens/sec | {result['memory_gb']:.2f} GB")
            results.append({
                **result,
                "config": config["name"],
                "batch": batch,
                "seq_len": seq_len,
                "kv_len": kv_len,
                "scenario": config["scenario"]
            })
        else:
            results.append({
                **result,
                "config": config["name"],
                "batch": batch,
                "seq_len": seq_len,
                "kv_len": kv_len,
                "scenario": config["scenario"]
            })
    
    return results


def print_summary(all_results: List[Dict]):
    """
    Print a summary comparison table
    """
    print("\n" + "=" * 70)
    print("SUMMARY - Best Times per Configuration")
    print("=" * 70)
    
    # Group by configuration
    by_config = {}
    for result in all_results:
        if not result.get("success"):
            continue
        config_name = result["config"]
        if config_name not in by_config:
            by_config[config_name] = []
        by_config[config_name].append(result)
    
    for config_name, results in by_config.items():
        print(f"\n{config_name}:")
        # Sort by time
        sorted_results = sorted(results, key=lambda x: x["time_ms"])
        
        baseline_time = sorted_results[-1]["time_ms"]  # Slowest
        
        for i, result in enumerate(sorted_results):
            speedup = baseline_time / result["time_ms"]
            symbol = "🥇" if i == 0 else "🥈" if i == 1 else "🥉" if i == 2 else "  "
            print(f"  {symbol} {result['name']:20s}: {result['time_ms']:7.2f} ms ({speedup:5.2f}x speedup)")
    
    # Overall winner by scenario
    print("\n" + "=" * 70)
    print("WINNERS BY SCENARIO")
    print("=" * 70)
    
    prefill_results = [r for r in all_results if r.get("success") and r.get("scenario") == "prefill"]
    generation_results = [r for r in all_results if r.get("success") and r.get("scenario") == "generation"]
    
    if prefill_results:
        prefill_by_impl = {}
        for r in prefill_results:
            name = r["name"]
            if name not in prefill_by_impl:
                prefill_by_impl[name] = []
            prefill_by_impl[name].append(r["time_ms"])
        
        prefill_avg = {name: sum(times) / len(times) for name, times in prefill_by_impl.items()}
        best_prefill = min(prefill_avg.items(), key=lambda x: x[1])
        print(f"\n🏆 Best for Prefill: {best_prefill[0]} (avg {best_prefill[1]:.2f} ms)")
    
    if generation_results:
        gen_by_impl = {}
        for r in generation_results:
            name = r["name"]
            if name not in gen_by_impl:
                gen_by_impl[name] = []
            gen_by_impl[name].append(r["time_ms"])
        
        gen_avg = {name: sum(times) / len(times) for name, times in gen_by_impl.items()}
        best_gen = min(gen_avg.items(), key=lambda x: x[1])
        print(f"🏆 Best for Generation: {best_gen[0]} (avg {best_gen[1]:.2f} ms)")


# Main benchmark loop
all_results = []

for config in CONFIGS:
    results = run_config(config)
    all_results.extend(results)

# Print summary
print_summary(all_results)

print("\n" + "=" * 70)
print("✅ Benchmark Complete!")
print("=" * 70)
