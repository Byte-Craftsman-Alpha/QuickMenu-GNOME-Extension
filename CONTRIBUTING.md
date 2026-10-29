# Contributing to Quick Menu & ADB Manager

First off, thank you for considering contributing to **Quick Menu & ADB Manager**! It's people like you that make open source such a great community.

---

## Code of Conduct

Please be respectful, constructive, and considerate in all communications, issues, and pull requests.

---

## How Can I Contribute?

### Reporting Bugs

Before creating a bug report, please check existing issues to see if the problem has already been reported.

When creating a bug report, please include:
- Your Linux distribution and version (e.g. Ubuntu 24.04, Zorin OS 17.2, Fedora 40).
- GNOME Shell version (`gnome-shell --version`).
- Output of `scrcpy --version` and `adb version`.
- Clear steps to reproduce the issue.
- Relevant GNOME Shell log excerpts:
  ```bash
  journalctl -b /usr/bin/gnome-shell -n 50 --no-pager
  ```

### Suggesting Enhancements

Feature requests and ideas are welcome! Please open an issue using the Feature Request template describing:
- The problem or use-case you are trying to solve.
- Your proposed solution or desired behavior.
- Any alternative approaches you've considered.

### Pull Requests

1. **Fork** the repository and create your branch from `main`:
   ```bash
   git checkout -b feature/my-new-feature
   ```

2. **Code Style & Guidelines**:
   - Modern ES Modules syntax (`import` / `export`).
   - Clean indentation (4 spaces).
   - Follow GNOME Shell HIG (Human Interface Guidelines).
   - Use standard symbolic icons (`*-symbolic`); do **not** use emojis in labels or menus.
   - All text that can exceed bounds should have appropriate ellipsization (`Pango.EllipsizeMode.END`).

3. **Verify Syntax & Schemas**:
   ```bash
   make lint
   make schemas
   make pack
   ```

4. **Test Locally**:
   Install your changes locally with:
   ```bash
   make install
   ```
   Reload GNOME Shell and verify that settings, actions, and device menus work smoothly without errors in `journalctl`.

5. **Submit PR**:
   Open a pull request describing what you changed, why, and how it was tested.

---

## License

By contributing, you agree that your contributions will be licensed under the **GNU General Public License v3.0 (GPL-3.0)**.
