import re

# 1. Modify app.py to add Alerts API and Telegram Background Thread
app_path = "/home/pi/bvb-trading-dashboard/app.py"
with open(app_path, "r") as f:
    app_py = f.read()

imports_patch = """import requests
from bs4 import BeautifulSoup
import json
import threading
import time"""
app_py = app_py.replace("import requests\nfrom bs4 import BeautifulSoup\nimport json\nimport time", imports_patch)

# Add Alerts Logic
alerts_logic = """
ALERTS_FILE = os.path.join(DATA_DIR, "alerts.json")
TELEGRAM_FILE = os.path.join(DATA_DIR, "telegram.json")

def load_alerts():
    if os.path.exists(ALERTS_FILE):
        try:
            with open(ALERTS_FILE, "r") as f:
                return json.load(f)
        except:
            return []
    return []

def save_alerts(alerts):
    with open(ALERTS_FILE, "w") as f:
        json.dump(alerts, f)

def get_telegram_config():
    if os.path.exists(TELEGRAM_FILE):
        try:
            with open(TELEGRAM_FILE, "r") as f:
                return json.load(f)
        except:
            return {}
    return {}

@app.route('/api/alerts', methods=['GET'])
def api_get_alerts():
    return jsonify(load_alerts())

@app.route('/api/alerts', methods=['POST'])
def api_save_alerts():
    alerts = request.json
    save_alerts(alerts)
    return jsonify({"status": "ok"})

# --- TELEGRAM BACKGROUND WORKER ---
def telegram_alert_worker():
    print("Starting Telegram Alert Worker...")
    while True:
        try:
            alerts = load_alerts()
            if not alerts:
                time.sleep(60)
                continue
                
            tg_config = get_telegram_config()
            tg_token = tg_config.get("token")
            tg_chat_id = tg_config.get("chat_id")
            
            if not tg_token or not tg_chat_id:
                time.sleep(60)
                continue
                
            triggered = False
            for alert in list(alerts):
                sym = alert.get("symbol")
                target = float(alert.get("target"))
                created_price = float(alert.get("createdPrice", 0))
                
                # Fetch latest price directly
                try:
                    res = requests.get(f"http://127.0.0.1:5050/api/stocks", timeout=10)
                    if res.status_code == 200:
                        all_stocks = res.json()
                        current_price = None
                        for s in all_stocks:
                            if s["symbol"] == sym:
                                current_price = s.get("price")
                                break
                                
                        if current_price:
                            # Check condition
                            if (created_price < target and current_price >= target) or (created_price > target and current_price <= target):
                                # TRIGGER
                                msg = f"🚨 *Alertă BVB* 🚨\\nPrețul pentru *{sym}* a atins ținta de *{target} RON*!\\nPreț curent: {current_price} RON."
                                tg_url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
                                requests.post(tg_url, json={"chat_id": tg_chat_id, "text": msg, "parse_mode": "Markdown"})
                                alerts.remove(alert)
                                triggered = True
                except Exception as e:
                    print("Telegram check error:", e)
                    
            if triggered:
                save_alerts(alerts)
                
        except Exception as e:
            print("Worker error:", e)
            
        time.sleep(120) # Check every 2 minutes

# Start the worker thread
thread = threading.Thread(target=telegram_alert_worker, daemon=True)
thread.start()

# -----------------------------------
"""

if "api_get_alerts" not in app_py:
    app_py = app_py.replace("if __name__ == '__main__':", alerts_logic + "\nif __name__ == '__main__':")

with open(app_path, "w") as f:
    f.write(app_py)

# 2. Modify script.js
js_path = "/home/pi/bvb-trading-dashboard/static/script.js"
with open(js_path, "r") as f:
    js = f.read()
    
# Replace localstorage alerts with API calls
js = js.replace("let alerts = JSON.parse(localStorage.getItem(\"bvb_price_alerts\") || \"[]\");", "let alerts = window.serverAlerts || [];")
js = js.replace("let alertsList = JSON.parse(localStorage.getItem(\"bvb_price_alerts\") || \"[]\");", "let alertsList = window.serverAlerts || [];")
js = js.replace("localStorage.setItem(\"bvb_price_alerts\", JSON.stringify(remainingAlerts));", "saveServerAlerts(remainingAlerts);")
js = js.replace("localStorage.setItem(\"bvb_price_alerts\", JSON.stringify(alerts));", "saveServerAlerts(alerts);")

api_funcs = """
window.serverAlerts = [];
function fetchServerAlerts() {
    fetch('/api/alerts')
        .then(res => res.json())
        .then(data => {
            window.serverAlerts = data;
            renderActiveAlerts();
        });
}
function saveServerAlerts(alertsList) {
    window.serverAlerts = alertsList;
    fetch('/api/alerts', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(alertsList)
    });
}
// Call fetch on load
fetchServerAlerts();
"""
if "fetchServerAlerts" not in js:
    js = js.replace("document.addEventListener(\"DOMContentLoaded\", function () {", api_funcs + "\ndocument.addEventListener(\"DOMContentLoaded\", function () {")

# Remove browser Notification API check inside checkPriceAlerts since backend handles background, but keep frontend alerts if open?
# Actually, the user can have both. We just leave the frontend check.

with open(js_path, "w") as f:
    f.write(js)

# Bump cache
html_path = "/home/pi/bvb-trading-dashboard/static/index.html"
with open(html_path, "r") as f:
    html = f.read()
html = re.sub(r'script\.js\?v=\d+', 'script.js?v=69', html)
with open(html_path, "w") as f:
    f.write(html)
