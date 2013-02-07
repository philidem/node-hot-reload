// third-party dependencies
var fs = require('fs');
var path = require('path');
var util = require('util');
var events = require('events');

/**
 * Reload a given module.
 * @param {Module} module a module
 * @param {EventEmitter} an event emitter
 */
function reloadModule(module, eventEmitter) {
    console.log('[Hot Reload] Reloading module: ' + module.filename);

    if (eventEmitter) {
        eventEmitter.emit('beforeModuleReload', module);
    }

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

    if (eventEmitter) {
        eventEmitter.emit('afterModuleReload', module);
    }
}

/**
 * This function will watch a directory for changes.
 * If any file/directory change occurs, then all modules under this
 * directory will be reloaded.
 *
 * NOTE: It's not sufficient to reload just a single module because of the
 * interdependencies that might exist between modules.
 */
exports.watch = function(dir, options)
{
    var eventEmitter = new events.EventEmitter();

    if (!Array.isArray(dir)) {
        dir = [dir];
    }

    var excludes = null;
    var excludesArray = (options) ? options.excludes : null;
    if (excludesArray) {
        excludes = {};
        for ( var i = 0; i < excludesArray.length; i++) {

            excludesArray[i] = filename = path.normalize(excludesArray[i]);
            excludes[filename] = true;
        }
    }
    
    var lastReloadTimestamp = new Date();

    function isModuleExcluded(filename) {

        if (excludesArray) {
            // makes sure file is not excluded or within an excluded directory
            for (var i = 0; i < excludesArray.length; i++) {
                var exclude = excludesArray[i];
                if (filename.indexOf(exclude) === 0) {
                    return true;
                }
            }
        }

        // make sure module is within watched directory
        for (var i = 0; i < dir.length; i++) {
            if (filename.indexOf(dir[i]) === 0) {
                return false;
            }
        }

        return true;
    }

    var reloadTimeout = null;
    function scheduleReload() {

        if (reloadTimeout) {
            clearTimeout(reloadTimeout);
        }

        reloadTimeout = setTimeout(reload, 1500);
    }

    /**
     * Reload all of the modules within a directory. This directory will typically
     * be the root of the source tree.
     *
     * @param {String} dir the directory whose nested modules will be reloaded
     * @param {Object} excludes an object whose keys are modules that will never be reloaded
     *      (typically, the module that invoked the watching will never be reloaded because
     *      it would produce duplicate listeners)
     * @param {EventEmitter} eventEmitter the event emitter.
     */
    function reload() {
        reloadTimeout = null;

        var now = new Date();
        var diff = now.getTime() - lastReloadTimestamp.getTime();
        if (diff <= 500) {
            return;
        }

        if (eventEmitter) {
            eventEmitter.emit('beforeReload');
        }

        var reloadableModules = [];

        // FIRST PASS: loop through the module cache and remove entries within directories that we are watching
        for (var key in require.cache) {
            var module = require.cache[key];

            if (!isModuleExcluded(module.filename)) {

                // delete the cache entry only in first pass
                delete require.cache[key];

                // keep track of the modules that
                reloadableModules.push(module);
            }
        }

        // SECOND PASS: Now trigger a reload of all of the modules since their cache entry was removed
        for (var i = 0; i < reloadableModules.length; i++) {
            // reload the module
            reloadModule(reloadableModules[i], eventEmitter);
        }

        if (eventEmitter) {
            eventEmitter.emit('afterReload');
        }

        lastReloadTimestamp = now;
    }

    function watchDirectory(dir) {
        // normalize the directory path that we are watching
        dir = path.normalize(dir);

        var directoryWalker = require('directory-walker');

        directoryWalker.walk({
            basedir : dir,
            excludes : options ? options.excludes : undefined,

            onFile : function(file) {
                if (excludes && excludes[file]) {
                    return false;
                }

                console.log('[Hot Reload] Watching file: ' + file);
                fs.watch(file,
                    function(event, changedFile) {
                        console.log('[Hot Reload] File changed: ' + (changedFile || file));
                        scheduleReload();
                    });
            },

            onDirectory : function(directory) {
                if (excludes && excludes[directory]) {
                    return false;
                }

                console.log('[Hot Reload] Watching directory: ' + directory);
                fs.watch(directory,
                    function(event, file) {
                        console.log('[Hot Reload] Directory changed: ' + file);
                        scheduleReload();
                    });
            },

            listeners : {
                'error' : function(err) {
                    console.error(err);
                }
            }
        });
    }

    var normalized;
    for (var i = 0; i < dir.length; i++) {
        dir[i] = normalized = path.normalize(dir[i]) + '/';
        watchDirectory(normalized);
    }

    return eventEmitter;
};

