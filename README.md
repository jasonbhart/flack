# Bolt

A team communication platform optimized for instant performance. Core philosophy: 0ms latency UI, offline-first messaging, minimal bloat.

## Tech Stack

- **Frontend:** Svelte 5 with Runes
- **Backend:** Convex (real-time backend)
- **Desktop:** Tauri v2
- **Styling:** Tailwind CSS v4

## Prerequisites

- Node.js 18+
- npm 9+
- Rust 1.85+ (for desktop app)

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment example and configure
cp .env.example .env
# Edit .env with your Convex deployment URL

# Run Convex dev server (terminal 1)
npx convex dev

# Run Svelte dev server (terminal 2)
npm run dev
```

## Desktop App Development

Tauri v2 requires **Rust 1.85 or newer** (edition 2024 support).

### Prerequisites

```bash
# Install rustup (if not installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Update to latest stable Rust
rustup update stable

# Verify version (should be 1.85+)
rustc --version
```

### Development Workflow

Desktop development requires two terminals running simultaneously:

```bash
# Terminal 1: Start the Svelte dev server
npm run dev

# Terminal 2: Start the Tauri dev app (in a separate terminal)
npm run tauri:dev
```

The Tauri window will open with hot-reload enabled. Changes to Svelte components update live.

### Production Build

```bash
# Build Svelte app first
npm run build

# Build Tauri binary
npm run tauri:build
```

The compiled binary is located at:
- **macOS:** `src-tauri/target/release/bundle/macos/Bolt.app`
- **Windows:** `src-tauri/target/release/bundle/msi/Bolt_0.1.0_x64_en-US.msi`
- **Linux:** `src-tauri/target/release/bundle/appimage/Bolt_0.1.0_amd64.AppImage`

### Linux System Dependencies

On Ubuntu/Debian, install required system libraries:

```bash
sudo apt-get update && sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

On Fedora:

```bash
sudo dnf install webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel
```

On Arch:

```bash
sudo pacman -S webkit2gtk-4.1 gtk3 libayatana-appindicator librsvg
```

### Common Issues

- **"edition2024" error:** Your Rust version is outdated. Run `rustup update stable`
- **"gobject-2.0 not found" error:** Missing Linux system dependencies. See [Linux System Dependencies](#linux-system-dependencies) above
- **Tauri window blank:** Ensure `npm run dev` is running first

## Testing

```bash
# Run unit tests
npm run test

# Run tests once (CI mode)
npm run test:run
```

## Project Structure

```
├── src/                    # Svelte frontend
│   ├── lib/               # Components, stores, utilities
│   └── routes/            # SvelteKit routes
├── convex/                 # Convex backend functions
├── src-tauri/             # Tauri desktop app
│   ├── src/               # Rust source
│   └── capabilities/      # Permission configs
└── static/                # Static assets
```
