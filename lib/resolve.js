var fs = require('fs');
var nodePath = require('path');
var Module = require('module').Module;

function startsWith(str, prefix) {
    if (str.length < prefix.length) {
        return false;
    }
    
    return str.substring(0, prefix.length) == prefix;
}

function find(path, from, callback) {
    

    if (process.platform === 'win32') {
        path = path.replace(/\//g, '\\'); // Replace forward slashes with back slashes
    }

    if (startsWith(path, './') || startsWith(path, '../')) {
        // Don't go through the search paths for relative paths
        return callback(nodePath.join(from, path));
    }
    else {
        var paths = Module._nodeModulePaths(from);

        for (var i=0, len=paths.length; i<len; i++) {
            var searchPath = paths[i];

            var result = callback(nodePath.join(searchPath, path));
            if (result) {
                return result;
            }
        }
    }
}

module.exports = function(path, from) {
    var resolvedPath = find(path, from, function(path) {
        // Try with the extensions
        var extensions = require.extensions;
        for (var ext in extensions) {
            if (extensions.hasOwnProperty(ext)) {
                var pathWithExt = path + ext;
                if (fs.existsSync(pathWithExt)) {
                    return pathWithExt;
                }
            }
        }

        if (fs.existsSync(path)) {
            return path;
        }

        return null;
    });

    if (!resolvedPath) {
        throw new Error('Module not found: ' + path);
    }

    return resolvedPath;
};