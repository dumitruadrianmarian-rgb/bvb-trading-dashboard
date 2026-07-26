import re

css_path = "/home/pi/bvb-trading-dashboard/static/style.css"
with open(css_path, "r") as f:
    css = f.read()

# Fix :root (Dark Theme) to a softer grey
new_root = """:root {
    /* Color Palette - Neumorphism Dark (Softer Grey) */
    --bg-app: #2B303B;
    --bg-sidebar: #2B303B;
    --bg-card: #2B303B;
    --bg-card-hover: #2B303B;
    --border-color: transparent;
    --text-primary: #f8fafc;
    --text-secondary: #cbd5e1;
    --text-muted: #94a3b8;
    
    --color-green: #10b981;
    --color-green-glow: rgba(16, 185, 129, 0.15);
    --color-red: #ef4444;
    --color-red-glow: rgba(239, 68, 68, 0.15);
    --color-yellow: #f59e0b;
    --color-blue: #3b82f6;
    --color-blue-glow: rgba(59, 130, 246, 0.2);

    /* Neumorphism Shadows (Dark) */
    --neu-out: 8px 8px 16px #22262f, -8px -8px 16px #343a47;
    --neu-in: inset 4px 4px 8px #22262f, inset -4px -4px 8px #343a47;
    --neu-btn: 4px 4px 8px #22262f, -4px -4px 8px #343a47;
    --neu-btn-active: inset 2px 2px 5px #22262f, inset -2px -2px 5px #343a47;

    /* Fonts */
    --font-heading: 'Outfit', sans-serif;
    --font-body: 'Plus Jakarta Sans', sans-serif;
    
    /* Layout */
    --sidebar-width: 260px;
    --transition-speed: 0.3s;
}"""

# Replace the :root block
css = re.sub(r':root\s*\{.*?(?=\nhtml\s*\{)', new_root + "\n", css, flags=re.DOTALL)

# Fix .theme-light (Fade White Neumorphism)
new_light = """.theme-light {
    --bg-app: #EAECEF;
    --bg-sidebar: #EAECEF;
    --bg-card: #EAECEF;
    --bg-card-hover: #EAECEF;
    --border-color: transparent;
    --text-primary: #1e293b;
    --text-secondary: #475569;
    --text-muted: #64748b;

    /* Neumorphism Shadows (Light) */
    --neu-out: 8px 8px 16px #c8cacc, -8px -8px 16px #ffffff;
    --neu-in: inset 4px 4px 8px #c8cacc, inset -4px -4px 8px #ffffff;
    --neu-btn: 4px 4px 8px #c8cacc, -4px -4px 8px #ffffff;
    --neu-btn-active: inset 2px 2px 5px #c8cacc, inset -2px -2px 5px #ffffff;
}"""

css = re.sub(r'\.theme-light\s*\{[^}]*\}', new_light, css)

with open(css_path, "w") as f:
    f.write(css)

# Bump cache
html_path = "/home/pi/bvb-trading-dashboard/static/index.html"
with open(html_path, "r") as f:
    html = f.read()
html = re.sub(r'v=5\d', 'v=59', html)
with open(html_path, "w") as f:
    f.write(html)

sw_path = "/home/pi/bvb-trading-dashboard/static/sw.js"
with open(sw_path, "r") as f:
    sw = f.read()
sw = re.sub(r'rpi-admin-cache-v\d+', 'rpi-admin-cache-v62', sw)
sw = re.sub(r'v=5\d', 'v=59', sw)
with open(sw_path, "w") as f:
    f.write(sw)

print("Themes fixed!")
