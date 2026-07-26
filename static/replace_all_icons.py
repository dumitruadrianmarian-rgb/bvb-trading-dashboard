import re

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
    "rotate-ccw": "ph-arrow-counter-clockwise",
    "loader": "ph-spinner",
    "check-circle": "ph-check-circle",
    "alert-circle": "ph-warning-circle",
    "pencil": "ph-pencil",
    "shield-alert": "ph-shield-warning"
}

def replace_in_html(content):
    content = content.replace('<script src="https://unpkg.com/lucide@latest"></script>',
                              '<script src="https://unpkg.com/@phosphor-icons/web"></script>')
    
    def replacer(match):
        name = match.group(1)
        other_attrs = match.group(2) if match.group(2) else ""
        ph_name = icon_map.get(name, "ph-" + name)
        
        if 'class="' in other_attrs:
            replaced_attrs = other_attrs.replace('class="', 'class="ph-duotone ' + ph_name + ' ')
            return '<i ' + replaced_attrs + '></i>'
        else:
            return '<i class="ph-duotone ' + ph_name + '" ' + other_attrs + '></i>'

    content = re.sub(r'<i\s+data-lucide="([^"]+)"([^>]*)></i>', replacer, content)
    
    # Update cache versions
    content = re.sub(r'style\.css\?v=\d+', 'style.css?v=56', content)
    content = re.sub(r'script\.js\?v=\d+', 'script.js?v=56', content)
    return content

def replace_in_js(content):
    def replacer(match):
        name = match.group(1)
        other_attrs = match.group(2) if match.group(2) else ""
        
        if name.startswith("${"):
            # Dynamic variables like ${iconName}
            # The JS must construct the string.
            ph_name = "${" + name[2:-1] + ".replace('arrow-up-right', 'arrow-up-right').replace('arrow-down-right', 'arrow-down-right').replace('minus', 'minus').replace('check-circle', 'check-circle').replace('alert-circle', 'warning-circle')}"
            return f'<i class="ph-duotone ph-{ph_name}" {other_attrs}></i>'
        
        ph_name = icon_map.get(name, "ph-" + name)
        if 'class="' in other_attrs:
            replaced_attrs = other_attrs.replace('class="', 'class="ph-duotone ' + ph_name + ' ')
            return '<i ' + replaced_attrs + '></i>'
        else:
            return '<i class="ph-duotone ' + ph_name + '" ' + other_attrs + '></i>'

    content = re.sub(r'<i\s+data-lucide="([^"]+)"([^>]*)></i>', replacer, content)
    
    # Remove lucide.createIcons
    content = re.sub(r'if\s*\(\s*window\.lucide\s*\)\s*\{?\s*window\.lucide\.createIcons\(\);\s*\}?', '', content)
    content = re.sub(r'if\s*\(\s*typeof\s+lucide\s*!==\s*[\'"]undefined[\'"]\s*\)\s*lucide\.createIcons\(\);', '', content)
    
    return content

html_path = "/home/pi/bvb-trading-dashboard/static/index.html"
with open(html_path, "r") as f:
    html = f.read()
with open(html_path, "w") as f:
    f.write(replace_in_html(html))

js_path = "/home/pi/bvb-trading-dashboard/static/script.js"
with open(js_path, "r") as f:
    js = f.read()
    
# Fix specific JS dynamic variables
js = js.replace("const sentimentIcon = score >= 60 ? 'arrow-up-right' : score <= 40 ? 'arrow-down-right' : 'minus';",
                "const sentimentIcon = score >= 60 ? 'trend-up' : score <= 40 ? 'trend-down' : 'minus';")
js = js.replace("const iconName = type === 'success' ? 'check-circle' : 'alert-circle';",
                "const iconName = type === 'success' ? 'check-circle' : 'warning-circle';")

with open(js_path, "w") as f:
    f.write(replace_in_js(js))

# Service worker cache bump
sw_path = "/home/pi/bvb-trading-dashboard/static/sw.js"
with open(sw_path, "r") as f:
    sw = f.read()
sw = re.sub(r'rpi-admin-cache-v\d+', 'rpi-admin-cache-v59', sw)
sw = re.sub(r'v=5\d', 'v=56', sw)
with open(sw_path, "w") as f:
    f.write(sw)

print("Icons replaced everywhere!")
