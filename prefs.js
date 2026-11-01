import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function getMenuItems(settings) {
    try {
        const raw = settings.get_string('menu-items');
        return JSON.parse(raw) || [];
    } catch (e) {
        return [];
    }
}

function saveMenuItems(settings, items) {
    settings.set_string('menu-items', JSON.stringify(items));
}

export default class QuickMenuPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const schemaId = this.metadata?.['settings-schema'] || 'org.gnome.shell.extensions.quick-menu';
        const settings = this.getSettings(schemaId);
        window._settings = settings;
        window.default_width = 650;
        window.default_height = 700;

        const page1 = new Adw.PreferencesPage({
            title: _('Menu and Shortcuts'),
            icon_name: 'view-list-bullet-symbolic',
        });

        const panelGroup = new Adw.PreferencesGroup({
            title: _('Panel Placement'),
            description: _('Configure where and how the menu appears on the top panel.'),
        });

        const titleRow = new Adw.EntryRow({
            title: _('Menu Title Label'),
            text: settings.get_string('menu-title'),
        });
        titleRow.connect('changed', (entry) => {
            settings.set_string('menu-title', entry.text || 'Options');
        });
        panelGroup.add(titleRow);

        const boxModel = new Gtk.StringList();
        boxModel.append(_('Left'));
        boxModel.append(_('Center'));
        boxModel.append(_('Right'));

        const currentBox = settings.get_string('panel-box');
        const boxMap = ['left', 'center', 'right'];
        const boxCombo = new Adw.ComboRow({
            title: _('Panel Section'),
            model: boxModel,
            selected: Math.max(0, boxMap.indexOf(currentBox)),
        });
        boxCombo.connect('notify::selected', (widget) => {
            settings.set_string('panel-box', boxMap[widget.selected] || 'left');
        });
        panelGroup.add(boxCombo);

        const posAdjustment = new Gtk.Adjustment({
            lower: 0,
            upper: 30,
            step_increment: 1,
            page_increment: 5,
            value: settings.get_int('panel-position'),
        });
        const posRow = new Adw.SpinRow({
            title: _('Position Order Index'),
            subtitle: _('Order within the selected panel section (lower numbers are closer to the edge).'),
            adjustment: posAdjustment,
        });
        posRow.connect('notify::value', (widget) => {
            settings.set_int('panel-position', Math.round(widget.value));
        });
        panelGroup.add(posRow);

        const stickSwitch = new Adw.SwitchRow({
            title: _('Lock Next to Start Menu'),
            subtitle: _('Keeps the menu pinned right after the Zorin/Start menu icon on the left.'),
            active: settings.get_boolean('stick-to-zorin-menu'),
        });
        settings.bind('stick-to-zorin-menu', stickSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(stickSwitch);

        page1.add(panelGroup);

        const itemsGroup = new Adw.PreferencesGroup({
            title: _('Menu Shortcuts'),
            description: _('Custom links, folders, and applications in your menu dropdown.'),
        });

        const addHeaderButton = new Gtk.Button({
            label: _('Add Shortcut'),
            icon_name: 'list-add-symbolic',
            css_classes: ['suggested-action'],
            valign: Gtk.Align.CENTER,
        });
        addHeaderButton.connect('clicked', () => {
            this._showItemDialog(window, settings, null, () => this._refreshItemsList(itemsGroup, settings, window));
        });
        itemsGroup.set_header_suffix(addHeaderButton);

        this._refreshItemsList(itemsGroup, settings, window);
        page1.add(itemsGroup);
        window.add(page1);

        const page2 = new Adw.PreferencesPage({
            title: _('Android and Scrcpy'),
            icon_name: 'phone-symbolic',
        });

        const depCheckGroup = new Adw.PreferencesGroup({
            title: _('System Prerequisites'),
        });

        const adbPath = GLib.find_program_in_path('adb') || (GLib.file_test('/usr/local/bin/adb', GLib.FileTest.IS_EXECUTABLE) ? '/usr/local/bin/adb' : null);
        const scrcpyPath = GLib.find_program_in_path('scrcpy') || (GLib.file_test('/usr/local/bin/scrcpy', GLib.FileTest.IS_EXECUTABLE) ? '/usr/local/bin/scrcpy' : null);
        const allDepsFound = adbPath && scrcpyPath;

        const prereqRow = new Adw.ActionRow({
            title: allDepsFound ? _('Dependencies Detected') : _('Missing System Dependencies'),
            subtitle: allDepsFound
                ? `adb: ${adbPath}\nscrcpy: ${scrcpyPath}`
                : _('Run in terminal: sudo apt install adb scrcpy'),
        });

        const prereqIcon = new Gtk.Image({
            icon_name: allDepsFound ? 'emblem-ok-symbolic' : 'dialog-warning-symbolic',
            pixel_size: 24,
        });
        prereqRow.add_prefix(prereqIcon);

        if (!allDepsFound) {
            const copyBtn = new Gtk.Button({
                label: _('Copy Install Command'),
                icon_name: 'edit-copy-symbolic',
                valign: Gtk.Align.CENTER,
            });
            copyBtn.connect('clicked', () => {
                const clipboard = Gdk.Display.get_default()?.get_clipboard();
                if (clipboard) {
                    clipboard.set('sudo apt install adb scrcpy');
                    copyBtn.set_label(_('Copied!'));
                }
            });
            prereqRow.add_suffix(copyBtn);
        }

        depCheckGroup.add(prereqRow);
        page2.add(depCheckGroup);

        const adbGroup = new Adw.PreferencesGroup({
            title: _('ADB Device Integration'),
            description: _('Control dynamic menus for connected Android devices.'),
        });

        const adbSwitch = new Adw.SwitchRow({
            title: _('Enable ADB Device Menus'),
            subtitle: _('Automatically detect connected devices and display dedicated panel buttons with controls.'),
            active: settings.get_boolean('enable-adb'),
        });
        settings.bind('enable-adb', adbSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        adbGroup.add(adbSwitch);
        page2.add(adbGroup);

        const scrcpyGroup = new Adw.PreferencesGroup({
            title: _('Scrcpy Performance and Multi-Window'),
            description: _('Optimizations for opening multiple app windows simultaneously without screen freezing.'),
        });

        const resModel = new Gtk.StringList();
        resModel.append(_('1024 px (Fast / Low Bandwidth)'));
        resModel.append(_('1280 px (Recommended / Balanced)'));
        resModel.append(_('1920 px (Full HD)'));
        resModel.append(_('Native Phone Resolution (Uncapped)'));
        const resValues = [1024, 1280, 1920, 0];
        const currentRes = settings.get_int('scrcpy-max-size');
        let resIndex = resValues.indexOf(currentRes);
        if (resIndex < 0) resIndex = 1;

        const resCombo = new Adw.ComboRow({
            title: _('App Window Max Resolution'),
            subtitle: _('Lower resolution allows mobile chips to encode multiple windows concurrently.'),
            model: resModel,
            selected: resIndex,
        });
        resCombo.connect('notify::selected', (widget) => {
            settings.set_int('scrcpy-max-size', resValues[widget.selected] ?? 1280);
        });
        scrcpyGroup.add(resCombo);

        const bitModel = new Gtk.StringList();
        bitModel.append(_('2 Mbps (Low Latency / Smooth)'));
        bitModel.append(_('4 Mbps (Recommended)'));
        bitModel.append(_('8 Mbps (High Quality)'));
        bitModel.append(_('16 Mbps (Ultra)'));
        const bitValues = ['2M', '4M', '8M', '16M'];
        const currentBit = settings.get_string('scrcpy-bitrate');
        let bitIndex = bitValues.indexOf(currentBit);
        if (bitIndex < 0) bitIndex = 1;

        const bitCombo = new Adw.ComboRow({
            title: _('Stream Video Bitrate'),
            subtitle: _('Bitrate allocated per scrcpy app window.'),
            model: bitModel,
            selected: bitIndex,
        });
        bitCombo.connect('notify::selected', (widget) => {
            settings.set_string('scrcpy-bitrate', bitValues[widget.selected] || '4M');
        });
        scrcpyGroup.add(bitCombo);

        const awakeSwitch = new Adw.SwitchRow({
            title: _('Keep Device Awake'),
            subtitle: _('Prevents Android from putting virtual displays and video encoders to sleep during mirroring.'),
            active: settings.get_boolean('scrcpy-stay-awake'),
        });
        settings.bind('scrcpy-stay-awake', awakeSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        scrcpyGroup.add(awakeSwitch);

        const audioSwitch = new Adw.SwitchRow({
            title: _('Mute Audio in App Windows'),
            subtitle: _('Prevents Android AudioPlaybackCapture deadlocks when running multiple app windows at once.'),
            active: settings.get_boolean('scrcpy-no-audio'),
        });
        settings.bind('scrcpy-no-audio', audioSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        scrcpyGroup.add(audioSwitch);

        const extraArgsRow = new Adw.EntryRow({
            title: _('Extra scrcpy CLI Arguments'),
            text: settings.get_string('scrcpy-extra-args'),
        });
        extraArgsRow.connect('changed', (entry) => {
            settings.set_string('scrcpy-extra-args', entry.text || '');
        });
        scrcpyGroup.add(extraArgsRow);

        page2.add(scrcpyGroup);
        window.add(page2);

        const page3 = new Adw.PreferencesPage({
            title: _('About'),
            icon_name: 'help-about-symbolic',
        });

        const aboutGroup = new Adw.PreferencesGroup({
            title: _('Quick Menu and ADB Manager'),
            description: _('Customizable top panel menu for system shortcuts and multi-window Android device control via scrcpy.'),
        });

        const versionStr = this.metadata?.version ? `v${this.metadata.version}` : 'v4.0.0';
        const verRow = new Adw.ActionRow({
            title: _('Version'),
            subtitle: `${versionStr} (Open Source Edition)`,
        });
        aboutGroup.add(verRow);

        const authorRow = new Adw.ActionRow({
            title: _('Author & Maintainer'),
            subtitle: 'Byte-Craftsman-Alpha',
        });
        aboutGroup.add(authorRow);

        const depRow = new Adw.ActionRow({
            title: _('Dependencies'),
            subtitle: _('Requires "adb" and "scrcpy" installed on your Linux system.'),
        });
        aboutGroup.add(depRow);

        const repoRow = new Adw.ActionRow({
            title: _('Source Code Repository'),
            subtitle: 'https://github.com/Byte-Craftsman-Alpha/QuickMenu-GNOME-Extension',
        });
        aboutGroup.add(repoRow);

        page3.add(aboutGroup);
        window.add(page3);
    }

    _refreshItemsList(group, settings, parentWindow) {
        if (group._itemRows) {
            for (const r of group._itemRows)
                group.remove(r);
        }
        group._itemRows = [];

        const items = getMenuItems(settings);

        if (items.length === 0) {
            const emptyRow = new Adw.ActionRow({
                title: _('No shortcuts configured'),
                subtitle: _('Click "+ Add Shortcut" above to create your first menu item.'),
            });
            group.add(emptyRow);
            group._itemRows.push(emptyRow);
            return;
        }

        items.forEach((item, index) => {
            const row = new Adw.ActionRow({
                title: item.name,
                subtitle: `${(item.type || 'command').toUpperCase()}: ${item.target}`,
            });

            const icon = new Gtk.Image({
                icon_name: item.icon || 'application-x-executable-symbolic',
                pixel_size: 24,
            });
            row.add_prefix(icon);

            const enabledSwitch = new Gtk.Switch({
                active: item.enabled !== false,
                valign: Gtk.Align.CENTER,
            });
            enabledSwitch.connect('notify::active', (sw) => {
                items[index].enabled = sw.active;
                saveMenuItems(settings, items);
            });
            row.add_suffix(enabledSwitch);

            if (index > 0) {
                const upBtn = new Gtk.Button({
                    icon_name: 'go-up-symbolic',
                    has_frame: false,
                    valign: Gtk.Align.CENTER,
                    tooltip_text: _('Move Up'),
                });
                upBtn.connect('clicked', () => {
                    const temp = items[index - 1];
                    items[index - 1] = items[index];
                    items[index] = temp;
                    saveMenuItems(settings, items);
                    this._refreshItemsList(group, settings, parentWindow);
                });
                row.add_suffix(upBtn);
            }

            if (index < items.length - 1) {
                const downBtn = new Gtk.Button({
                    icon_name: 'go-down-symbolic',
                    has_frame: false,
                    valign: Gtk.Align.CENTER,
                    tooltip_text: _('Move Down'),
                });
                downBtn.connect('clicked', () => {
                    const temp = items[index + 1];
                    items[index + 1] = items[index];
                    items[index] = temp;
                    saveMenuItems(settings, items);
                    this._refreshItemsList(group, settings, parentWindow);
                });
                row.add_suffix(downBtn);
            }

            const editBtn = new Gtk.Button({
                icon_name: 'document-edit-symbolic',
                has_frame: false,
                valign: Gtk.Align.CENTER,
                tooltip_text: _('Edit'),
            });
            editBtn.connect('clicked', () => {
                this._showItemDialog(parentWindow, settings, { item, index }, () => {
                    this._refreshItemsList(group, settings, parentWindow);
                });
            });
            row.add_suffix(editBtn);

            const delBtn = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                has_frame: false,
                css_classes: ['destructive-action'],
                valign: Gtk.Align.CENTER,
                tooltip_text: _('Delete'),
            });
            delBtn.connect('clicked', () => {
                items.splice(index, 1);
                saveMenuItems(settings, items);
                this._refreshItemsList(group, settings, parentWindow);
            });
            row.add_suffix(delBtn);

            group.add(row);
            group._itemRows.push(row);
        });
    }

    _showItemDialog(parentWindow, settings, editData, onSaved) {
        const isEdit = !!editData;
        const currentItem = isEdit ? editData.item : {
            id: 'item_' + Date.now(),
            name: '',
            icon: 'application-x-executable-symbolic',
            type: 'command',
            target: '',
            enabled: true,
        };

        const dialog = new Adw.Window({
            title: isEdit ? _('Edit Shortcut') : _('Add Shortcut'),
            transient_for: parentWindow,
            modal: true,
            default_width: 480,
            default_height: 440,
        });

        const toolbarView = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar();

        const cancelBtn = new Gtk.Button({
            label: _('Cancel'),
        });
        cancelBtn.connect('clicked', () => dialog.close());
        headerBar.pack_start(cancelBtn);

        const saveBtn = new Gtk.Button({
            label: _('Save'),
            css_classes: ['suggested-action'],
        });
        headerBar.pack_end(saveBtn);

        toolbarView.add_top_bar(headerBar);

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup();

        const nameRow = new Adw.EntryRow({
            title: _('Shortcut Name'),
            text: currentItem.name || '',
        });
        group.add(nameRow);

        const iconRow = new Adw.EntryRow({
            title: _('Icon Name (Symbolic)'),
            text: currentItem.icon || 'application-x-executable-symbolic',
        });
        group.add(iconRow);

        const typeModel = new Gtk.StringList();
        typeModel.append(_('Terminal Command / Executable'));
        typeModel.append(_('Web URL'));
        typeModel.append(_('Folder / File Path'));
        typeModel.append(_('Special User Directory'));

        const typeMap = ['command', 'url', 'path', 'special-dir'];
        const typeCombo = new Adw.ComboRow({
            title: _('Action Type'),
            model: typeModel,
            selected: Math.max(0, typeMap.indexOf(currentItem.type)),
        });
        group.add(typeCombo);

        const targetRow = new Adw.EntryRow({
            title: _('Target (Command, URL, or Path)'),
            text: currentItem.target || '',
        });
        group.add(targetRow);

        const helpRow = new Adw.ActionRow({
            title: _('Examples'),
            subtitle: _('Command: x-terminal-emulator or btop\nURL: https://google.com\nPath: /home/user/Projects\nSpecial: DOWNLOAD, DOCUMENTS, PICTURES'),
        });
        group.add(helpRow);

        saveBtn.connect('clicked', () => {
            const name = nameRow.text.trim();
            const target = targetRow.text.trim();
            const iconName = iconRow.text.trim() || 'application-x-executable-symbolic';
            const selectedType = typeMap[typeCombo.selected] || 'command';

            if (!name || !target)
                return;

            const items = getMenuItems(settings);

            if (isEdit) {
                items[editData.index] = {
                    ...currentItem,
                    name,
                    icon: iconName,
                    type: selectedType,
                    target,
                };
            } else {
                items.push({
                    id: 'item_' + Date.now(),
                    name,
                    icon: iconName,
                    type: selectedType,
                    target,
                    enabled: true,
                });
            }

            saveMenuItems(settings, items);
            dialog.close();
            if (onSaved)
                onSaved();
        });

        page.add(group);
        toolbarView.set_content(page);
        dialog.set_content(toolbarView);
        dialog.present();
    }
}
