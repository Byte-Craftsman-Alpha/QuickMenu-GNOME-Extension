# Quick Menu & ADB Manager

[![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-45%20|%2046%20|%2047%20|%2048-blue.svg)](https://extensions.gnome.org/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-green.svg)](LICENSE)
[![Platform: Linux](https://img.shields.io/badge/Platform-Linux-orange.svg)](#requirements)
[![CI Validation](https://github.com/Byte-Craftsman-Alpha/QuickMenu-GNOME-Extension/actions/workflows/ci.yml/badge.svg)](https://github.com/Byte-Craftsman-Alpha/QuickMenu-GNOME-Extension/actions)

A modern, native GNOME Shell extension providing a customizable quick-access top panel menu for application shortcuts, web bookmarks, and folder paths, paired with automatic **Android ADB device detection** and **multi-window app streaming** powered by `scrcpy`.

---

## Highlights

- **Fully Customizable Menu**: Add, edit, reorder, and toggle terminal commands, web URLs, file paths, and special system folders (Downloads, Documents, etc.) directly from a native Libadwaita preferences window.
- **Dynamic ADB Device Indicators**: Automatically detects connected Android phones and tablets via ADB and creates dedicated top panel menus for each device.
- **Multi-Window Android App Streaming**: Launch individual Android apps into independent desktop windows using `scrcpy --new-display`. Run multiple apps concurrently without mirroring the entire phone screen.
- **Hardware-Optimized Performance**: Configurable resolution caps (1024px, 1280px, 1920px), video bitrates, automatic screen wake-locks, and audio muting to avoid mobile MediaCodec encoder overload and screen freezing.
- **Clean macOS/iOS Symbolic UI**: Strict adherence to modern GNOME symbolic icon guidelines with zero emojis and elliptical text.
- **Panel Placement Controls**: Lock the menu right next to your Start/Zorin menu or place it anywhere in the left, center, or right panel sections.

---

## Requirements

1. **GNOME Shell**: 45, 46, 47, or 48.
2. **ADB (Android Debug Bridge)**:
   ```bash
   sudo apt install adb
   ```
3. **Scrcpy (v2.0 or newer recommended)**:
   ```bash
   sudo apt install scrcpy
   ```

---

## Recommended Android Developer Settings

To run multiple Android applications simultaneously in independent desktop windows with resizable borders, enable the following flags on your Android device:

1. Open **Settings** > **About Phone** and tap **Build Number** 7 times to enable Developer Options.
2. Go to **Settings** > **System** > **Developer Options** and enable:
   - **USB Debugging**
   - **Force activities to be resizable** *(Permits apps without multi-window support to be resized)*
   - **Enable freeform windows** *(Allows floating, movable, and resizable app windows)*
3. Restart your phone after toggling these options.

> **Why did multi-window apps freeze previously?**  
> Mobile hardware chips have hardware limits on the number of simultaneous active video encoding streams. By default, this extension configures `--no-audio` (preventing `AudioPlaybackCapture` deadlock), `--stay-awake` (preventing display sleep), and limits stream resolution to `1280px` at `4 Mbps`, ensuring smooth parallel operation.

---

## Extension Preferences

You can customize every aspect of the extension via **GNOME Extension Manager**, **GNOME Extensions app**, or by clicking **Extension Settings** inside the menu:

### 1. Menu & Shortcuts Page
- **Menu Title**: Customize the panel button text (defaults to `Options`).
- **Panel Placement**: Choose between Left, Center, or Right sections with custom ordering.
- **Lock Next to Start Menu**: Keeps the menu pinned immediately adjacent to the Zorin OS / GNOME application launcher.
- **Shortcut Editor**:
  - **Action Types Supported**:
    - `Terminal Command / Executable`: Runs any CLI binary or terminal program (e.g. `x-terminal-emulator`, `btop`, `code`).
    - `Web URL`: Opens web applications or websites in your default browser (e.g. `https://web.whatsapp.com`).
    - `Folder / File Path`: Opens a directory or file in the default file manager.
    - `Special User Directory`: Directly resolves XDG folders such as `DOWNLOAD`, `DOCUMENTS`, `PICTURES`, `VIDEOS`.
  - Reorder items up and down or toggle visibility with switches.

### 2. Android & Scrcpy Page
- **Enable ADB Integration**: Toggle automatic device detection on or off.
- **Max Resolution**: Set 1024px, 1280px (recommended), 1920px, or native.
- **Stream Bitrate**: Choose between 2 Mbps, 4 Mbps, 8 Mbps, or 16 Mbps.
- **Keep Device Awake**: Keeps the phone awake while streaming apps.
- **Mute Audio in App Windows**: Prevents audio pipeline congestion when running several apps at once.
- **Extra scrcpy Arguments**: Supply custom flags (e.g. `--turn-screen-off`, `--keyboard=uhid`).

---

## Installation & Build

### From Source (Makefile)

1. Clone this repository:
   ```bash
   git clone https://github.com/Byte-Craftsman-Alpha/QuickMenu-GNOME-Extension.git
   cd QuickMenu-GNOME-Extension
   ```

2. Compile GSettings schemas and install:
   ```bash
   make install
   ```

3. Enable the extension:
   ```bash
   gnome-extensions enable quick-menu@byte-craftsman-alpha
   ```
   *(On X11, you can also press `Alt+F2`, type `r`, and hit `Enter` to restart GNOME Shell)*.

### Building a Release Package (`.zip`)

To build a distributable package ready for [extensions.gnome.org](https://extensions.gnome.org):

```bash
make pack
```

This compiles schemas and generates `quick-menu@byte-craftsman-alpha.shell-extension.zip`.

---

## Directory Structure

```text
QuickMenu-GNOME-Extension/
├── extension.js            # Main GNOME Shell extension logic & ADB monitor
├── prefs.js                # Libadwaita (Adw) GTK4 settings interface
├── metadata.json           # Extension metadata & schema binding
├── schemas/
│   ├── org.gnome.shell.extensions.quick-menu.gschema.xml
│   └── gschemas.compiled   # Compiled GSettings binary
├── .github/
│   ├── workflows/          # CI and automated GitHub release workflows
│   └── ISSUE_TEMPLATE/     # Standardized bug report & feature request forms
├── CONTRIBUTING.md         # Guidelines for contributors
├── CHANGELOG.md            # Version release log
├── Makefile                # Build, pack, and installation automation
├── LICENSE                 # GNU General Public License v3.0
└── README.md               # Documentation & usage guide
```

---

## Contributing

Contributions, bug reports, and suggestions are warmly welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on code style, testing, and pull request workflows.

---

## License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**. See [LICENSE](LICENSE) for details.
