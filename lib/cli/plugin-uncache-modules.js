module.exports = function(hotReload, config) {
    var uncache = config.uncache;
    if (typeof uncache === 'string') {
        uncache = [uncache];
    }

    uncache.forEach(function(path) {
        hotReload.uncache(path);
    });
};

