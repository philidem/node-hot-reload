var nodePath = require('path');
var fs = require('fs');
var cwd = process.cwd();
var configFile = nodePath.resolve(cwd, 'hot-reload.json');
var json;
var fsOptions = {encoding: 'utf8'};
var jsonminify = require('jsonminify');
var propertyHandlers = require('property-handlers');
var childProcess = require('child_process');

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

var watcher =  require('../watcher').create();

propertyHandlers(config, {
    loggingEnabled: function(value) {
        watcher.loggingEnabled(value);
    },
    watch: function(value) {
        for (var i=0; i<value.length; i++) {
            var path = value[i];
            watcher.watch(nodePath.resolve(cwd, path));
        }
    },
    watchExclude: function(value) {
        for (var i=0; i<value.length; i++) {
            var path = value[i];
            watcher.watchExclude(path);
        }
    }
}, 'Unable to load config at path "' + configFile + '"');

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
    extend(env, watcher.childProcessEnv);
    child = watcher.childProcess = childProcess.fork(main, argv, {
        cwd: process.cwd(),
        env: env
    });
}

function restart() {
    if (child) {
        if (child.connected) {
            child.once('exit', function() {
                watcher.log('Restarting server app...');
                fork();
            });
            child.kill();
        }
    } else {
        fork();
    }
}

watcher.start();
restart();

watcher.on('change', function() {
    restart();
});
