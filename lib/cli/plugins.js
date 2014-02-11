var resolve = require('../resolve');

var nativePlugins = {
    'hot-reload-uncache-modules': './plugin-uncache-modules'
};

function loadPlugin(hotReload, moduleName, config, basedir) {
    var modulePath;
    var pluginModule;

    try {
        modulePath = resolve(moduleName, basedir);
    }
    catch(e) {
        if (nativePlugins[moduleName]) {
            pluginModule = require(nativePlugins[moduleName]);
            pluginModule.__hotReload__ = false;
        }
    }

    if (!modulePath && !pluginModule) {
        throw new Error('Plugin not found: ' + moduleName);
    }

    if (!pluginModule) {
        pluginModule = require(modulePath);
        pluginModule.__hotReload__ = false;
    }

    if (typeof pluginModule === 'function') {
        pluginModule = {
            init: pluginModule
        };
    }
    
    if (pluginModule.init) {
        pluginModule.init(hotReload, config);
    }

    if (pluginModule.beforeReload) {
        hotReload.beforeReload(pluginModule.beforeReload);
    }

    if (pluginModule.afterReload) {
        hotReload.afterReload(pluginModule.afterReload);
    }
}

exports.loadPlugin = loadPlugin;