'use strict';

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CompactTopBarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();

        // --- Group 1: Top Bar Text & Icons Fade ---
        const fadeGroup = new Adw.PreferencesGroup({
            title: _('Top Bar Text & Icons Fade'),
            description: _('Fade the top bar text and icons when an application is fullscreen or touching top bar'),
        });
        page.add(fadeGroup);

        // Switch row: Fade text on fullscreen
        const fadeSwitchRow = new Adw.ActionRow({
            title: _('Fade text on fullscreen'),
            subtitle: _('Dim text and icons when an application is fullscreen or touching top bar'),
        });
        fadeGroup.add(fadeSwitchRow);

        const fadeSwitch = new Gtk.Switch({
            active: settings.get_boolean('fade-text-on-fullscreen'),
            valign: Gtk.Align.CENTER,
        });
        settings.bind(
            'fade-text-on-fullscreen',
            fadeSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        fadeSwitchRow.add_suffix(fadeSwitch);
        fadeSwitchRow.activatable_widget = fadeSwitch;

        // Opacity slider row
        const textOpacityRow = this._addOpacityRow(fadeGroup, settings, {
            key: 'text-fade-opacity',
            title: _('Fade opacity'),
            subtitle: _('Opacity of text and icons when faded'),
        });

        // Color selector row
        const textColorRow = this._addColorRow(fadeGroup, settings, {
            key: 'text-fade-color',
            title: _('Fade color'),
            subtitle: _('Color of text and icons when faded'),
        });

        // Link sensitivity to switch
        const updateFadeSensitivity = () => {
            const enabled = settings.get_boolean('fade-text-on-fullscreen');
            textOpacityRow.set_sensitive(enabled);
            textColorRow.set_sensitive(enabled);
        };
        settings.connect('changed::fade-text-on-fullscreen', updateFadeSensitivity);
        updateFadeSensitivity();

        // --- Group 2: Top Bar Background ---
        const topBarGroup = new Adw.PreferencesGroup({
            title: _('Top Bar Background'),
            description: _('Configure top bar transparency when no window is touching it'),
        });
        page.add(topBarGroup);

        this._addOpacityRow(topBarGroup, settings, {
            key: 'background-fade-opacity',
            title: _('Background opacity'),
            subtitle: _('Opacity of the top bar background when transparent'),
        });

        // --- Group 3: On-Screen Display (OSD) ---
        const osdGroup = new Adw.PreferencesGroup({
            title: _('On-Screen Display (OSD)'),
            description: _('Configure transparency and colors for volume, brightness, and other popups'),
        });
        page.add(osdGroup);

        this._addOpacityRow(osdGroup, settings, {
            key: 'osd-opacity',
            title: _('OSD background opacity'),
            subtitle: _('Background opacity of the OSD popup'),
        });

        this._addOpacityRow(osdGroup, settings, {
            key: 'osd-text-opacity',
            title: _('OSD logo & text opacity'),
            subtitle: _('Opacity of the OSD icon, logo, and text'),
        });

        this._addColorRow(osdGroup, settings, {
            key: 'osd-text-color',
            title: _('OSD logo & text color'),
            subtitle: _('Color of the OSD icon, logo, and text'),
        });

        window.add(page);
    }

    _addOpacityRow(group, settings, { key, title, subtitle }) {
        const row = new Adw.ActionRow({ title, subtitle });
        group.add(row);

        const scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 100, 1);
        scale.set_size_request(200, -1);
        scale.set_draw_value(true);
        scale.set_value_pos(Gtk.PositionType.LEFT);
        scale.set_value(Math.round(settings.get_double(key) * 100));
        scale.set_valign(Gtk.Align.CENTER);

        scale.connect('value-changed', () => {
            settings.set_double(key, scale.get_value() / 100.0);
        });

        settings.connect(`changed::${key}`, () => {
            const val = Math.round(settings.get_double(key) * 100);
            if (Math.round(scale.get_value()) !== val)
                scale.set_value(val);
        });

        row.add_suffix(scale);
        return row;
    }

    _addColorRow(group, settings, { key, title, subtitle }) {
        const row = new Adw.ActionRow({ title, subtitle });
        group.add(row);

        const currentColor = settings.get_string(key) || '#ffffff';
        const rgba = new Gdk.RGBA();
        rgba.parse(currentColor);

        let colorButton = null;
        if (Gtk.ColorDialogButton) {
            const dialog = new Gtk.ColorDialog({ with_alpha: false });
            colorButton = new Gtk.ColorDialogButton({
                dialog,
                rgba,
                valign: Gtk.Align.CENTER,
            });
            colorButton.connect('notify::rgba', () => {
                const c = colorButton.get_rgba();
                const r = Math.round(c.red * 255).toString(16).padStart(2, '0');
                const g = Math.round(c.green * 255).toString(16).padStart(2, '0');
                const b = Math.round(c.blue * 255).toString(16).padStart(2, '0');
                settings.set_string(key, `#${r}${g}${b}`);
            });
            settings.connect(`changed::${key}`, () => {
                const updated = new Gdk.RGBA();
                if (updated.parse(settings.get_string(key)))
                    colorButton.set_rgba(updated);
            });
        } else if (Gtk.ColorButton) {
            colorButton = new Gtk.ColorButton({
                rgba,
                valign: Gtk.Align.CENTER,
            });
            colorButton.connect('color-set', () => {
                const c = colorButton.get_rgba();
                const r = Math.round(c.red * 255).toString(16).padStart(2, '0');
                const g = Math.round(c.green * 255).toString(16).padStart(2, '0');
                const b = Math.round(c.blue * 255).toString(16).padStart(2, '0');
                settings.set_string(key, `#${r}${g}${b}`);
            });
            settings.connect(`changed::${key}`, () => {
                const updated = new Gdk.RGBA();
                if (updated.parse(settings.get_string(key)))
                    colorButton.set_rgba(updated);
            });
        }

        if (colorButton) {
            row.add_suffix(colorButton);
            row.activatable_widget = colorButton;
        }

        return row;
    }
}
