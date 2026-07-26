import re

css_path = "/home/pi/bvb-trading-dashboard/static/style.css"
with open(css_path, "r") as f:
    css = f.read()

# Fix .port-search-box styling
new_port_search = """.port-search-box {
    width: 100%;
    min-width: 0;
    background: var(--bg-app);
    box-shadow: var(--neu-in);
    border: none !important;
    border-radius: 8px;
    height: 42px;
    padding: 0 14px;
    gap: 8px;
    box-sizing: border-box;
    transition: all 0.2s;
}"""
css = re.sub(r'\.port-search-box\s*\{[^}]*\}', new_port_search, css)

# Fix .port-input styling
new_port_input = """.port-input {
    background: var(--bg-app);
    box-shadow: var(--neu-in);
    border: none !important;
    border-radius: 8px;
    color: var(--text-primary);
    font-family: var(--font-body);
    font-size: 13px;
    outline: none;
    height: 42px;
    padding: 0 14px;
    box-sizing: border-box;
    transition: all 0.2s;
    width: 100%;
    min-width: 0;
}"""
css = re.sub(r'\.port-input\s*\{[^}]*\}', new_port_input, css)

# Fix .port-submit-btn styling
new_submit_btn = """.port-submit-btn {
    background-color: var(--color-blue) !important;
    border: none !important;
    box-shadow: var(--neu-btn) !important;
    color: white !important;
    width: 100%;
    height: 42px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-weight: 600;
    box-sizing: border-box;
    transition: all 0.2s ease;
}
.port-submit-btn:hover {
    box-shadow: var(--neu-btn-active) !important;
    transform: translateY(1px);
}"""
css = re.sub(r'\.port-submit-btn\s*\{[^}]*\}', new_submit_btn, css)

# Remove any old .port-submit-btn:hover or active if they existed
css = re.sub(r'\.port-submit-btn:(hover|active)\s*\{[^}]*\}', '', css)

with open(css_path, "w") as f:
    f.write(css)

# Bump cache
html_path = "/home/pi/bvb-trading-dashboard/static/index.html"
with open(html_path, "r") as f:
    html = f.read()
html = re.sub(r'v=6\d', 'v=62', html)
with open(html_path, "w") as f:
    f.write(html)

sw_path = "/home/pi/bvb-trading-dashboard/static/sw.js"
with open(sw_path, "r") as f:
    sw = f.read()
sw = re.sub(r'rpi-admin-cache-v\d+', 'rpi-admin-cache-v65', sw)
sw = re.sub(r'v=6\d', 'v=62', sw)
with open(sw_path, "w") as f:
    f.write(sw)

print("Sizes aligned!")
