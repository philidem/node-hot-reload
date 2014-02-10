var nodePath = require('path');
var fs = require('fs');
var cwd = process.cwd();
var configFile = nodePath.resolve(cwd, 'hot-reload.json');
var json;
var fsOptions = {encoding: 'utf8'};
var jsonminify = require("jsonminify");
var resolve = require('../resolve');
var propertyHandlers = require('property-handlers');
var plugins = require('./plugins');

function usage() {
    console.log('Usage: hot-reload <main> [args]');
}
if (process.argv.length < 3) {
    usage();
    console.error('main argument is required.');
    process.exit(1);
}

try {
    json = jsonminify(fs.readFileSync(configFile, fsOptions));
}
catch(e) {
    json = '';
    fs.createReadStream(nodePath.join(__dirname, '../default-config.json'), fsOptions)
        .on('data', function(data) {
            json += data;
        })
        .pipe(fs.createWriteStream(configFile, fsOptions));
}

var config = JSON.parse(json);

// Fix process.argv so it looks like Node.js executed the main file directly
process.argv.splice(1, 1); // Remove the second argument which is the path to the "hot-reload" executable

var main = process.argv[1];

if (main.charAt(0) !== '.') {
    main = './' + main;
}

// Resolve the second argument to be the full path to the main script
main = process.argv[1]= resolve(main, cwd);

var hotReload =  require('../').create({ basedir: cwd });
propertyHandlers(config, {
    watch: function(value) {
        for (var i=0; i<value.length; i++) {
            var path = value[i];
            var recursive = null;

            if (path) {
                if (typeof path === 'object') {
                    recursive = path.recursive;
                    path = path.path;
                }
            }
            path = nodePath.resolve(cwd, path);
            hotReload.watch(path, recursive);
        }
    },
    watchExclude: function(value) {
        for (var i=0; i<value.length; i++) {
            var path = value[i];
            var recursive = null;

            if (path) {
                if (typeof path === 'object') {
                    recursive = path.recursive;
                    path = path.path;
                }
            }

            hotReload.watchExclude(path, recursive);
        }
    },
    plugins: function(value) {
        for (var pluginModuleName in value) {
            if (value.hasOwnProperty(pluginModuleName)) {
                var pluginConfig = value[pluginModuleName] || {};
                if (pluginConfig.enabled === false) {
                    continue;
                }

                delete pluginConfig.enabled;

                plugins.loadPlugin(hotReload, pluginModuleName, pluginConfig, cwd);
            }
        }
    },
    loggingEnabled: function(value) {
        hotReload.loggingEnabled(value);
    }
}, 'Unable to load config at path "' + configFile + '"');

hotReload.start();

require(main);