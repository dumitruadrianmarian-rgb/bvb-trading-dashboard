import re

css_path = "/home/pi/bvb-trading-dashboard/static/style.css"
with open(css_path, "r") as f:
    css = f.read()

# Fix .port-input to have Neumorphic styling
new_port_input = """.port-input {
    background: var(--bg-app);
    box-shadow: var(--neu-in);
    border: none !important;
    border-radius: 8px;
    color: var(--text-primary);
    font-family: var(--font-body);
    font-size: 13px;
    outline: none;
    padding: 9px 12px;
    transition: all 0.2s;
    width: 100%;
    min-width: 0;
}"""

css = re.sub(
    r'\.port-input\s*\{[^}]*\}',
    new_port_input,
    css
)

# Remove the `.theme-light .port-input` block because now it inherits variables properly
css = re.sub(
    r'\.theme-light\s+\.port-input\s*\{[^}]*\}',
    '',
    css
)

# Also fix the hover/focus state for .port-input to maybe just change border or shadow
css = re.sub(
    r'\.port-input:focus\s*\{[^}]*\}',
    '.port-input:focus {\n    box-shadow: var(--neu-in), 0 0 0 2px var(--color-blue-glow);\n}',
    css
)

with open(css_path, "w") as f:
    f.write(css)

# Bump cache
html_path = "/home/pi/bvb-trading-dashboard/static/index.html"
with open(html_path, "r") as f:
    html = f.read()
html = re.sub(r'v=6\d', 'v=61', html)
html = re.sub(r'v=5\d', 'v=61', html)
with open(html_path, "w") as f:
    f.write(html)

sw_path = "/home/pi/bvb-trading-dashboard/static/sw.js"
with open(sw_path, "r") as f:
    sw = f.read()
sw = re.sub(r'rpi-admin-cache-v\d+', 'rpi-admin-cache-v64', sw)
sw = re.sub(r'v=6\d', 'v=61', sw)
sw = re.sub(r'v=5\d', 'v=61', sw)
with open(sw_path, "w") as f:
    f.write(sw)

print("Port inputs styled!")
