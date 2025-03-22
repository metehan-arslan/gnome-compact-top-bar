import Meta from 'gi://Meta';
import St from 'gi://St';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class CompactTopBar extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._settingsChangedId = this._settings.connect('changed::fade-text-on-fullscreen', this._updateStyles.bind(this));


        this._actorSignalIds = new Map();
        this._windowSignalIds = new Map();

        this._actorSignalIds.set(Main.overview, [
            Main.overview.connect('showing', this._updateTransparent.bind(this)),
            Main.overview.connect('hiding', this._updateTransparent.bind(this))
        ]);

        this._actorSignalIds.set(Main.sessionMode, [
            Main.sessionMode.connect('updated', this._updateTransparent.bind(this))
        ]);

        for (const metaWindowActor of global.get_window_actors()) {
            this._onWindowActorAdded(metaWindowActor.get_parent(), metaWindowActor);
        }

        this._actorSignalIds.set(global.window_group, [
            global.window_group.connect('child-added', this._onWindowActorAdded.bind(this)),
            global.window_group.connect('child-removed', this._onWindowActorRemoved.bind(this))
        ]);

        this._actorSignalIds.set(global.window_manager, [
            global.window_manager.connect('switch-workspace', this._updateTransparent.bind(this))
        ]);

        this._updateTransparent();
        this._updateStyles();
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
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

        Main.panel.remove_style_class_name('transparent-top-bar--solid');
        Main.panel.remove_style_class_name('transparent-top-bar--transparent');
        Main.panel.remove_style_class_name('transparent-top-bar--fade-text');
    }

    _onWindowActorAdded(container, metaWindowActor) {
        this._windowSignalIds.set(metaWindowActor, [
            metaWindowActor.connect('notify::allocation', this._updateTransparent.bind(this)),
            metaWindowActor.connect('notify::visible', this._updateTransparent.bind(this))
        ]);
    }

    _onWindowActorRemoved(container, metaWindowActor) {
        for (const signalId of this._windowSignalIds.get(metaWindowActor)) {
            metaWindowActor.disconnect(signalId);
        }
        this._windowSignalIds.delete(metaWindowActor);
        this._updateTransparent();
    }

    _updateStyles() {
        const fadeTextOnFullscreen = this._settings.get_boolean('fade-text-on-fullscreen');
        if (fadeTextOnFullscreen) {
            Main.panel.add_style_class_name('transparent-top-bar--fade-text');
        } else {
            Main.panel.remove_style_class_name('transparent-top-bar--fade-text');
        }
    }

    _updateTransparent() {
        if (Main.panel.has_style_pseudo_class('overview') || !Main.sessionMode.hasWindows) {
            this._setTransparent(true);
            return;
        }

        if (!Main.layoutManager.primaryMonitor) {
            return;
        }

        // Get all the windows in the active workspace that are visible.
        const workspaceManager = global.workspace_manager;
        const activeWorkspace = workspaceManager.get_active_workspace();
        const windows = activeWorkspace.list_windows().filter(metaWindow => {
        if (!Main.layoutManager.primaryMonitor.inFullscreen){
            return metaWindow.is_on_primary_monitor()
                    && metaWindow.showing_on_its_workspace()
                    && !metaWindow.is_hidden()
                    && !metaWindow.is_fullscreen()
                    && metaWindow.get_window_type() !== Meta.WindowType.DESKTOP;
        } else {
            return !metaWindow.is_on_primary_monitor()
                    && metaWindow.showing_on_its_workspace()
                    && !metaWindow.is_hidden()
                    && !metaWindow.is_fullscreen()
                    && metaWindow.get_window_type() !== Meta.WindowType.DESKTOP;
        }
            
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
        if (transparent) {
            Main.panel.remove_style_class_name('transparent-top-bar--solid');
            Main.panel.add_style_class_name('transparent-top-bar--transparent');
        } else {
            Main.panel.add_style_class_name('transparent-top-bar--solid');
            Main.panel.remove_style_class_name('transparent-top-bar--transparent');

        }
    }
};
