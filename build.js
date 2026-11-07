// Builds docs/index.html (one self-contained page) from src/template.html + src/mesher.js.
// Usage: node build.js
const fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const page = read('src/template.html').replace('/*__MESHER__*/', () => read('src/mesher.js'));
const head = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>[hidden]{display:none!important}body{margin:0}</style></head><body>\n';
fs.mkdirSync(path.join(__dirname, 'docs'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'docs/index.html'), head + page + '\n</body></html>\n');
// syntax check of the inline script
const js = /<script>([\s\S]*)<\/script>/.exec(page)[1];
new Function(js);
console.log('built docs/index.html (' + Math.round((head.length + page.length) / 1024) + ' KB)');
