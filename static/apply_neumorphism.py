import re

css_path = "/home/pi/bvb-trading-dashboard/static/style.css"
with open(css_path, "r") as f:
    css = f.read()

new_vars = """:root {
    /* Color Palette - Neumorphism */
    --bg-app: #1A1D24;
    --bg-sidebar: #1A1D24;
    --bg-card: #1A1D24;
    --bg-card-hover: #1A1D24;
    --border-color: rgba(255, 255, 255, 0.02);
    --text-primary: #f8fafc;
    --text-secondary: #cbd5e1;
    --text-muted: #8b98ab;
    
    --color-green: #10b981;
    --color-green-glow: rgba(16, 185, 129, 0.15);
    --color-red: #ef4444;
    --color-red-glow: rgba(239, 68, 68, 0.15);
    --color-yellow: #f59e0b;
    --color-blue: #3b82f6;
    --color-blue-glow: rgba(59, 130, 246, 0.2);

    /* Neumorphism Shadows */
    --neu-out: 8px 8px 16px #12151a, -8px -8px 16px #22252e;
    --neu-in: inset 4px 4px 8px #12151a, inset -4px -4px 8px #22252e;
    --neu-btn: 4px 4px 8px #12151a, -4px -4px 8px #22252e;
    --neu-btn-active: inset 2px 2px 5px #12151a, inset -2px -2px 5px #22252e;

    /* Fonts */
    --font-heading: 'Outfit', sans-serif;
    --font-body: 'Plus Jakarta Sans', sans-serif;
    
    /* Layout */
    --sidebar-width: 260px;
    --transition-speed: 0.3s;
}"""

# Replace root variables
css = re.sub(r':root\s*\{.*?(?=\nhtml\s*\{)', new_vars + "\n", css, flags=re.DOTALL)

# Remove backdrop-filter
css = re.sub(r'\s*backdrop-filter:[^;]+;', '', css)
css = re.sub(r'\s*-webkit-backdrop-filter:[^;]+;', '', css)

# Replace common glassmorphism bg
css = css.replace("rgba(30, 41, 59, 0.7)", "var(--bg-card)")
css = css.replace("rgba(30, 41, 59, 0.95)", "var(--bg-card-hover)")

# Make elements borderless and add neumorphic shadows
def add_neu(selector, shadow_var, css_text):
    pattern = r'(' + re.escape(selector) + r'\s*\{)'
    replacement = r'\1\n    box-shadow: ' + shadow_var + r';\n    border: none !important;'
    return re.sub(pattern, replacement, css_text)

css = add_neu('.index-card', 'var(--neu-out)', css)
css = add_neu('.rec-panel', 'var(--neu-out)', css)
css = add_neu('.chart-sidebar', 'var(--neu-out)', css)
css = add_neu('.chart-container', 'var(--neu-out)', css)
css = add_neu('.stock-news-panel', 'var(--neu-out)', css)
css = add_neu('.portfolio-add-panel', 'var(--neu-out)', css)
css = add_neu('.portfolio-table-panel', 'var(--neu-out)', css)
css = add_neu('.realized-table-panel', 'var(--neu-out)', css)

# Add inset shadow to inputs
css = add_neu('.search-box', 'var(--neu-in)', css)
css = re.sub(r'(\.port-input,\s*\.port-search-input\s*\{)', r'\1\n    box-shadow: var(--neu-in);\n    border: none;\n    background: var(--bg-app) !important;', css)

# Fix inputs background
css = css.replace("background: rgba(0, 0, 0, 0.2);", "background: var(--bg-app); box-shadow: var(--neu-in); border: none;")
css = css.replace("background:rgba(0,0,0,0.25);", "background:var(--bg-app);box-shadow:var(--neu-in);border:none;")

# Update sidebar to have a shadow instead of right border
css = re.sub(r'(\.sidebar\s*\{[^}]*?)border-right:[^;]+;', r'\1box-shadow: var(--neu-out); border: none;', css)

# Change general card borders
css = re.sub(r'border:\s*1px\s*solid\s*var\(--border-color\);', 'border: none;', css)
css = re.sub(r'border:\s*1px\s*solid\s*rgba\(255,\s*255,\s*255,\s*0\.1[0-9]*\);', 'border: none;', css)

with open(css_path, "w") as f:
    f.write(css)

print("Applied Neumorphism to style.css")
