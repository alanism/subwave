'use strict';
// Electron's utility process supplies Node; no system Node installation or
// terminal is needed by the installed player.
require(require('node:path').join(process.env.SUBWAVE_WEB_ROOT, 'server.js'));
