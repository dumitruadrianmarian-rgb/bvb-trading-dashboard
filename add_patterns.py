import re

js_path = "/home/pi/bvb-trading-dashboard/static/script.js"
with open(js_path, "r") as f:
    js = f.read()

old_patterns = """        // 4. Bearish Engulfing
        if (isBullish2 && isBearish3 && c3.close <= c2.open && c3.open >= c2.close && body3 > body2) {
            patterns.push({ time: c3.timestamp, name: 'Bearish Engulfing', type: 'bearish', desc: 'Corpul roșu înghite complet corpul verde precedent. Presiune imensă de vânzare.' });
            continue;
        }
        
        // 5. Doji
        if (body3 <= dojiThreshold && total3 > (c3.close * 0.005)) {
            patterns.push({ time: c3.timestamp, name: 'Doji', type: 'neutral', desc: 'Indecizie totală pe piață (Echilibru Bulls/Bears).' });
            continue;
        }"""

new_patterns = """        // 4. Bearish Engulfing
        if (isBullish2 && isBearish3 && c3.close <= c2.open && c3.open >= c2.close && body3 > body2) {
            patterns.push({ time: c3.timestamp, name: 'Bearish Engulfing', type: 'bearish', desc: 'Corpul roșu înghite complet corpul verde precedent. Presiune imensă de vânzare.' });
            continue;
        }
        
        // 5. Bullish Marubozu
        if (isBullish3 && wickUp3 <= body3 * 0.1 && wickDown3 <= body3 * 0.1 && body3 > (c3.close * 0.005)) {
            patterns.push({ time: c3.timestamp, name: 'Bullish Marubozu', type: 'bullish', desc: 'Lumânare verde mare aproape fără umbre. Cumpărătorii au controlat complet sesiunea de la deschidere la închidere.' });
            continue;
        }

        // 6. Bearish Marubozu
        if (isBearish3 && wickUp3 <= body3 * 0.1 && wickDown3 <= body3 * 0.1 && body3 > (c3.close * 0.005)) {
            patterns.push({ time: c3.timestamp, name: 'Bearish Marubozu', type: 'bearish', desc: 'Lumânare roșie mare aproape fără umbre. Vânzătorii au controlat complet sesiunea.' });
            continue;
        }

        // 7. Spinning Top (Neutral)
        if (body3 > 0 && body3 <= total3 * 0.25 && wickUp3 > body3 && wickDown3 > body3 && total3 > (c3.close * 0.005)) {
            patterns.push({ time: c3.timestamp, name: 'Spinning Top', type: 'neutral', desc: 'Corp mic și umbre lungi în ambele direcții. Indecizie și posibilă schimbare de direcție.' });
            continue;
        }
        
        // 8. Doji (Relaxat)
        if (body3 <= total3 * 0.15 && total3 > (c3.close * 0.002)) {
            patterns.push({ time: c3.timestamp, name: 'Doji', type: 'neutral', desc: 'Indecizie totală pe piață (Echilibru Bulls/Bears).' });
            continue;
        }"""

js = js.replace(old_patterns, new_patterns)

with open(js_path, "w") as f:
    f.write(js)

# Bump cache to v67
html_path = "/home/pi/bvb-trading-dashboard/static/index.html"
with open(html_path, "r") as f:
    html = f.read()
html = re.sub(r'script\.js\?v=\d+', 'script.js?v=67', html)
with open(html_path, "w") as f:
    f.write(html)
