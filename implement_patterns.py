import re

# 1. Update index.html
html_path = "/home/pi/bvb-trading-dashboard/static/index.html"
with open(html_path, "r") as f:
    html = f.read()

ai_panel = """
                <!-- AI Trading Assistant Panel -->
                <div class="ai-assistant-panel" style="margin-top: 1.5rem; background: var(--card-bg); border-radius: 16px; padding: 1.5rem; box-shadow: var(--neu-out);">
                    <div class="news-header">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 256 256" style="color: #8b5cf6;"><path fill="currentColor" d="M208,104a80,80,0,1,0-80,80,8.02,8.02,0,0,1,8,8v16a8,8,0,0,1-16,0V192a96,96,0,1,1,96-96Zm-80,48a64,64,0,1,1,64-64A64.07,64.07,0,0,1,128,152Z"/></svg>
                        <h3>Asistent AI: Pattern-uri Japoneze (Price Action)</h3>
                    </div>
                    <div id="ai-patterns-container" style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem;">
                        <div class="loading-placeholder" style="color: var(--text-muted);">Analizez graficul curent...</div>
                    </div>
                </div>
                
                <!-- Stock Related News Feed -->"""

if "ai-patterns-container" not in html:
    html = html.replace("<!-- Stock Related News Feed -->", ai_panel)
    
# bump cache version in index.html
html = re.sub(r'script\.js\?v=\d+', 'script.js?v=65', html)

with open(html_path, "w") as f:
    f.write(html)


# 2. Update script.js
js_path = "/home/pi/bvb-trading-dashboard/static/script.js"
with open(js_path, "r") as f:
    js = f.read()

pattern_func = """
function detectCandlePatterns(dataSlice) {
    const patterns = [];
    const recentSlice = dataSlice.slice(-40); // scan last 40 days
    
    for (let i = 2; i < recentSlice.length; i++) {
        const c1 = recentSlice[i-2];
        const c2 = recentSlice[i-1];
        const c3 = recentSlice[i];
        
        const body3 = Math.abs(c3.open - c3.close);
        const wickUp3 = c3.high - Math.max(c3.open, c3.close);
        const wickDown3 = Math.min(c3.open, c3.close) - c3.low;
        const total3 = c3.high - c3.low;
        const isBullish3 = c3.close > c3.open;
        const isBearish3 = c3.close < c3.open;
        
        const isBullish2 = c2.close > c2.open;
        const isBearish2 = c2.close < c2.open;
        const body2 = Math.abs(c2.open - c2.close);
        
        const dojiThreshold = total3 * 0.1;
        
        // 1. Hammer (Bullish)
        if (wickDown3 > body3 * 2 && wickUp3 < body3 * 0.5 && body3 > 0) {
            patterns.push({ time: c3.timestamp, name: 'Hammer', type: 'bullish', desc: 'Umbra lungă inferioară (minim 2x corpul) arată o respingere puternică a prețurilor mici. Semnal Bullish.' });
            continue;
        }
        
        // 2. Shooting Star (Bearish)
        if (wickUp3 > body3 * 2 && wickDown3 < body3 * 0.5 && body3 > 0) {
            patterns.push({ time: c3.timestamp, name: 'Shooting Star', type: 'bearish', desc: 'Umbra lungă superioară arată respingerea prețurilor mari de către vânzători. Semnal Bearish.' });
            continue;
        }
        
        // 3. Bullish Engulfing
        if (isBearish2 && isBullish3 && c3.close >= c2.open && c3.open <= c2.close && body3 > body2) {
            patterns.push({ time: c3.timestamp, name: 'Bullish Engulfing', type: 'bullish', desc: 'Corpul verde înghite complet corpul roșu precedent. Momentum de cumpărare masiv.' });
            continue;
        }
        
        // 4. Bearish Engulfing
        if (isBullish2 && isBearish3 && c3.close <= c2.open && c3.open >= c2.close && body3 > body2) {
            patterns.push({ time: c3.timestamp, name: 'Bearish Engulfing', type: 'bearish', desc: 'Corpul roșu înghite complet corpul verde precedent. Presiune imensă de vânzare.' });
            continue;
        }
        
        // 5. Doji
        if (body3 <= dojiThreshold && total3 > (c3.close * 0.005)) {
            patterns.push({ time: c3.timestamp, name: 'Doji', type: 'neutral', desc: 'Indecizie totală pe piață (Echilibru Bulls/Bears).' });
            continue;
        }
    }
    return patterns.reverse().slice(0, 3);
}

// Render the main interactive stock chart using ApexCharts
"""

if "detectCandlePatterns" not in js:
    js = js.replace("// Render the main interactive stock chart using ApexCharts\n", pattern_func)

# Replace data mapping
old_map = """    const dates = slice.map(d => d.timestamp);
    const prices = slice.map(d => d.close);
    
    // Base series configuration
    const series = [
        {
            name: activeSymbol,
            data: prices,
            type: 'area'
        }
    ];"""
    
new_map = """    const dates = slice.map(d => d.timestamp);
    
    // Convert to OHLC
    const ohlcData = slice.map(d => ({
        x: d.timestamp,
        y: [d.open, d.high, d.low, d.close]
    }));
    
    // Base series configuration
    const series = [
        {
            name: activeSymbol,
            data: ohlcData,
            type: 'candlestick'
        }
    ];
    
    // Detect patterns
    const detectedPatterns = detectCandlePatterns(slice);"""

js = js.replace(old_map, new_map)

# Add annotations points
old_annotations = """    if (portItem) {
        annotationsY.push({
            y: portItem.avgPrice,"""

new_annotations = """    const annotationsPoints = [];
    detectedPatterns.forEach(p => {
        annotationsPoints.push({
            x: p.time,
            seriesIndex: 0,
            label: {
                borderColor: p.type === 'bullish' ? '#10b981' : (p.type === 'bearish' ? '#ef4444' : '#8b5cf6'),
                style: {
                    color: '#fff',
                    background: p.type === 'bullish' ? '#10b981' : (p.type === 'bearish' ? '#ef4444' : '#8b5cf6'),
                    fontSize: '11px',
                },
                text: p.name,
                offsetY: p.type === 'bullish' ? 30 : -30
            }
        });
    });

    const aiContainer = document.getElementById("ai-patterns-container");
    if (aiContainer) {
        if (detectedPatterns.length === 0) {
            aiContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.95rem;">Nu s-a detectat niciun pattern major recent (din cele de bază). Piața este într-o fază de consolidare.</div>';
        } else {
            aiContainer.innerHTML = '';
            detectedPatterns.forEach(p => {
                const dateStr = new Date(p.time).toLocaleDateString("ro-RO", {day: 'numeric', month: 'short'});
                const icon = p.type === 'bullish' ? '🟢' : (p.type === 'bearish' ? '🔴' : '⚪');
                const colorClass = p.type === 'bullish' ? '#10b981' : (p.type === 'bearish' ? '#ef4444' : '#8b5cf6');
                
                aiContainer.innerHTML += `
                    <div style="padding: 1rem; border-radius: 12px; background: rgba(255,255,255,0.02); box-shadow: var(--neu-in); display: flex; flex-direction: column; gap: 0.4rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <strong style="font-size: 1.05rem; color: ${colorClass};">${icon} ${p.name}</strong>
                            <span style="font-size: 0.85rem; color: var(--text-muted);">${dateStr}</span>
                        </div>
                        <div style="font-size: 0.95rem; color: var(--text-muted); line-height: 1.5;">
                            ${p.desc}
                        </div>
                    </div>
                `;
            });
        }
    }

    if (portItem) {
        annotationsY.push({
            y: portItem.avgPrice,"""
            
js = js.replace(old_annotations, new_annotations)

old_options = """    const options = {
        annotations: {
            yaxis: annotationsY
        },"""
new_options = """    const options = {
        annotations: {
            yaxis: annotationsY,
            points: annotationsPoints
        },"""
js = js.replace(old_options, new_options)

with open(js_path, "w") as f:
    f.write(js)
