# TraceLens Seismic Data Viewer

A modern, cross-platform desktop application for viewing and inspecting SEG-Y seismic data files.

![TraceLens app snapshot](docs/assets/screenshot.png)
Parihaka 3D seismic data courtesy of New Zealand Petroleum and Minerals (NZPM) / New Zealand Crown
Minerals, supplied as a public dataset.

## Download

Grab the latest installer for your platform from the
[**Releases**](https://github.com/tasansal/tracelens/releases/latest) page.

| Platform | File | Notes |
|----------|------|-------|
| macOS (Apple Silicon) | `tracelens_*_aarch64.dmg` | M-series Macs |
| macOS (Intel) | `tracelens_*_x64.dmg` | Intel Macs |
| Windows 10/11 | `tracelens_*_x64-setup.exe` | Per-user install; no admin needed |
| Linux (universal) | `tracelens_*_amd64.AppImage` | Runs on most distros; self-updating |
| Linux (Debian/Ubuntu) | `tracelens_*_amd64.deb` | Native install + menu integration |
| Linux (Rocky/RHEL/Fedora) | `tracelens_*_amd64.flatpak` | `flatpak install tracelens_*.flatpak` |

The app is currently **unsigned**, so on first launch macOS ("unidentified
developer") and Windows SmartScreen will warn you. On macOS, right-click the app
and choose **Open**; on Windows, click **More info → Run anyway**.

The macOS `.dmg`, Windows `.exe`, and Linux `.AppImage` builds auto-update from
GitHub Releases. Flatpak updates via `flatpak update`; `.deb` users re-download.

## Building installers locally

Installers are normally produced by the tag-triggered `release` workflow, but you
can build them by hand.

**Prerequisites:** Node 22, the Rust toolchain, and the platform's Tauri
[system dependencies](https://v2.tauri.app/start/prerequisites/). On Debian/Ubuntu:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

**Build for the current platform:**

```bash
npm ci
npm run tauri build
```

**macOS — build a specific architecture:**

```bash
npm run tauri build -- --target aarch64-apple-darwin   # Apple Silicon
npm run tauri build -- --target x86_64-apple-darwin    # Intel
```

Artifacts are written under `src-tauri/target/release/bundle/`.

**Flatpak (Linux):**

```bash
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install -y flathub org.gnome.Platform//48 org.gnome.Sdk//48
# Build the .deb first (npm run tauri build), then copy it to ./tracelens.deb
flatpak-builder --force-clean --repo=flatpak-repo flatpak-build flatpak/com.tracelens.desktop.yml
flatpak build-bundle flatpak-repo tracelens.flatpak com.tracelens.desktop
```

> Locally built binaries are **not** updater-signed unless you export
> `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` before
> building. Unsigned local builds still run; they just can't publish updates.

## Features

- **Multi-Revision SEG-Y Parsing** - Automatic revision detection (Rev 0 / Rev 1) with manual override when detection is ambiguous
- **Schema-Driven Header Inspection** - Binary and trace header tables loaded from embedded JSON specs per revision; schema metadata (field counts, byte ranges) visible in the Schema tab
- **Dynamic Header Parsing** - Spec-driven field extraction at runtime — no hardcoded struct rewrites needed for new revisions
- **Spec Validation** - All embedded specs are validated at startup for overlapping byte ranges, duplicate keys, and structural integrity
- **Trace Visualization** - Variable density, wiggle, and combined renders with colormaps and amplitude scaling
- **Interactive Viewport** - Trace range controls, pan/zoom, and resizable panels
- **Performance-Focused I/O** - Memory-mapped reads with on-demand trace loading and async rendering
- **Remote File Support** - Load SEG-Y files from local disk, S3, GCS, Azure Blob Storage, and HTTPS endpoints
- **GPU Accelerated Rendering** - Extremely fast WebGL-based rendering for up to tens of thousands of traces when
- **Tiled Rendering** - Efficient canvas rendering with viewport-based tile loading for smooth interaction
- **Settings Persistence** - User preferences saved between sessions

## Upcoming / Future Features

- **SEG-Y Rev 2.0 / Rev 2.1 Support** - Extended header and variable trace length parsing
- **Custom Header Definitions** - User-defined field specs and overrides with save/load workflows

## Tech Stack

**Backend**

- Rust with Tokio for async operations
- Tauri for native desktop integration
- Efficient binary parsing with `byteorder`
- Memory-mapped file I/O for local files
- Cloud storage integrations (S3, GCS, Azure Blob Storage, HTTP)

**Frontend**

- React 19 with TypeScript
- Vite for fast development and builds
- Zustand for state management
- Tailwind CSS and shadcn/ui components for styling
- Lucide React for icons
- Tauri plugin system for dialogs, processes, and updates

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (1.94.1+)
- [Node.js](https://nodejs.org/) (20+)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd tracelens

# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Build

```bash
# Build for production
npm run tauri build
```

## Development

```bash
# Run frontend dev server
npm run dev

# Format and lint frontend code
npm run format
npm run lint

# Format and lint Rust code
cd src-tauri && cargo fmt
cd src-tauri && cargo clippy

# Run Rust tests
cd src-tauri && cargo test
```

## Platform Support

- Windows
- macOS
- Linux

## License

Licensed under either of

- Apache License, Version 2.0 (see `LICENSE-APACHE`)
- MIT license (see `LICENSE-MIT`)

at your option.
