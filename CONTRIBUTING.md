# Contributing to TraceLens

Thank you for your interest in contributing to TraceLens! This guide will help you get started with development and submission of contributions.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Reporting Issues](#reporting-issues)

## Getting Started

TraceLens is a modern desktop application built with:

- **Backend**: Rust (async with Tokio)
- **Frontend**: React 18+ with TypeScript and Vite
- **Framework**: Tauri 2.x

Before contributing, familiarize yourself with:

- [Tauri Documentation](https://tauri.app/v2/)
- SEG-Y format specifications (rev0, rev1, rev2.0, rev2.1)

## Development Setup

### Prerequisites

- **Rust**: 1.77.2+ (install via [rustup](https://rustup.rs/))
- **Node.js**: 18+ with npm
- **Platform-specific dependencies**: Follow [Tauri prerequisites](https://tauri.app/v2/guides/getting-started/prerequisites/)

### Optional Tools

- `sccache` for faster Rust builds
- `mold` linker (Linux) for improved link times

### Initial Setup

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd tracelens
   ```

2. Install dependencies:

   ```bash
   npm install
   cd src-tauri && cargo build
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

## Project Structure

```
tracelens/
├── src/                              # React frontend
│   ├── app/                          # App-level components/layout
│   │   └── components/
│   ├── features/                     # Feature slices
│   │   ├── segy/                     # SEG-Y metadata UI
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── types/
│   │   └── trace-visualization/      # Trace rendering UI
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── store/
│   │       └── types/
│   ├── services/                     # External/service adapters
│   │   └── tauri/                    # IPC bridge
│   ├── shared/                       # Reusable UI + utilities
│   │   ├── components/
│   │   ├── hooks/
│   │   └── utils/
│   ├── store/                        # App-level Zustand store
│   ├── App.tsx                       # Root component
│   ├── index.css                     # Global styles
│   └── main.tsx                      # App entry point
└── src-tauri/                        # Rust backend (Tauri v2)
    ├── capabilities/                 # Tauri capability definitions
    ├── icons/                        # App icons
    ├── src/
    │   ├── commands.rs               # Tauri commands
    │   ├── error.rs                  # AppError definitions
    │   ├── lib.rs                    # Library exports
    │   ├── main.rs                   # Tauri entry point
    │   └── segy/                     # SEG-Y parser + rendering
    │       └── rendering/            # PNG renderers, colormaps
    ├── build.rs                      # Tauri build script
    ├── tauri.conf.json               # Tauri configuration
    └── Cargo.toml                    # Rust dependencies
```

## Development Workflow

### Branch Strategy

- Create feature branches from `main`: `feat/feature-name`
- Create bugfix branches: `fix/bug-description`

### Commit Messages

Follow conventional commits:

- `feat: add support for SEG-Y rev2.1 extended headers`
- `fix: resolve parsing error for big-endian data`
- `docs: update installation instructions`
- `refactor: optimize binary deserialization`
- `test: add unit tests for custom field parsing`

### Running Development Environment

```bash
# Frontend development with hot reload
npm run dev

# Build frontend
npm run build

# Run Tauri app in development mode
npm run tauri dev

# Build production app
npm run tauri build
```

## Code Standards

### Rust Guidelines

- **Ownership**: Prefer borrowing; use `Arc`/`Rc` judiciously
- **Error Handling**:
  - Use `thiserror` for library errors
  - Use `anyhow` with `.context()` for application errors
  - Tauri commands return `Result<T, String>`
- **Async**: Use Tokio; avoid blocking operations
- **Naming**: `snake_case` for functions/variables, `PascalCase` for types
- **Documentation**: Use `///` doc comments with examples
- **Linting**: Run `cargo fmt` and `cargo clippy --all-features` before committing

### TypeScript/React Guidelines

- **Strict mode**: Enable TypeScript strict mode; avoid `any`
- **Components**: Functional components with hooks
- **State Management**: Zustand for global state, React Query for server data
- **Error Handling**: Use discriminated unions matching Rust error types
- **Naming**: `camelCase` for functions/variables, `PascalCase` for components
- **IPC**: Use `invoke('command', { camelCaseParams })`
- **Linting**: Run `npm run lint` before committing

### Design Principles

- **UI/UX**: Follow distinctive, production-grade design patterns
- **Performance**: Optimize for speed; avoid unnecessary allocations
- **Security**: Validate all inputs; use least privilege principles
- **Cross-platform**: Test on Windows, macOS, and Linux where possible

## Testing

### Rust Tests

```bash
cd src-tauri
cargo test
```

### Frontend Tests

```bash
npm test
```

### Integration Testing

Test the full application in development mode:

```bash
npm run tauri dev
```

### Test Coverage

- Write unit tests for new Rust functions
- Cover edge cases from SEG-Y specifications
- Test error handling paths
- Validate custom byte parsing logic

## Submitting Changes

### Pull Request Process

1. **Create a branch** for your feature or fix
2. **Make your changes** following code standards
3. **Test thoroughly** (unit tests + manual testing)
4. **Update documentation** if needed
5. **Commit with clear messages** following conventional commits
6. **Push your branch** and open a pull request

### PR Requirements

- [ ] Code follows project style guidelines
- [ ] All tests pass (`cargo test` and `npm test`)
- [ ] Linting passes (`cargo clippy` and `npm run lint`)
- [ ] Documentation updated if applicable
- [ ] Commit messages follow conventional format
- [ ] No breaking changes (or clearly documented)

### Review Process

- Maintainers will review your PR
- Address feedback and update as needed
- Once approved, your PR will be merged

## Reporting Issues

### Bug Reports

Include:

- Operating system and version
- Steps to reproduce
- Expected vs. actual behavior
- SEG-Y file details (revision, size) if applicable
- Error messages or logs

### Feature Requests

Include:

- Clear description of the feature
- Use cases and benefits
- Potential implementation approach
- References to SEG-Y specifications if relevant

### Security Issues

For security vulnerabilities, please contact maintainers directly rather than opening a public issue.

## Questions?

If you have questions about contributing, please:

1. Check existing issues and discussions
2. Open a new issue with your question

Thank you for contributing to TraceLens!
