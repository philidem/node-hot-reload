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
var timerId;
var timeout = 100;

function fork() {
    console.log('[hot-reload] App starting...');
    child = childProcess.fork(main, argv, {
        cwd: process.cwd(),
        env: process.env
    });
}

function restart() {
    timerId = null;

    if (child) {
        console.log('[hot-reload] Restarting app...');
        // we already spawned a child process
        if (child.connected) {
            child.once('exit', function() {
                fork();
            });

            // tell the child process to end
            child.kill();
        }
    } else {
        fork();
    }
}

function scheduleRestart() {
    if (!timerId) {
        timerId = setTimeout(restart, timeout);
    }
}

watcher.start();

// schedule immediate start
restart();

watcher.on('change', function(path) {
    console.log('[hot-reload] Change detected to ' + path + '. App will be restarted in ' + timeout + ' ms.');
    scheduleRestart();
});
