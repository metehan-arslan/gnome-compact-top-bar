import Meta from 'gi://Meta';
import St from 'gi://St';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class CompactTopBar extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._isTransparent = false;
        this._isHovered = false;
        this._isUpdatingStyle = false;

        this._settingsChangedIds = [
            this._settings.connect('changed::fade-text-on-fullscreen', this._applyStyles.bind(this)),
            this._settings.connect('changed::text-fade-opacity', this._applyStyles.bind(this)),
            this._settings.connect('changed::text-fade-color', this._applyStyles.bind(this)),
            this._settings.connect('changed::background-fade-opacity', this._applyStyles.bind(this)),
            this._settings.connect('changed::transparent-with-windows', this._updateTransparent.bind(this)),
            this._settings.connect('changed::font-size', this._applyStyles.bind(this)),
            this._settings.connect('changed::osd-opacity', this._applyOsdStyle.bind(this)),
            this._settings.connect('changed::osd-text-opacity', this._applyOsdStyle.bind(this)),
            this._settings.connect('changed::osd-text-color', this._applyOsdStyle.bind(this)),
        ];

        this._actorSignalIds = new Map();
        this._windowSignalIds = new Map();

        this._actorSignalIds.set(Main.overview, [
            Main.overview.connect('showing', this._updateTransparent.bind(this)),
            Main.overview.connect('hiding', this._updateTransparent.bind(this)),
            Main.overview.connect('hidden', () => {
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    if (this._settings) {
                        this._updateTransparent();
                        this._applyStyles();
                    }
                    return GLib.SOURCE_REMOVE;
                });
            }),
        ]);

        this._actorSignalIds.set(Main.sessionMode, [
            Main.sessionMode.connect('updated', this._updateTransparent.bind(this)),
        ]);

        this._actorSignalIds.set(Main.layoutManager, [
            Main.layoutManager.connect('monitors-changed', this._applyOsdStyle.bind(this)),
        ]);

        this._actorSignalIds.set(Main.panel, [
            Main.panel.connect('enter-event', () => {
                this._isHovered = true;
                this._applyStyles();
            }),
            Main.panel.connect('leave-event', () => {
                this._isHovered = false;
                this._applyStyles();
            }),
            Main.panel.connect('notify::style', () => {
                if (this._isUpdatingStyle || !this._settings)
                    return;
                if (this._isTransparent && !Main.overview.visibleTarget && !Main.panel.style)
                    this._applyStyles();
            }),
        ]);

        for (const metaWindowActor of global.get_window_actors()) {
            this._onWindowActorAdded(metaWindowActor.get_parent(), metaWindowActor);
        }

        this._actorSignalIds.set(global.window_group, [
            global.window_group.connect('child-added', this._onWindowActorAdded.bind(this)),
            global.window_group.connect('child-removed', this._onWindowActorRemoved.bind(this)),
        ]);

        this._actorSignalIds.set(global.window_manager, [
            global.window_manager.connect('switch-workspace', this._updateTransparent.bind(this)),
        ]);

        this._updateTransparent();
        this._applyOsdStyle();
    }

    disable() {
        if (this._settingsChangedIds) {
            for (const id of this._settingsChangedIds)
                this._settings.disconnect(id);
            this._settingsChangedIds = null;
        }

        for (const actorSignalIds of [this._actorSignalIds, this._windowSignalIds]) {
            for (const [actor, signalIds] of actorSignalIds) {
                for (const signalId of signalIds) {
                    actor.disconnect(signalId);
                }
            }
        }
        this._settings = null;
        this._actorSignalIds = null;
        this._windowSignalIds = null;

        // Reset panel styles
        Main.panel.remove_style_class_name('transparent-top-bar--solid');
        Main.panel.remove_style_class_name('transparent-top-bar--transparent');
        Main.panel.remove_style_class_name('transparent-top-bar--fade-text');
        Main.panel.set_style(null);

        // Reset button and dot styles
        const { buttons, dots } = this._getPanelElements();
        for (const btn of buttons)
            btn.set_style(null);
        for (const dot of dots)
            dot.set_style(null);

        // Reset OSD styles
        const osdWindows = Main.osdWindowManager?._osdWindows ?? [];
        for (const osdWindow of osdWindows) {
            if (!osdWindow)
                continue;

            const box = this._findOsdBox(osdWindow);
            if (box)
                this._styleActor(box, null);

            if (osdWindow._icon)
                this._styleActor(osdWindow._icon, null);

            if (osdWindow._label)
                this._styleActor(osdWindow._label, null);

            const clearRecursive = actor => {
                if (!actor)
                    return;
                for (const child of actor.get_children?.() ?? []) {
                    this._styleActor(child, null);
                    clearRecursive(child);
                }
            };
            if (box)
                clearRecursive(box);
        }
    }

    _onWindowActorAdded(container, metaWindowActor) {
        this._windowSignalIds.set(metaWindowActor, [
            metaWindowActor.connect('notify::allocation', this._updateTransparent.bind(this)),
            metaWindowActor.connect('notify::visible', this._updateTransparent.bind(this)),
        ]);
    }

    _onWindowActorRemoved(container, metaWindowActor) {
        for (const signalId of this._windowSignalIds.get(metaWindowActor)) {
            metaWindowActor.disconnect(signalId);
        }
        this._windowSignalIds.delete(metaWindowActor);
        this._updateTransparent();
    }

    _getPanelElements() {
        const buttons = [];
        const dots = [];

        const find = actor => {
            if (!actor)
                return;
            if (actor.has_style_class_name?.('panel-button'))
                buttons.push(actor);
            if (actor.has_style_class_name?.('workspace-dot'))
                dots.push(actor);
            for (const child of actor.get_children?.() ?? [])
                find(child);
        };

        find(Main.panel);
        return { buttons, dots };
    }

    _styleActor(actor, style) {
        if (!actor || typeof actor.set_style !== 'function')
            return;
        try {
            actor.set_style(style);
        } catch (e) {
            // Guard against any internal actor style errors
        }
    }

    _findOsdBox(actor) {
        if (!actor)
            return null;
        if (actor._hbox && typeof actor._hbox.set_style === 'function')
            return actor._hbox;
        if (actor._box && typeof actor._box.set_style === 'function')
            return actor._box;
        if (typeof actor.has_style_class_name === 'function' && actor.has_style_class_name('osd-window'))
            return actor;
        for (const child of actor.get_children?.() ?? []) {
            const found = this._findOsdBox(child);
            if (found)
                return found;
        }
        return null;
    }

    _applyOsdStyle() {
        if (!this._settings)
            return;

        const bgOpacity = this._settings.get_double('osd-opacity');
        const textOpacity = this._settings.get_double('osd-text-opacity');
        const colorStr = this._settings.get_string('osd-text-color') || '#ffffff';

        let r = 255, g = 255, b = 255;
        if (colorStr.startsWith('#') && colorStr.length === 7) {
            r = parseInt(colorStr.slice(1, 3), 16) || 255;
            g = parseInt(colorStr.slice(3, 5), 16) || 255;
            b = parseInt(colorStr.slice(5, 7), 16) || 255;
        }

        const bgStyle = `rgba(0, 0, 0, ${bgOpacity.toFixed(2)})`;
        const textStyle = `rgba(${r}, ${g}, ${b}, ${textOpacity.toFixed(2)})`;
        const boxStyle = `background-color: ${bgStyle}; color: ${textStyle};`;
        const labelStyle = `color: ${textStyle};`;

        const osdWindows = Main.osdWindowManager?._osdWindows ?? [];
        for (const osdWindow of osdWindows) {
            if (!osdWindow)
                continue;

            const box = this._findOsdBox(osdWindow);
            if (box)
                this._styleActor(box, boxStyle);

            if (osdWindow._icon)
                this._styleActor(osdWindow._icon, labelStyle);

            if (osdWindow._label)
                this._styleActor(osdWindow._label, labelStyle);

            // Also recursively style any labels or icons inside the box
            const applyRecursive = actor => {
                if (!actor)
                    return;
                for (const child of actor.get_children?.() ?? []) {
                    if (child !== box && typeof child.set_style === 'function') {
                        if (child instanceof St.Label || child instanceof St.Icon ||
                            child.text !== undefined || child.gicon !== undefined || child.icon_name !== undefined) {
                            this._styleActor(child, labelStyle);
                        }
                    }
                    applyRecursive(child);
                }
            };
            if (box)
                applyRecursive(box);
        }
    }

    _applyStyles() {
        if (!this._settings)
            return;

        this._isUpdatingStyle = true;
        try {
            const fadeEnabled = this._settings.get_boolean('fade-text-on-fullscreen');
            const bgOpacity = this._settings.get_double('background-fade-opacity');
            const textOpacity = this._settings.get_double('text-fade-opacity');
            const colorStr = this._settings.get_string('text-fade-color') || '#ffffff';
            const fontSize = this._settings.get_int('font-size');

            // 1. Top bar background and font size
            let panelStyle = `font-size: ${fontSize}pt;`;
            if (this._isTransparent)
                panelStyle += ` background-color: rgba(0, 0, 0, ${bgOpacity.toFixed(2)}); transition-duration: 500ms;`;
            Main.panel.set_style(panelStyle);

            // 2. Text and icons fading
            const { buttons, dots } = this._getPanelElements();

            if (!this._isTransparent && fadeEnabled && !this._isHovered) {
                Main.panel.add_style_class_name('transparent-top-bar--fade-text');

                // Parse hex color into RGB components
                let r = 255, g = 255, b = 255;
                if (colorStr.startsWith('#') && colorStr.length === 7) {
                    r = parseInt(colorStr.slice(1, 3), 16) || 255;
                    g = parseInt(colorStr.slice(3, 5), 16) || 255;
                    b = parseInt(colorStr.slice(5, 7), 16) || 255;
                }

                const fadedColor = `rgba(${r}, ${g}, ${b}, ${textOpacity.toFixed(2)})`;
                const buttonStyle = `color: ${fadedColor}; transition: color 0.3s ease;`;
                const dotStyle = `background-color: ${fadedColor}; transition: background-color 0.3s ease;`;

                for (const btn of buttons)
                    btn.set_style(buttonStyle);
                for (const dot of dots)
                    dot.set_style(dotStyle);
            } else {
                Main.panel.remove_style_class_name('transparent-top-bar--fade-text');

                for (const btn of buttons)
                    btn.set_style(null);
                for (const dot of dots)
                    dot.set_style(null);
            }
        } finally {
            this._isUpdatingStyle = false;
        }
    }

    _updateTransparent() {
        if (Main.overview.visibleTarget || !Main.sessionMode.hasWindows ||
            this._settings?.get_boolean('transparent-with-windows')) {
            this._setTransparent(true);
            return;
        }

        if (!Main.layoutManager.primaryMonitor) {
            return;
        }

        // Get all the windows in the active workspace that are visible.
        const workspaceManager = global.workspace_manager;
        const activeWorkspace = workspaceManager.get_active_workspace();
        const topBarMonitor = Main.layoutManager.findMonitorForActor(Main.panel).index;
        const windows = activeWorkspace.list_windows().filter(metaWindow => {
            return metaWindow.get_monitor() === topBarMonitor
                && metaWindow.showing_on_its_workspace()
                && !metaWindow.is_hidden()
                && !metaWindow.is_fullscreen()
                && metaWindow.get_window_type() !== Meta.WindowType.DESKTOP;
        });

        // Check if at least one window is near enough to the panel.
        const panelTop = Main.panel.get_transformed_position()[1];
        const panelBottom = panelTop + Main.panel.get_height();
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const isNearEnough = windows.some(metaWindow => {
            const verticalPosition = metaWindow.get_frame_rect().y;
            return verticalPosition < panelBottom + 5 * scale;
        });

        this._setTransparent(!isNearEnough);
    }

    _setTransparent(transparent) {
        this._isTransparent = transparent;

        if (transparent) {
            Main.panel.remove_style_class_name('transparent-top-bar--solid');
            Main.panel.add_style_class_name('transparent-top-bar--transparent');
        } else {
            Main.panel.add_style_class_name('transparent-top-bar--solid');
            Main.panel.remove_style_class_name('transparent-top-bar--transparent');
        }

        this._applyStyles();
    }
}
