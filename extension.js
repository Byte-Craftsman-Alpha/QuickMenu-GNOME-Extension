import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export default class MyMenuExtension extends Extension {
    enable() {
        this._enabled = true;
        this._deviceButtons = new Map(); // serial -> { button, device, appsSubmenu, appsLoaded, apps }
        this._pollTimeoutId = null;
        this._pollingActive = false;

        // Initialize Settings
        const schemaId = this.metadata?.['settings-schema'] || 'org.gnome.shell.extensions.quick-menu';
        this._settings = this.getSettings(schemaId);
        this._settingsSignals = [];

        this._settingsSignals.push(
            this._settings.connect('changed::menu-title', () => this._onMenuTitleChanged()),
            this._settings.connect('changed::menu-items', () => this._buildMenuItems()),
            this._settings.connect('changed::panel-box', () => this._relocatePanelButton()),
            this._settings.connect('changed::panel-position', () => this._relocatePanelButton()),
            this._settings.connect('changed::stick-to-zorin-menu', () => this._ensurePositions()),
            this._settings.connect('changed::enable-adb', () => this._onEnableAdbChanged())
        );

        const initialTitle = this._settings.get_string('menu-title') || 'Options';
        const initialBox = this._settings.get_string('panel-box') || 'left';
        const initialPos = this._settings.get_int('panel-position');

        // ---------------- Options Panel Menu ----------------
        this.button = new PanelMenu.Button(0.0, initialTitle);

        this.label = new St.Label({
            text: initialTitle,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.button.add_child(this.label);

        // Build dynamic menu items from GSettings
        this._buildMenuItems();

        Main.panel.addToStatusArea(
            'quick-menu-indicator',
            this.button,
            initialPos,
            initialBox
        );

        this._ensurePositions();

        // ---------------- Start ADB Device Monitor ----------------
        if (this._settings.get_boolean('enable-adb')) {
            this._startDeviceMonitor();
        }
    }

    // ---------------- SETTINGS HANDLERS ----------------

    _onMenuTitleChanged() {
        if (this.label && this._settings) {
            const title = this._settings.get_string('menu-title') || 'Options';
            this.label.set_text(title);
        }
    }

    _relocatePanelButton() {
        if (!this.button || !this._settings)
            return;

        const box = this._settings.get_string('panel-box') || 'left';
        const position = this._settings.get_int('panel-position');

        if (this.button.container) {
            const parent = this.button.container.get_parent();
            if (parent) {
                parent.remove_child(this.button.container);
            }
        }
        delete Main.panel.statusArea['quick-menu-indicator'];

        Main.panel.addToStatusArea('quick-menu-indicator', this.button, position, box);

        // Also relocate ADB device buttons to the same box if any
        for (const [serial, devData] of this._deviceButtons) {
            if (devData.button?.container) {
                const parent = devData.button.container.get_parent();
                if (parent) {
                    parent.remove_child(devData.button.container);
                }
                delete Main.panel.statusArea[`adb-device-${serial}`];
                Main.panel.addToStatusArea(`adb-device-${serial}`, devData.button, position + 1, box);
            }
        }

        this._ensurePositions();
    }

    _onEnableAdbChanged() {
        if (!this._settings)
            return;

        const enabled = this._settings.get_boolean('enable-adb');
        if (!enabled) {
            if (this._pollTimeoutId) {
                GLib.source_remove(this._pollTimeoutId);
                this._pollTimeoutId = null;
            }
            for (const [serial, devData] of this._deviceButtons) {
                try {
                    devData.button.destroy();
                } catch (e) {
                    // Ignore
                }
            }
            this._deviceButtons.clear();
        } else {
            this._startDeviceMonitor();
        }
    }

    _buildMenuItems() {
        if (!this.button?.menu || !this._settings)
            return;

        this.button.menu.removeAll();

        let items = [];
        try {
            const raw = this._settings.get_string('menu-items');
            items = JSON.parse(raw) || [];
        } catch (e) {
            console.error(`My Menu: Error parsing menu-items: ${e}`);
        }

        for (const item of items) {
            if (item.enabled === false)
                continue;

            const name = item.name || 'Shortcut';
            const icon = item.icon || 'starred-symbolic';

            this.addMenuItemWithIcon(
                this.button.menu,
                name,
                icon,
                () => this._executeItemAction(item)
            );
        }

        // Settings / Preferences action at bottom
        this.button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.addMenuItemWithIcon(
            this.button.menu,
            'Extension Settings',
            'preferences-system-symbolic',
            () => this.openSettings()
        );
    }

    _executeItemAction(item) {
        const target = item.target ? item.target.trim() : '';
        if (!target)
            return;

        switch (item.type) {
            case 'command': {
                try {
                    const [success, argv] = GLib.shell_parse_argv(target);
                    if (success && argv && argv.length > 0) {
                        this.runCommand(argv);
                    } else {
                        this.runCommand([target]);
                    }
                } catch (e) {
                    console.error(`My Menu: Parse command error: ${e}`);
                    this.runCommand([target]);
                }
                break;
            }
            case 'url':
                this.openUrl(target);
                break;
            case 'path':
                this.openPath(target);
                break;
            case 'special-dir': {
                const dirKey = `DIRECTORY_${target.toUpperCase()}`;
                const dirType = GLib.UserDirectory[dirKey] !== undefined
                    ? GLib.UserDirectory[dirKey]
                    : GLib.UserDirectory.DIRECTORY_DOWNLOAD;
                const path = GLib.get_user_special_dir(dirType);
                if (path) {
                    this.openPath(path);
                } else {
                    this.notify(`${item.name || 'Directory'} not found.`);
                }
                break;
            }
            default:
                console.warn(`My Menu: Unknown action type: ${item.type}`);
        }
    }

    openSettings() {
        try {
            if (typeof this.openPreferences === 'function') {
                this.openPreferences();
                return;
            }
        } catch (e) {
            console.error(`My Menu: this.openPreferences() failed: ${e}`);
        }

        try {
            Gio.Subprocess.new(
                ['gnome-extensions', 'prefs', this.metadata.uuid],
                Gio.SubprocessFlags.NONE
            );
        } catch (e) {
            console.error(`My Menu: Failed to spawn gnome-extensions prefs: ${e}`);
            this.notify('Could not open extension preferences.');
        }
    }

    // ---------------- UI ITEM BUILDERS ----------------

    addMenuItemWithIcon(menu, text, iconName, callback, params = {}) {
        const item = new PopupMenu.PopupImageMenuItem(text, iconName, params);
        if (item.label?.clutter_text) {
            item.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            item.label.clutter_text.line_wrap = false;
        }

        if (callback) {
            item.connect('activate', callback);
        }

        menu.addMenuItem(item);
        return item;
    }

    addSubMenuWithIcon(menu, text, iconName) {
        const item = new PopupMenu.PopupSubMenuMenuItem(text, true);
        if (item.icon && iconName) {
            item.icon.icon_name = iconName;
        }
        if (item.label?.clutter_text) {
            item.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            item.label.clutter_text.line_wrap = false;
        }

        menu.addMenuItem(item);
        return item;
    }

    _ensurePositions() {
        if (!this._enabled || !this.button?.container)
            return;

        // Never modify panel layout while any menu is open (prevents menu disappearing/closing)
        if (this.button?.menu?.isOpen)
            return;

        for (const [, devData] of this._deviceButtons) {
            if (devData.button?.menu?.isOpen)
                return;
        }

        const boxName = this._settings ? this._settings.get_string('panel-box') : 'left';
        let box = Main.panel._leftBox;
        if (boxName === 'center')
            box = Main.panel._centerBox;
        else if (boxName === 'right')
            box = Main.panel._rightBox;

        if (!box || !box.contains(this.button.container))
            return;

        const stick = this._settings ? this._settings.get_boolean('stick-to-zorin-menu') : true;

        if (stick && boxName === 'left') {
            // 1. Locate the Zorin Menu container (first element in the panel)
            let zorinContainer = Main.panel.statusArea['zorin-menu']?.container;
            if (!zorinContainer) {
                const children = box.get_children();
                if (children.length > 0 && children[0] !== this.button.container) {
                    zorinContainer = children[0];
                }
            }

            // 2. Lock Options immediately after the Zorin Menu icon only if not already there
            if (zorinContainer && box.contains(zorinContainer)) {
                const children = box.get_children();
                const zorinIdx = children.indexOf(zorinContainer);
                const optionsIdx = children.indexOf(this.button.container);

                if (optionsIdx !== zorinIdx + 1) {
                    box.set_child_above_sibling(this.button.container, zorinContainer);
                }
            }
        }

        // 3. Keep all ADB device buttons in sequence immediately after Options
        let lastIndicator = this.button.container;
        for (const [serial, devData] of this._deviceButtons) {
            if (devData.button?.container && box.contains(devData.button.container)) {
                const currentChildren = box.get_children();
                const lastIdx = currentChildren.indexOf(lastIndicator);
                const devIdx = currentChildren.indexOf(devData.button.container);

                if (devIdx !== lastIdx + 1) {
                    box.set_child_above_sibling(devData.button.container, lastIndicator);
                }
                lastIndicator = devData.button.container;
            }
        }
    }

    notify(message) {
        if (this._enabled)
            Main.notify('My Menu', message);
    }

    openUrl(url) {
        try {
            Gio.AppInfo.launch_default_for_uri(url, null);
        } catch (e) {
            console.error(`My Menu: URL error: ${e}`);
            this.notify('Could not open URL.');
        }
    }

    openPath(path) {
        try {
            const file = Gio.File.new_for_path(path);
            Gio.AppInfo.launch_default_for_uri(file.get_uri(), null);
        } catch (e) {
            console.error(`My Menu: Could not open ${path}: ${e}`);
            this.notify(`Could not open: ${path}`);
        }
    }

    runCommand(argv) {
        try {
            Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
        } catch (e) {
            console.error(`My Menu: Command failed: ${e}`);
            this.notify(`Could not run ${argv[0]}.`);
        }
    }

    findExecutable(name, fallback) {
        return GLib.find_program_in_path(name) || fallback;
    }

    // ---------------- ADB DEVICE MONITORING ----------------

    _startDeviceMonitor() {
        if (this._pollTimeoutId) {
            GLib.source_remove(this._pollTimeoutId);
            this._pollTimeoutId = null;
        }

        this._pollDevices();

        this._pollTimeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            2,
            () => {
                if (!this._enabled)
                    return GLib.SOURCE_REMOVE;

                this._pollDevices();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _pollDevices() {
        if (!this._enabled || this._pollingActive)
            return;

        this._pollingActive = true;
        this._ensurePositions();

        const adb = this.findExecutable('adb', '/usr/local/bin/adb');

        let proc;
        try {
            proc = Gio.Subprocess.new(
                [adb, 'devices', '-l'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
        } catch (e) {
            this._pollingActive = false;
            return;
        }

        proc.communicate_utf8_async(null, null, (source, result) => {
            this._pollingActive = false;
            if (!this._enabled)
                return;

            let stdout = '';
            try {
                const [, out] = source.communicate_utf8_finish(result);
                stdout = out || '';
            } catch (e) {
                return;
            }

            if (!source.get_successful())
                return;

            this._handleDevicesList(stdout);
        });
    }

    _handleDevicesList(output) {
        if (!this._enabled)
            return;

        const currentDevices = new Map();

        for (const line of output.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('List of devices attached') || trimmed.startsWith('* daemon'))
                continue;

            const fields = trimmed.split(/\s+/);
            if (fields.length < 2)
                continue;

            const serial = fields[0];
            const state = fields[1];

            if (state !== 'device')
                continue;

            const match = trimmed.match(/\bmodel:(\S+)/);
            const model = match ? match[1].replace(/_/g, ' ') : serial;

            currentDevices.set(serial, { serial, model, state });
        }

        // Add buttons for newly connected devices
        for (const [serial, devInfo] of currentDevices) {
            if (!this._deviceButtons.has(serial)) {
                this._createDeviceButton(devInfo);
            }
        }

        // Remove buttons for disconnected devices
        let removed = false;
        for (const [serial, devData] of this._deviceButtons) {
            if (!currentDevices.has(serial)) {
                try {
                    devData.button.destroy();
                } catch (e) {
                    // Ignore
                }
                this._deviceButtons.delete(serial);
                removed = true;
            }
        }

        if (removed) {
            this._ensurePositions();
        }
    }

    // ---------------- DEDICATED DEVICE PANEL BUTTON ----------------

    _createDeviceButton(device) {
        const button = new PanelMenu.Button(0.0, device.model);

        const label = new St.Label({
            text: device.model,
            y_align: Clutter.ActorAlign.CENTER,
        });
        button.add_child(label);

        // 1. Header info
        this.addMenuItemWithIcon(
            button.menu,
            device.model,
            'phone-symbolic',
            null,
            { reactive: false }
        );

        button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 2. Scrcpy Mirror Screen
        this.addMenuItemWithIcon(
            button.menu,
            'Mirror',
            'video-display-symbolic',
            () => this.launchScrcpy(device.serial, false)
        );

        // 3. Scrcpy Mirrorless Screen
        this.addMenuItemWithIcon(
            button.menu,
            'Mirrorless',
            'display-symbolic',
            () => this.launchScrcpy(device.serial, true)
        );

        button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 4. ADB Shell in Terminal
        this.addMenuItemWithIcon(
            button.menu,
            'Shell',
            'terminal-symbolic',
            () => this.openAdbShell(device.serial, device.model)
        );

        // 5. Device Storage Submenu
        const storageSubmenu = this.addSubMenuWithIcon(
            button.menu,
            'Storage',
            'system-file-manager-symbolic'
        );

        this.addMenuItemWithIcon(
            storageSubmenu.menu,
            'Files App',
            'system-file-manager-symbolic',
            () => this.launchAppWindow(device.serial, device.model, 'Files', 'com.android.documentsui')
        );

        this.addMenuItemWithIcon(
            storageSubmenu.menu,
            'Browse /sdcard',
            'folder-symbolic',
            () => this.openStorageShell(device.serial, device.model)
        );

        button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 6. Installed Packages / Apps Submenu
        const appsSubmenu = this.addSubMenuWithIcon(
            button.menu,
            'Apps',
            'view-app-grid-symbolic'
        );

        // 7. Quick Utilities
        button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this.addMenuItemWithIcon(
            button.menu,
            'Screenshot',
            'camera-photo-symbolic',
            () => this.takeScreenshot(device.serial, device.model)
        );

        this.addMenuItemWithIcon(
            button.menu,
            'Reboot',
            'system-reboot-symbolic',
            () => this.rebootDevice(device.serial)
        );

        const devData = {
            device,
            button,
            appsSubmenu,
            appsLoaded: false,
            apps: null,
        };

        // Load apps when submenu is expanded
        appsSubmenu.menu.connect('open-state-changed', (_m, isOpen) => {
            if (isOpen && !devData.appsLoaded) {
                this.loadDeviceApps(devData);
            }
        });

        // Add to panel in matching panel box
        const boxName = this._settings ? this._settings.get_string('panel-box') : 'left';
        const position = this._settings ? this._settings.get_int('panel-position') + 1 : 2;
        Main.panel.addToStatusArea(`adb-device-${device.serial}`, button, position, boxName);
        this._deviceButtons.set(device.serial, devData);
        this._ensurePositions();

        // Preload apps in background so clicking Installed Apps is fast
        this.loadDeviceApps(devData);
    }

    // ---------------- SCRCPY & APP LAUNCHING ----------------

    launchScrcpy(serial, mirrorless = false) {
        const scrcpy = this.findExecutable('scrcpy', '/usr/local/bin/scrcpy');
        const argv = [scrcpy, '--serial', serial];

        if (mirrorless)
            argv.push('-S');

        if (this._settings) {
            const extraArgs = this._settings.get_string('scrcpy-extra-args')?.trim();
            if (extraArgs) {
                try {
                    const [ok, parsed] = GLib.shell_parse_argv(extraArgs);
                    if (ok && parsed) {
                        argv.push(...parsed);
                    }
                } catch (e) {
                    console.error(`My Menu: Error parsing scrcpy-extra-args: ${e}`);
                }
            }
        }

        try {
            Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
            console.log(`My Menu: Started scrcpy for ${serial} (mirrorless: ${mirrorless})`);
        } catch (e) {
            console.error(`My Menu: scrcpy launch failed: ${e}`);
            this.notify('Could not start scrcpy.');
        }
    }

    launchAppWindow(serial, model, appName, pkg) {
        const scrcpy = this.findExecutable('scrcpy', '/usr/local/bin/scrcpy');
        const argv = [
            scrcpy,
            '--serial', serial,
            '--new-display',
        ];

        if (this._settings) {
            if (this._settings.get_boolean('scrcpy-no-audio')) {
                argv.push('--no-audio');
            }
            if (this._settings.get_boolean('scrcpy-stay-awake')) {
                argv.push('--stay-awake');
            }

            const maxSize = this._settings.get_int('scrcpy-max-size');
            if (maxSize > 0) {
                argv.push(`--max-size=${maxSize}`);
            }

            const bitrate = this._settings.get_string('scrcpy-bitrate');
            if (bitrate) {
                argv.push(`--video-bit-rate=${bitrate}`);
            }

            const extraArgs = this._settings.get_string('scrcpy-extra-args')?.trim();
            if (extraArgs) {
                try {
                    const [ok, parsed] = GLib.shell_parse_argv(extraArgs);
                    if (ok && parsed) {
                        argv.push(...parsed);
                    }
                } catch (e) {
                    console.error(`My Menu: Error parsing scrcpy-extra-args: ${e}`);
                }
            }
        } else {
            argv.push('--no-audio', '--stay-awake', '--max-size=1280', '--video-bit-rate=4M');
        }

        argv.push(
            '--no-vd-destroy-content',
            `--window-title=${appName} (${model})`,
            `--start-app=${pkg}`
        );

        try {
            Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
            console.log(`My Menu: Started app ${pkg} for ${serial} on separate window`);
        } catch (e) {
            console.error(`My Menu: Failed to launch app ${pkg}: ${e}`);
            this.notify(`Could not start ${appName}.`);
        }
    }

    openAdbShell(serial, model) {
        const terminal = this.findExecutable('x-terminal-emulator', 'gnome-terminal');
        const adb = this.findExecutable('adb', '/usr/local/bin/adb');

        try {
            Gio.Subprocess.new(
                [terminal, '--', adb, '-s', serial, 'shell'],
                Gio.SubprocessFlags.NONE
            );
        } catch (e) {
            console.error(`My Menu: Failed to open ADB shell: ${e}`);
            this.notify('Could not open terminal emulator.');
        }
    }

    openStorageShell(serial, model) {
        const terminal = this.findExecutable('x-terminal-emulator', 'gnome-terminal');
        const adb = this.findExecutable('adb', '/usr/local/bin/adb');

        try {
            Gio.Subprocess.new(
                [terminal, '--', adb, '-s', serial, 'shell', '-t', 'cd /sdcard && exec sh -l'],
                Gio.SubprocessFlags.NONE
            );
        } catch (e) {
            console.error(`My Menu: Failed to open storage shell: ${e}`);
            this.notify('Could not open terminal emulator.');
        }
    }

    takeScreenshot(serial, model) {
        const adb = this.findExecutable('adb', '/usr/local/bin/adb');
        const picturesDir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES) || GLib.get_home_dir();
        const safeModel = model.replace(/\s+/g, '_');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = GLib.build_filenamev([picturesDir, `Screenshot_${safeModel}_${timestamp}.png`]);

        try {
            const sh = this.findExecutable('sh', '/bin/sh');
            const cmd = `"${adb}" -s "${serial}" exec-out screencap -p > "${filename}"`;
            const proc = Gio.Subprocess.new([sh, '-c', cmd], Gio.SubprocessFlags.NONE);

            proc.wait_async(null, (source, result) => {
                try {
                    if (source.wait_finish(result)) {
                        this.notify('Screenshot saved to Pictures folder.');
                        this.openPath(filename);
                    }
                } catch (e) {
                    console.error(`My Menu: Screenshot wait error: ${e}`);
                }
            });
        } catch (e) {
            console.error(`My Menu: Screenshot failed: ${e}`);
            this.notify('Could not capture screenshot.');
        }
    }

    rebootDevice(serial) {
        const adb = this.findExecutable('adb', '/usr/local/bin/adb');
        try {
            Gio.Subprocess.new([adb, '-s', serial, 'reboot'], Gio.SubprocessFlags.NONE);
            this.notify('Device reboot signal sent.');
        } catch (e) {
            console.error(`My Menu: Reboot failed: ${e}`);
            this.notify('Could not reboot device.');
        }
    }

    // ---------------- APP PACKAGE DISCOVERY ----------------

    loadDeviceApps(devData) {
        const { device, appsSubmenu } = devData;
        const menu = appsSubmenu.menu;

        if (menu.numMenuItems === 0) {
            const loadingItem = new PopupMenu.PopupMenuItem('Loading apps...');
            loadingItem.setSensitive(false);
            menu.addMenuItem(loadingItem);
        }

        const scrcpy = this.findExecutable('scrcpy', '/usr/local/bin/scrcpy');
        let proc;
        try {
            proc = Gio.Subprocess.new(
                [scrcpy, '--serial', device.serial, '--list-apps'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
        } catch (e) {
            console.error(`My Menu: Could not list apps with scrcpy: ${e}`);
            this._fallbackLoadAppsWithAdb(devData);
            return;
        }

        proc.communicate_utf8_async(null, null, (source, result) => {
            if (!this._enabled || !this._deviceButtons.has(device.serial))
                return;

            let stdout = '';
            try {
                const [, out] = source.communicate_utf8_finish(result);
                stdout = out || '';
            } catch (e) {
                this._fallbackLoadAppsWithAdb(devData);
                return;
            }

            const { userApps, systemApps } = this.parseScrcpyApps(stdout);

            if (userApps.length === 0 && systemApps.length === 0) {
                this._fallbackLoadAppsWithAdb(devData);
                return;
            }

            devData.appsLoaded = true;
            devData.apps = { userApps, systemApps };
            this.populateAppsMenu(devData);
        });
    }

    _fallbackLoadAppsWithAdb(devData) {
        const { device } = devData;
        const adb = this.findExecutable('adb', '/usr/local/bin/adb');

        let proc;
        try {
            proc = Gio.Subprocess.new(
                [adb, '-s', device.serial, 'shell', 'pm', 'list', 'packages', '-3'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
        } catch (e) {
            return;
        }

        proc.communicate_utf8_async(null, null, (source, result) => {
            if (!this._enabled || !this._deviceButtons.has(device.serial))
                return;

            let stdout = '';
            try {
                const [, out] = source.communicate_utf8_finish(result);
                stdout = out || '';
            } catch (e) {
                return;
            }

            const userApps = [];
            for (const line of stdout.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (trimmed.startsWith('package:')) {
                    const pkg = trimmed.substring(8).trim();
                    if (pkg) {
                        const parts = pkg.split('.');
                        const rawName = parts[parts.length - 1];
                        const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
                        userApps.push({ name, pkg, isUser: true });
                    }
                }
            }

            userApps.sort((a, b) => a.name.localeCompare(b.name));
            devData.appsLoaded = true;
            devData.apps = { userApps, systemApps: [] };
            this.populateAppsMenu(devData);
        });
    }

    parseScrcpyApps(output) {
        const userApps = [];
        const systemApps = [];

        for (const line of output.split(/\r?\n/)) {
            const match = line.match(/^\s*([*-])\s+(.+?)\s{2,}(\S+)\s*$/);
            if (match) {
                const isUser = match[1] === '-';
                const name = match[2].trim();
                const pkg = match[3].trim();
                const app = { name, pkg, isUser };

                if (isUser)
                    userApps.push(app);
                else
                    systemApps.push(app);
            }
        }

        userApps.sort((a, b) => a.name.localeCompare(b.name));
        systemApps.sort((a, b) => a.name.localeCompare(b.name));

        return { userApps, systemApps };
    }

    populateAppsMenu(devData) {
        const { device, appsSubmenu, apps } = devData;
        const menu = appsSubmenu.menu;
        menu.removeAll();

        // Refresh action with symbolic icon
        this.addMenuItemWithIcon(
            menu,
            'Refresh Apps',
            'view-refresh-symbolic',
            () => {
                devData.appsLoaded = false;
                this.loadDeviceApps(devData);
            }
        );

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        if (apps.userApps.length === 0 && apps.systemApps.length === 0) {
            const noApps = new PopupMenu.PopupMenuItem('No apps found');
            noApps.setSensitive(false);
            menu.addMenuItem(noApps);
            return;
        }

        // User installed apps
        if (apps.userApps.length > 0) {
            for (const app of apps.userApps) {
                this.addMenuItemWithIcon(
                    menu,
                    app.name,
                    'application-x-executable-symbolic',
                    () => this.launchAppWindow(device.serial, device.model, app.name, app.pkg)
                );
            }
        }

        // System apps
        if (apps.systemApps.length > 0) {
            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('System Apps'));
            for (const app of apps.systemApps) {
                this.addMenuItemWithIcon(
                    menu,
                    app.name,
                    'applications-other-symbolic',
                    () => this.launchAppWindow(device.serial, device.model, app.name, app.pkg)
                );
            }
        }
    }

    // ---------------- CLEANUP ----------------

    disable() {
        this._enabled = false;

        // Disconnect settings signals
        if (this._settings && this._settingsSignals) {
            for (const sigId of this._settingsSignals) {
                this._settings.disconnect(sigId);
            }
            this._settingsSignals = [];
        }
        this._settings = null;

        // Stop polling
        if (this._pollTimeoutId) {
            GLib.source_remove(this._pollTimeoutId);
            this._pollTimeoutId = null;
        }

        // Remove all device buttons from panel
        for (const [serial, devData] of this._deviceButtons) {
            try {
                devData.button.destroy();
            } catch (e) {
                // Ignore
            }
        }
        this._deviceButtons.clear();

        // Destroy Options button
        this.button?.destroy();
        this.button = null;
        this.label = null;
    }
}
