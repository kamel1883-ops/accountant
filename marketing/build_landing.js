const fs = require('fs');
const path = require('path');
const H = __dirname;
let t = fs.readFileSync(path.join(H, 'landing.template.html'), 'utf8');
const css = fs.readFileSync(path.join(H, 'demos/demo-engine.css'), 'utf8');
const js = fs.readFileSync(path.join(H, 'demos/demo-engine.js'), 'utf8');
const legal = JSON.parse(fs.readFileSync(path.join(H, 'assets/legal.json'), 'utf8'));
const hp = path.join(H, 'assets/hero-team.jpg');
let hero;
if (fs.existsSync(hp)) {
  hero = 'data:image/jpeg;base64,' + fs.readFileSync(hp).toString('base64');
} else {
  const old = fs.readFileSync(path.join(H, 'landing-page.html'), 'utf8');
  const m = old.match(/src="(data:image\/jpeg;base64,[^"]+)"/);
  if (!m) throw new Error('no hero image');
  hero = m[1];
}
t = t.replace('__HERO__', hero).replace('/*DEMO_CSS*/', css).replace('/*DEMO_JS*/', js);
for (const [k, K] of [['privacy', 'PRIVACY'], ['terms', 'TERMS'], ['refund', 'REFUND']]) {
  t = t.replace(`__${K}_T__`, legal[k][0]).replace(`__${K}__`, legal[k][1]);
}
fs.writeFileSync(path.join(H, 'landing-page.html'), t);
console.log('landing-page.html', Math.round(t.length / 1024), 'KB');
