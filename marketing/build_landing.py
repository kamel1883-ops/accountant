"""يبني landing-page.html ملفاً واحداً مكتفياً بذاته (الصورة + CSS/JS العروض مضمّنة)."""
import base64, json, os
H = os.path.dirname(os.path.abspath(__file__))
rd = lambda p: open(os.path.join(H, p), encoding='utf8').read()
t = rd('landing.template.html')
hero = 'data:image/jpeg;base64,' + base64.b64encode(open(os.path.join(H, 'assets/hero-team.jpg'), 'rb').read()).decode()
legal = json.load(open(os.path.join(H, 'assets/legal.json'), encoding='utf8'))
t = t.replace('__HERO__', hero).replace('/*DEMO_CSS*/', rd('demos/demo-engine.css')).replace('/*DEMO_JS*/', rd('demos/demo-engine.js'))
for k, K in [('privacy', 'PRIVACY'), ('terms', 'TERMS'), ('refund', 'REFUND')]:
    t = t.replace(f'__{K}_T__', legal[k][0]).replace(f'__{K}__', legal[k][1])
open(os.path.join(H, 'landing-page.html'), 'w', encoding='utf8').write(t)
print('landing-page.html', len(t) // 1024, 'KB')
