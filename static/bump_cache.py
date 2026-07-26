import re

html_path = "/home/pi/bvb-trading-dashboard/static/index.html"
sw_path = "/home/pi/bvb-trading-dashboard/static/sw.js"

with open(html_path, "r") as f:
    html = f.read()
html = re.sub(r'v=5\d', 'v=58', html)
with open(html_path, "w") as f:
    f.write(html)

with open(sw_path, "r") as f:
    sw = f.read()
sw = re.sub(r'rpi-admin-cache-v\d+', 'rpi-admin-cache-v61', sw)
sw = re.sub(r'v=5\d', 'v=58', sw)
with open(sw_path, "w") as f:
    f.write(sw)

print("Cache bumped")
