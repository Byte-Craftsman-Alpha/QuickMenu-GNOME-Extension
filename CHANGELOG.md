# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2026-10-29

### Added
- **Native Libadwaita Preferences Window (`prefs.js`)**:
  - Full graphical editor for shortcuts (Terminal commands, URLs, Paths, XDG directories).
  - Ability to add, edit, delete, reorder, and toggle items on/off.
  - Position index selector and panel box placement (Left, Center, Right).
  - Pin to start / Zorin menu lock toggle.
  - ADB Device Manager toggle.
  - Scrcpy streaming controls (Max resolution selector, bitrate selector, stay-awake switch, audio mute switch, extra CLI arguments).
- **Automated ADB Device Integration**:
  - Real-time detection of connected Android devices via background ADB polling.
  - Dedicated dynamic panel indicators for each connected device.
  - Full screen mirroring (`scrcpy`) and mirrorless control (`scrcpy -S`).
  - Terminal ADB shell launcher and storage shell (`/sdcard`).
  - Background discovery of installed user and system packages.
  - Multi-window independent app launching (`scrcpy --new-display`) with resolution and bitrate bounding.
  - Quick utility actions (Screenshot directly saved to Pictures, Device Reboot).
- **GSettings Schema**:
  - Defined under `org.gnome.shell.extensions.quick-menu`.
  - Dynamic live reloading without requiring GNOME Shell restarts.
- **Packaging & CI Automation**:
  - Automated GitHub Actions CI workflow for syntax checks and schema compilation.
  - Automated Release workflow to build and attach `.shell-extension.zip` on version tags.
  - `Makefile` for building, packaging, installing, and linting.

### Changed
- Replaced outdated icons with modern macOS/iOS-style symbolic icons (`*-symbolic`).
- Removed all emojis across menus and headers for a sleek, modern desktop appearance.
- Eliminated tooltip popups and hover layout invalidations to ensure smooth cursor movement and prevent panel menu auto-closing.

---

## [1.0.0] - Initial Release

- Initial panel menu implementation for quick static shortcuts.
