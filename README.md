# AIBenchy 🚀

One CLI to set up AMD ROCm + PyTorch nightlies and run quick benchmarks. Fun, fast, and focused on AMD GPUs.

Important: AMD only (for now)
- You need an AMD GPU. (No NVIDIA support, I don't think I can distrubute CUDA or cuDNN since its close sourced)
- Linux is the target platform right now.

## TL;DR

```bash
# 1) Install and link the CLI
npm install
npm link

# 2) Detect your system
aibenchy detect

# 3) Install ROCm (interactive, uses sudo for /opt/rocm)
aibenchy rocm

# 4) Install PyTorch for AMD ROCm (interactive)
aibenchy python

# 5) Run benchmarks and save results
aibenchy bench

# 6) View benchmark results
aibenchy view_benchmark
```

That’s it. The tool guides you with friendly prompts and sensible defaults.

## What you get

- Auto-detect AMD GPU + compatible ROCm families
- Pick from ROCm nightly builds and install to `/opt/rocm`
- Set up a Python project with AMD ROCm nightly wheels (torch/vision/audio)
- Optional Flash Attention install
- Simple performance benchmarks that save JSON snapshots
- A web-based viewer to visualize and compare benchmark results.

## Where things go

- ROCm install: `/opt/rocm` (writes `.info/build-info.json`)
- Download cache: `~/.cache/aibenchy/`
- CLI config: `~/.config/aibenchy/config.json`
- Benchmark results: `~/.config/aibenchy/benchmark-results/*.json`
- Project env file: `<your-project>/.env`

## Requirements

- AMD GPU with ROCm support (RDNA/CDNA, e.g., gfx10xx/gfx11xx/gfx9x)
- Linux, with sudo access for installing to `/opt/rocm`
- Python tooling: we use `uv` inside the Python flow

Tip: If you use fish shell, the tool prints fish-friendly env exports as well.

## Commands cheat sheet

- `aibenchy detect` — Show platform, GPU arch, and ROCm compatibility
- `aibenchy rocm` — Guided ROCm install (download → backup → install → verify)
- `aibenchy python` — Guided PyTorch/Flash-Attn install for AMD ROCm nightlies
- `aibenchy bench` — Run basic GPU checks and small benchmarks; saves JSON
- `aibenchy config` — Print current config
- `aibenchy view_benchmark` — Starts a web server to view benchmark results.

## Friendly notes

- The installer backs up any existing `/opt/rocm` to a timestamped `.backup` folder before installing.
- Benchmarks write results you can diff over time and post-process however you like.
- NVIDIA and CPU-only support are on the wishlist. If you need them, open an issue—PRs welcome!

## License

MIT
