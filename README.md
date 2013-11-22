node-hot-reload
===============

Utility code for watching source files for changes and reloading modules

# Installation:
```
npm install hot-reload
```

# Usage

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
