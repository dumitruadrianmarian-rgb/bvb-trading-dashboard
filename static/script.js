// State Management
let stocks = [];
let recommendations = {};
let activeSymbol = null;
let initialLoad = true;
let chartData = [];
let chartRange = "3m"; // '1m', '3m', '1y', '3y', '5y'
let apexChart = null;
let sortColumn = ""; // default sort column (empty means backend order)
let sortDirection = "asc"; // 'asc' or 'desc'

let portfolio = [];
let portfolioChart = null;
let realizedTransactions = [];

window.serverAlerts = [];
function fetchServerAlerts() {
    fetch('/api/alerts')
        .then(res => res.json())
        .then(data => {
            window.serverAlerts = data;
            if (typeof renderPriceAlertsList === "function" && activeSymbol !== null) {
                renderPriceAlertsList();
            }
            if (typeof renderManageAlertsTable === "function") {
                renderManageAlertsTable();
            }
        });
}
function saveServerAlerts(alertsList) {
    window.serverAlerts = alertsList;
    fetch('/api/alerts', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(alertsList)
    });
}
fetchServerAlerts();

function loadRealizedTransactions() {
    return fetch("/api/realized")
        .then(res => res.json())
        .then(data => {
            realizedTransactions = data || [];
        })
        .catch(err => {
            console.warn("Could not load realized transactions:", err);
            realizedTransactions = [];
        });
}

// Helper to load portfolio from backend with localStorage fallback and auto-migration
function loadPortfolio() {
    return fetch("/api/portfolio")
        .then(res => res.json())
        .then(data => {
            if (data && data.length > 0) {
                portfolio = data;
                localStorage.setItem("bvb_virtual_portfolio", JSON.stringify(portfolio));
                renderPortfolio();
            } else {
                // Backend is empty. Check if local storage has old data to migrate
                const localData = JSON.parse(localStorage.getItem("bvb_virtual_portfolio")) || [];
                if (localData.length > 0) {
                    console.log("Migrating local storage portfolio to backend...");
                    portfolio = localData;
                    savePortfolioToBackend();
                    renderPortfolio();
                } else {
                    portfolio = [];
                    renderPortfolio();
                }
            }
        })
        .catch(err => {
            console.warn("Could not load portfolio from backend, falling back to local storage:", err);
            portfolio = JSON.parse(localStorage.getItem("bvb_virtual_portfolio")) || [];
            renderPortfolio();
        });
}

// PWA Custom Install Prompt Banner Manager
function initPWAInstallPrompt(appName, appIconPath) {
    let deferredPrompt = null;
    
    // Check if running in standalone mode (already installed PWA)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone || document.referrer.includes('android-app://');
    if (isStandalone) return;
    
    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
    });

    // Always attempt to display banner after 600ms unless dismissed in this browser session
    setTimeout(() => {
        showPWABanner();
    }, 600);

    function showPWABanner() {
        if (document.getElementById('pwa-install-banner') || sessionStorage.getItem('pwa_banner_closed')) return;
        
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        
        const banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.className = 'pwa-install-banner';
        
        if (isIOS) {
            banner.innerHTML = `
                <div class="pwa-banner-content">
                    <img src="${appIconPath}" alt="${appName}" class="pwa-banner-icon">
                    <div class="pwa-banner-text">
                        <strong>Instalează ${appName} pe iPhone</strong>
                        <span>Apasă pe butonul Partajare 📤 din browser și alege <strong>'Adaugă pe ecranul principal' ➕</strong>.</span>
                    </div>
                </div>
                <div class="pwa-banner-actions">
                    <button id="pwa-dismiss-btn" class="pwa-btn-secondary">Închide</button>
                </div>
            `;
        } else {
            banner.innerHTML = `
                <div class="pwa-banner-content">
                    <img src="${appIconPath}" alt="${appName}" class="pwa-banner-icon">
                    <div class="pwa-banner-text">
                        <strong>Instalează Aplicația ${appName}</strong>
                        <span>Adaugă aplicația pe ecranul principal pentru acces rapid și ecran complet.</span>
                    </div>
                </div>
                <div class="pwa-banner-actions">
                    <button id="pwa-dismiss-btn" class="pwa-btn-secondary">Nu acum</button>
                    <button id="pwa-install-btn" class="pwa-btn-primary">📲 Instalează Acum</button>
                </div>
            `;
        }
        
        document.body.appendChild(banner);

        const installBtn = document.getElementById('pwa-install-btn');
        if (installBtn) {
            installBtn.addEventListener('click', async () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    console.log('PWA user prompt outcome:', outcome);
                    deferredPrompt = null;
                    banner.remove();
                } else {
                    // Fallback guide if browser beforeinstallprompt hasn't fired
                    alert(`Pentru a instala ${appName}:\n\n1. Apasă pe meniul browserului (cele 3 puncte vertical ⋮ sus în dreapta sau jos).\n2. Selectează 'Instalează aplicația' sau 'Adaugă la ecranul de start'.`);
                    banner.remove();
                }
            });
        }

        const dismissBtn = document.getElementById('pwa-dismiss-btn');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                sessionStorage.setItem('pwa_banner_closed', 'true');
                banner.remove();
            });
        }
    }
}

// Initialize Dashboard
document.addEventListener("DOMContentLoaded", () => {
    // Register Service Worker for PWA
    // Kill all service workers and caches to prevent stale CSS/JS being served
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(reg => reg.unregister());
        });
    }
    if ('caches' in window) {
        caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    }

    // Reliance on native browser PWA prompt (Chrome/Edge/Android/iOS native install)
    // initPWAInstallPrompt("RoInvest Hub BVB", "icon-192.png?v=2.0");

    // Apply light/dark theme dynamically based on Sunrise/Sunset
    applyThemeBasedOnSun();

    // Setup active state highlight on scroll & click
    setupScrollHighlight();

    // Setup Ticker Search & Autocomplete
    setupSearch();

    // Mobile sidebar hamburger toggle
    const mobileToggle = document.getElementById("mobile-menu-toggle");
    const mobileOverlay = document.getElementById("mobile-overlay");
    const sidebar = document.querySelector(".sidebar");
    if (mobileToggle && sidebar) {
        mobileToggle.addEventListener("click", () => {
            sidebar.classList.toggle("open");
            mobileOverlay.classList.toggle("active");
        });
        mobileOverlay.addEventListener("click", () => {
            sidebar.classList.remove("open");
            mobileOverlay.classList.remove("active");
        });
        // Close sidebar when a nav item is clicked on mobile
        sidebar.querySelectorAll(".nav-link").forEach(item => {
            item.addEventListener("click", () => {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove("open");
                    mobileOverlay.classList.remove("active");
                }
            });
        });
    }

    // Setup BVB Market Open/Closed indicator
    updateMarketStatus();
    setInterval(updateMarketStatus, 60000);
    
    // Live ticking clock
    startLiveClock();

    Promise.all([loadPortfolio(), loadRealizedTransactions()]).then(() => {
        fetchData();
    });
    
    setupEventListeners();
    enableDragToScroll();
    initPortfolio();
    
    // Auto refresh every 60 seconds
    setInterval(fetchData, 60000);

    // Immediately fetch fresh data when tab becomes visible or window gains focus (mobile unlock/tab switch)
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            console.log("Tab became visible, auto-syncing data...");
            fetchData();
        }
    });

    window.addEventListener("focus", () => {
        console.log("Window focused, auto-syncing data...");
        fetchData();
    });
});

function startLiveClock() {
    const clockEl = document.getElementById("live-time-clock");
    if (!clockEl) return;
    
    function tick() {
        const now = new Date();
        clockEl.innerText = now.toLocaleTimeString("ro-RO", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    
    tick();
    setInterval(tick, 1000);
}

// Setup DOM Event Listeners
function setupEventListeners() {
    // Refresh Button
    const refreshBtn = document.getElementById("refresh-data-btn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            if (refreshBtn.classList.contains("spinning")) return;
            refreshBtn.classList.add("spinning");
            refreshBtn.disabled = true;
            showToast("Se sincronizează datele cu BVB...", "success");
            
            fetch(`/api/stocks/refresh?_t=${Date.now()}`, {
                method: "POST"
            })
            .then(res => res.json())
            .then(data => {
                // Poll status from server
                let checks = 0;
                const interval = setInterval(() => {
                    fetch(`/api/stocks?_t=${Date.now()}`)
                    .then(res => res.json())
                    .then(stockData => {
                        if (stockData.status !== "Updating" || checks > 20) {
                            clearInterval(interval);
                            fetchData(() => {
                                refreshBtn.classList.remove("spinning");
                                refreshBtn.disabled = false;
                                showToast("Datele au fost actualizate de pe BVB!", "success");
                            });
                        }
                    });
                    checks++;
                }, 1500);
            })
            .catch(err => {
                console.error(err);
                refreshBtn.classList.remove("spinning");
                refreshBtn.disabled = false;
                showToast("Eroare la pornirea actualizării.", "error");
            });
        });
    }

    // Chart Range Selectors
    document.getElementById("chart-range-1m").addEventListener("click", (e) => setChartRange("1m", e.target));
    document.getElementById("chart-range-3m").addEventListener("click", (e) => setChartRange("3m", e.target));
    document.getElementById("chart-range-1y").addEventListener("click", (e) => setChartRange("1y", e.target));
    document.getElementById("chart-range-3y").addEventListener("click", (e) => setChartRange("3y", e.target));
    document.getElementById("chart-range-5y").addEventListener("click", (e) => setChartRange("5y", e.target));

    // Chart Overlay Checkboxes
    document.getElementById("overlay-ma50").addEventListener("change", () => renderChart());
    document.getElementById("overlay-ma200").addEventListener("change", () => renderChart());

    // Price Alerts
    const btnSetAlert = document.getElementById("btn-set-alert");
    if (btnSetAlert) {
        btnSetAlert.addEventListener("click", setPriceAlert);
    }
}

// Fetch missing portfolio stocks from backend
function fetchMissingPortfolioStocks() {
    if (!portfolio || portfolio.length === 0) return;
    const missing = portfolio.filter(item => !stocks.some(s => s.symbol === item.symbol));
    if (missing.length === 0) return;
    
    console.log("Fetching missing portfolio stock data for: ", missing.map(m => m.symbol));
    
    Promise.all(missing.map(m => 
        fetch(`/api/stocks/add/${m.symbol}`, { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.success && data.stock) {
                    if (!stocks.some(s => s.symbol === m.symbol)) {
                        stocks.push(data.stock);
                    }
                }
            })
            .catch(err => console.error(`Error fetching missing stock ${m.symbol}:`, err))
    )).then(() => {
        renderPortfolio();
    });
}

// Fetch all stock data
function fetchData(callback = null) {
    console.log("Fetching fresh data...");
    
    // Fetch Stocks & Watchlist
    fetch(`/api/stocks?_t=${Date.now()}`)
        .then(res => res.json())
        .then(data => {
            stocks = data.stocks;
            applySorting();
            
            // Update last updated time and status indicator
            const lastUpdatedDate = data.last_updated > 0 ? new Date(data.last_updated * 1000) : new Date();
            const timeStr = lastUpdatedDate.toLocaleTimeString("ro-RO", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const timeEl = document.getElementById("last-update-time");
            if (data.status === "Updating") {
                timeEl.innerHTML = `${timeStr} <span class="updating-text" style="color: var(--color-blue); font-size: 0.75rem; margin-left: 5px; font-weight: 500;">(Se actualizează...)</span>`;
            } else if (data.status === "Error") {
                timeEl.innerHTML = `${timeStr} <span style="color: var(--color-red); font-size: 0.75rem; margin-left: 5px; font-weight: 500;">(Eroare)</span>`;
            } else {
                timeEl.innerText = timeStr;
            }
            
            // Populate Watchlist Table
            populateWatchlist();
            
            // Fetch any missing portfolio stocks dynamically
            fetchMissingPortfolioStocks();
            
            // Populate Widgets
            updateTopWidgets();
            renderTopMovers();
            
            // Refresh Alert History Table
            if (typeof renderAlertHistoryTable === "function") renderAlertHistoryTable();
            
            // Fetch Recommendations
            return fetch("/api/recommendations");
        })
        .then(res => res.json())
        .then(data => {
            recommendations = data;
            
            // Populate Recommendations panels
            populateRecommendations();
            
            // Load chart for active symbol if not loaded yet
            if (stocks.length > 0) {
                if (initialLoad) {
                    // Find top traded (highest variation)
                    let topTraded = null;
                    let maxChange = -999.0;
                    stocks.forEach(stock => {
                        const varVal = parseFloat(stock.variation.replace('%', '').replace('+', '').replace(',', '.'));
                        if (!isNaN(varVal) && varVal > maxChange) {
                            maxChange = varVal;
                            topTraded = stock;
                        }
                    });
                    if (topTraded) {
                        activeSymbol = topTraded.symbol;
                    } else {
                        activeSymbol = stocks[0].symbol;
                    }
                    initialLoad = false;
                } else {
                    // If the activeSymbol is not in the list anymore (e.g. deleted), default to first
                    if (!stocks.find(s => s.symbol === activeSymbol)) {
                        activeSymbol = stocks[0].symbol;
                    }
                }
                updateActiveTickerDetails(activeSymbol);
                fetchNews(activeSymbol);
                if (typeof renderPriceAlertsList === "function") {
                    renderPriceAlertsList();
                }
            }
            
            // Initialize Lucide icons
            
            
            if (callback) callback();
        })
        .catch(err => {
            console.error("Error fetching dashboard data:", err);
            if (callback) callback();
        });
}

// Populate Watchlist Table
function populateWatchlist() {
    const tbody = document.getElementById("watchlist-table-body");
    tbody.innerHTML = "";
    
    // Update sort icon visual states in the header
    updateSortIcons();
    
    if (stocks.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="table-loading" style="padding: 40px; text-align: center;">
                    <div style="font-weight: 600; color: var(--text-muted);">Watchlist-ul tău este gol.</div>
                </td>
            </tr>
        `;
        return;
    }
    
    stocks.forEach(stock => {
        const isSelected = stock.symbol === activeSymbol ? "selected" : "";
        const tr = document.createElement("tr");
        tr.className = `${isSelected} row-signal-${stock.technical.tech_signal}`;
        tr.setAttribute("data-symbol", stock.symbol);
        
        // Price format
        const priceFormatted = stock.price.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
        
        // Variation format & color class
        const varText = stock.variation;
        const varNum = parseFloat(varText.replace(",", "."));
        const varClass = varNum > 0 ? "val-up" : (varNum < 0 ? "val-down" : "val-neutral");
        
        // YTD Return
        const ytd = stock.technical.ytd_return;
        const ytdText = (ytd >= 0 ? "+" : "") + ytd.toFixed(2) + "%";
        const ytdClass = ytd > 0 ? "val-up" : (ytd < 0 ? "val-down" : "val-neutral");
        
        // RSI
        const rsi = stock.technical.rsi;
        const rsiClass = rsi < 35 ? "val-up" : (rsi > 65 ? "val-down" : "val-neutral");
        
        let signalText = stock.technical.tech_signal;
        if (signalText === "BUY") signalText = "Cumpără";
        else if (signalText === "HOLD") signalText = "Așteaptă";
        else if (signalText === "SELL") signalText = "Vinde";
        
        tr.innerHTML = `
            <td>
                <div class="table-symbol-col">
                    <span class="table-symbol">${stock.symbol}</span>
                    <span class="table-name">${stock.name}</span>
                </div>
            </td>
            <td class="table-price">${priceFormatted} RON</td>
            <td class="${varClass}">${varText}</td>
            <td class="${ytdClass}">${ytdText}</td>
            <td class="table-num">${stock.pe > 0 ? stock.pe.toFixed(2) : '-'}</td>
            <td class="table-num">${stock.pb > 0 ? stock.pb.toFixed(2) : '-'}</td>
            <td class="table-num">${stock.div_yield > 0 ? stock.div_yield.toFixed(2) + '%' : '0.00%'}</td>
            <td class="${rsiClass}">${rsi.toFixed(1)}</td>
            <td>
                <span class="badge-signal ${stock.technical.tech_signal}">${signalText}</span>
            </td>
            <td>
                <div class="table-actions-wrapper">
                    <button class="btn-table-action select-ticker-btn" onclick="selectTicker('${stock.symbol}')">
                        <i class="ph-duotone ph-chart-line-up" ></i>
                        <span>Grafic</span>
                    </button>
                    <button class="btn-table-action remove-ticker-btn" onclick="removeTicker('${stock.symbol}', event)">
                        <i class="ph-duotone ph-trash" ></i>
                        <span>Șterge</span>
                    </button>
                </div>
            </td>
        `;
        
        // Clicking row selects it
        tr.addEventListener("click", (e) => {
            if (!e.target.closest("button")) {
                selectTicker(stock.symbol);
            }
        });
        
        tbody.appendChild(tr);
    });
    
    renderPortfolio();
}

// Update Top Highlight Widgets
function updateTopWidgets() {
    // 1. Find top traded (highest positive change or custom logic)
    let topTraded = null;
    let maxChange = -999.0;
    
    stocks.forEach(stock => {
        const varVal = parseFloat(stock.variation.replace('%', '').replace('+', '').replace(',', '.'));
        if (!isNaN(varVal) && varVal > maxChange) {
            maxChange = varVal;
            topTraded = stock;
        }
    });
    
    if (topTraded) {
        document.getElementById("top-traded-sym").innerText = topTraded.symbol;
        document.getElementById("top-traded-name").innerText = topTraded.name;
        const topTradedChange = document.getElementById("top-traded-change");
        topTradedChange.innerText = topTraded.variation;
        
        const isUp = parseFloat(topTraded.variation.replace(",", ".")) > 0;
        topTradedChange.className = isUp ? "index-change positive" : "index-change negative";
    }
    
    // 2. Average DIVY calculation
    let totalDivy = 0;
    let divyCount = 0;
    stocks.forEach(stock => {
        if (stock.div_yield > 0) {
            totalDivy += stock.div_yield;
            divyCount++;
        }
    });
    if (divyCount > 0) {
        document.getElementById("avg-divy").innerText = (totalDivy / divyCount).toFixed(2) + "%";
    }
    
    // 3. Market Sentiment Index (BVB Fear & Greed)
    let totalScore = 0;
    let scoreCount = 0;
    stocks.forEach(stock => {
        if (stock.technical && stock.technical.tech_score !== undefined) {
            totalScore += stock.technical.tech_score;
            scoreCount++;
        }
    });
    const avgScore = scoreCount > 0 ? totalScore / scoreCount : 50.0;
    const sentimentValEl = document.getElementById("market-sentiment-value");
    const sentimentStatusEl = document.getElementById("market-sentiment-status");
    const sentimentDescEl = document.getElementById("market-sentiment-desc");
    
    if (sentimentValEl && sentimentStatusEl && sentimentDescEl) {
        sentimentValEl.innerText = avgScore.toFixed(1) + "%";
        
        let status = "NEUTRU";
        let statusClass = "neutral";
        let desc = "Index Fear & Greed BVB";
        
        if (avgScore > 70) {
            status = "GREED";
            statusClass = "positive";
            desc = "Lăcomie / Piață Bullish";
        } else if (avgScore > 55) {
            status = "OPTIMISM";
            statusClass = "positive";
            desc = "Optimism moderat";
        } else if (avgScore < 30) {
            status = "FEAR";
            statusClass = "negative";
            desc = "Frică / Oportunitate BUY!";
        } else if (avgScore < 45) {
            status = "PESIMISM";
            statusClass = "negative";
            desc = "Pesimism moderat";
        }
        
        sentimentStatusEl.innerText = status;
        sentimentStatusEl.className = `index-change ${statusClass}`;
        sentimentDescEl.innerText = desc;
    }
    
    // 4. Trigger Price Alerts check
    checkPriceAlerts();
}

// Render Top Gainers / Losers widgets on the Dashboard tab
function renderTopMovers() {
    const gainersEl = document.getElementById("top-gainers-list");
    const losersEl = document.getElementById("top-losers-list");
    if (!gainersEl || !losersEl) return;

    const ranked = stocks
        .map(stock => ({
            stock,
            varVal: parseFloat(stock.variation.replace('%', '').replace('+', '').replace(',', '.'))
        }))
        .filter(r => !isNaN(r.varVal) && r.varVal !== 0);

    const gainers = ranked.filter(r => r.varVal > 0).sort((a, b) => b.varVal - a.varVal).slice(0, 5);
    const losers = ranked.filter(r => r.varVal < 0).sort((a, b) => a.varVal - b.varVal).slice(0, 5);

    const renderRows = (list) => list.map(({ stock, varVal }) => {
        const priceFormatted = stock.price.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
        const isUp = varVal > 0;
        return `
            <div class="mover-row" onclick="selectTicker('${stock.symbol}'); switchTab('analysis');">
                <div class="mover-identity">
                    <span class="mover-symbol">${stock.symbol}</span>
                    <span class="mover-name" title="${stock.name}">${stock.name}</span>
                </div>
                <div class="mover-figures">
                    <span class="mover-price">${priceFormatted} RON</span>
                    <span class="mover-change ${isUp ? 'val-up' : 'val-down'}">${stock.variation}</span>
                </div>
            </div>
        `;
    }).join('');

    gainersEl.innerHTML = gainers.length
        ? renderRows(gainers)
        : '<div class="loading-placeholder">Nicio creștere semnificativă azi.</div>';
    losersEl.innerHTML = losers.length
        ? renderRows(losers)
        : '<div class="loading-placeholder">Nicio scădere semnificativă azi.</div>';
}

// Populate Recommendations Panels
function populateRecommendations() {
    const buyList = document.getElementById("buy-recommendations-list");
    const sellList = document.getElementById("sell-recommendations-list");
    
    buyList.innerHTML = "";
    sellList.innerHTML = "";
    
    // BUYs
    if (recommendations.buy && recommendations.buy.length > 0) {
        recommendations.buy.forEach(rec => {
            const stock = stocks.find(s => s.symbol === rec.symbol);
            const priceText = stock ? stock.price.toLocaleString("ro-RO", { minimumFractionDigits: 2 }) + " RON" : "";
            
            const card = document.createElement("div");
            card.className = "rec-card";
            card.onclick = () => selectTicker(rec.symbol);
            card.innerHTML = `
                <div class="rec-card-header">
                    <span class="rec-card-term">${rec.term}</span>
                    <span class="rec-card-symbol">${rec.symbol}</span>
                </div>
                <div class="rec-card-info">
                    <span class="rec-card-name">${rec.name}</span>
                    <span class="rec-card-price">${priceText}</span>
                </div>
                <div class="rec-card-reason">
                    <strong>Broker Insight:</strong> ${rec.reason}
                </div>
                <div class="rec-card-news" id="rec-news-buy-${rec.symbol}">
                    <div class="loading-news" style="font-size: 0.8rem; color: var(--text-muted);"><i  class="ph-duotone ph-spinner spin"></i> Scanare flux de știri...</div>
                </div>
            `;
            buyList.appendChild(card);
            
            // Fetch news
            fetch(`/api/news/${rec.symbol}`)
                .then(r => r.json())
                .then(news => {
                    const newsEl = document.getElementById(`rec-news-buy-${rec.symbol}`);
                    if (!newsEl) return;
                    if (news.length > 0) {
                        const topNews = news[0];
                        let sentimentIcon = "minus";
                        let sentimentColor = "var(--text-muted)";
                        if (topNews.sentiment === "positive") { sentimentIcon = "trending-up"; sentimentColor = "var(--text-success)"; }
                        else if (topNews.sentiment === "negative") { sentimentIcon = "trending-down"; sentimentColor = "var(--text-danger)"; }
                        
                        newsEl.innerHTML = `
                            <div style="margin-top: 10px; padding: 4px 0 4px 12px; border-left: 2px solid ${sentimentColor};">
                                <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Pulsul Pieței</div>
                                <div style="font-size: 0.8rem; font-weight: 500; color: var(--text-primary);">"${topNews.title}"</div>
                                <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; display: flex; align-items: center; gap: 4px;">
                                    <i class="ph-duotone ph-${sentimentIcon.replace('arrow-up-right', 'arrow-up-right').replace('arrow-down-right', 'arrow-down-right').replace('minus', 'minus').replace('check-circle', 'check-circle').replace('alert-circle', 'warning-circle')}"  style="font-size: 11px; width:11px;height:11px;color:${sentimentColor}"></i>
                                    Sentiment: ${topNews.sentiment === 'positive' ? 'Pozitiv' : (topNews.sentiment === 'negative' ? 'Negativ' : 'Neutru')}
                                </div>
                            </div>
                        `;
                    } else {
                        newsEl.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px; font-style: italic;">Nicio știre relevantă recentă.</div>`;
                    }
                })
                .catch(() => {
                    const newsEl = document.getElementById(`rec-news-buy-${rec.symbol}`);
                    if (newsEl) newsEl.innerHTML = '';
                });
        });
    } else {
        buyList.innerHTML = `<div class="loading-placeholder">Nu sunt recomandări de cumpărare active.</div>`;
    }
    
    // SELLs
    if (recommendations.sell && recommendations.sell.length > 0) {
        recommendations.sell.forEach(rec => {
            const stock = stocks.find(s => s.symbol === rec.symbol);
            const priceText = stock ? stock.price.toLocaleString("ro-RO", { minimumFractionDigits: 2 }) + " RON" : "";
            
            const card = document.createElement("div");
            card.className = "rec-card";
            card.onclick = () => selectTicker(rec.symbol);
            card.innerHTML = `
                <div class="rec-card-header">
                    <span class="rec-card-term">${rec.term}</span>
                    <span class="rec-card-symbol">${rec.symbol}</span>
                </div>
                <div class="rec-card-info">
                    <span class="rec-card-name">${rec.name}</span>
                    <span class="rec-card-price">${priceText}</span>
                </div>
                <div class="rec-card-reason">
                    <strong>Broker Insight:</strong> ${rec.reason}
                </div>
                <div class="rec-card-news" id="rec-news-sell-${rec.symbol}">
                    <div class="loading-news" style="font-size: 0.8rem; color: var(--text-muted);"><i  class="ph-duotone ph-spinner spin"></i> Scanare flux de știri...</div>
                </div>
            `;
            sellList.appendChild(card);
            
            // Fetch news
            fetch(`/api/news/${rec.symbol}`)
                .then(r => r.json())
                .then(news => {
                    const newsEl = document.getElementById(`rec-news-sell-${rec.symbol}`);
                    if (!newsEl) return;
                    if (news.length > 0) {
                        const topNews = news[0];
                        let sentimentIcon = "minus";
                        let sentimentColor = "var(--text-muted)";
                        if (topNews.sentiment === "positive") { sentimentIcon = "trending-up"; sentimentColor = "var(--text-success)"; }
                        else if (topNews.sentiment === "negative") { sentimentIcon = "trending-down"; sentimentColor = "var(--text-danger)"; }
                        
                        newsEl.innerHTML = `
                            <div style="margin-top: 10px; padding: 4px 0 4px 12px; border-left: 2px solid ${sentimentColor};">
                                <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Pulsul Pieței</div>
                                <div style="font-size: 0.8rem; font-weight: 500; color: var(--text-primary);">"${topNews.title}"</div>
                                <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; display: flex; align-items: center; gap: 4px;">
                                    <i class="ph-duotone ph-${sentimentIcon.replace('arrow-up-right', 'arrow-up-right').replace('arrow-down-right', 'arrow-down-right').replace('minus', 'minus').replace('check-circle', 'check-circle').replace('alert-circle', 'warning-circle')}"  style="font-size: 11px; width:11px;height:11px;color:${sentimentColor}"></i>
                                    Sentiment: ${topNews.sentiment === 'positive' ? 'Pozitiv' : (topNews.sentiment === 'negative' ? 'Negativ' : 'Neutru')}
                                </div>
                            </div>
                        `;
                    } else {
                        newsEl.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px; font-style: italic;">Nicio știre relevantă recentă.</div>`;
                    }
                })
                .catch(() => {
                    const newsEl = document.getElementById(`rec-news-sell-${rec.symbol}`);
                    if (newsEl) newsEl.innerHTML = '';
                });
        });
    } else {
        sellList.innerHTML = `<div class="loading-placeholder">Nu sunt recomandări de vânzare active.</div>`;
    }
    
    // Populate Dividend Calendar
    populateDividendCalendar();
}

// Select a Ticker and Update Chart
function selectTicker(symbol) {
    activeSymbol = symbol;
    
    // Update selected class in watchlist table
    const rows = document.querySelectorAll("#watchlist-table-body tr");
    rows.forEach(row => {
        if (row.getAttribute("data-symbol") === symbol) {
            row.classList.add("selected");
        } else {
            row.classList.remove("selected");
        }
    });
    
    // Update Details and Fetch Chart
    updateActiveTickerDetails(symbol);
    
    // Fetch News for the selected symbol
    fetchNews(symbol);
    
    // Render alerts
    renderPriceAlertsList();
}

// Update Active Ticker Information Sidebar
function updateActiveTickerDetails(symbol) {
    const stock = stocks.find(s => s.symbol === symbol);
    if (!stock) return;
    
    document.getElementById("chart-symbol").innerText = stock.symbol;
    document.getElementById("chart-name").innerText = stock.name;
    document.getElementById("chart-price").innerText = stock.price.toLocaleString("ro-RO", { minimumFractionDigits: 2 });
    
    // Variation
    const chartVar = document.getElementById("chart-variation");
    chartVar.innerText = stock.variation;
    const isUp = parseFloat(stock.variation.replace(",", ".")) > 0;
    chartVar.className = isUp ? "active-variation positive" : "active-variation negative";
    
    // Ratios
    document.getElementById("stat-pe").innerText = stock.pe > 0 ? stock.pe.toFixed(2) : "N/A";
    document.getElementById("stat-pb").innerText = stock.pb > 0 ? stock.pb.toFixed(2) : "N/A";
    document.getElementById("stat-divy").innerText = stock.div_yield > 0 ? stock.div_yield.toFixed(2) + "%" : "0.00%";
    document.getElementById("stat-rsi").innerText = stock.technical.rsi.toFixed(1);
    
    const ytd = stock.technical.ytd_return;
    document.getElementById("stat-ytd").innerText = (ytd >= 0 ? "+" : "") + ytd.toFixed(2) + "%";
    
    // Market Cap
    const mCap = stock.market_cap;
    let mCapText = "N/A";
    if (mCap > 1e9) {
        mCapText = (mCap / 1e9).toFixed(2) + "B RON";
    } else if (mCap > 1e6) {
        mCapText = (mCap / 1e6).toFixed(2) + "M RON";
    }
    document.getElementById("stat-mcap").innerText = mCapText;
    
    // New Broker Stats
    // Graham's intrinsic value formula (√(22.5 × EPS × Valoare Contabilă/Acțiune)) is only
    // defined for profitable companies - a negative/zero EPS can't produce a meaningful
    // "fair value", so we surface *why* it's N/A instead of leaving it unexplained.
    const intrinsic = stock.intrinsic_value;
    const intrinsicEl = document.getElementById("stat-intrinsic");
    const safety = stock.margin_of_safety;
    const safetyEl = document.getElementById("stat-safety");

    if (intrinsic > 0) {
        intrinsicEl.innerText = intrinsic.toFixed(2) + " RON";
        intrinsicEl.title = "";
        safetyEl.innerText = (safety >= 0 ? "+" : "") + safety.toFixed(1) + "%";
        safetyEl.className = "stat-value " + (safety > 10 ? "val-up" : (safety < -10 ? "val-down" : "val-neutral"));
        safetyEl.title = "";
    } else if (stock.is_fund) {
        intrinsicEl.innerText = "N/A (fond)";
        intrinsicEl.title = "Fondurile/ETF-urile nu au profit pe acțiune (EPS) - formula Graham de valoare intrinsecă se aplică doar acțiunilor individuale.";
        safetyEl.innerText = "N/A (fond)";
        safetyEl.className = "stat-value val-neutral";
        safetyEl.title = intrinsicEl.title;
    } else if (!(stock.eps > 0)) {
        intrinsicEl.innerText = "N/A (pierdere)";
        intrinsicEl.title = "Compania raportează pierdere pe acțiune (EPS negativ sau zero) - valoarea intrinsecă nu se poate calcula.";
        safetyEl.innerText = "N/A (pierdere)";
        safetyEl.className = "stat-value val-neutral";
        safetyEl.title = intrinsicEl.title;
    } else {
        intrinsicEl.innerText = "N/A (fără P/B)";
        intrinsicEl.title = "Lipsește raportul preț/valoare contabilă (P/B) necesar calculului.";
        safetyEl.innerText = "N/A";
        safetyEl.className = "stat-value val-neutral";
        safetyEl.title = intrinsicEl.title;
    }
    
    const beta = stock.beta || 1.0;
    const betaText = beta < 0.85 ? `${beta.toFixed(2)} (Defensiv)` : (beta > 1.15 ? `${beta.toFixed(2)} (Agresiv)` : `${beta.toFixed(2)} (Echilibrat)`);
    const betaEl = document.getElementById("stat-beta");
    if (betaEl) {
        betaEl.innerText = betaText;
        betaEl.className = "stat-value " + (beta < 0.85 ? "val-up" : (beta > 1.15 ? "val-down" : "val-neutral"));
    }
    
    const sectorEl = document.getElementById("stat-sector");
    if (sectorEl) {
        sectorEl.innerText = stock.sector || getStockSector(stock.symbol);
    }
    
    // Technical Score
    const techScore = stock.technical ? (stock.technical.tech_score || 50.0) : 50.0;
    const techScoreEl = document.getElementById("stat-techscore");
    if (techScoreEl) {
        techScoreEl.innerText = techScore.toFixed(1) + "%";
        techScoreEl.className = techScore > 70 ? "val-up" : (techScore < 30 ? "val-down" : "val-neutral");
    }
    
    // Signal Badge
    const signalBadge = document.getElementById("active-signal-badge");
    if (signalBadge && stock.technical) {
        let signalText = stock.technical.tech_signal;
        if (signalText === "BUY") signalText = "Cumpără";
        else if (signalText === "HOLD") signalText = "Așteaptă";
        else if (signalText === "SELL") signalText = "Vinde";
        signalBadge.innerText = signalText;
        signalBadge.className = `gauge-value ${stock.technical.tech_signal}`;
    }
    
    // Fetch Chart Data
    fetchChartData(symbol);
}

// Set Chart Range
function setChartRange(range, element) {
    chartRange = range;
    
    // Update active style on range buttons
    const buttons = document.querySelectorAll(".chart-type-selectors button");
    buttons.forEach(btn => btn.classList.remove("active"));
    element.classList.add("active");
    
    // Re-render chart with new slice
    renderChart();
}

// Fetch historical chart data from backend
function fetchChartData(symbol) {
    console.log(`Fetching history for ${symbol}...`);
    
    fetch(`/api/stocks/${symbol}/chart`)
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                console.error("Failed to load chart data:", data.error);
                return;
            }
            
            chartData = data.chart;
            renderChart();
        })
        .catch(err => {
            console.error("Error loading chart data:", err);
        });
}

// Calculate indicators in client-side for dynamic overlay
function calculateMA(closes, period) {
    const ma = [];
    for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) {
            ma.push(null);
        } else {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += closes[i - j];
            }
            ma.push(parseFloat((sum / period).toFixed(4)));
        }
    }
    return ma;
}


// Small candlestick glyphs for the AI pattern list — each pattern gets a shape
// that mirrors its actual candles (body/wick proportions, up to 3 candles),
// instead of a generic up/down arrow, so a beginner can recognize the shape
// on the real chart from the icon alone.
function svgCandle(x, wickTop, bodyTop, bodyBottom, wickBottom, bullish, neutral) {
    const color = neutral ? '#94a3b8' : (bullish ? '#10b981' : '#ef4444');
    const w = 4;
    const h = Math.max(bodyBottom - bodyTop, 1.4);
    return `<line x1="${x}" y1="${wickTop}" x2="${x}" y2="${wickBottom}" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>` +
           `<rect x="${x - w / 2}" y="${bodyTop}" width="${w}" height="${h}" rx="0.6" fill="${color}"/>`;
}

function patternIconSvg(candles) {
    const inner = candles.map(c => svgCandle(c.x, c.wickTop, c.bodyTop, c.bodyBottom, c.wickBottom, c.bullish, c.neutral)).join('');
    return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">${inner}</svg>`;
}

const PATTERN_ICONS = {
    hammer: [{ x: 12, wickTop: 6, bodyTop: 6, bodyBottom: 9.5, wickBottom: 20, bullish: true }],
    'shooting-star': [{ x: 12, wickTop: 4, bodyTop: 14.5, bodyBottom: 18, wickBottom: 18, bullish: false }],
    'marubozu-bull': [{ x: 12, wickTop: 4, bodyTop: 4, bodyBottom: 20, wickBottom: 20, bullish: true }],
    'marubozu-bear': [{ x: 12, wickTop: 4, bodyTop: 4, bodyBottom: 20, wickBottom: 20, bullish: false }],
    doji: [{ x: 12, wickTop: 4, bodyTop: 11.3, bodyBottom: 12.7, wickBottom: 20, neutral: true }],
    'spinning-top': [{ x: 12, wickTop: 3, bodyTop: 10, bodyBottom: 14, wickBottom: 21, neutral: true }],
    'engulf-bull': [
        { x: 8, wickTop: 9, bodyTop: 9, bodyBottom: 13, wickBottom: 13, bullish: false },
        { x: 16, wickTop: 6, bodyTop: 6, bodyBottom: 18, wickBottom: 18, bullish: true }
    ],
    'engulf-bear': [
        { x: 8, wickTop: 11, bodyTop: 11, bodyBottom: 15, wickBottom: 15, bullish: true },
        { x: 16, wickTop: 6, bodyTop: 6, bodyBottom: 18, wickBottom: 18, bullish: false }
    ],
    'pierce-bull': [
        { x: 8, wickTop: 6, bodyTop: 6, bodyBottom: 18, wickBottom: 18, bullish: false },
        { x: 16, wickTop: 11, bodyTop: 11, bodyBottom: 20, wickBottom: 20, bullish: true }
    ],
    'pierce-bear': [
        { x: 8, wickTop: 6, bodyTop: 6, bodyBottom: 18, wickBottom: 18, bullish: true },
        { x: 16, wickTop: 4, bodyTop: 4, bodyBottom: 13, wickBottom: 13, bullish: false }
    ],
    'tweezer-bull': [
        { x: 8, wickTop: 8, bodyTop: 8, bodyBottom: 14, wickBottom: 20, bullish: false },
        { x: 16, wickTop: 6, bodyTop: 6, bodyBottom: 12, wickBottom: 20, bullish: true }
    ],
    'tweezer-bear': [
        { x: 8, wickTop: 4, bodyTop: 10, bodyBottom: 16, wickBottom: 16, bullish: true },
        { x: 16, wickTop: 4, bodyTop: 12, bodyBottom: 18, wickBottom: 18, bullish: false }
    ],
    'star-bull': [
        { x: 4.5, wickTop: 5, bodyTop: 6, bodyBottom: 14, wickBottom: 15, bullish: false },
        { x: 12, wickTop: 15, bodyTop: 16, bodyBottom: 18, wickBottom: 19, neutral: true },
        { x: 19.5, wickTop: 7, bodyTop: 8, bodyBottom: 16, wickBottom: 17, bullish: true }
    ],
    'star-bear': [
        { x: 4.5, wickTop: 9, bodyTop: 10, bodyBottom: 18, wickBottom: 19, bullish: true },
        { x: 12, wickTop: 5, bodyTop: 6, bodyBottom: 8, wickBottom: 9, neutral: true },
        { x: 19.5, wickTop: 6, bodyTop: 7, bodyBottom: 15, wickBottom: 16, bullish: false }
    ],
    'soldiers-bull': [
        { x: 4.5, wickTop: 15, bodyTop: 16, bodyBottom: 20, wickBottom: 21, bullish: true },
        { x: 12, wickTop: 10, bodyTop: 11, bodyBottom: 15, wickBottom: 16, bullish: true },
        { x: 19.5, wickTop: 5, bodyTop: 6, bodyBottom: 10, wickBottom: 11, bullish: true }
    ],
    'crows-bear': [
        { x: 4.5, wickTop: 3, bodyTop: 4, bodyBottom: 8, wickBottom: 9, bullish: false },
        { x: 12, wickTop: 8, bodyTop: 9, bodyBottom: 13, wickBottom: 14, bullish: false },
        { x: 19.5, wickTop: 13, bodyTop: 14, bodyBottom: 18, wickBottom: 19, bullish: false }
    ]
};

function detectCandlePatterns(dataSlice) {
    const patterns = [];
    const recentSlice = dataSlice.slice(-40); // scan last 40 days
    
    for (let i = 2; i < recentSlice.length; i++) {
        const c1 = recentSlice[i-2];
        const c2 = recentSlice[i-1];
        const c3 = recentSlice[i];
        
        const body3 = Math.abs(c3.open - c3.close);
        const wickUp3 = c3.high - Math.max(c3.open, c3.close);
        const wickDown3 = Math.min(c3.open, c3.close) - c3.low;
        const total3 = c3.high - c3.low;
        const isBullish3 = c3.close > c3.open;
        const isBearish3 = c3.close < c3.open;
        
        const isBullish2 = c2.close > c2.open;
        const isBearish2 = c2.close < c2.open;
        const body2 = Math.abs(c2.open - c2.close);
        
        const isBullish1 = c1.close > c1.open;
        const isBearish1 = c1.close < c1.open;
        const body1 = Math.abs(c1.open - c1.close);

        // 1. Morning Star (Răsturnare spre Creștere) - 3 lumânări
        if (isBearish1 && isBullish3 && body2 <= body1 * 0.4 && c3.close >= c1.open - body1 * 0.5 && body1 > c1.close * 0.003) {
            patterns.push({
                time: c3.timestamp,
                name: 'Morning Star (Steaua Dimineții)',
                type: 'bullish',
                icon: 'star-bull',
                tag: 'SEMNAL DE CREȘTERE',
                desc: 'Scăderea anterioară a obosit, urmată de o pauză de ezitare și o revenire puternică a cumpărătorilor. Semnalează finalul perioadei slabe și o potențială urcare durabilă a prețului.'
            });
            continue;
        }

        // 2. Evening Star (Răsturnare spre Scădere) - 3 lumânări
        if (isBullish1 && isBearish3 && body2 <= body1 * 0.4 && c3.close <= c1.open + body1 * 0.5 && body1 > c1.close * 0.003) {
            patterns.push({
                time: c3.timestamp,
                name: 'Evening Star (Steaua Serii)',
                type: 'bearish',
                icon: 'star-bear',
                tag: 'SEMNAL DE SCĂDERE',
                desc: 'După o perioadă bună de creștere, piața a obosit și vânzătorii au preluat controlul. Este un avertisment timpuriu că prețul tinde să scadă și poate fi un moment bun pentru marcarea profitului.'
            });
            continue;
        }

        // 3. Hammer (Ciocan) - Bullish
        if (wickDown3 >= body3 * 2 && wickUp3 <= body3 * 0.5 && body3 > 0 && total3 > (c3.close * 0.003)) {
            patterns.push({
                time: c3.timestamp,
                name: 'Hammer (Ciocan)',
                type: 'bullish',
                icon: 'hammer',
                tag: 'RESPINGERE PREȚ MIC',
                desc: 'Vânzătorii au încercat să scadă prețul în timpul zilei, dar cumpărătorii au intervenit în forță și l-au readus sus. Indică un minim atins și un potențial început de creștere.'
            });
            continue;
        }
        
        // 4. Shooting Star (Stea Căzătoare) - Bearish
        if (wickUp3 >= body3 * 2 && wickDown3 <= body3 * 0.5 && body3 > 0 && total3 > (c3.close * 0.003)) {
            patterns.push({
                time: c3.timestamp,
                name: 'Shooting Star (Stea Căzătoare)',
                type: 'bearish',
                icon: 'shooting-star',
                tag: 'OBOSEALĂ CUMPĂRĂTORI',
                desc: 'Prețul a crescut mult în timpul zilei, dar cumpărătorii și-au pierdut puterea pe final, iar vânzătorii l-au împins înapoi jos. Sugerează o posibilă scădere a prețului în zilele următoare.'
            });
            continue;
        }
        
        // 5. Bullish Engulfing (Înghițire Verde)
        if (isBearish2 && isBullish3 && c3.close >= c2.open && c3.open <= c2.close && body3 > body2) {
            patterns.push({
                time: c3.timestamp,
                name: 'Bullish Engulfing (Înghițire Verde)',
                type: 'bullish',
                icon: 'engulf-bull',
                tag: 'DOMINAȚIE CUMPĂRĂTORI',
                desc: 'Cumpărătorii au fost atât de puternici încât au acoperit complet scăderea din ziua precedentă. Este un semnal clar de încredere și un avânt puternic de creștere.'
            });
            continue;
        }
        
        // 6. Bearish Engulfing (Înghițire Roșie)
        if (isBullish2 && isBearish3 && c3.close <= c2.open && c3.open >= c2.close && body3 > body2) {
            patterns.push({
                time: c3.timestamp,
                name: 'Bearish Engulfing (Înghițire Roșie)',
                type: 'bearish',
                icon: 'engulf-bear',
                tag: 'DOMINAȚIE VÂNZĂTORI',
                desc: 'Vânzările de azi au fost masive și au anulat complet câștigul din ziua anterioară. Arată că vânzătorii au preluat controlul și prețul se poate corecta în continuare.'
            });
            continue;
        }
        
        // 7. Bullish Marubozu (Control Total Cumpărători)
        if (isBullish3 && wickUp3 <= body3 * 0.1 && wickDown3 <= body3 * 0.1 && body3 > (c3.close * 0.005)) {
            patterns.push({
                time: c3.timestamp,
                name: 'Bullish Marubozu (Control Total)',
                type: 'bullish',
                icon: 'marubozu-bull',
                tag: 'FORȚĂ MAXIMĂ DE CREȘTERE',
                desc: 'Prețul a crescut constant de la prima până la ultima minută a zilei, fără ezitări. Demonstrează că investitorii cumpără cu mare încredere la orice preț.'
            });
            continue;
        }

        // 8. Bearish Marubozu (Control Total Vânzători)
        if (isBearish3 && wickUp3 <= body3 * 0.1 && wickDown3 <= body3 * 0.1 && body3 > (c3.close * 0.005)) {
            patterns.push({
                time: c3.timestamp,
                name: 'Bearish Marubozu (Presiune Vânzare)',
                type: 'bearish',
                icon: 'marubozu-bear',
                tag: 'SCĂDERE CONTINUĂ',
                desc: 'Acțiunea a scăzut continuu pe tot parcursul zilei. Indică o grabă a investitorilor de a ieși din acțiune, prețul având șanse mari să continue scăderea.'
            });
            continue;
        }

        // 9a. Piercing Line (Linia de Străpungere) - Bullish, 2 lumânări
        if (isBearish2 && isBullish3 && c3.open < c2.close && c3.close > (c2.open + c2.close) / 2 && c3.close < c2.open && body2 > c2.close * 0.003) {
            patterns.push({
                time: c3.timestamp,
                name: 'Piercing Line (Linia de Străpungere)',
                type: 'bullish',
                icon: 'pierce-bull',
                tag: 'REVENIRE CUMPĂRĂTORI',
                desc: 'Prima zi a fost puternic negativă, iar a doua a deschis chiar mai jos, dar a urcat și a acoperit peste jumătate din pierderea anterioară. Cumpărătorii revin în forță și pot opri scăderea.'
            });
            continue;
        }

        // 9b. Dark Cloud Cover (Nor Întunecat) - Bearish, 2 lumânări
        if (isBullish2 && isBearish3 && c3.open > c2.close && c3.close < (c2.open + c2.close) / 2 && c3.close > c2.open && body2 > c2.close * 0.003) {
            patterns.push({
                time: c3.timestamp,
                name: 'Dark Cloud Cover (Nor Întunecat)',
                type: 'bearish',
                icon: 'pierce-bear',
                tag: 'REVENIRE VÂNZĂTORI',
                desc: 'Prima zi a fost puternic pozitivă, iar a doua a deschis chiar mai sus, dar a coborât și a șters peste jumătate din câștigul anterior. Vânzătorii revin în forță și pot opri creșterea.'
            });
            continue;
        }

        // 9c. Tweezer Bottom (Pensetă de Minim) - Bullish, 2 lumânări cu minime egale
        if (isBearish2 && isBullish3 && Math.abs(c2.low - c3.low) <= c3.close * 0.0015 && body2 > c2.close * 0.002) {
            patterns.push({
                time: c3.timestamp,
                name: 'Tweezer Bottom (Pensetă de Minim)',
                type: 'bullish',
                icon: 'tweezer-bull',
                tag: 'MINIM DUBLU CONFIRMAT',
                desc: 'Prețul a atins aproape exact același nivel minim două zile la rând și nu a mai putut coborî sub el. Vânzătorii au pierdut din putere, iar acest minim dublu poate marca o revenire.'
            });
            continue;
        }

        // 9d. Tweezer Top (Pensetă de Maxim) - Bearish, 2 lumânări cu maxime egale
        if (isBullish2 && isBearish3 && Math.abs(c2.high - c3.high) <= c3.close * 0.0015 && body2 > c2.close * 0.002) {
            patterns.push({
                time: c3.timestamp,
                name: 'Tweezer Top (Pensetă de Maxim)',
                type: 'bearish',
                icon: 'tweezer-bear',
                tag: 'MAXIM DUBLU CONFIRMAT',
                desc: 'Prețul a atins aproape exact același nivel maxim două zile la rând și nu a mai putut urca peste el. Cumpărătorii au pierdut din putere, iar acest maxim dublu poate marca o scădere.'
            });
            continue;
        }

        // 9e. Three White Soldiers (Trei Soldați Albi) - Bullish, 3 lumânări
        if (isBullish1 && isBullish2 && isBullish3 &&
            c2.close > c1.close && c3.close > c2.close &&
            c2.open > c1.open && c2.open < c1.close &&
            c3.open > c2.open && c3.open < c2.close &&
            body1 > (c1.high - c1.low) * 0.55 && body2 > (c2.high - c2.low) * 0.55 && body3 > (c3.high - c3.low) * 0.55) {
            patterns.push({
                time: c3.timestamp,
                name: 'Three White Soldiers (Trei Soldați Albi)',
                type: 'bullish',
                icon: 'soldiers-bull',
                tag: 'CONTINUARE CREȘTERE',
                desc: 'Trei zile la rând cu creșteri solide, fiecare închizând mai sus decât precedenta, fără ezitări mari. Arată o presiune de cumpărare constantă și susținută, nu doar un puseu izolat.'
            });
            continue;
        }

        // 9f. Three Black Crows (Trei Ciori Negre) - Bearish, 3 lumânări
        if (isBearish1 && isBearish2 && isBearish3 &&
            c2.close < c1.close && c3.close < c2.close &&
            c2.open < c1.open && c2.open > c1.close &&
            c3.open < c2.open && c3.open > c2.close &&
            body1 > (c1.high - c1.low) * 0.55 && body2 > (c2.high - c2.low) * 0.55 && body3 > (c3.high - c3.low) * 0.55) {
            patterns.push({
                time: c3.timestamp,
                name: 'Three Black Crows (Trei Ciori Negre)',
                type: 'bearish',
                icon: 'crows-bear',
                tag: 'CONTINUARE SCĂDERE',
                desc: 'Trei zile la rând cu scăderi solide, fiecare închizând mai jos decât precedenta, fără ezitări mari. Arată o presiune de vânzare constantă și susținută, nu doar un puseu izolat.'
            });
            continue;
        }

        // 9. Spinning Top (Ezitare / Titirez)
        if (body3 > 0 && body3 <= total3 * 0.25 && wickUp3 > body3 && wickDown3 > body3 && total3 > (c3.close * 0.005)) {
            patterns.push({
                time: c3.timestamp,
                name: 'Spinning Top (Titirez)',
                type: 'neutral',
                icon: 'spinning-top',
                tag: 'EZITARE ÎN PIAȚĂ',
                desc: 'Nici cumpărătorii, nici vânzătorii nu au reușit să controleze ziua. Piața este nesigură pe direcție și se pregătește de o schimbare de tendință.'
            });
            continue;
        }
        
        // 10. Doji (Echilibru Total)
        if (body3 <= total3 * 0.15 && total3 > (c3.close * 0.002)) {
            patterns.push({
                time: c3.timestamp,
                name: 'Doji (Cruce de Indecizie)',
                type: 'neutral',
                icon: 'doji',
                tag: 'INDECIZIE A PIEȚEI',
                desc: 'Prețul a deschis și a închis aproape la fel — cumpărătorii și vânzătorii sunt la egalitate perfectă și niciuna dintre tabere nu a câștigat ziua. Nu arată singur o direcție; urmărește următoarele lumânări ca să vezi încotro se rupe echilibrul.'
            });
            continue;
        }
    }
    return patterns.reverse().slice(0, 3);
}

// Render the main interactive stock chart using ApexCharts
function renderChart() {
    if (chartData.length === 0) return;
    
    // Filter history based on range
    let daysToKeep = 90; // Default 3M
    if (chartRange === "1m") daysToKeep = 30;
    else if (chartRange === "1y") daysToKeep = 250; // approx trading days
    else if (chartRange === "3y") daysToKeep = 756;
    else if (chartRange === "5y") daysToKeep = 1260;
    
    const slice = chartData.slice(-daysToKeep);
    
    const dates = slice.map(d => d.timestamp);
    
    // Convert to OHLC
    const ohlcData = slice.map(d => ({
        x: d.timestamp,
        y: [d.open, d.high, d.low, d.close]
    }));
    
    // Base series configuration
    const series = [
        {
            name: activeSymbol,
            data: ohlcData,
            type: 'candlestick'
        }
    ];
    
    // Detect patterns
    const detectedPatterns = detectCandlePatterns(slice);
    
    // Indicator overlays (calculate on full data and slice to match date index)
    const showMA50 = document.getElementById("overlay-ma50").checked;
    const showMA200 = document.getElementById("overlay-ma200").checked;
    
    if (showMA50) {
        const fullCloses = chartData.map(d => d.close);
        const ma50Full = calculateMA(fullCloses, 50);
        const ma50Slice = ma50Full.slice(-daysToKeep);
        const ma50Data = ma50Slice.map((val, i) => ({ x: dates[i], y: val }));
        series.push({
            name: "MA50",
            data: ma50Data,
            type: 'line'
        });
    }
    
    if (showMA200) {
        const fullCloses = chartData.map(d => d.close);
        const ma200Full = calculateMA(fullCloses, 200);
        const ma200Slice = ma200Full.slice(-daysToKeep);
        const ma200Data = ma200Slice.map((val, i) => ({ x: dates[i], y: val }));
        series.push({
            name: "MA200",
            data: ma200Data,
            type: 'line'
        });
    }
    
    // Colors for series
    const colors = ['#3b82f6', '#10b981', '#f59e0b'];
    
    // Annotations (Buy Price and Active Alerts)
    const annotationsY = [];
    const portItem = portfolio.find(p => p.symbol === activeSymbol);
    const annotationsPoints = [];
    detectedPatterns.forEach(p => {
        annotationsPoints.push({
            x: p.time,
            seriesIndex: 0,
            label: {
                borderColor: p.type === 'bullish' ? '#10b981' : (p.type === 'bearish' ? '#ef4444' : '#8b5cf6'),
                style: {
                    color: '#fff',
                    background: p.type === 'bullish' ? '#10b981' : (p.type === 'bearish' ? '#ef4444' : '#8b5cf6'),
                    fontSize: '11px',
                },
                text: p.name,
                offsetY: p.type === 'bullish' ? 30 : -30
            }
        });
    });

    const aiContainer = document.getElementById("ai-patterns-container");
    if (aiContainer) {
        if (detectedPatterns.length === 0) {
            aiContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.92rem; padding: 0.5rem 0;">Nu s-a detectat niciun pattern major recent în ultimele 40 de zile. Prețul evoluează stabil fără schimbări bruște de direcție.</div>';
        } else {
            aiContainer.innerHTML = '';
            detectedPatterns.forEach(p => {
                const dateStr = new Date(p.time).toLocaleDateString("ro-RO", {day: 'numeric', month: 'short'});
                const iconSvg = patternIconSvg(PATTERN_ICONS[p.icon] || PATTERN_ICONS.doji);
                const colorClass = p.type === 'bullish' ? '#10b981' : (p.type === 'bearish' ? '#ef4444' : '#8b5cf6');
                const bgTag = p.type === 'bullish' ? 'rgba(16, 185, 129, 0.12)' : (p.type === 'bearish' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(139, 92, 246, 0.12)');
                const borderTag = p.type === 'bullish' ? 'rgba(16, 185, 129, 0.3)' : (p.type === 'bearish' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(139, 92, 246, 0.3)');

                aiContainer.innerHTML += `
                    <div style="padding: 1rem 1.1rem; border-radius: 14px; background: rgba(255,255,255,0.02); box-shadow: var(--neu-in); display: flex; flex-direction: column; gap: 0.5rem; border: 1px solid rgba(255,255,255,0.03);">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                            <strong style="font-size: 1rem; color: var(--text-primary); display: flex; align-items: center; gap: 10px;">
                                <span class="pattern-icon-badge" style="background: ${bgTag}; border: 1px solid ${borderTag};">${iconSvg}</span> ${p.name}
                            </strong>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 0.75rem; padding: 3px 8px; border-radius: 6px; background: ${bgTag}; color: ${colorClass}; border: 1px solid ${borderTag}; font-weight: 700; letter-spacing: 0.3px;">
                                    ${p.tag || (p.type === 'bullish' ? 'CREȘTERE' : (p.type === 'bearish' ? 'SCĂDERE' : 'NEUTRU'))}
                                </span>
                                <span style="font-size: 0.82rem; color: var(--text-muted); font-weight: 500;">${dateStr}</span>
                            </div>
                        </div>
                        <div style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.55;">
                            ${p.desc}
                        </div>
                    </div>
                `;
            });
        }
    }

    if (portItem) {
        annotationsY.push({
            y: portItem.avgPrice,
            borderColor: '#10b981',
            strokeDashArray: 5,
            borderWidth: 2,
            label: {
                borderColor: '#10b981',
                style: {
                    color: '#fff',
                    background: '#10b981',
                    fontSize: '11px',
                    fontWeight: 600
                },
                text: `Mediu Achiziție: ${portItem.avgPrice.toLocaleString("ro-RO", { minimumFractionDigits: 2 })} RON`
            }
        });
    }
    
    let alertsList = window.serverAlerts || [];
    const activeAlertsList = alertsList.filter(a => a.symbol === activeSymbol);
    activeAlertsList.forEach(alert => {
        annotationsY.push({
            y: alert.target,
            borderColor: '#f59e0b',
            strokeDashArray: 4,
            borderWidth: 1.5,
            label: {
                borderColor: '#f59e0b',
                style: {
                    color: '#000',
                    background: '#f59e0b',
                    fontSize: '10px',
                    fontWeight: 600
                },
                text: `Alertă: ${alert.target.toLocaleString("ro-RO", { minimumFractionDigits: 2 })} RON`
            }
        });
    });
    
    const options = {
        annotations: {
            yaxis: annotationsY,
            points: annotationsPoints
        },
        chart: {
            height: 380,
            type: 'line',
            toolbar: {
                show: false
            },
            animations: {
                enabled: true,
                easing: 'easeinout',
                speed: 400
            },
            background: 'transparent'
        },
        colors: colors,
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
            labels: {
                style: {
                    colors: '#6b7280',
                    fontFamily: 'Plus Jakarta Sans'
                }
            },
            axisBorder: {
                show: false
            },
            axisTicks: {
                show: false
            }
        },
        yaxis: {
            labels: {
                formatter: function (value) {
                    return value.toLocaleString("ro-RO", { minimumFractionDigits: 2 }) + " RON";
                },
                style: {
                    colors: '#6b7280',
                    fontFamily: 'Plus Jakarta Sans'
                }
            }
        },
        grid: {
            // App UI is always light-themed (no dark mode in style.css), so chart
            // chrome must stay in light colors regardless of the day/night clock toggle.
            borderColor: 'rgba(15, 23, 42, 0.06)',
            strokeDashArray: 4,
            xaxis: {
                lines: {
                    show: true
                }
            }
        },
        theme: {
            mode: 'light'
        },
        tooltip: {
            shared: true,
            intersect: false,
            x: {
                format: 'dd MMM yyyy'
            },
            y: {
                formatter: function (value) {
                    if (value === null || value === undefined) return "N/A";
                    return value.toLocaleString("ro-RO", { minimumFractionDigits: 4 }) + " RON";
                }
            }
        },
        legend: {
            show: true,
            position: 'top',
            horizontalAlign: 'right',
            labels: {
                colors: '#0f172a'
            }
        }
    };
    
    if (apexChart) {
        apexChart.destroy();
    }
    
    apexChart = new ApexCharts(document.querySelector("#main-apex-chart"), options);
    apexChart.render();
}

// Sunrise/Sunset Theme Toggling
function applyThemeBasedOnSun() {
    const lat = 44.4323; // Bucharest Coordinates
    const lng = 26.1063;
    
    console.log("Fetching sunrise and sunset times...");
    fetch(`https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&formatted=0`)
        .then(res => res.json())
        .then(data => {
            if (data.status === "OK") {
                const sunrise = new Date(data.results.sunrise);
                const sunset = new Date(data.results.sunset);
                const now = new Date();
                
                if (now >= sunrise && now <= sunset) {
                    setTheme("light");
                } else {
                    setTheme("dark");
                }
            } else {
                applyFallbackTheme();
            }
        })
        .catch(err => {
            console.warn("Could not fetch sunrise/sunset API, using local time fallback:", err);
            applyFallbackTheme();
        });
}

function applyFallbackTheme() {
    const now = new Date();
    const hour = now.getHours();
    
    // Fallback: light theme between 7:00 AM and 8:30 PM (20:30) local time
    if (hour >= 7 && (hour < 20 || (hour === 20 && now.getMinutes() < 30))) {
        setTheme("light");
    } else {
        setTheme("dark");
    }
}

function setTheme(theme) {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    
    if (theme === "light") {
        document.documentElement.classList.add("theme-light");
        document.documentElement.classList.remove("theme-dark");
        if (metaThemeColor) metaThemeColor.setAttribute("content", "#f1f5f9");
        console.log("Applied dynamic Day Theme (Light Mode)");
    } else {
        document.documentElement.classList.add("theme-dark");
        document.documentElement.classList.remove("theme-light");
        if (metaThemeColor) metaThemeColor.setAttribute("content", "#1e293b");
        console.log("Applied dynamic Night Theme (Dark Mode)");
    }
    
    // Re-render chart to update background and label colors if it's active
    if (chartData.length > 0) {
        renderChart();
    }
    if (typeof portfolio !== 'undefined' && portfolio.length > 0) {
        renderPortfolio();
    }
}

function switchTab(tabId) {
    if (!tabId) return;
    
    // Hide all tab-panes, show active
    document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.remove("active"));
    const activePane = document.getElementById("tab-" + tabId);
    if (activePane) activePane.classList.add("active");
    
    // Update active nav links (both desktop and mobile)
    document.querySelectorAll(".nav-link").forEach(item => {
        if (item.getAttribute("data-tab") === tabId) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    window.scrollTo({ top: 0, behavior: "instant" });

    // Refresh ApexCharts if analysis tab
    if (tabId === "analysis" && window.stockChart) {
        setTimeout(() => {
            try { window.stockChart.render(); } catch(e){}
        }, 100);
    }
}
window.switchTab = switchTab;

function setupScrollHighlight() {
    document.querySelectorAll(".nav-link").forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const tabId = item.getAttribute("data-tab");
            if (tabId) switchTab(tabId);
        });
    });
}

// Ticker Search & Autocomplete
function setupSearch() {
    const searchInput = document.getElementById("ticker-search-input");
    const suggestionsContainer = document.getElementById("search-suggestions");
    const clearBtn = document.getElementById("clear-search-btn");

    if (!searchInput || !suggestionsContainer || !clearBtn) return;

    let searchTimeout = null;

    searchInput.addEventListener("input", (e) => {
        const value = e.target.value.trim().toUpperCase();
        
        if (value.length > 0) {
            clearBtn.style.display = "flex";
            
            // Debounce the suggestions query to avoid hammering the BVB backend
            if (searchTimeout) clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                showSuggestions(value);
            }, 200);
        } else {
            clearBtn.style.display = "none";
            suggestionsContainer.style.display = "none";
        }
    });

    clearBtn.addEventListener("click", () => {
        searchInput.value = "";
        clearBtn.style.display = "none";
        suggestionsContainer.style.display = "none";
        searchInput.focus();
    });

    // Close suggestions dropdown when clicking outside
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".search-container")) {
            suggestionsContainer.style.display = "none";
        }
    });

    function showSuggestions(query) {
        // 1. Filter local stocks matching query by symbol or name
        let localMatches = [];
        if (stocks && stocks.length > 0) {
            localMatches = stocks.filter(stock => 
                stock.symbol.toUpperCase().includes(query) || 
                stock.name.toUpperCase().includes(query)
            );
        }

        // 2. Fetch remote matches from BVB Search API
        fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(remoteMatches => {
            // Combine both lists
            let combined = [...localMatches];
            
            // Add remote matches that aren't already in local matches
            remoteMatches.forEach(rm => {
                if (!combined.some(c => c.symbol === rm.symbol)) {
                    combined.push({
                        symbol: rm.symbol,
                        name: rm.name,
                        price: 0,
                        variation: "",
                        isRemote: true
                    });
                }
            });

            if (combined.length === 0) {
                suggestionsContainer.style.display = "none";
                return;
            }

            // Sort matched list (favor startsWith, then alphabetical)
            combined.sort((a, b) => {
                const queryUpper = query.toUpperCase();
                const aSymStart = a.symbol.toUpperCase().startsWith(queryUpper);
                const bSymStart = b.symbol.toUpperCase().startsWith(queryUpper);
                
                if (aSymStart && !bSymStart) return -1;
                if (!aSymStart && bSymStart) return 1;
                
                const aNameStart = a.name.toUpperCase().startsWith(queryUpper);
                const bNameStart = b.name.toUpperCase().startsWith(queryUpper);
                
                if (aNameStart && !bNameStart) return -1;
                if (!aNameStart && bNameStart) return 1;
                
                return a.symbol.localeCompare(b.symbol);
            });

            suggestionsContainer.innerHTML = "";
            combined.forEach(stock => {
                const item = document.createElement("div");
                item.className = "suggestion-item";
                
                const indicator = stock.isRemote 
                    ? `<span class="suggestion-badge remote">BVB</span>` 
                    : `<span class="suggestion-badge local">Watchlist</span>`;
                
                item.innerHTML = `
                    <div class="suggestion-info">
                        <span class="suggestion-symbol">${stock.symbol}</span>
                        <span class="suggestion-name" title="${stock.name}">${stock.name}</span>
                    </div>
                    ${indicator}
                `;
                
                item.addEventListener("click", () => {
                    const isLocal = stocks.some(s => s.symbol === stock.symbol);
                    if (isLocal) {
                        selectTicker(stock.symbol);
                    } else {
                        addNewStockFromServer(stock.symbol);
                    }
                    suggestionsContainer.style.display = "none";
                    searchInput.value = stock.symbol;
                    
                    // Scroll to chart
                    const chartEl = document.getElementById("chart-section");
                    if (chartEl) {
                        chartEl.scrollIntoView({ behavior: 'smooth' });
                    }
                });
                suggestionsContainer.appendChild(item);
            });

            // Add dynamic "Add ticker" option if query is a potential symbol pattern and not in combined
            const isValidSymbolPattern = /^[A-Z0-9.\-]{2,8}$/.test(query);
            const alreadyExists = combined.some(s => s.symbol === query);
            
            if (isValidSymbolPattern && !alreadyExists) {
                const addOption = document.createElement("div");
                addOption.className = "suggestion-item add-custom-ticker-option";
                addOption.innerHTML = `
                    <div class="suggestion-info">
                        <span class="suggestion-symbol">
                            <i class="ph-duotone ph-plus-circle" style="font-size: 14px; width: 14px; height: 14px; margin-right: 6px; display: inline-block; vertical-align: middle;"></i>
                            Adaugă "${query}"
                        </span>
                        <span class="suggestion-name">Importă de pe BVB</span>
                    </div>
                `;
                addOption.addEventListener("click", () => {
                    addNewStockFromServer(query);
                    suggestionsContainer.style.display = "none";
                });
                suggestionsContainer.appendChild(addOption);
                
            }

            suggestionsContainer.style.display = "block";
        })
        .catch(err => {
            console.error("Error fetching suggestions:", err);
            // Fallback to local matches only if remote search fails
            if (localMatches.length > 0) {
                suggestionsContainer.innerHTML = "";
                localMatches.forEach(stock => {
                    const item = document.createElement("div");
                    item.className = "suggestion-item";
                    item.innerHTML = `
                        <div class="suggestion-info">
                            <span class="suggestion-symbol">${stock.symbol}</span>
                            <span class="suggestion-name" title="${stock.name}">${stock.name}</span>
                        </div>
                        <span class="suggestion-badge local">Watchlist</span>
                    `;
                    item.addEventListener("click", () => {
                        selectTicker(stock.symbol);
                        suggestionsContainer.style.display = "none";
                        searchInput.value = stock.symbol;
                    });
                    suggestionsContainer.appendChild(item);
                });
                suggestionsContainer.style.display = "block";
            } else {
                suggestionsContainer.style.display = "none";
            }
        });
    }
}

// Dynamically Add Custom Stock from BVB/Yahoo
function addNewStockFromServer(symbol) {
    const searchInput = document.getElementById("ticker-search-input");
    const clearBtn = document.getElementById("clear-search-btn");
    const originalPlaceholder = searchInput ? searchInput.placeholder : "";
    
    if (searchInput) {
        searchInput.value = "";
        searchInput.placeholder = `Se adaugă ${symbol}...`;
        searchInput.disabled = true;
    }
    if (clearBtn) clearBtn.style.display = "none";
    
    fetch(`/api/stocks/add/${symbol}`, {
        method: 'POST'
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(errData => { throw new Error(errData.error || "Eroare necunoscută") });
        }
        return res.json();
    })
    .then(data => {
        if (data.success) {
            // Push to local stocks array
            const exists = stocks.some(s => s.symbol === symbol);
            if (!exists) {
                stocks.push(data.stock);
                populateWatchlist();
            }
            
            // Highlight and display the new stock
            selectTicker(symbol);
            showToast(`Simbolul ${symbol} a fost adăugat cu succes!`, 'success');
            
            // Scroll to chart
            const chartEl = document.getElementById("chart-section");
            if (chartEl) {
                chartEl.scrollIntoView({ behavior: 'smooth' });
            }
        } else {
            showToast(`Eroare: ${data.error}`, 'error');
        }
    })
    .catch(err => {
        console.error(err);
        showToast(err.message || "Nu s-a putut găsi simbolul pe BVB.", 'error');
    })
    .finally(() => {
        if (searchInput) {
            searchInput.placeholder = originalPlaceholder;
            searchInput.disabled = false;
            searchInput.value = "";
            searchInput.focus();
        }
    });
}

// Toast Notification Helper
function showToast(message, type = 'success') {
    const container = document.getElementById("toast-container");
    if (!container) return;
    
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    const iconName = type === 'success' ? 'check-circle' : 'warning-circle';
    toast.innerHTML = `
        <i class="ph-duotone ph-${iconName.replace('arrow-up-right', 'arrow-up-right').replace('arrow-down-right', 'arrow-down-right').replace('minus', 'minus').replace('check-circle', 'check-circle').replace('alert-circle', 'warning-circle')}"  style="font-size: 18px; width: 18px; height: 18px; color: ${type === 'success' ? '#22c55e' : '#ef4444'}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    
    // Trigger CSS slide-in animation
    setTimeout(() => toast.classList.add("show"), 10);
    
    // Animate out and remove
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

// Remove Ticker from Watchlist
function removeTicker(symbol, event) {
    if (event) event.stopPropagation(); // prevent row click select trigger
    
    if (confirm(`Ești sigur că vrei să elimini acțiunea ${symbol} din lista de monitorizare?`)) {
        fetch(`/api/stocks/remove/${symbol}`, {
            method: 'POST'
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast(`Simbolul ${symbol} a fost eliminat.`, 'success');
                
                if (data.reset_triggered) {
                    showToast("Lista a fost golită. Se auto-populează cu activele implicite...", "success");
                    
                    // Show a loading text in table
                    const tbody = document.getElementById("watchlist-table-body");
                    if (tbody) {
                        tbody.innerHTML = `<tr><td colspan="10" class="table-loading">Se reîncarcă activele implicite BVB...</td></tr>`;
                    }
                    
                    // Poll periodically until reset is complete
                    let checks = 0;
                    const interval = setInterval(() => {
                        fetchData(() => {
                            if (stocks.length > 5 || checks > 10) {
                                clearInterval(interval);
                                showToast("Lista a fost restaurată automat!", "success");
                            }
                        });
                        checks++;
                    }, 2000);
                } else {
                    // If the deleted symbol was active, select another one first
                    if (activeSymbol === symbol) {
                        const remaining = stocks.filter(s => s.symbol !== symbol);
                        if (remaining.length > 0) {
                            activeSymbol = remaining[0].symbol;
                        }
                    }
                    // Fetch fresh data
                    fetchData();
                }
            } else {
                showToast(`Eroare: ${data.error}`, 'error');
            }
        })
        .catch(err => {
            console.error(err);
            showToast("Eroare la eliminarea simbolului.", 'error');
        });
    }
}

// Fetch and render stock news
function fetchNews(symbol) {
    const container = document.getElementById("news-articles-container");
    const label = document.getElementById("news-ticker-label");
    if (!container) return;
    
    if (label) label.innerText = symbol;
    container.innerHTML = `<div class="loading-placeholder">Se încarcă știri despre ${symbol}...</div>`;
    
    fetch(`/api/news/${symbol}`)
        .then(res => res.json())
        .then(data => {
            if (!data || data.length === 0) {
                container.innerHTML = `<div class="loading-placeholder">Nu s-au găsit știri recente despre ${symbol} pe BVB sau în presa financiară.</div>`;
                return;
            }
            
            container.innerHTML = "";
            data.forEach(item => {
                const card = document.createElement("a");
                card.className = `news-card news-sentiment-${item.sentiment}`;
                card.href = item.link;
                card.target = "_blank";
                
                card.innerHTML = `
                    <div class="news-title">${item.title}</div>
                    <div class="news-meta">
                        <span class="news-source">${item.source}</span>
                        <span class="news-date">
                            <i class="ph-duotone ph-calendar-blank"  style="font-size: 12px; width: 12px; height: 12px; vertical-align: middle;"></i>
                            <span>${item.date}</span>
                        </span>
                    </div>
                `;
                container.appendChild(card);
            });
            
            
        })
        .catch(err => {
            console.error(`Error loading news for ${symbol}:`, err);
            container.innerHTML = `<div class="loading-placeholder">Eroare la încărcarea știrilor pentru ${symbol}.</div>`;
        });
}

// Update BVB Market status indicator
function updateMarketStatus() {
    const badge = document.getElementById("market-status-badge");
    const text = document.getElementById("market-status-text");
    if (!badge || !text) return;
    
    const now = new Date();
    const day = now.getDay(); // 0 is Sunday, 6 is Saturday
    const hour = now.getHours();
    
    const isWeekday = day >= 1 && day <= 5;
    const isTradingHours = hour >= 10 && hour < 16;
    
    if (isWeekday && isTradingHours) {
        badge.className = "market-status open";
        text.innerText = "Bursă: Deschisă";
    } else {
        badge.className = "market-status closed";
        text.innerText = "Bursă: Închisă";
    }
}

// Table column sorting functions
function sortTable(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
        sortColumn = column;
        sortDirection = "asc";
    }
    
    applySorting();
    populateWatchlist();
}

function applySorting() {
    if (!sortColumn) return;
    stocks.sort((a, b) => {
        let valA = getStockValueForSort(a, sortColumn);
        let valB = getStockValueForSort(b, sortColumn);
        
        if (typeof valA === "string") {
            return sortDirection === "asc" 
                ? valA.localeCompare(valB) 
                : valB.localeCompare(valA);
        } else {
            if (valA === null || valA === undefined) return 1;
            if (valB === null || valB === undefined) return -1;
            return sortDirection === "asc" ? valA - valB : valB - valA;
        }
    });
}

function getStockValueForSort(stock, column) {
    switch (column) {
        case "symbol":
            return stock.symbol;
        case "name":
            return stock.name;
        case "price":
            return stock.price;
        case "variation":
            const cleanVar = stock.variation.replace('%', '').replace('+', '').replace(',', '.');
            return parseFloat(cleanVar) || 0;
        case "ytd":
            return stock.technical.ytd_return || 0;
        case "pe":
            return stock.pe || 0;
        case "pb":
            return stock.pb || 0;
        case "divy":
            return stock.div_yield || 0;
        case "rsi":
            return stock.technical.rsi || 0;
        case "signal":
            return stock.technical.tech_signal;
        default:
            return stock.symbol;
    }
}

function updateSortIcons() {
    const headers = ["symbol", "price", "variation", "ytd", "pe", "pb", "divy", "rsi", "signal"];
    headers.forEach(h => {
        const iconEl = document.getElementById(`sort-icon-${h}`);
        if (iconEl) {
            if (sortColumn === h) {
                iconEl.innerText = sortDirection === "asc" ? "▲" : "▼";
                iconEl.classList.add("active");
            } else {
                iconEl.innerText = "↕";
                iconEl.classList.remove("active");
            }
        }
    });
}

// Enable mouse drag-to-scroll for horizontal scrolling on desktop/tablet
function enableDragToScroll() {
    const containers = document.querySelectorAll('.table-container');
    
    containers.forEach(container => {
        let isDown = false;
        let startX;
        let scrollLeft;
        
        container.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Only drag with left mouse click
            isDown = true;
            container.classList.add('active-dragging');
            startX = e.pageX - container.offsetLeft;
            scrollLeft = container.scrollLeft;
        });
        
        container.addEventListener('mouseleave', () => {
            isDown = false;
            container.classList.remove('active-dragging');
        });
        
        container.addEventListener('mouseup', () => {
            isDown = false;
            container.classList.remove('active-dragging');
        });
        
        container.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - container.offsetLeft;
            const walk = (x - startX) * 1.5; // Scroll speed multiplier
            container.scrollLeft = scrollLeft - walk;
        });
    });
}

// Clear all symbols in the watchlist
function clearWatchlist() {
    if (confirm("Ești sigur că vrei să golești COMPLET lista de monitorizare?")) {
        // Show loading state
        const tbody = document.getElementById("watchlist-table-body");
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="10" class="table-loading">Se golește lista de monitorizare...</td></tr>`;
        }
        
        fetch('/api/stocks/clear', {
            method: 'POST'
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast("Lista de monitorizare a fost golită cu succes.", "success");
                fetchData();
            } else {
                showToast(`Eroare: ${data.error || 'Nu s-a putut goli lista.'}`, "error");
            }
        })
        .catch(err => {
            console.error(err);
            showToast("Eroare la comunicarea cu serverul.", "error");
        });
    }
}

// Reset watchlist to default BVB tickers
function resetWatchlist() {
    if (confirm("Ești sigur că vrei să restaurezi activele implicite BVB? Această acțiune va înlocui lista curentă.")) {
        // Show loading state
        const tbody = document.getElementById("watchlist-table-body");
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="10" class="table-loading">Se restaurează activele implicite BVB...</td></tr>`;
        }
        
        fetch('/api/stocks/reset', {
            method: 'POST'
        })
        .then(res => res.json())
        .then(data => {
            showToast("Se reîncarcă datele pentru activele implicite...", "success");
            
            // Poll periodically until reset data is fetched and populated
            let checks = 0;
            const interval = setInterval(() => {
                fetchData(() => {
                    if (stocks.length > 5 || checks > 10) {
                        clearInterval(interval);
                        showToast("Watchlist-ul a fost restaurat cu succes!", "success");
                    }
                });
                checks++;
            }, 2000);
        })
        .catch(err => {
            console.error(err);
            showToast("Eroare la restaurarea watchlist-ului.", "error");
        });
    }
}

// ─── Virtual Portfolio Tracker Logic ─────────────────────────────────────────

// Initialize Portfolio Event Listeners
function initPortfolio() {
    const form       = document.getElementById("portfolio-add-form");
    const symbolInput = document.getElementById("port-add-symbol");
    const suggestions = document.getElementById("port-search-suggestions");
    const priceInput  = document.getElementById("port-add-price");

    if (!symbolInput || !suggestions) return;

    let debounceTimer = null;

    const showSuggestions = () => {
        const q = symbolInput.value.trim();

        // Clear price hint when user types
        const priceHintEl = document.getElementById("port-current-price-hint");
        if (priceHintEl) priceHintEl.innerText = "";

        if (q.length < 1) {
            suggestions.style.display = "none";
            return;
        }

        // Show loading state immediately
        suggestions.innerHTML = `<div style="padding:10px 14px;font-size:12px;color:var(--text-muted);">Se caută...</div>`;
        suggestions.style.display = "block";

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`)
                .then(r => r.json())
                .then(results => {
                    if (!results || results.length === 0) {
                        suggestions.innerHTML = `<div style="padding:10px 14px;font-size:12px;color:var(--text-muted);">Niciun rezultat pentru „${q}".</div>`;
                        suggestions.style.display = "block";
                        return;
                    }

                    suggestions.innerHTML = results.slice(0, 20).map(s => {
                        // Try to find a live price from the current watchlist
                        const watchStock = stocks.find(w => w.symbol === s.symbol);
                        const priceHint  = watchStock ? `<span style="color:var(--color-green);font-size:11px;margin-left:6px;">${watchStock.price} RON</span>` : "";
                        return `
                            <div class="suggestion-item" data-symbol="${s.symbol}" data-price="${watchStock ? watchStock.price : ''}">
                                <div class="suggestion-sym">${s.symbol}${priceHint}</div>
                                <div class="suggestion-name">${s.name || ""}</div>
                            </div>`;
                    }).join("");

                    suggestions.style.display = "block";

                    // Click handler on each item
                    suggestions.querySelectorAll(".suggestion-item").forEach(item => {
                        item.addEventListener("click", () => {
                            symbolInput.value = item.dataset.symbol;
                            suggestions.style.display = "none";
                            
                            const currentPrice = item.dataset.price;
                            if (currentPrice) {
                                if (priceInput && !priceInput.value) {
                                    priceInput.value = parseFloat(currentPrice).toFixed(4);
                                }
                                if (priceHintEl) {
                                    priceHintEl.innerText = `Preț curent pe BVB: ${currentPrice} RON`;
                                }
                            }
                            
                            symbolInput.focus();
                        });
                    });
                })
                .catch(() => {
                    suggestions.style.display = "none";
                });
        }, 250);
    };

    symbolInput.addEventListener("input", showSuggestions);
    symbolInput.addEventListener("focus", showSuggestions);

    document.addEventListener("click", e => {
        if (!symbolInput.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.style.display = "none";
        }
    });

    if (form) {
        form.addEventListener("submit", e => {
            e.preventDefault();
            const symbol = symbolInput.value.trim().toUpperCase();
            const qtyRaw = document.getElementById("port-add-qty").value;
            const priceRaw = priceInput.value;
            
            const qty    = parseFloat(qtyRaw.toString().replace(',', '.'));
            const price  = parseFloat(priceRaw.toString().replace(',', '.'));

            if (!symbol || isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
                showToast("Date tranzacție invalide.", "error");
                return;
            }
            
            showToast(`Se adaugă activele ${symbol}...`, "info");
            
            fetch(`/api/stocks/add/${symbol}`, { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.stock) {
                        if (!stocks.some(s => s.symbol === symbol)) {
                            stocks.push(data.stock);
                        }
                    }
                    addPortfolioTransaction(symbol, qty, price);
                })
                .catch(() => {
                    addPortfolioTransaction(symbol, qty, price);
                });
        });
    }
}

// Render Portfolio Table and Summary Cards
function renderPortfolio() {
    const tbody = document.getElementById("portfolio-table-body");
    
    if (!tbody) return;
    
    if (portfolio.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">
                    Nu ai nicio acțiune în portofoliu. Adaugă tranzacții folosind formularul de mai sus.
                </td>
            </tr>
        `;
        document.getElementById("port-total-value").textContent = "0.00 RON";
        document.getElementById("port-total-cost").textContent = "0.00 RON";
        document.getElementById("port-total-pl").textContent = "0.00 RON";
        const plPctLabel = document.getElementById("port-total-pl-pct");
        if (plPctLabel) {
            plPctLabel.textContent = "0.00%";
            plPctLabel.className = "index-change neutral";
        }
        
        updatePortfolioChart([], []);
        return;
    }
    
    let totalCost = 0;
    let totalValue = 0;
    let totalDividends = 0;
    
    // Map portfolio items with current BVB prices
    const enrichedItems = portfolio.map(item => {
        const stock = stocks.find(s => s.symbol === item.symbol);
        const currentPrice = stock ? stock.price : item.avgPrice;
        const itemCost = item.qty * item.avgPrice;
        const itemValue = item.qty * currentPrice;
        const divValue = parseFloat(item.dividends || 0.0);
        const itemPL = (itemValue + divValue) - itemCost;
        const itemPLPercent = itemCost > 0 ? (itemPL / itemCost) * 100 : 0;
        
        totalCost += itemCost;
        totalValue += itemValue;
        totalDividends += divValue;
        
        return {
            ...item,
            currentPrice,
            cost: itemCost,
            value: itemValue,
            dividends: divValue,
            pl: itemPL,
            plPercent: itemPLPercent
        };
    });
    
    // Render Table Rows
    tbody.innerHTML = "";
    enrichedItems.forEach(item => {
        const tr = document.createElement("tr");
        
        const plClass = item.pl > 0 ? "val-up" : (item.pl < 0 ? "val-down" : "val-pl-neutral");
        const rowSignalClass = item.pl > 0 ? "row-signal-BUY" : (item.pl < 0 ? "row-signal-SELL" : "row-signal-HOLD");
        tr.className = rowSignalClass;
        
        const plPrefix = item.pl > 0 ? "+" : "";
        const sharePercent = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
        
        // Find stock today's variation from stocks array
        const stock = stocks.find(s => s.symbol === item.symbol);
        const variation = stock ? stock.variation : "0.00%";
        const varVal = parseFloat(variation.replace('%', '').replace('+', '').replace(',', '.'));
        const varClass = varVal > 0 ? "val-up" : (varVal < 0 ? "val-down" : "val-neutral");
        const varPrefix = (varVal > 0 && !variation.startsWith('+')) ? "+" : "";
 
        // Format values
        const formattedVal = item.value.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " RON";
        const formattedQty = item.qty.toLocaleString("ro-RO", { maximumFractionDigits: 4 });
        const formattedCurPrice = item.currentPrice.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + " RON";
        const formattedAvgPrice = item.avgPrice.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + " RON";
        const formattedCost = item.cost.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " RON";
        const formattedPL = `${plPrefix}${item.pl.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`;
        const formattedPLPct = `${plPrefix}${item.plPercent.toFixed(2)}%`;
 
        tr.innerHTML = `
            <td>
                <div style="font-family: var(--font-mono); font-weight: 700; font-size: 14px; color: var(--text-primary);">${item.symbol}</div>
                <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-top: 2px;">Valoare: ${formattedVal}</div>
            </td>
            <td>
                <div style="font-family: var(--font-mono); font-size: 13px; font-weight: 500;">${formattedCurPrice}</div>
                <div class="${varClass}" style="font-size: 11px; font-weight: 600; margin-top: 2px;">${varPrefix}${variation}</div>
            </td>
            <td>
                <div style="font-family: var(--font-mono); font-size: 13px;">${formattedAvgPrice}</div>
                <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-top: 2px;">Cost: ${formattedCost}</div>
            </td>
            <td>
                <div style="display: flex; align-items: center; gap: 4px;">
                    <input type="number" step="any" min="0" value="${item.dividends}" onchange="updatePortfolioDividends('${item.symbol}', this.value)" style="font-size: 70px; width: 70px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 2px 4px; border-radius: 4px; font-size: 12px; font-weight: 600; text-align: right;">
                    <span style="font-size: 11px; color: var(--text-muted);">RON</span>
                </div>
            </td>
            <td class="${plClass}">
                <div style="font-weight: 600; font-size: 13px;">${formattedPL}</div>
                <div style="font-size: 11px; margin-top: 2px; font-weight: 600;">${formattedPLPct}</div>
            </td>
            <td>
                <div style="font-family: var(--font-mono); font-size: 13px; font-weight: 500;">${sharePercent.toFixed(1)}%</div>
                <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-top: 2px;">${formattedQty} unit.</div>
            </td>
            <td>
                <button class="btn-table-action btn-delete-holding" onclick="removePortfolioTransaction('${item.symbol}')" title="Elimină deținerea">
                    <i class="ph-duotone ph-trash"  style="font-size: 13px; width: 13px; height: 13px;"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Render Realized Transactions Table
    const realizedTbody = document.getElementById("realized-table-body");
    let totalRealizedGain = 0;
    let totalRealizedLoss = 0;
    let totalRealizedTax = 0;
    let totalRealizedNet = 0;

    if (realizedTbody) {
        realizedTbody.innerHTML = "";
        
        if (realizedTransactions.length === 0) {
            realizedTbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; color: var(--text-muted); font-style: italic; padding: 15px;">
                        Nicio tranzacție realizată. Apasă „Adaugă" pentru a înregistra prima tranzacție.
                    </td>
                </tr>
            `;
        } else {
            realizedTransactions.forEach((item, idx) => {
                const gain = parseFloat(item.gain || 0.0);
                const loss = parseFloat(item.loss || 0.0);
                const tax = parseFloat(item.tax || 0.0);
                const net = parseFloat(item.net || 0.0);

                totalRealizedGain += gain;
                totalRealizedLoss += loss;
                totalRealizedTax += tax;
                totalRealizedNet += net;

                const tr = document.createElement("tr");
                const netClass = net > 0 ? "val-up" : (net < 0 ? "val-down" : "val-neutral");
                const rowSignalClass = net > 0 ? "row-signal-BUY" : (net < 0 ? "row-signal-SELL" : "row-signal-HOLD");
                tr.className = rowSignalClass;

                const formattedGain = gain.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " RON";
                const formattedLoss = loss.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " RON";
                const formattedTax = tax > 0 ? (tax.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " RON") : "-";
                const formattedNet = net.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " RON";

                tr.innerHTML = `
                    <td style="font-family: var(--font-mono); font-weight: 700; color: var(--text-primary);">${item.symbol}</td>
                    <td style="font-family: var(--font-mono); text-align: right; color: var(--color-green);">${formattedGain}</td>
                    <td style="font-family: var(--font-mono); text-align: right; color: var(--color-red);">${formattedLoss}</td>
                    <td style="font-family: var(--font-mono); text-align: right; color: #f59e0b;">${formattedTax}</td>
                    <td style="text-align: right; font-weight: 600;" class="${netClass}">${formattedNet}</td>
                    <td style="text-align: right; white-space: nowrap;">
                        <button class="btn-table-action" onclick="editRealizedEntry(${idx})" style="margin-right:4px;" title="Editează">
                            <i class="ph-duotone ph-pencil"  style="font-size: 12px; width:12px;height:12px;"></i>
                        </button>
                        <button class="btn-table-action" onclick="deleteRealizedEntry(${idx})" style="background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.2);color:var(--color-red);" title="Șterge">
                            <i class="ph-duotone ph-trash"  style="font-size: 12px; width:12px;height:12px;"></i>
                        </button>
                    </td>
                `;
                realizedTbody.appendChild(tr);
            });
        }

        // Update footer totals
        document.getElementById("realized-total-gain").textContent = totalRealizedGain.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " RON";
        document.getElementById("realized-total-loss").textContent = totalRealizedLoss.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " RON";
        document.getElementById("realized-total-tax").textContent = totalRealizedTax.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " RON";
        
        const netTotalEl = document.getElementById("realized-total-net");
        if (netTotalEl) {
            netTotalEl.textContent = totalRealizedNet.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " RON";
            netTotalEl.className = totalRealizedNet > 0 ? "val-up" : (totalRealizedNet < 0 ? "val-down" : "val-neutral");
        }
    }

    // Update summary labels
    document.getElementById("port-total-value").textContent = totalValue.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " RON";
    document.getElementById("port-total-cost").textContent = totalCost.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " RON";
    
    // Total Return accounts for current holdings value + all dividends received + net realized gains/losses - active cost basis
    const totalPL = (totalValue + totalDividends + totalRealizedNet) - totalCost;
    const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
    
    const plLabel = document.getElementById("port-total-pl");
    const plPctLabel = document.getElementById("port-total-pl-pct");
    const totalPlClass = totalPL > 0 ? "positive" : (totalPL < 0 ? "negative" : "neutral");
    const totalPlPrefix = totalPL > 0 ? "+" : "";
    
    if (plLabel) {
        plLabel.textContent = `${totalPlPrefix}${totalPL.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`;
    }
    if (plPctLabel) {
        plPctLabel.textContent = `${totalPlPrefix}${totalPLPercent.toFixed(2)}%`;
        plPctLabel.className = `index-change ${totalPlClass}`;
    }
    
    // Update Allocation Donut Chart grouped by industry sector
    const sectorMap = {};
    enrichedItems.forEach(item => {
        const sector = getStockSector(item.symbol);
        sectorMap[sector] = (sectorMap[sector] || 0) + item.value;
    });
    
    const sortedSectors = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);
    const labels = sortedSectors.map(entry => entry[0]);
    const series = sortedSectors.map(entry => entry[1]);
    updatePortfolioChart(labels, series);
    
    // Generate Broker Diversification Advice
    const adviceDiv = document.getElementById("portfolio-diversification-advice");
    if (adviceDiv) {
        if (enrichedItems.length === 0) {
            adviceDiv.style.display = "none";
        } else {
            adviceDiv.style.display = "block";
            let adviceHtml = `
                <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                    <i class="ph-duotone ph-shield-warning"  style="font-size: 16px; width:16px;height:16px;color:var(--color-blue);"></i>
                    Sfatul Brokerului (Diversificare)
                </div>
            `;
            
            let overexposedSector = null;
            let maxPct = 0;
            
            Object.entries(sectorMap).forEach(([sector, val]) => {
                const pct = (val / totalValue) * 100;
                if (pct > 50 && pct > maxPct) {
                    overexposedSector = sector;
                    maxPct = pct;
                }
            });
            
            if (overexposedSector) {
                let recommendation = "";
                if (overexposedSector === "Financiar-Bancar") {
                    recommendation = `Deții o expunere foarte mare în sectorul <strong>Financiar-Bancar</strong> (${maxPct.toFixed(0)}%). Brokerul recomandă diversificarea portofoliului prin adăugarea de acțiuni din <strong>Energie & Utilități</strong> (ex. <strong>Hidroelectrica - H2O</strong> sau <strong>Romgaz - SNG</strong>) pentru o stabilitate mai mare a randamentelor.`;
                } else if (overexposedSector.includes("Energie")) {
                    recommendation = `Portofoliul tău este concentrat masiv în sectorul <strong>Energie</strong> (${maxPct.toFixed(0)}%). Pentru a reduce expunerea pe factori macroeconomici de energie, analizează adăugarea unor acțiuni din sectorul <strong>Bancar</strong> (ex. <strong>Banca Transilvania - TLV</strong>) sau <strong>Imobiliar</strong> (ex. <strong>One United - ONE</strong>).`;
                } else {
                    recommendation = `Expunerea pe sectorul <strong>${overexposedSector}</strong> depășește 50% din portofoliu (${maxPct.toFixed(0)}%). Pentru o siguranță sporită a capitalului pe termen lung, brokerul îți recomandă să diversifici în alte 1-2 sectoare economice distincte de la BVB.`;
                }
                
                adviceHtml += `
                    <div style="color: var(--text-muted); line-height: 1.4; font-size: 12px; border-left: 3px solid var(--color-blue); padding-left: 10px; margin-top: 6px;">
                        ${recommendation}
                    </div>
                `;
            } else {
                adviceHtml += `
                    <div style="color: var(--text-success); line-height: 1.4; font-size: 12px; border-left: 3px solid var(--color-emerald); padding-left: 10px; margin-top: 6px;">
                        ✨ <strong>Portofoliu bine diversificat!</strong> Expunerea ta pe sectoare este echilibrată. Felicitări, ai un profil de risc excelent!
                    </div>
                `;
            }
            
            adviceDiv.innerHTML = adviceHtml;
        }
    }
    
    
}

// Helper to save portfolio to backend with local storage fallback
function savePortfolioToBackend() {
    localStorage.setItem("bvb_virtual_portfolio", JSON.stringify(portfolio));
    
    fetch("/api/portfolio", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(portfolio)
    })
    .then(res => res.json())
    .then(data => {
        if (!data.success) {
            console.error("Eroare la salvarea portofoliului pe server:", data.error);
        }
    })
    .catch(err => console.error("Eroare de rețea la salvarea portofoliului:", err));
}

// Add transaction to portfolio
function addPortfolioTransaction(symbol, qty, price) {
    const existing = portfolio.find(item => item.symbol === symbol);
    if (existing) {
        const oldQty = existing.qty;
        const oldAvg = existing.avgPrice;
        
        existing.qty = oldQty + qty;
        existing.avgPrice = ((oldQty * oldAvg) + (qty * price)) / existing.qty;
    } else {
        portfolio.push({
            symbol: symbol,
            qty: qty,
            avgPrice: price
        });
    }
    
    savePortfolioToBackend();
    
    // Clear form
    document.getElementById("port-add-symbol").value = "";
    document.getElementById("port-add-qty").value = "";
    document.getElementById("port-add-price").value = "";
    
    renderPortfolio();
    showToast(`Adăugat ${qty} acțiuni ${symbol} în portofoliu.`, "success");
}

// Remove transaction from portfolio
function removePortfolioTransaction(symbol) {
    if (confirm(`Ești sigur că vrei să elimini acțiunea ${symbol} din portofoliul virtual?`)) {
        portfolio = portfolio.filter(item => item.symbol !== symbol);
        savePortfolioToBackend();
        
        renderPortfolio();
        showToast(`Eliminat activele ${symbol} din portofoliu.`, "success");
    }
}

// Map BVB symbols to their corresponding industry sectors
function getStockSector(symbol) {
    const sym = symbol.toUpperCase().trim();
    
    const sectors = {
        // Energie, Utilitati, Petrol & Gaze
        "SNP": "Energie & Petrol",
        "H2O": "Energie & Utilități",
        "SNG": "Energie & Petrol",
        "SNN": "Energie & Utilități",
        "EL": "Energie & Utilități",
        "TGN": "Energie & Utilități",
        "TEL": "Energie & Utilități",
        "COTE": "Energie & Utilități",
        "RRC": "Energie & Petrol",
        
        // Sectorul Financiar, Bancar si Investitii
        "TLV": "Financiar-Bancar",
        "BRD": "Financiar-Bancar",
        "FP": "Fonduri de Investiții",
        "BVB": "Servicii Financiare",
        "SIF1": "Fonduri de Investiții",
        "SIF2": "Fonduri de Investiții",
        "SIF3": "Fonduri de Investiții",
        "SIF4": "Fonduri de Investiții",
        "SIF5": "Fonduri de Investiții",
        "EVRY": "Fonduri de Investiții",
        "TRAN": "Financiar-Bancar",
        
        // Imobiliare
        "ONE": "Dezvoltare Imobiliară",
        "REIT": "Dezvoltare Imobiliară",
        
        // Tehnologie & Telecom
        "DIGI": "Telecom & Media",
        "AROBS": "Tehnologie & IT",
        "SAFE": "Tehnologie & IT",
        "2B": "Tehnologie & IT",
        "BNET": "Tehnologie & IT",
        
        // Sanatate / Farma
        "BIO": "Sănătate & Pharma",
        "ATB": "Sănătate & Pharma",
        
        // Consum / Retail / Food / Horeca
        "WINE": "Bunuri de Consum",
        "SFG": "HORECA & Servicii",
        "AQ": "Distribuție & Logistică",
        
        // Industrie / Metalurgie / Constructii / Transporturi
        "ALR": "Metalurgie & Producție",
        "TRP": "Materiale de Construcție",
        "TTS": "Transport & Logistică",
        "CMP": "Piese & Componente Auto",
    };
    
    return sectors[sym] || "Alte Sectoare";
}

// Update Donut Chart
function updatePortfolioChart(labels, series) {
    const chartDiv = document.getElementById("portfolio-allocation-chart");
    if (!chartDiv) return;
    
    if (series.length === 0) {
        document.getElementById("portfolio-chart-card").style.display = "none";
        return;
    }
    
    document.getElementById("portfolio-chart-card").style.display = "block";
    
    // App UI is always light-themed (no dark mode in style.css), so chart
    // chrome must stay in light colors regardless of the day/night clock toggle.
    const textColor = "#0f172a";
    const mutedColor = "#64748b";
    const strokeColor = "#ffffff";
    
    const options = {
        series: series,
        labels: labels,
        chart: {
            type: 'donut',
            width: '100%',
            height: 280, // slightly lower height so the circle fits perfectly and is as large as possible
            foreColor: mutedColor,
            animations: {
                enabled: true,
                animateGradually: {
                    enabled: true,
                    delay: 150
                },
                dynamicAnimation: {
                    enabled: true,
                    speed: 200
                }
            }
        },
        colors: [
            '#6366f1', // Indigo (Financiar)
            '#10b981', // Emerald (Energie)
            '#14b8a6', // Teal (Utilitati)
            '#f59e0b', // Amber (Real Estate)
            '#ef4444', // Red (Horeca/Servicii)
            '#8b5cf6', // Violet
            '#06b6d4', // Cyan
            '#ec4899', // Pink
            '#f43f5e', // Rose
            '#a855f7'  // Purple
        ],
        stroke: {
            show: true,
            colors: [strokeColor],
            width: 2
        },
        legend: {
            show: false // Hide default wrapping legend
        },
        dataLabels: {
            enabled: true,
            style: {
                fontSize: '11px',
                fontFamily: 'var(--font-body)',
                fontWeight: 'bold',
                colors: ['#ffffff']
            },
            dropShadow: {
                enabled: true,
                top: 1,
                left: 1,
                blur: 1,
                color: '#000',
                opacity: 0.45
            },
            formatter: function (val) {
                return val.toFixed(1) + "%";
            }
        },
        plotOptions: {
            pie: {
                expandOnClick: true,
                customScale: 1.0, // Maximizes the circle size within the box
                donut: {
                    size: '68%',
                    background: 'transparent',
                    labels: {
                        show: true,
                        name: {
                            show: true,
                            fontSize: '13px',
                            fontFamily: 'var(--font-body)',
                            fontWeight: '600',
                            color: mutedColor,
                            offsetY: -6
                        },
                        value: {
                            show: true,
                            fontSize: '18px',
                            fontFamily: 'var(--font-body)',
                            fontWeight: '700',
                            color: textColor,
                            offsetY: 6,
                            formatter: function (val) {
                                return parseFloat(val).toLocaleString("ro-RO", { maximumFractionDigits: 0 }) + " RON";
                            }
                        },
                        total: {
                            show: true,
                            label: 'Portofoliu',
                            color: mutedColor,
                            fontWeight: '600',
                            formatter: function (w) {
                                const sum = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                                return sum.toLocaleString("ro-RO", { maximumFractionDigits: 0 }) + " RON";
                            }
                        }
                    }
                }
            }
        },
        tooltip: {
            theme: 'light',
            y: {
                formatter: function (val) {
                    return val.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " RON";
                }
            }
        }
    };
    
    if (portfolioChart) {
        portfolioChart.updateOptions(options);
    } else {
        portfolioChart = new ApexCharts(chartDiv, options);
        portfolioChart.render();
    }
    
    // Render custom single line scrollable legend
    const legendDiv = document.getElementById("portfolio-legend");
    if (legendDiv) {
        const colorPalette = options.colors;
        legendDiv.innerHTML = labels.map((label, idx) => {
            const color = colorPalette[idx % colorPalette.length];
            return `
                <div class="custom-legend-item">
                    <span class="custom-legend-dot" style="background-color: ${color};"></span>
                    <span>${label}</span>
                </div>
            `;
        }).join("");
    }
}

// -------------------------------------------------------------
// ADVANCED BROKER FEATURES IMPLEMENTATION
// -------------------------------------------------------------

// 1. Total Return Tracker: update dividends in portfolio
function updatePortfolioDividends(symbol, value) {
    const item = portfolio.find(i => i.symbol === symbol);
    if (item) {
        item.dividends = parseFloat(value) || 0.0;
        savePortfolioToBackend();
        renderPortfolio();
        showToast(`Dividende încasate actualizate pentru ${symbol}.`, "success");
    }
}

// 2. Predictor & Calendar de Dividende (Sezonul BVB 2026)
function populateDividendCalendar() {
    const calendarBody = document.getElementById("dividend-calendar-body");
    if (!calendarBody) return;
    
    // Date estimate de dividende BVB pentru anul 2026
    const bvbDividendDates = {
        "H2O": { ex: "2026-05-18", pay: "2026-06-12", status: "Aprobat" },
        "TLV": { ex: "2026-06-05", pay: "2026-06-25", status: "Propus" },
        "SNP": { ex: "2026-05-12", pay: "2026-06-04", status: "Aprobat" },
        "SNG": { ex: "2026-05-25", pay: "2026-06-18", status: "Propus" },
        "SNN": { ex: "2026-05-20", pay: "2026-06-15", status: "Aprobat" },
        "TGN": { ex: "2026-06-10", pay: "2026-07-02", status: "Propus" },
        "BRD": { ex: "2026-05-08", pay: "2026-05-29", status: "Aprobat" },
        "EL":  { ex: "2026-06-15", pay: "2026-07-08", status: "Propus" }
    };
    
    calendarBody.innerHTML = "";
    const rows = [];
    
    stocks.forEach(stock => {
        const yieldVal = stock.div_yield || 0.0;
        if (yieldVal > 0) {
            const staticInfo = bvbDividendDates[stock.symbol] || {
                ex: "2026-06-20",
                pay: "2026-07-15",
                status: "Estimare"
            };
            
            // Calcul valoare dividend în RON în funcție de prețul curent
            const divValue = (stock.price * (yieldVal / 100));
            
            // Status dinamic bazat pe timp
            const todayStr = new Date().toISOString().split('T')[0];
            let statusText = staticInfo.status;
            let statusClass = "neutral";
            if (todayStr > staticInfo.pay) {
                statusText = "Distribuit";
                statusClass = "positive";
            } else if (todayStr > staticInfo.ex) {
                statusText = "Ex-Date Trecut";
                statusClass = "negative";
            } else if (staticInfo.status === "Aprobat") {
                statusClass = "positive";
            }
            
            rows.push({
                symbol: stock.symbol,
                name: stock.name,
                divValue: divValue,
                yieldVal: yieldVal,
                ex: staticInfo.ex,
                pay: staticInfo.pay,
                statusText,
                statusClass
            });
        }
    });
    
    // Sortare cronologică după Ex-Date
    rows.sort((a, b) => new Date(a.ex) - new Date(b.ex));
    
    if (rows.length === 0) {
        calendarBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">Nu există companii cu dividende active în baza de date.</td></tr>`;
        return;
    }
    
    rows.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <div style="font-weight: 700; color: var(--text-primary);">${r.symbol}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${r.name}</div>
            </td>
            <td style="font-weight: 600;">${r.divValue.toFixed(4)} RON</td>
            <td style="color: var(--color-emerald); font-weight: 700;">${r.yieldVal.toFixed(2)}%</td>
            <td style="font-size: 12px; font-weight: 500;">${r.ex}</td>
            <td style="font-size: 12px; font-weight: 500; color: var(--text-muted);">${r.pay}</td>
            <td>
                <span class="badge-signal ${r.statusClass}" style="padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">${r.statusText}</span>
            </td>
        `;
        calendarBody.appendChild(tr);
    });
}

// 3. Sistem Alerte de Preț locale
function checkPriceAlerts() {
    if (!stocks || stocks.length === 0) return;
    let alerts = window.serverAlerts || [];
    if (alerts.length === 0) return;
    
    let triggered = false;
    let remainingAlerts = [];
    
    alerts.forEach(alert => {
        const stock = stocks.find(s => s.symbol === alert.symbol);
        if (!stock) {
            remainingAlerts.push(alert);
            return;
        }
        
        const currentPrice = stock.price;
        const target = alert.target;
        
        let isTriggered = false;
        if (alert.direction === "up" && currentPrice >= target) {
            isTriggered = true;
        } else if (alert.direction === "down" && currentPrice <= target) {
            isTriggered = true;
        }
        
        if (isTriggered) {
            if (!alert.toastShown) {
                alert.toastShown = true;
                triggered = true;
                showToast(`<span class="alert-icon-pulse">🚨</span> ALERTĂ PREȚ: ${alert.symbol} a atins targetul de ${target.toFixed(2)} RON! (Preț curent: ${currentPrice.toFixed(2)} RON)`, "success");
                
                if (Notification.permission === "granted") {
                    new Notification(`Alertă Preț: ${alert.symbol}`, {
                        body: `${alert.symbol} a atins targetul de ${target.toFixed(2)} RON! Preț curent: ${currentPrice.toFixed(2)} RON`,
                        icon: '/favicon.svg'
                    });
                }
            }
        }
    });
    
    if (triggered) {
        renderPriceAlertsList();
    }
}

function setPriceAlert() {
    const targetInput = document.getElementById("alert-target-price");
    const typeSelect = document.getElementById("alert-type-select");
    if (!targetInput) return;
    
    const target = parseFloat(targetInput.value);
    if (isNaN(target) || target <= 0) {
        showToast("Introdu un preț țintă valid.", "error");
        return;
    }
    
    const stock = stocks.find(s => s.symbol === activeSymbol);
    if (!stock) return;
    
    const currentPrice = stock.price;
    let type = typeSelect ? typeSelect.value : (target > currentPrice ? "sell" : "buy");
    const direction = type === "buy" ? "down" : "up";
    
    let alerts = window.serverAlerts || [];
    
    // Verifică duplicat
    if (alerts.some(a => a.symbol === activeSymbol && a.target === target && (a.type === type || a.direction === direction))) {
        showToast("Această alertă este deja setată.", "info");
        return;
    }
    
    const newAlert = {
        id: Date.now().toString(),
        symbol: activeSymbol,
        target: target,
        type: type,
        direction: direction,
        timestamp: Date.now()
    };
    
    alerts.push(newAlert);
    saveServerAlerts(alerts);
    targetInput.value = "";
    
    renderPriceAlertsList();
    if (typeof renderManageAlertsTable === "function") renderManageAlertsTable();
    if (typeof renderChart === "function") renderChart();
    showToast(`Alertă ${type.toUpperCase()} setată pentru ${activeSymbol} la ${target.toFixed(2)} RON (Telegram).`, "success");
    
    if (Notification.permission === "default") {
        Notification.requestPermission();
    }
}

function removePriceAlert(index) {
    let alerts = window.serverAlerts || [];
    alerts.splice(index, 1);
    saveServerAlerts(alerts);
    renderPriceAlertsList();
    if (typeof renderManageAlertsTable === "function") renderManageAlertsTable();
    if (typeof renderChart === "function") renderChart();
    showToast("Alertă ștearsă.", "info");
}

window.removePriceAlert = removePriceAlert;

function renderPriceAlertsList() {
    const listDiv = document.getElementById("active-alerts-list");
    if (!listDiv) return;
    
    let alerts = window.serverAlerts || [];
    const activeAlerts = alerts
        .map((alert, idx) => ({ ...alert, originalIndex: idx }))
        .filter(alert => alert.symbol === activeSymbol);
        
    if (activeAlerts.length === 0) {
        listDiv.innerHTML = `<span style="font-style: italic; color: var(--text-muted);">Nicio alertă setată pentru ${activeSymbol}.</span>`;
        return;
    }
    
    listDiv.innerHTML = activeAlerts.map(alert => {
        const type = alert.type || (alert.direction === "down" ? "buy" : "sell");
        const isBuy = type === "buy";
        const badgeColor = isBuy ? "var(--color-green)" : "var(--color-red)";
        const badgeBg = isBuy ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)";
        const typeLabel = isBuy ? "BUY" : "SELL";
        
        return `
            <div class="alert-item-anim" style="display: flex; justify-content: space-between; align-items: center; background: var(--card-bg); padding: 6px 10px; border-radius: 8px; border-left: 3px solid ${badgeColor}; box-shadow: var(--neu-in);">
                <span style="font-size: 12px; display: flex; align-items: center; gap: 6px;">
                    <span style="padding: 2px 6px; border-radius: 4px; background: ${badgeBg}; color: ${badgeColor}; font-size: 10px; font-weight: 700;">${typeLabel}</span>
                    <span style="color: var(--text-primary); font-weight: 600;">${alert.target.toLocaleString("ro-RO", { minimumFractionDigits: 2 })} RON</span>
                </span>
                <button onclick="removePriceAlert(${alert.originalIndex})" style="background: none; border: none; color: var(--color-red); cursor: pointer; font-size: 16px; font-weight: bold; line-height: 1; padding: 2px 6px; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'" title="Șterge Alerta">×</button>
            </div>
        `;
    }).join("");
}

window.updatePortfolioDividends = updatePortfolioDividends;
window.renderPriceAlertsList = renderPriceAlertsList;

// ─── Realized Transactions CRUD ────────────────────────────────────────────

function showRealizedForm(idx = -1) {
    const form = document.getElementById('realized-form-container');
    const title = document.getElementById('realized-form-title');
    document.getElementById('realized-edit-index').value = idx;

    if (idx >= 0 && realizedTransactions[idx]) {
        const item = realizedTransactions[idx];
        document.getElementById('realized-form-symbol').value = item.symbol || '';
        document.getElementById('realized-form-gain').value = item.gain || 0;
        document.getElementById('realized-form-loss').value = item.loss || 0;
        document.getElementById('realized-form-tax').value = item.tax || 0;
        title.textContent = 'Editează Tranzacție: ' + item.symbol;
    } else {
        document.getElementById('realized-form-symbol').value = '';
        document.getElementById('realized-form-gain').value = 0;
        document.getElementById('realized-form-loss').value = 0;
        document.getElementById('realized-form-tax').value = 0;
        title.textContent = 'Adaugă Tranzacție Realizată';
    }

    form.style.display = 'block';
    document.getElementById('realized-form-symbol').focus();
}

function hideRealizedForm() {
    document.getElementById('realized-form-container').style.display = 'none';
}

function editRealizedEntry(idx) {
    showRealizedForm(idx);
}

async function deleteRealizedEntry(idx) {
    if (!confirm('Ștergi această tranzacție?')) return;
    realizedTransactions.splice(idx, 1);
    await persistRealized();
}

async function saveRealizedEntry() {
    const symbol = document.getElementById('realized-form-symbol').value.trim();
    if (!symbol) { alert('Simbolul / descrierea este obligatorie!'); return; }

    const gain  = parseFloat(document.getElementById('realized-form-gain').value) || 0;
    const loss  = parseFloat(document.getElementById('realized-form-loss').value) || 0;
    const tax   = parseFloat(document.getElementById('realized-form-tax').value) || 0;
    const net   = gain + loss; // loss should already be negative

    const entry = { symbol, gain, loss, net, tax };
    const idx = parseInt(document.getElementById('realized-edit-index').value, 10);

    if (idx >= 0) {
        realizedTransactions[idx] = entry;
    } else {
        realizedTransactions.push(entry);
    }

    hideRealizedForm();
    await persistRealized();
}

async function persistRealized() {
    try {
        await fetch('/api/realized', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(realizedTransactions)
        });
        showToast('Tranzacții actualizate!', 'success');
    } catch (e) {
        showToast('Eroare la salvare: ' + e.message, 'error');
    }
    // Re-render portfolio to update P&L
    if (typeof renderPortfolio === 'function') renderPortfolio();
    
}

window.showRealizedForm = showRealizedForm;
window.hideRealizedForm = hideRealizedForm;
window.editRealizedEntry = editRealizedEntry;
window.deleteRealizedEntry = deleteRealizedEntry;
window.saveRealizedEntry = saveRealizedEntry;

function deleteManageAlert(alertId) {
    window.serverAlerts = window.serverAlerts.filter(a => String(a.id) !== String(alertId) && String(a.timestamp) !== String(alertId));
    saveServerAlerts(window.serverAlerts);
    renderManageAlertsTable();
    showToast("Alertă ștearsă!", "success");
}
window.deleteManageAlert = deleteManageAlert;

function renderManageAlertsTable() {
    const tbody = document.getElementById("manage-alerts-body");
    if (!tbody) return;
    
    if (!window.serverAlerts || window.serverAlerts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">Nu există alerte active.</td></tr>';
        return;
    }
    
    tbody.innerHTML = "";
    window.serverAlerts.forEach(alert => {
        const sym = alert.symbol || "N/A";
        const target = alert.target || 0;
        const type = alert.type || (alert.direction === "down" ? "buy" : "sell");
        const typeBadge = type === "buy" 
            ? '<span class="status-indicator" style="background: rgba(34, 197, 94, 0.18); color: #10b981; border: 1px solid rgba(34, 197, 94, 0.3); font-weight: 700; padding: 4px 10px; border-radius: 8px; display: inline-block;">BUY (Sub)</span>' 
            : '<span class="status-indicator" style="background: rgba(239, 68, 68, 0.18); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 700; padding: 4px 10px; border-radius: 8px; display: inline-block;">SELL (Peste)</span>';
        const alertId = alert.id || alert.timestamp;
        
        const symCell = sym !== "N/A"
            ? `<span class="table-symbol-clickable" onclick="selectTicker('${sym}'); switchTab('analysis');">${sym}</span>`
            : `<span class="table-symbol">${sym}</span>`;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${symCell}</td>
            <td>${typeBadge}</td>
            <td style="font-family: var(--font-mono); font-weight: bold;">${target} RON</td>
            <td>
                <button class="btn-action btn-delete" onclick="deleteManageAlert('${alertId}')" title="Șterge Alertă" style="background: none; border: none; color: var(--color-red); cursor: pointer; padding: 5px;">
                    <i class="ph-duotone ph-trash" style="font-size: 18px;"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
window.renderManageAlertsTable = renderManageAlertsTable;

function fetchTelegramConfig() {
    fetch('/api/telegram')
        .then(res => res.json())
        .then(data => {
            const tokenInput = document.getElementById("tg-token-input");
            const chatIdInput = document.getElementById("tg-chatid-input");
            if (tokenInput && data.token) tokenInput.value = data.token;
            if (chatIdInput && data.chat_id) chatIdInput.value = data.chat_id;
        })
        .catch(err => console.error("Error fetching telegram config:", err));
}

function saveTelegramConfig() {
    const tokenInput = document.getElementById("tg-token-input");
    const chatIdInput = document.getElementById("tg-chatid-input");
    if (!tokenInput || !chatIdInput) return;
    
    const token = tokenInput.value.trim();
    const chat_id = chatIdInput.value.trim();
    
    fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, chat_id: chat_id })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'ok') {
            showToast("Setările Telegram au fost salvate cu succes!", "success");
        } else {
            showToast("Eroare la salvarea setărilor Telegram.", "error");
        }
    })
    .catch(err => showToast("Eroare de rețea la salvare Telegram.", "error"));
}

function testTelegramConnection() {
    const tokenInput = document.getElementById("tg-token-input");
    const chatIdInput = document.getElementById("tg-chatid-input");
    const token = tokenInput ? tokenInput.value.trim() : "";
    const chat_id = chatIdInput ? chatIdInput.value.trim() : "";
    
    if (!token || !chat_id) {
        showToast("Introdu Bot Token și Chat ID înainte de test!", "error");
        return;
    }
    
    showToast("Se trimite mesajul de test pe Telegram...", "info");
    
    fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, chat_id: chat_id })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'ok') {
            showToast("🚀 " + data.message, "success");
        } else {
            showToast("❌ " + (data.message || "Eroare la trimiterea mesajului de test."), "error");
        }
    })
    .catch(err => showToast("Eroare de conexiune la testarea Telegram.", "error"));
}

function renderAlertHistoryTable() {
    const tbody = document.getElementById("alert-history-body");
    if (!tbody) return;
    
    fetch('/api/alerts/history')
        .then(res => res.json())
        .then(history => {
            if (!history || history.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">Nu există nicio alertă declanșată în istoric.</td></tr>';
                return;
            }
            tbody.innerHTML = "";
            history.forEach(item => {
                const sym = item.symbol || "N/A";
                const type = item.type || "N/A";
                const typeBadge = type === "buy" ? '<span class="status-indicator" style="background: rgba(34, 197, 94, 0.1); color: #22c55e;">BUY</span>' : '<span class="status-indicator" style="background: rgba(239, 68, 68, 0.1); color: #ef4444;">SELL</span>';
                const target = item.target ? `${item.target.toFixed(4)} RON` : 'N/A';
                const price = item.triggered_price ? `${item.triggered_price.toFixed(4)} RON` : 'N/A';
                const timeStr = item.triggered_at || 'N/A';
                const statusBadge = item.status === "Sent" 
                    ? '<span style="color: var(--color-green); font-weight: 600;"><i class="ph-duotone ph-check-circle" style="margin-right: 4px;"></i>Trimis (200 OK)</span>'
                    : `<span style="color: var(--color-red); font-weight: 600;"><i class="ph-duotone ph-warning" style="margin-right: 4px;"></i>${item.status}</span>`;
                
                const symCell = sym !== "N/A"
                    ? `<span class="table-symbol-clickable" onclick="selectTicker('${sym}'); switchTab('analysis');">${sym}</span>`
                    : `<span class="table-symbol">${sym}</span>`;
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${symCell}</td>
                    <td>${typeBadge}</td>
                    <td style="font-family: var(--font-mono); font-weight: 600;">${target}</td>
                    <td style="font-family: var(--font-mono); font-weight: 700; color: var(--color-blue);">${price}</td>
                    <td style="font-size: 12px; color: var(--text-muted);">${timeStr}</td>
                    <td>${statusBadge}</td>
                `;
                tbody.appendChild(tr);
            });
        })
        .catch(err => {
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--color-red); padding: 20px;">Eroare la încărcarea istoricului.</td></tr>';
        });
}
window.renderAlertHistoryTable = renderAlertHistoryTable;

document.addEventListener("DOMContentLoaded", () => {
    fetchTelegramConfig();
    renderAlertHistoryTable();
    
    const btnSaveTg = document.getElementById("btn-save-telegram");
    if (btnSaveTg) btnSaveTg.addEventListener("click", saveTelegramConfig);
    
    const btnTestTg = document.getElementById("btn-test-telegram");
    if (btnTestTg) btnTestTg.addEventListener("click", testTelegramConnection);

    const btnAddManageAlert = document.getElementById("btn-add-manage-alert");
    if (btnAddManageAlert) {
        btnAddManageAlert.addEventListener("click", () => {
            const symInput = document.getElementById("manage-alert-symbol");
            const targetInput = document.getElementById("manage-alert-target");
            const typeInput = document.getElementById("manage-alert-type");
            
            const sym = symInput.value.toUpperCase().trim();
            const target = parseFloat(targetInput.value);
            const type = typeInput.value;
            
            if (!sym || isNaN(target) || target <= 0) {
                showToast("Simbol sau preț invalid!", "error");
                return;
            }
            
            const newAlert = {
                id: Date.now().toString(),
                symbol: sym,
                target: target,
                type: type,
                timestamp: Date.now()
            };
            
            window.serverAlerts.push(newAlert);
            saveServerAlerts(window.serverAlerts);
            renderManageAlertsTable();
            
            symInput.value = "";
            targetInput.value = "";
            showToast(`Alertă adăugată pentru ${sym}!`, "success");
        });
    }
});

