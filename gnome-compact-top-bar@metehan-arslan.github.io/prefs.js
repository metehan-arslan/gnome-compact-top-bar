'use strict';

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CompactTopBarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // Create a preferences page and group
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup();
        page.add(group);

        // Create a new preferences row
        const row = new Adw.ActionRow({ title: _('Fade text on fullscreen') });
        group.add(row);

        // Create a switch and bind its value to the setting
        const toggle = new Gtk.Switch({
            active: settings.get_boolean ('fade-text-on-fullscreen'),
            valign: Gtk.Align.CENTER,
        });
        settings.bind(
            'fade-text-on-fullscreen',
            toggle,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        // Add the switch to the row
        row.add_suffix(toggle);
        row.activatable_widget = toggle;

        // Add our page to the window
        window.add(page);
    }
}