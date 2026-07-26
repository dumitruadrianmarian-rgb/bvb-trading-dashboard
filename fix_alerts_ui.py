import re

html_path = "/home/pi/bvb-trading-dashboard/static/index.html"
with open(html_path, "r") as f:
    html = f.read()

old_alert = """                        <!-- Price Alerts Widget -->
                        <div class="price-alerts-widget" style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;">
                            <div style="font-size: 12px; font-weight: 700; color: var(--text-primary); margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                                <i class="ph-duotone ph-bell"  style="font-size: 14px; width:14px;height:14px;color:var(--color-blue);"></i>
                                Alerte de Preț Locale
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <input type="number" id="alert-target-price" placeholder="Target RON" step="any" style="width: 100%; padding: 6px 8px; border-radius: 4px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; font-size: 12px;">
                                <button id="btn-set-alert" style="padding: 6px 12px; border-radius: 4px; background: var(--color-blue); border: none; color: #fff; font-size: 12px; font-weight: 600; cursor: pointer;">Setează</button>
                            </div>"""

new_alert = """                        <!-- Price Alerts Widget -->
                        <div class="price-alerts-widget" style="margin-top: 1.5rem; padding: 1.5rem; background: var(--card-bg); box-shadow: var(--neu-out); border-radius: 16px;">
                            <div style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                                <i class="ph-duotone ph-bell" style="font-size: 18px; color: var(--color-blue);"></i>
                                Alerte de Preț Locale
                            </div>
                            <div style="display: flex; gap: 12px; align-items: center;">
                                <input type="number" id="alert-target-price" placeholder="Target RON" step="any" style="width: 100%; padding: 10px 14px; border-radius: 10px; background: var(--card-bg); box-shadow: var(--neu-in); border: none; outline: none; color: var(--text-primary); font-size: 13px; font-family: inherit;">
                                <button id="btn-set-alert" style="padding: 10px 20px; border-radius: 10px; background: var(--card-bg); box-shadow: var(--neu-out); border: none; color: var(--color-blue); font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s ease;" onmousedown="this.style.boxShadow='var(--neu-btn-active)'" onmouseup="this.style.boxShadow='var(--neu-out)'" onmouseleave="this.style.boxShadow='var(--neu-out)'">Setează</button>
                            </div>"""
                            
html = html.replace(old_alert, new_alert)

html = re.sub(r'script\.js\?v=\d+', 'script.js?v=68', html)

with open(html_path, "w") as f:
    f.write(html)
