import re

css_path = "/home/pi/bvb-trading-dashboard/static/style.css"
with open(css_path, "r") as f:
    css = f.read()

# Remove the hacky padding/margin from .portfolio-section that breaks mobile layout
css = re.sub(r'\.portfolio-section\s*\{\s*box-sizing:\s*border-box;\s*padding:\s*12px;\s*margin:\s*-12px\s*-12px\s*40px\s*-12px;\s*\}', '', css)
css = re.sub(r'\.portfolio-section\s*\{\s*box-sizing:\s*border-box;\s*padding:\s*12px;\s*margin:\s*-12px;\s*\}', '', css)

with open(css_path, "w") as f:
    f.write(css)

# Bump cache
html_path = "/home/pi/bvb-trading-dashboard/static/index.html"
with open(html_path, "r") as f:
    html = f.read()
html = re.sub(r'v=6\d', 'v=64', html)
with open(html_path, "w") as f:
    f.write(html)

sw_path = "/home/pi/bvb-trading-dashboard/static/sw.js"
with open(sw_path, "r") as f:
    sw = f.read()
sw = re.sub(r'rpi-admin-cache-v\d+', 'rpi-admin-cache-v67', sw)
sw = re.sub(r'v=6\d', 'v=64', sw)
with open(sw_path, "w") as f:
    f.write(sw)

print("Mobile alignment fixed!")
