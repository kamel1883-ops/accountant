"""تسجيل العروض التوضيحية كملفات MP4 (15 ثانية).
التشغيل:  pip install playwright && playwright install chromium && python record.py
ثبّت خط Tajawal على الجهاز قبل التسجيل ليظهر النص بنفس هوية الموقع.
"""
import os, subprocess, time, shutil, sys
import numpy as np
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'videos'); os.makedirs(OUT, exist_ok=True)
KEYS = ['invoice', 'journal', 'pos', 'stock', 'tax']

with sync_playwright() as p:
    b = p.chromium.launch()
    for k in KEYS:
        tmp = os.path.join(OUT, '_tmp_' + k); shutil.rmtree(tmp, ignore_errors=True)
        ctx = b.new_context(viewport={'width': 1280, 'height': 720}, record_video_dir=tmp, record_video_size={'width': 1280, 'height': 720})
        pg = ctx.new_page()
        pg.goto('file://' + os.path.join(HERE, 'record.html') + '?v=' + k)
        pg.wait_for_timeout(700)
        pg.evaluate('window.startDemo()')
        pg.wait_for_function('window.__demoDone===true', timeout=30000)
        pg.wait_for_timeout(1500)
        ctx.close()
        webm = [f for f in os.listdir(tmp) if f.endswith('.webm')][0]
        mp4 = os.path.join(OUT, f'jadara-{k}.mp4')
        src = os.path.join(tmp, webm)
        # نحدد لحظة بدء العرض بدقة عبر وميض التزامن (لون أرجواني) في أول الفيديو
        raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', src, '-vf', 'fps=20,scale=32:18', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
        frames = np.frombuffer(raw, np.uint8).reshape(-1, 18, 32, 3).mean(axis=(1, 2))
        is_mag = lambda f: f[0] > 200 and f[1] < 70 and f[2] > 200
        is_cyan = lambda f: f[0] < 110 and f[1] > 170 and f[2] > 170
        i0 = next(i for i, f in enumerate(frames) if is_mag(f))
        i1 = next(i for i, f in enumerate(frames) if i > i0 and is_cyan(f))
        start = i0 / 20 + 0.24
        span = i1 / 20 - 0.06 - start          # مدة العرض كما سُجّلت (قد تكون ممتدة زمنياً)
        factor = 15.0 / span                    # نعيد ضبط السرعة ليصبح الفيديو 15 ثانية بالضبط
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{start:.3f}', '-t', f'{span:.3f}', '-i', src,
                        '-vf', f'setpts=PTS*{factor:.5f}', '-r', '25', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p',
                        '-movflags', '+faststart', '-an', mp4], check=True)
        shutil.rmtree(tmp, ignore_errors=True)
        print('ok', mp4, os.path.getsize(mp4) // 1024, 'KB')
    b.close()
