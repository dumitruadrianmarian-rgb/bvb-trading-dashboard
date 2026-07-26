import re

js_path = "/home/pi/bvb-trading-dashboard/static/script.js"
with open(js_path, "r") as f:
    js = f.read()

# Fix MA line data format
old_ma50 = """        const ma50Slice = ma50Full.slice(-daysToKeep);
        series.push({
            name: "MA50",
            data: ma50Slice,
            type: 'line'
        });"""
new_ma50 = """        const ma50Slice = ma50Full.slice(-daysToKeep);
        const ma50Data = ma50Slice.map((val, i) => ({ x: dates[i], y: val }));
        series.push({
            name: "MA50",
            data: ma50Data,
            type: 'line'
        });"""
js = js.replace(old_ma50, new_ma50)

old_ma200 = """        const ma200Slice = ma200Full.slice(-daysToKeep);
        series.push({
            name: "MA200",
            data: ma200Slice,
            type: 'line'
        });"""
new_ma200 = """        const ma200Slice = ma200Full.slice(-daysToKeep);
        const ma200Data = ma200Slice.map((val, i) => ({ x: dates[i], y: val }));
        series.push({
            name: "MA200",
            data: ma200Data,
            type: 'line'
        });"""
js = js.replace(old_ma200, new_ma200)

# Fix chart options (remove gradient fill, stroke, and categories)
old_options = """        colors: colors,
        stroke: {
            width: [3, 2, 2],
            curve: 'smooth'
        },
        fill: {
            type: ['gradient', 'solid', 'solid'],
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.35,
                opacityTo: 0.05,
                stops: [0, 90, 100]
            }
        },
        series: series,
        xaxis: {
            type: 'datetime',
            categories: dates,
            labels: {"""

new_options = """        colors: colors,
        stroke: {
            width: [1, 2, 2],
            curve: 'smooth'
        },
        fill: {
            type: 'solid'
        },
        plotOptions: {
            candlestick: {
                colors: {
                    upward: '#10b981',
                    downward: '#ef4444'
                }
            }
        },
        series: series,
        xaxis: {
            type: 'datetime',
            labels: {"""
            
js = js.replace(old_options, new_options)

with open(js_path, "w") as f:
    f.write(js)

# bump cache
html_path = "/home/pi/bvb-trading-dashboard/static/index.html"
with open(html_path, "r") as f:
    html = f.read()
html = re.sub(r'script\.js\?v=\d+', 'script.js?v=66', html)
with open(html_path, "w") as f:
    f.write(html)
