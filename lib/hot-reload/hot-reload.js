// third-party dependencies
var fs = require('fs');
var path = require('path');
var util = require('util');
var events = require('events');
var directoryWalker = require('directory-walker');
var pathFilters = require('path-filters');

var cwd = process.cwd();
function relPath(filePath) {
    return path.relative(cwd, filePath);
}

function leftPad(str, len) {
    while (str.length < len) {
        str = ' ' + str;
    }
    return str;
}

function ModuleFilter(moduleUri) {
    this._moduleUri = moduleUri;
}

ModuleFilter.prototype.test = function(path) {
    return this._moduleUri === path;
}

function ModulePathFilters(_require) {
    pathFilters.PathFilters.call(this);
    this._require = _require;
}

util.inherits(ModulePathFilters, pathFilters.PathFilters);

ModulePathFilters.prototype.createSimpleFilter = function(filter, recursive, matchResult) {

    if (recursive !== false) {
        try {
            var moduleUri = this._require.resolve(filter);
            return new ModuleFilter(moduleUri)
        } catch(e) {
            // ignore and fall through
        }
    }

    return pathFilters.PathFilters.prototype.createSimpleFilter.apply(this, arguments);
}

function HotReloader(require) {
    events.EventEmitter.call(this);
    var self = this;
    this._loggingEnabled = true;
    this._require = require;
    this._uncacheIncludes = new ModulePathFilters(require);
    this._uncacheExcludes = new ModulePathFilters(require);

    this._watchIncludes = {};
    this._watchedPaths = {};
    this._watchExcludeFilters = pathFilters.create();

    this._reloadIncludes = pathFilters.create();
    this._reloadExcludes = pathFilters.create();
    this._specialReloadIncludes = pathFilters.create();
    this._specialReloadExcludes = pathFilters.create();
    this._pending = 0;
    this._reloadDelay = 2000;
    this._lastReloadTime = null;

    this._handleComplete = function() {
        if (--self._pending === 0) {
            self.emit('ready');
        }
    }
}

util.inherits(HotReloader, events.EventEmitter);

HotReloader.prototype.loggingEnabled = function(enabled) {
    this._loggingEnabled = enabled !== false;
    return this;
};

HotReloader.prototype.uncache = function(filter, recursive, matchResult) {
    this._uncacheIncludes.add(filter, recursive, matchResult);
    return this;
};

HotReloader.prototype.uncacheExclude = function(filter, recursive, matchResult) {
    this._uncacheExcludes.add(filter, recursive, matchResult);
    return this;
};

HotReloader.prototype.reload = function(filter, recursive, matchResult) {
    this._reloadIncludes.add(filter, recursive, matchResult);
    return this;
};

HotReloader.prototype.reloadExclude = function(filter, recursive, matchResult) {
    this._reloadExcludes.add(filter, recursive, matchResult);
    return this;
};

HotReloader.prototype.watch = function(dir, recursive) {
    if (Array.isArray(dir)) {
        dir.forEach(function(curDir) {
            this.watch(curDir, recursive);
        }, this);
        return this;
    }

    var self = this;
    var watchIncludes = this._watchIncludes;

    if (recursive === undefined) {
        recursive = true;
    }

    function callback(path, eventArgs) {
        var realPath = fs.realpathSync(path);
        var includeInfo = {
            path: path,
            realPath: realPath,
            stat: eventArgs.stat,
            recursive: recursive
        };

        watchIncludes[path] = includeInfo;
    }

    this._pending++;

    directoryWalker.create()
        .recursive(recursive)
        .onDirectory(callback)
        .onRoot(callback)
        .onError(function(e) {
            console.error('Directory walk error: ', e);
        })
        .onComplete(this._handleComplete)
        .walk(dir);

    return this;
}

HotReloader.prototype.watchExclude = function(filter, recursive) {
    this._watchExcludeFilters.add(filter, recursive);
    return this;
}

HotReloader.prototype.specialReload = function(filter, recursive, handlerFunc) {
    if (arguments.length === 2) {
        handlerFunc = arguments[1];
        recursive = true;
    }

    var result = this._specialReloadIncludes.add(filter, recursive);
    if (Array.isArray(result)) {
        for (var i = 0; i < result.length; i++) {
            result[i].handler = handlerFunc;
        }
    } else {
        result.handler = handlerFunc;
    }

    return this;
}

HotReloader.prototype.specialReloadExclude = function(filter, recursive) {
    this._specialReloadExcludes.add(filter, recursive);
    return this;
}

HotReloader.prototype.beforeReload = function(func) {
    this.on('beforeReload', func);
    return this;
}

HotReloader.prototype.afterReload = function(func) {
    this.on('afterReload', func);
    return this;
}

HotReloader.prototype.beforeSpecialReload = function(func) {
    this.on('beforeSpecialReload', func);
    return this;
}

HotReloader.prototype.afterSpecialReload = function(func) {
    this.on('afterSpecialReload', func);
    return this;
}

HotReloader.prototype._shouldUncacheModule = function(moduleName) {
    if (this._uncacheIncludes.isEmpty() && this._uncacheExcludes.isEmpty()) {
        return true;
    }

    if (this._uncacheExcludes.hasMatch(moduleName)) {
        return false;
    }

    if (!this._uncacheExcludes.isEmpty() && this._uncacheIncludes.isEmpty()) {
        return true;
    }

    if (this._uncacheIncludes.hasMatch(moduleName)) {
        return true;
    }

    return false;
}

HotReloader.prototype._shouldReloadModule = function(moduleName) {
    if (this._reloadIncludes.isEmpty() && this._reloadExcludes.isEmpty()) {
        return false;
    }

    if (this._reloadExcludes.hasMatch(moduleName)) {
        return false;
    }

    if (!this._reloadExcludes.isEmpty() && this._reloadIncludes.isEmpty()) {
        return true;
    }

    if (this._reloadIncludes.hasMatch(moduleName)) {
        return true;
    }

    return false;
}

HotReloader.prototype.getRequire = function() {
    return this._require;
};

HotReloader.prototype._log = function(message) {
    if (this._loggingEnabled) {
        console.log('[hot-reload] ' + message);
    }
}

HotReloader.prototype._reload = function(path) {
    this._log('Beginning reload...');


    var specialReloadHandlers;

    if (!this._specialReloadExcludes.hasMatch(path)) {
        specialReloadHandlers = this._specialReloadIncludes.getMatches(path);
    }

    var eventArgs = {
        path: path
    };
    var i;



    function fullReload() {
        this.emit('beforeReload', eventArgs);

        var modulesToReload = [];

        // FIRST PASS: loop through the module cache and remove entries within directories that we are watching
        var uncacheCount = 0;
        for (var key in require.cache) {
            if (require.cache.hasOwnProperty(key)) {
                var module = require.cache[key];
                var moduleExports = module.exports;
                if (moduleExports && moduleExports.__hotReload__ === false) {
                    continue;
                }

                if (this._shouldUncacheModule(module.filename)) {

                    

                    // delete the cache entry only in first pass
                    delete require.cache[key];
                    uncacheCount++;

                    // this._log('Uncached module: ' + module.filename);

                    // keep track of the modules that
                    if (this._shouldReloadModule(module.filename)) {
                        modulesToReload.push(module);
                    }
                }


            } else {
                //this._log('Not uncaching ' + module.filename);
            }
        }

        if (uncacheCount !== 0) {
            this._log('Uncached ' + uncacheCount + ' ' + (uncacheCount === 1 ? 'module' : 'modules'));
        }


        for (i = 0; i < modulesToReload.length; i++) {
            var module = modulesToReload[i];
            this._reloadModule(module);
        }

        this.emit('afterReload', eventArgs);
    }

    if (specialReloadHandlers.length !== 0) {
        this.emit('beforeSpecialReload', eventArgs);
        var fullReloadEnabled = false;

        var context = {
            path: path,
            fullReload: function() {
                fullReloadEnabled = true;
            }
        };

        for (i = 0; i < specialReloadHandlers.length; i++) {
            var result = specialReloadHandlers[i].handler(path, context);
            if (result === false) {
                break;
            }
        }

        this.emit('afterSpecialReload', eventArgs);

        if (fullReloadEnabled) {
            fullReload.call(this);
        }
    } else {
        fullReload.call(this);
    }

    this._log('Reload complete');
}

HotReloader.prototype._reloadModule = function(module) {

    this._log('Reloading module "' + module.filename + '"...');

    this.emit('beforeModuleReload', module);

    delete require.cache[module.filename];

    try {
        var newModule = require(module.filename);

        // copy properties from new module to old module in case their are some
        // references to old module
        for (var key in newModule) {
            if (newModule.hasOwnProperty(key)) {
                module.exports[key] = newModule[key];
            }
        }

        this._log('Reloaded module: ' + module.filename);
    } catch (e) {
        console.error('[hot-reload] ERROR: Unable to reload module "' + module.filename + '". Exception: ' + e, e.stack);
    }


    this.emit('afterModuleReload', module);
};

HotReloader.prototype.start = function(func) {



    var watchIncludes = this._watchIncludes,
        watchedPaths = this._watchedPaths,
        watchExcludes = this._watchExcludes,
        self = this;


    function startWatching() {

        function createWatcherFunc(watchInclude) {
            return function(event, filename) {
                if (watchInclude.stat.isDirectory()) {
                    if (!filename) {
                        handleModified(event, watchInclude.path, watchInclude.recursive);
                    } else {
                        handleModified(event, require('path').join(watchInclude.path, filename), watchInclude.recursive);
                    }
                } else {
                    handleModified(event, watchInclude.path, false);
                }
            };
        }

        function watch(watchInclude, logWatch) {

            var watcher = fs.watch(
                watchInclude.realPath,
                createWatcherFunc(watchInclude));
            

            if (logWatch !== false) {
                self._log('' + leftPad('Watching ' + (watchInclude.stat.isDirectory() ? 'directory' : 'file'), 18) + ': ' + relPath(watchInclude.path));    
            }
            
            watchedPaths[watchInclude.realPath] = watchInclude;
            watchInclude.watcher = watcher;
        }

        function handleNewDirectory(dir) {
            function handler(path, eventArgs) {
                var realPath = fs.realpathSync(path);
                watch({
                    path: path,
                    realPath: realPath,
                    stat: eventArgs.stat,
                    recursive: true
                });  
            }

            directoryWalker.create()
                .recursive(true)
                .onDirectory(handler)
                .onError(function(e) {
                    console.error('Directory walk error: ', e);
                })
                .walk(dir);
        }

        function handleModified(event, path, recursive) {

            var realPath;
            try {
                realPath = fs.realpathSync(path);    
            }
            catch(e) {
                return; // In some cases the file that triggered the event can be deleted immediately
            }
            var stat;

            try {
                stat = fs.statSync(realPath)
            }
            catch(e) {
                return; // In some cases the file that triggered the event can be deleted immediately
            }

            if (recursive) {
                
                if (!watchedPaths[realPath] && stat.isDirectory()) {
                    // A new sub-directory was added to a directory that we are watching
                    // recursively. Therefore, we need to start watching this directory
                    // recursively as well.
                    handleNewDirectory(realPath);                 
                }
            }

            var now = Date.now();
            if (self._lastReloadTime === null || now - self._lastReloadTime > self._reloadDelay) {

                if (self._watchExcludeFilters.hasMatch(path)) {
                    self._log('Modified file ignored since it is excluded: ' + path + ' ');
                    // The file excluded from being watched so ignore the event
                    return;
                }

                self._log('File modified: ' + path + ' (' + event + ')');
                self._reload(path);
                self._lastReloadTime = now;
            }

            if (stat.isFile() && watchedPaths[realPath]) {

                // On some operating systems, after a file is modified we stop
                // receiving modification events. To solve this problem
                // we will rewatch the file
                watchedPaths[realPath].watcher.close();
                delete watchedPaths[realPath].watcher;
                watch(watchedPaths[realPath], false /* don't add log output */); 
            }
        }

        for (var path in watchIncludes) {

            if (watchIncludes.hasOwnProperty(path)) {

                if (this._watchExcludeFilters.hasMatch(path)) {
                    self._log('Not watching "' + path + '" since it is excluded.');
                    // The path is excluded from being watched...skip it
                    continue;
                }
                var watchInclude = watchIncludes[path];
                watch(watchInclude);
            }
        }
    }

    if (this._pending) {
        this.on('ready', startWatching);
    } else {
        startWatching();
    }

    return this;
};

exports.create = function(require) {
    if (!require) {
        throw new Error("require argument is required");
    }

    return new HotReloader(require);
};

exports.HotReloader = HotReloader;
