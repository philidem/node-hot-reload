node-hot-reload
===============

Utility code for watching source files for changes and reloading modules

# Installation:
```
npm install hot-reload --global
```

# Usage

## Command Line Interface Usage
```
hot-reload [main-script]
```

## Configuration

The `hot-reload` CLI will load its configuration from `<cwd>/hot-reload.json`. A sample configuration is shown below:
```javascript
{
    "watch": [
        "config/",
        "src/",
        "init-app.js",
        "routes.js",
        "package.json"
    ],
    "logging-enabled": true,
    "plugins": {
        "hot-reload-uncache-modules": {
            "enabled": true,
            "uncache": "*" // Uncache all cached Node modules
        },
        "./hot-reload": {
            "enabled": true
        }
    }
}
```

## Plugins
A plugin is implemented as a module that exports a function as shown in the sample plugin below:

```javascript
var server = require('./server');
var nodePath = require('path');

module.exports = function(hotReload, config) {
    hotReload.specialReload(nodePath.join(__dirname, 'routes.js'), function(path) {
        hotReload.log('Reloading routes: ' + path);
        delete require.cache[path];
        server.reload();
    });

    hotReload.on('afterReload', function() {
        server.reload();    
    });
};
```

## JavaScript API Usage
Example Usage:
```javascript
require('hot-reload').create(require)
    .uncache("*")
    .uncacheExclude(__filename)
    .specialReload(path.join(__dirname, 'optimizer-config.xml'), initApp)
    .specialReload(path.join(__dirname, 'routes.js'), function(path) {
        delete require.cache[path];
        initApp();
    })
    .watch(path.join(__dirname, 'modules'))
    .watch(path.join(__dirname, 'optimizer-config.xml'))
    .watch(path.join(__dirname, 'routes.js'))
    .watchExclude("*.css")
    .onBeforeReload(function() {
        
    })
    .onAfterReload(function() {
        
    })
    .start();
```
