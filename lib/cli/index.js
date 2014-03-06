var nodePath = require('path');
var fs = require('fs');
var cwd = process.cwd();
var configFile = nodePath.resolve(cwd, 'hot-reload.json');
var json;
var fsOptions = {encoding: 'utf8'};
var jsonminify = require("jsonminify");
var propertyHandlers = require('property-handlers');
var plugins = require('./plugins');
var childProcess = require('child_process');
var q = require('q');
var jsonminify = require('jsonminify');

// function usage() {
//     console.log('Usage: hot-reload [<main> [..args]]');
// }

try {
    json = jsonminify(fs.readFileSync(configFile, fsOptions));
}
catch(e) {
    json = fs.readFileSync(nodePath.join(__dirname, '../../default-config.json'), fsOptions);
    fs.writeFile(configFile, json, fsOptions, function() {});
}

json = jsonminify(json);
var config = json ? JSON.parse(json) : {};

var main;
var argv;

if (process.argv.length > 2) {
    main = process.argv[2];
}

if (process.argv.length > 3) {
    argv = process.argv.concat([]).slice(3);
}
else {
    argv = [];
}

if (!main) {
    var pkg = require(nodePath.join(process.cwd(), 'package.json'));
    main = pkg.main || 'index.js';
}

main = nodePath.resolve(process.cwd(), main);

var shouldRestart = true;

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
    },
    restart: function(value) {
        shouldRestart = value === true;
    }
}, 'Unable to load config at path "' + configFile + '"');

hotReload.start();

var child;


function extend(target, source) { //A simple function to copy properties from one project to another
    if (!target) { //Check if a target was provided, otherwise create a new empty object to return
        target = {};
    }
    for (var propName in source) {
        if (source.hasOwnProperty(propName)) { //Only look at source properties that are not inherited
            target[propName] = source[propName]; //Copy the property
        }
    }

    return target;
}

function fork() {

    var env = extend({}, process.env);
    extend(env, hotReload.childProcessEnv);
    child = hotReload.childProcess = childProcess.fork(main, argv, {
        cwd: process.cwd(),
        env: env
    });
}

function restart() {
    if (child) {
        var deferred = q.defer();

        if (child.connected) {
            child.once('exit', function() {
                hotReload.log('Restarting server app...');
                fork();
                deferred.resolve();
            });
            child.kill();    
        } else {
            deferred.resolve();
        }

        return deferred.promise;
    } else {
        fork();
    }
}

restart();

if (shouldRestart) {
    hotReload.on('beforeReload', function() {
        hotReload.waitFor(restart());
    });
}

