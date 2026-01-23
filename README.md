# TraceLens Seismic Data Viewer

A modern, cross-platform desktop application for viewing and analyzing SEG-Y seismic data files.

## Features

- **Multi-Revision Support** - Full compatibility with SEG-Y rev0, rev1, rev2.0, and rev2.1
- **Custom Byte Parsing** - Define and parse custom headers and fields
- **Cloud Integration** - Read files from local storage, S3, GCS, Azure, and HTTPS
- **Optimized Performance** - Efficient binary serialization and deserialization
- **Modern UI** - Distinctive, production-grade interface built with React

## Tech Stack

**Backend**

- Rust with Tokio for async operations
- Tauri for native desktop integration
- Efficient binary parsing with `byteorder`

**Frontend**

- React 19 with TypeScript
- Vite for fast development and builds
- Zustand for state management
- Tailwind CSS for styling

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (1.77.2+)
- [Node.js](https://nodejs.org/) (18+)

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

# Format and code
npm run format
npm run lint

# Format and lint Rust code
cargo fmt
cargo clippy

# Run Rust tests
cargo test
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
