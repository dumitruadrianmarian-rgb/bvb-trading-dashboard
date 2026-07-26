import re

css_path = "/home/pi/bvb-trading-dashboard/static/style.css"
with open(css_path, "r") as f:
    css = f.read()

# Fix .portfolio-section by removing overflow: hidden
css = re.sub(
    r'\.portfolio-section\s*\{[^}]*\}',
    '.portfolio-section {\n    margin-bottom: 40px;\n    width: 100%;\n    max-width: 100%;\n}',
    css
)

# Fix .portfolio-add-panel overflow: hidden since it doesn't need it and might clip outer shadows of children? Wait, add-panel is the one WITH the outer shadow.
# Actually, overflow: hidden on an element DOES NOT clip its OWN box-shadow. But it's safer to remove if it's not needed. Let's remove it just in case.
css = re.sub(
    r'\.portfolio-add-panel\s*\{[^}]*\}',
    '.portfolio-add-panel {\n    box-shadow: var(--neu-out);\n    border: none !important;\n    width: 100%;\n    min-width: 0;\n    border-radius: 12px;\n}',
    css
)

# Same for .portfolio-table-panel
css = re.sub(
    r'\.portfolio-table-panel\s*\{[^}]*\}',
    '.portfolio-table-panel {\n    box-shadow: var(--neu-out);\n    border: none !important;\n    width: 100%;\n    border-radius: 12px;\n}',
    css
)

# And chart col card
css = re.sub(
    r'\.portfolio-chart-col\s*\{[^}]*\}',
    '.portfolio-chart-col {\n    position: sticky;\n    top: 20px;\n    border-radius: 12px;\n}',
    css
)

# Ensure padding in portfolio section so shadows have space to breathe
# wait, if portfolio-section is 100% width, adding padding will make it larger than 100% unless box-sizing: border-box
css = css + "\n.portfolio-section { box-sizing: border-box; padding: 12px; margin: -12px; }\n"

with open(css_path, "w") as f:
    f.write(css)

# Bump cache
html_path = "/home/pi/bvb-trading-dashboard/static/index.html"
with open(html_path, "r") as f:
    html = f.read()
html = re.sub(r'v=5\d', 'v=60', html)
with open(html_path, "w") as f:
    f.write(html)

sw_path = "/home/pi/bvb-trading-dashboard/static/sw.js"
with open(sw_path, "r") as f:
    sw = f.read()
sw = re.sub(r'rpi-admin-cache-v\d+', 'rpi-admin-cache-v63', sw)
sw = re.sub(r'v=5\d', 'v=60', sw)
with open(sw_path, "w") as f:
    f.write(sw)

print("Portfolio CSS shadows fixed!")
