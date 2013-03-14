// third-party dependencies
var fs = require('fs');
var path = require('path');
var util = require('util');
var events = require('events');
var directoryWalker = require('directory-walker');

function resolveFilename(filename) {
    if ((filename.charAt(0) !== '.') && (filename.charAt(0) !== '/')) {
        return filename;
    } else {
        return path.resolve(filename);
    }
}
function HotReloader(config) {
    var self = this;

    events.EventEmitter.call(this);

    var lastReloadTimestamp = Date.now();

    if (config) {
        if (config.include) {
            this.include(config.include);
            console.log('[Hot Reload] Watched directories/files: ' + JSON.stringify(this._includes));
        }

        if (config.exclude) {
            this.exclude(config.exclude);
            console.log('[Hot Reload] Exclude from watched directories: ' + JSON.stringify(this._excludes));
        }

        if (config.alwaysReload) {
            this.alwaysReload(config.alwaysReload);
            console.log('[Hot Reload] Always reload: ' + JSON.stringify(this._alwaysReload));
        }

        if (config.neverReload) {
            this.neverReload(config.neverReload);
            console.log('[Hot Reload] Never reload: ' + JSON.stringify(this._neverReload));
        }
    }

    /**
     * Reloads all reloadable modules when a watched file is changed.
     */
    this.reload = function() {
        self._reloadTimeout = null;

        var now = Date.now();
        var diff = now - lastReloadTimestamp;
        if (diff <= 500) {
            return;
        }

        self.emit('beforeReload');

        var reloadableModules = [];

        // FIRST PASS: loop through the module cache and remove entries within directories that we are watching
        for (var key in require.cache) {
            var module = require.cache[key];

            if (self.isModuleReloadable(module)) {
                //console.log('[Hot Reload] Unloading ' + module.filename);
                // delete the cache entry only in first pass
                delete require.cache[key];

                // keep track of the modules that
                reloadableModules.push(module);
            } else {
                //console.log('[Hot Reload] Not unloading ' + module.filename);
            }
        }

        console.log('[Hot Reload] ' + reloadableModules.length + ' modules removed from cache.');

        if (!config || (config.autoReload !== false)) {
            // SECOND PASS: Now trigger a reload of all of the modules since their cache entry was removed
            for (var i = 0; i < reloadableModules.length; i++) {
                // reload the module
                self.reloadModule(reloadableModules[i]);
            }
        }

        self.emit('afterReload');

        lastReloadTimestamp = now;
    }
}

util.inherits(HotReloader, events.EventEmitter);

HotReloader.prototype.isModuleReloadable = function(module) {

    var filename = module.filename;

    if (this._excludes) {
        for (var i = 0; i < this._excludes.length; i++) {
            var exclude = this._excludes[i];
            if (filename.indexOf(exclude) === 0) {
                return false;
            }
        }
    }

    if (this._neverReload) {
        for (var i = 0; i < this._neverReload.length; i++) {
            var exclude = this._neverReload[i];
            if (filename.indexOf(exclude) === 0) {
                return false;
            }
        }
    }

    if (this._alwaysReload) {
        for (var i = 0; i < this._alwaysReload.length; i++) {
            var include = this._alwaysReload[i];
            if (filename.indexOf(include) === 0) {
                return true;
            }
        }
    }

    if (this._includes) {
        for (var i = 0; i < this._includes.length; i++) {
            var include = this._includes[i];
            if (filename.indexOf(include) === 0) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Reload a given module.
 * @param {Module} module a module
 * @param {EventEmitter} an event emitter
 */
HotReloader.prototype.reloadModule = function(module) {
    console.log('[Hot Reload] Reloading module: ' + module.filename);

    this.emit('beforeModuleReload', module);

    if (module.exports.unloadModule) {
        module.exports.unloadModule.call(exports);
    }

    delete require.cache[module.filename];
    
    var newModule = require(module.filename);

    // copy properties from new module to old module in case their are some
    // references to old module
    for (var key in newModule) {
        if (newModule.hasOwnProperty(key)) {
            module.exports[key] = newModule[key];
        }
    }
    
    this.emit('afterModuleReload', module);
}

HotReloader.prototype.watch = function(options) {
    if (options.include) {
        this.include(options.include);
    }

    if (options.exclude) {
        this.exclude(options.exclude);
    }

    return this;
}

/**
 * Identify directories/files that will be watched
 * for changes. Also, all Node.js modules within these directories
 * will automatically be reloaded if a file is changed
 * (unless they are explicitly excluded).
 */
HotReloader.prototype.include = function(includes) {

    if (!Array.isArray(includes)) {
        includes = [includes];
    }

    this._includes = this._includes || [];

    for (var i = 0; i < includes.length; i++) {
        var dir = resolveFilename(includes[i]);
        this._includes.push(dir);
    }

    return this;
}

/**
 * Identify directories/files that will not be watched.
 * Exclusions take precedence over inclusions.
 *
 * @param {String[]} list of paths that will not be watched
 */
HotReloader.prototype.exclude = function(excludes) {
    this._excludes = this._excludes || [];
    this._excludesMap = this._excludesMap || {};

    for ( var i = 0; i < excludes.length; i++) {
        this._excludes.push(filename = resolveFilename(excludes[i]));
        this._excludesMap[filename] = true;
    }

    return this;
}

/**
 * Identify all of the modules (and, implicitly, their submodules)
 * that will be automatically reloaded if any watched file/directory
 * changes.
 */
HotReloader.prototype.alwaysReload = function(modulePaths) {
    this._alwaysReload = this._alwaysReload || [];
    for (var i = 0; i < modulePaths.length; i++) {
        var modulePath = modulePaths[i];

        // store the file path of the modulePaths that should always be reloaded
        this._alwaysReload.push(resolveFilename(modulePath));
    }

    return this;
}

/**
 * Identify all of the modules (and, implicitly, their submodules)
 * that will never be reloaded. Exclusions given to this method
 * call take precedence over includes provided via "alwaysReload".
 */
HotReloader.prototype.neverReload = function(modulePaths) {
    this._neverReload = this._neverReload || [];
    for (var i = 0; i < modulePaths.length; i++) {
        var modulePath = modulePaths[i];

        // store the file path of the modulePaths that should never be reloaded
        this._neverReload.push(resolveFilename(modulePath));
    }

    return this;
}

HotReloader.prototype.start = function() {

    var self = this;

    var walker = directoryWalker.createDirectoryWalker({
        excludes : this._excludes,

        onDirectory : function(directory) {
            console.log('[Hot Reload] Watching directory: ' + directory);
            fs.watch(directory,
                function(event, file) {
                    console.log('[Hot Reload] Changed: ' + file);
                    self._scheduleReload();
                });
        },

        listeners : {
            'error' : function(err) {
                console.error(err);
            }
        }
    });

    if (this._includes) {
        for (var i = 0; i < this._includes.length; i++) {
            walker.walk(this._includes[i]);
        }
    }
}

HotReloader.prototype._scheduleReload = function() {
    if (this._reloadTimeout) {
        clearTimeout(this._reloadTimeout);
    }

    this._reloadTimeout = setTimeout(this.reload, 1500);
}

exports.createHotReloader = function(config) {
    return new HotReloader(config);
}

