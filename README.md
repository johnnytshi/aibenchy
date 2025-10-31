# AIBenchy - ROCm & PyTorch Installer CLI

A command-line tool to automate installing ROCm and updating PyTorch on your system with interactive prompts.

## Features

- 🤖 **Auto-detect** your AMD GPU and system platform
- 🔍 **Browse** 1,240+ ROCm nightly builds from official S3 bucket
- 🎯 **Filter** compatible builds for your specific GPU architecture
- 📦 **Download** and install ROCm packages to `/opt/rocm`
- 💬 **Interactive prompts** guide you through the entire process
- 🔥 Update PyTorch with ROCm support (coming soon)

## Quick Start

```bash
# Install dependencies
npm install

# Link the CLI tool globally
npm link

# Run the installer
aibenchy install
```

## ROCm Parser

The ROCm parser fetches and parses all available ROCm SDK nightly tarballs from the official S3 bucket.

### Test the Parser

```bash
npm test
```

This will:
1. Fetch all ROCm artifacts from the S3 index
2. Parse the filenames and extract metadata
3. Display available platforms, GPU types, variants, and versions
4. Show examples of filtered results

### Artifact Information

Each parsed artifact contains:
- `filename`: Full filename of the tarball
- `url`: Download URL
- `platform`: linux or windows
- `gpu`: GPU architecture (gfx110X, gfx90X, gfx120X, gfx94X, gfx950, etc.)
- `variant`: Package variant (all, dcgpu, dgpu)
- `rocmVersion`: ROCm version number (e.g., 7.10.0)
- `buildTag`: Build tag (e.g., a20251030 for alpha, rc20251030 for release candidate)
- `buildDate`: Parsed build date (YYYY-MM-DD)
- `fullVersion`: Complete version string

### Filter Options

```javascript
const filtered = filterArtifacts(artifacts, {
  platform: 'linux',        // 'linux' or 'windows'
  gpu: 'gfx110X',          // Specific GPU architecture
  variant: 'all',          // 'all', 'dcgpu', or 'dgpu'
  rocmVersion: '7.10.0',   // Specific ROCm version
  latest: true             // Get only the latest build for each config
});
```

## Usage

### Install ROCm

Run the interactive installer:

```bash
aibenchy install
```

**[📖 See detailed installation walkthrough](INSTALLATION.md)**

This will:
1. Auto-detect your system platform and AMD GPU
2. Fetch all available ROCm builds from the official repository
3. Show you compatible versions for your GPU
4. Let you select the version, variant, and build date
5. Download the selected ROCm package
6. Install it to `/opt/rocm` (requires sudo)
7. Provide environment setup instructions
8. Optionally verify the installation

### Detect Your System

Check what GPU and platform you have:

```bash
aibenchy detect
```

### Get Help

```bash
aibenchy --help
aibenchy install --help
```

## Installation Workflow

Here's what happens when you run `aibenchy install`:

```
🚀 AIBenchy - ROCm Installation Tool

=== Step 1: Detecting Your System ===
Platform: linux
Architecture: x64
GPU: gfx1151 ✅

=== Step 2: Fetching Available ROCm Builds ===
Found 164 compatible builds

=== Step 3: Select ROCm Version ===
? Which ROCm version would you like to install? (Use arrow keys)
❯ ROCm 7.10.0
  ROCm 7.9.0
  ROCm 7.0.0
  ROCm 6.5.0
  ROCm 6.4.0

=== Installation Summary ===
ROCm Version: 7.9.0
GPU: gfx1151
Build Date: 2025-10-08
Install Location: /opt/rocm

? Proceed with installation? (Y/n)
```

## Supported Systems

### Platforms
- ✅ Linux
- ✅ Windows (download only, manual installation required)

### Supported AMD GPU Architectures
- **RDNA 3** (RX 7000 series): gfx1100, gfx1101, gfx1102, gfx1103
- **RDNA 2** (RX 6000 series): gfx1030, gfx1031, gfx1032
- **RDNA 1** (RX 5000 series): gfx1010, gfx1011, gfx1012
- **Vega** (Radeon VII, RX Vega): gfx906, gfx908
- **CDNA** (Instinct MI series): gfx90a, gfx940, gfx941, gfx942, gfx950
- **APU/Mobile**: gfx1150, gfx1151

## Next Steps

- [x] CLI interface for listing and selecting ROCm builds
- [x] Download functionality
- [x] Installation scripts for ROCm
- [x] System detection (auto-detect GPU)
- [ ] PyTorch installation with ROCm support
- [ ] Update existing PyTorch to use ROCm
- [ ] Verify GPU acceleration in PyTorch

## License

MIT
