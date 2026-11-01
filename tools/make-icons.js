// node tools/make-icons.js
// 云球迷 Design G: tools/yunqiumi-icon.svg → public/icons/*.png + android/res/mipmap-*/ic_launcher.png
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');
function run(script) {
  const r = spawnSync(process.execPath, [path.join(root, 'tools', script)], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}
run('build-yunqiumi-svg.js');
run('render-yunqiumi-icon.js');
