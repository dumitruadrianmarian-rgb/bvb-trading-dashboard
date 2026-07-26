import re

css_path = "/home/pi/bvb-trading-dashboard/static/style.css"
with open(css_path, "r") as f:
    css = f.read()

# I appended `.portfolio-section { box-sizing: border-box; padding: 12px; margin: -12px; }` at the very end of style.css
# Let's replace `margin: -12px;` with `margin: -12px -12px 40px -12px;`
# So the bottom margin is restored to 40px, giving space before the chart section.

css = css.replace(
    ".portfolio-section { box-sizing: border-box; padding: 12px; margin: -12px; }",
    ".portfolio-section { box-sizing: border-box; padding: 12px; margin: -12px -12px 40px -12px; }"
)

with open(css_path, "w") as f:
    f.write(css)

# Bump cache
html_path = "/home/pi/bvb-trading-dashboard/static/index.html"
with open(html_path, "r") as f:
    html = f.read()
html = re.sub(r'v=6\d', 'v=63', html)
with open(html_path, "w") as f:
    f.write(html)

sw_path = "/home/pi/bvb-trading-dashboard/static/sw.js"
with open(sw_path, "r") as f:
    sw = f.read()
sw = re.sub(r'rpi-admin-cache-v\d+', 'rpi-admin-cache-v66', sw)
sw = re.sub(r'v=6\d', 'v=63', sw)
with open(sw_path, "w") as f:
    f.write(sw)

print("Spacing fixed!")
