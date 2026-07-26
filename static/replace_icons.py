import re

html_path = "/home/pi/bvb-trading-dashboard/static/index.html"
with open(html_path, "r") as f:
    html = f.read()

# 1. Replace the library script
html = html.replace('<script src="https://unpkg.com/lucide@latest"></script>',
                    '<script src="https://unpkg.com/@phosphor-icons/web"></script>')

# 2. Icon map
icon_map = {
    "trending-up": "ph-trend-up",
    "layout-dashboard": "ph-squares-four",
    "award": "ph-medal",
    "wallet": "ph-wallet",
    "area-chart": "ph-chart-line-up",
    "list": "ph-list-dashes",
    "search": "ph-magnifying-glass",
    "x": "ph-x",
    "refresh-cw": "ph-arrows-clockwise",
    "clock": "ph-clock",
    "arrow-up-circle": "ph-arrow-circle-up",
    "arrow-down-circle": "ph-arrow-circle-down",
    "calendar": "ph-calendar-blank",
    "plus-circle": "ph-plus-circle",
    "bar-chart-2": "ph-chart-bar",
    "landmark": "ph-bank",
    "plus": "ph-plus",
    "pie-chart": "ph-chart-pie-slice",
    "bell": "ph-bell",
    "newspaper": "ph-newspaper",
    "trash-2": "ph-trash",
    "rotate-ccw": "ph-arrow-counter-clockwise"
}

# Regex to match <i data-lucide="NAME" [other attributes]></i>
def replacer(match):
    name = match.group(1)
    other_attrs = match.group(2) if match.group(2) else ""
    ph_name = icon_map.get(name, "ph-star")
    
    # if class is already in other_attrs, we need to merge
    if "class=\"" in other_attrs:
        return f'<i {other_attrs.replace("class=\\"", f"class=\\"ph-duotone {ph_name} ")}></i>'
    else:
        return f'<i class="ph-duotone {ph_name}" {other_attrs}></i>'

html = re.sub(r'<i\s+data-lucide="([^"]+)"([^>]*)></i>', replacer, html)

# 3. Update cache version
html = re.sub(r'style\.css\?v=\d+', 'style.css?v=55', html)
html = re.sub(r'script\.js\?v=\d+', 'script.js?v=55', html)

with open(html_path, "w") as f:
    f.write(html)
print("Icons replaced successfully!")
