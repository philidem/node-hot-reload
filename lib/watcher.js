// third-party dependencies
var path = require('path');
var util = require('util');
var events = require('events');
var pathFilters = require('path-filters');
var chokidar = require('chokidar');
var cwd = process.cwd();

function relPath(filePath) {
    return path.relative(cwd, filePath);
}

function leftPad(str, len) {
    var numOfSpacesNeeded = len - str.length;
    if (numOfSpacesNeeded <= 0) {
        return str;
    }

    var buffer = new Array(numOfSpacesNeeded + 1);
    buffer[0] = str;
    for (var i = 1; i <= numOfSpacesNeeded; i++) {
        buffer[i] = ' ';
    }

    return buffer.join('');
}

function Watcher(options) {
    events.EventEmitter.call(this);

    this._watched = [];
    this._loggingEnabled = true;
    this._watchExcludeFilters = pathFilters.create();
}

util.inherits(Watcher, events.EventEmitter);

Watcher.prototype.loggingEnabled = function(enabled) {
    this._loggingEnabled = enabled !== false;
    return this;
};

Watcher.prototype.watch = function(dir, recursive) {
    if (Array.isArray(dir)) {
        for (var i = 0; i < dir.length; i++) {
            this._watched.push({
                dir: dir[i],
                recursive: recursive
            });
        }
    } else {
        this._watched.push({
            dir: dir,
            recursive: recursive
        });
    }

    return this;
};

Watcher.prototype.watchExclude = function(filter, recursive) {
    this.log('Added exclude filter: ' + filter);
    this._watchExcludeFilters.add(filter, recursive);
    return this;
};

Watcher.prototype.log = function(message) {
    if (this._loggingEnabled) {
        var args = Array.prototype.slice.call(arguments, 0);
        args.unshift('[hot-reload]');
        console.log.apply(console, args);
    }
};

Watcher.prototype.start = function(func) {

    var self = this;

    var options = {
        usePolling: false,
        ignoreInitial: true,
        ignored: function(path, stats) {
            var relativePath = relPath(path);

            var ignored = self._watchExcludeFilters.hasMatch(relativePath);
            if (this._loggingEnabled && ignored) {
                self.log(leftPad('Ignoring:', 10) + relativePath);
            }
            return ignored;
        }
    };

    var fsWatcher = chokidar.watch(this._watched.map(function(watched) {
        return watched.dir;
    }), options);

    fsWatcher.on('all', function(eventType, path, stat) {
        var relativePath = relPath(path);

        var desc;
        if (stat) {
            desc = stat.isDirectory() ? ' directory' : ' file';
        } else {
            desc = '';
        }

        self.log(leftPad('Changed' +  desc + ':', 10) + relativePath);

        self.emit('change', path, stat);
    });

    return this;
};

exports.create = function(options) {
    return new Watcher(options || {});
};

exports.Watcher = Watcher;
