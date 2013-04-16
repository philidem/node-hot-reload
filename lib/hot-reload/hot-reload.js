// third-party dependencies
var fs = require('fs');
var path = require('path');
var util = require('util');
var events = require('events');
var directoryWalker = require('directory-walker');
var pathFilters = require('path-filters');

var simpleRegExpReplacements = {
    "*": ".*?",
    "?": ".?"
};

var simpleRegExpTest = /[\?\*]/;


function isSimpleRegExp(str) {
    return simpleRegExpTest.test(str);
}

function escapeRegExpStr(str) {
    return str.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
}

function createSimpleRegExp(str) {
    var _this = this;
    
    return new RegExp("^" + str.replace(/[\*\?]|[^\*\?]*/g, function(match) {
        return simpleRegExpReplacements[match] || escapeRegExpStr(match);
    }) + "$");
}

function createSimpleRegExpFilter(str, matchResult) {
    var simpleRegExp = createSimpleRegExp(str);

    return function(str) {
        //console.error('str ', str, simpleRegExp);
        return simpleRegExp.test(str) ? matchResult || true : false;
    }
}

function getMatch(filters, path) {
    for (var i=0, len=filters.length; i<len; i++) {
        var result = filters[i](path);
        if (result !== false) {
            return result;
        }
    }
    return undefined;
}

function getMatches(filters, path) {
    var matches = [];
    for (var i=0, len=filters.length; i<len; i++) {
        var result = filters[i](path);
        if (result !== false) {
            matches.push(result);
        }
    }
    return matches;
}

function hasMatch(filters, path) {
    return getMatch(filters, path) !== undefined ? true : false;
}

function HotReloader(require) {
    events.EventEmitter.call(this);
    var _this = this;
    this._require = require;
    this._uncacheIncludes = [];
    this._uncacheExcludes = [];

    this._watchIncludes = {};
    this._watchExcludeFilters = [];
    this._watchExcludeFilters = pathFilters.create();

    this._reloadIncludes = [];
    this._reloadExcludes = [];
    this._specialReloadIncludes = pathFilters.create();
    this._specialReloadExcludes = pathFilters.create();
    this._pending = 0;
    this._reloadDelay = 2000;
    this._lastReloadTime = null;

    this._handleComplete = function() {
        if (--_this._pending === 0) {
            _this.emit('ready');
        }
    }
}

util.inherits(HotReloader, events.EventEmitter);

HotReloader.prototype._createFilterFunc = function(filter) {
    
}


HotReloader.prototype._addModuleFilters = function(target, args) {

    for (var i=0, len=args.length; i<len; i++) {
        var arg = args[i];
        if (Array.isArray(arg)) {
            this._addModuleFilters(target, arg);
            return;
        }
        else {

            var filter = arg;
            var filterFunc;

            if (typeof filter === 'string') {
                if (isSimpleRegExp(filter)) {
                    filterFunc = createSimpleRegExpFilter(filter);
                }
                else {

                    var moduleUri = this._require.resolve(filter);
                    filterFunc = function(input) {
                        return moduleUri === input;
                    }
                }
            }
            else if (filter.constructor === RegExp) {
                filterFunc = function(testModule) {
                    return testModule.test(filter);
                }
            }
            else if (typeof filter === 'function') {
                filterFunc = filter;
            }
            else {
                throw new Error("Invalid module filter: " + filter);
            }

            target.push(filterFunc);
        }
    }
}

HotReloader.prototype.uncache = function(filter) {
    this._addModuleFilters(this._uncacheIncludes, arguments);
    return this;
}

HotReloader.prototype.uncacheExclude = function(filter) {
    this._addModuleFilters(this._uncacheExcludes, arguments);
    return this;
}

HotReloader.prototype.reload = function(filter) {
    this._addModuleFilters(this._reloadIncludes, arguments);
    return this;
}

HotReloader.prototype.reloadExclude = function(filter) {
    this._addModuleFilters(this._reloadExcludes, arguments);
    return this;
}

HotReloader.prototype.watch = function(dir, recursive) {
    var _this = this;
    var watchIncludes = this._watchIncludes;

    function callback(path, eventArgs) {
        watchIncludes[path] = {path: path, stat: eventArgs.stat};
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
    this._specialReloadIncludes.add(filter, recursive, handlerFunc);
    return this;
}

HotReloader.prototype.specialReloadExclude = function(filter, recursive) {
    this._specialReloadExcludes.add(filter, recursive);
    return this;
}

HotReloader.prototype.onBeforeReload = function(func) {
    this.on('beforeReload', func);
    return this;
}


HotReloader.prototype.onAfterReload = function(func) {
    this.on('afterReload', func);
    return this;
}

HotReloader.prototype._shouldUncacheModule = function(moduleName) {
    if (!this._uncacheIncludes.length && !this._uncacheExcludes.length) {
        return true;
    }

    if (hasMatch(this._uncacheExcludes, moduleName)) {
        return false;
    }

    if (this._uncacheExcludes.length && !this._uncacheIncludes.length) {
        return true;
    }

    if (hasMatch(this._uncacheIncludes, moduleName)) {
        return true;
    }

    return false;
}

HotReloader.prototype._shouldReloadModule = function(moduleName) {
    if (!this._reloadIncludes.length && !this._reloadExcludes.length) {
        return false;
    }

    if (hasMatch(this._reloadExcludes, moduleName)) {
        return false;
    }

    if (this._reloadExcludes.length && !this._reloadIncludes.length) {
        return true;
    }

    if (hasMatch(this._reloadIncludes, moduleName)) {
        return true;
    }

    return false;
}

HotReloader.prototype.getRequire = function() {
    return this._require;
};

HotReloader.prototype._reload = function(path) {
    console.log('[hot-reload] Beginning reload...');


    var specialReloadHandlers;

    if (!hasMatch(this._specialReloadExcludes, path)) {
        specialReloadHandlers = getMatches(this._specialReloadIncludes, path);

    }
    var eventArgs = {path: path};
    var i;

    if (specialReloadHandlers.length !== 0) {
        this.emit('beforeSpecialReload', eventArgs);

        for (i=0; i<specialReloadHandlers.length; i++) {
            var specialReloadHandler = specialReloadHandlers[i];
            var result = specialReloadHandler(path);
            if (result === false) {
                break;
            }
        }
        
        this.emit('afterSpecialReload', eventArgs);
    }
    else {
        this.emit('beforeReload', eventArgs);

        var modulesToReload = [];

        // FIRST PASS: loop through the module cache and remove entries within directories that we are watching
        for (var key in require.cache) {
            var module = require.cache[key];

            if (this._shouldUncacheModule(module.filename)) {

                if (require.cache.hasOwnProperty(key)) {
                    // delete the cache entry only in first pass
                    delete require.cache[key];
                    
                    console.log('[hot-reload] Uncached module: ' + module.filename);

                    // keep track of the modules that
                    if (this._shouldReloadModule(module.filename)) {
                        modulesToReload.push(module);
                    }
                }
                    
                
            } else {
                //console.log('[hot-reload] Not uncaching ' + module.filename);
            }
        }


        for (i = 0; i < modulesToReload.length; i++) {
            var module = modulesToReload[i];
            this._reloadModule(module);
        }

        this.emit('afterReload', eventArgs);
    }

    console.log('[hot-reload] Reload complete');
}

HotReloader.prototype._reloadModule = function(module) {
    
    console.log('[hot-reload] Reloading module "' + module.filename + '"...');

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

        console.log('[hot-reload] Reloaded module: ' + module.filename);
    }
    catch(e) {
        console.error('[hot-reload] ERROR: Unable to reload module "' + module.filename + '". Exception: ' + e, e.stack);
    }
    
    
    this.emit('afterModuleReload', module);
}

HotReloader.prototype.start = function(func) {

    

    var watchIncludes = this._watchIncludes,
        watchExcludes = this._watchExcludes,
        _this = this;


    function startWatching() {

        function handleModified(event, path) {
            var now = Date.now();
            if (_this._lastReloadTime === null || now - _this._lastReloadTime > _this._reloadDelay) {

                if (hasMatch(_this._watchExcludeFilters, path)) {
                    console.log('[hot-reload] Modified file ignored since it is excluded: ' + path + ' ');
                    // The file excluded from being watched so ignore the event
                    return;
                }

                console.log('[hot-reload] File modified: ' + path + ' (' + event + ')');
                _this._reload(path);
                _this._lastReloadTime = now;
            }
        }

        function createWatcherFunc(watchInclude) {
            return function(event, filename) {
                if (watchInclude.stat.isDirectory()) {
                    if (!filename) {
                        handleModified(event, watchInclude.path);
                    }
                    else {
                        handleModified(event, require('path').join(watchInclude.path, filename));
                    }
                }
                else {
                    handleModified(event, watchInclude.path);
                }
            };
        }

        for (var path in watchIncludes) {
            if (watchIncludes.hasOwnProperty(path)) {
                if (hasMatch(_this._watchExcludeFilters, path)) {
                    console.log('[hot-reload] Not watching "' + path + '" since it is excluded.');
                    // The path is excluded from being watched...skip it
                    continue;
                }
                var watchInclude = watchIncludes[path];
                var watcher = fs.watch(
                    fs.realpathSync(path),
                    createWatcherFunc(watchInclude));

                console.log('[hot-reload] Watching ' + (watchInclude.stat.isDirectory() ? 'directory' : 'file') + ': ' + watchInclude.path);

                watchInclude.watcher = watcher;
            }
        }
    }

    if (this._pending) {
        this.on('ready', startWatching);
    }
    else {
        startWatching();
    }
    
    return this;
}



exports.create = function(require) {
    if (!require) {
        throw new Error("require argument is required");
    }

    return new HotReloader(require);
}

exports.HotReloader = HotReloader;

