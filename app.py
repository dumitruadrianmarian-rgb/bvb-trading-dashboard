import flask
from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
import os
import requests
import json
import threading
import time
from bs4 import BeautifulSoup
import urllib3
import pandas as pd
import numpy as np
import os

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__, static_folder='static')
CORS(app)

# Global caches and tracking
YAHOO_CACHE = {} # {symbol: {"timestamp": float, "history": list, "technical": dict}}
LAST_CLIENT_ACTIVITY = time.time()

@app.before_request
def update_client_activity():
    global LAST_CLIENT_ACTIVITY
    # Any request to api or root counts as client activity
    if request.path.startswith('/api/') or request.path == '/':
        LAST_CLIENT_ACTIVITY = time.time()

PORTFOLIO_FILE = 'data/portfolio.json'

# Cache dictionary to store parsed data
DATA_CACHE = {
    "stocks": {},
    "recommendations": {},
    "last_updated": 0,
    "status": "Initializing"
}

BVB_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def get_top_traded_bvb_tickers():
    """Scrape the top 10 most traded shares from BVB (either Main or AeRO if listed)"""
    url = "https://www.bvb.ro/TradingAndStatistics/Statistics/Top10ByTradingData"
    try:
        res = requests.get(url, headers=BVB_HEADERS, verify=False, timeout=8)
        if res.status_code == 200:
            soup = BeautifulSoup(res.text, 'html.parser')
            table = soup.find('table')
            if table:
                tickers = {}
                for row in table.find_all('tr')[1:]:
                    cells = row.find_all('td')
                    if len(cells) < 2:
                        continue
                    a_tag = cells[0].find('a')
                    if not a_tag:
                        continue
                    symbol = a_tag.text.strip().upper()
                    name = cells[1].text.strip()
                    
                    if len(symbol) > 6 or not symbol.isalnum():
                        continue
                        
                    tickers[symbol] = {
                        "name": name,
                        "yahoo": f"{symbol}.RO"
                    }
                    if len(tickers) >= 10:
                        break
                if len(tickers) >= 5:
                    return tickers
    except Exception as e:
        print(f"Error scraping top BVB tickers: {e}")
    
    # Fallback to default static tickers if scraping fails
    return {
        "TLV": {"name": "Banca Transilvania S.A.", "yahoo": "TLV.RO"},
        "SNP": {"name": "OMV Petrom S.A.", "yahoo": "SNP.RO"},
        "H2O": {"name": "Hidroelectrica S.A.", "yahoo": "H2O.RO"},
        "SNG": {"name": "Romgaz S.A.", "yahoo": "SNG.RO"},
        "BRD": {"name": "BRD Groupe Societe Generale", "yahoo": "BRD.RO"},
        "DIGI": {"name": "Digi Communications N.V.", "yahoo": "DIGI.RO"},
        "ONE": {"name": "One United Properties S.A.", "yahoo": "ONE.RO"},
        "SNN": {"name": "Nuclearelectrica S.A.", "yahoo": "SNN.RO"},
        "EL": {"name": "Electrica S.A.", "yahoo": "EL.RO"},
        "TGN": {"name": "Transgaz S.A.", "yahoo": "TGN.RO"}
    }

# Default tickers for resetting
DEFAULT_TICKERS = {
    "TLV": {"name": "Banca Transilvania S.A.", "yahoo": "TLV.RO"},
    "SNP": {"name": "OMV Petrom S.A.", "yahoo": "SNP.RO"},
    "H2O": {"name": "Hidroelectrica S.A.", "yahoo": "H2O.RO"},
    "SNG": {"name": "Romgaz S.A.", "yahoo": "SNG.RO"},
    "BRD": {"name": "BRD Groupe Societe Generale", "yahoo": "BRD.RO"},
    "DIGI": {"name": "Digi Communications N.V.", "yahoo": "DIGI.RO"},
    "ONE": {"name": "One United Properties S.A.", "yahoo": "ONE.RO"},
    "TRP": {"name": "TeraPlast S.A.", "yahoo": "TRP.RO"},
    "TTS": {"name": "Transport Trade Services S.A.", "yahoo": "TTS.RO"},
    "SNN": {"name": "Nuclearelectrica S.A.", "yahoo": "SNN.RO"},
    "EL": {"name": "Electrica S.A.", "yahoo": "EL.RO"},
    "TGN": {"name": "Transgaz S.A.", "yahoo": "TGN.RO"},
    "REIT": {"name": "Star Invest Imobiliare S.A.", "yahoo": "REIT.RO"}
}

def get_initial_watchlist():
    """Build the initial watchlist: Portfolio symbols first, then top traded, no duplicates"""
    tickers = {}
    import json
    import os
    
    # 1. Load Portfolio symbols first
    if os.path.exists(PORTFOLIO_FILE):
        try:
            with open(PORTFOLIO_FILE, 'r') as f:
                portfolio = json.load(f)
                for item in portfolio:
                    sym = item.get("symbol", "").upper()
                    if sym and sym not in tickers:
                        tickers[sym] = {"name": sym, "yahoo": f"{sym}.RO"}
        except Exception as e:
            print(f"Error loading portfolio for watchlist: {e}")
            
    # 2. Add Top Traded symbols
    top_traded = get_top_traded_bvb_tickers()
    for sym, info in top_traded.items():
        if sym not in tickers:
            tickers[sym] = info
            
    # 3. Fallback to default if empty
    if not tickers:
        for sym, info in DEFAULT_TICKERS.items():
            tickers[sym] = info
            
    return tickers

# Tickers to track
TICKERS = get_initial_watchlist()

def parse_bvb_metrics(symbol):
    """Scrape real-time price and metrics from bvb.ro"""
    url = f"https://www.bvb.ro/FinancialInstruments/Details/FinancialInstrumentsDetails.aspx?s={symbol}"
    try:
        res = requests.get(url, headers=BVB_HEADERS, verify=False, timeout=8)
        if res.status_code != 200:
            return None
        
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # Company name from <h2>
        name_tag = soup.find('h2')
        name_val = name_tag.text.strip() if name_tag else symbol
        
        # Price from <b class="value">
        price_tag = soup.find('b', class_='value')
        price_val = 0.0
        if price_tag:
            price_text = price_tag.text.strip().replace('.', '').replace(',', '.')
            try:
                price_val = float(price_text)
            except ValueError:
                pass
        
        # Variation % (BVB renders it as a "tooltip-trigger w100p" span; color class
        # varies - "positive" for gains, "red" for losses - so match on structure, not color)
        var_tag = soup.find(class_=lambda x: x and 'tooltip-trigger' in x and 'w100p' in x)
        variation = "0.00%"
        if var_tag:
            variation = var_tag.text.strip()
            
        metrics = {
            "Capitalizare": 0,
            "PER": 0.0,
            "P/BV": 0.0,
            "EPS": 0.0,
            "DIVY": 0.0,
            "Beta": 1.0
        }
        
        # Parse metrics table rows
        for row in soup.find_all('tr'):
            cells = row.find_all(['td', 'th'])
            if len(cells) >= 2:
                label = cells[0].text.strip()
                val = cells[1].text.strip().replace('.', '').replace(',', '.')
                
                try:
                    if 'Capitalizare' in label:
                        metrics["Capitalizare"] = float(val)
                    elif 'PER' in label or 'P/E' in label:
                        metrics["PER"] = float(val)
                    elif 'P/BV' in label or 'P/B' in label:
                        metrics["P/BV"] = float(val)
                    elif 'EPS' in label:
                        metrics["EPS"] = float(val)
                    elif 'DIVY' in label or 'Randament' in label:
                        metrics["DIVY"] = float(val)
                    elif 'Beta' in label:
                        metrics["Beta"] = float(val)
                except ValueError:
                    pass
        
        return {
            "name": name_val,
            "price": price_val,
            "variation": variation,
            "market_cap": metrics["Capitalizare"],
            "pe": metrics["PER"],
            "pb": metrics["P/BV"],
            "eps": metrics["EPS"],
            "div_yield": metrics["DIVY"],
            "beta": metrics["Beta"]
        }
    except Exception as e:
        print(f"Error scraping BVB for {symbol}: {e}")
        return None

def fetch_yahoo_history(yahoo_symbol):
    """Fetch 1 year of daily history from Yahoo Finance query1 API"""
    to_time = int(time.time())
    from_time = to_time - 365 * 24 * 3600
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_symbol}?period1={from_time}&period2={to_time}&interval=1d"
    
    try:
        res = requests.get(url, headers=BVB_HEADERS, verify=False, timeout=8)
        if res.status_code != 200:
            return None
        
        data = res.json()
        result = data["chart"]["result"][0]
        timestamps = result.get("timestamp", [])
        quotes = result.get("indicators", {}).get("quote", [{}])[0]
        closes = quotes.get("close", [])
        opens = quotes.get("open", [])
        highs = quotes.get("high", [])
        lows = quotes.get("low", [])
        volumes = quotes.get("volume", [])
        
        # Filter out null values
        valid_data = []
        for i, (t, c) in enumerate(zip(timestamps, closes)):
            if t is not None and c is not None:
                o = opens[i] if i < len(opens) and opens[i] is not None else c
                h = highs[i] if i < len(highs) and highs[i] is not None else c
                l = lows[i] if i < len(lows) and lows[i] is not None else c
                v = volumes[i] if i < len(volumes) and volumes[i] is not None else 0
                valid_data.append({
                    "timestamp": t * 1000, 
                    "open": o,
                    "high": h,
                    "low": l,
                    "close": c,
                    "volume": v
                })
                
        return valid_data
    except Exception as e:
        print(f"Error fetching Yahoo history for {yahoo_symbol}: {e}")
        return None

def compute_indicators(history_data):
    """Compute moving averages, RSI, MACD, and YTD return"""
    if not history_data or len(history_data) < 30:
        return {}
    
    df = pd.DataFrame(history_data)
    df['date'] = pd.to_datetime(df['timestamp'], unit='ms')
    df = df.sort_values('date')
    
    # Prices list
    closes = df['close']
    
    # 1. Moving Averages
    df['MA50'] = closes.rolling(window=min(50, len(df))).mean()
    df['MA200'] = closes.rolling(window=min(200, len(df))).mean()
    
    # 2. RSI (14)
    delta = closes.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(window=14).mean()
    avg_loss = loss.rolling(window=14).mean()
    rs = avg_gain / avg_loss
    df['RSI'] = 100 - (100 / (1 + rs))
    
    # 3. MACD (12, 26, 9)
    exp1 = closes.ewm(span=12, adjust=False).mean()
    exp2 = closes.ewm(span=26, adjust=False).mean()
    df['MACD'] = exp1 - exp2
    df['Signal'] = df['MACD'].ewm(span=9, adjust=False).mean()
    df['Hist'] = df['MACD'] - df['Signal']
    
    # 4. YTD return
    # Find first price of 2026
    current_year = time.strftime("%Y")
    ytd_start_df = df[df['date'] >= f"{current_year}-01-01"]
    ytd_return = 0.0
    if not ytd_start_df.empty:
        start_price = ytd_start_df.iloc[0]['close']
        current_price = closes.iloc[-1]
        ytd_return = ((current_price - start_price) / start_price) * 100
        
    last_row = df.iloc[-1]
    prev_row = df.iloc[-2] if len(df) > 1 else last_row
    
    # Technical recommendations
    rsi = last_row.get('RSI', 50)
    macd_hist = last_row.get('Hist', 0)
    prev_macd_hist = prev_row.get('Hist', 0)
    close_price = last_row.get('close', 0)
    ma50 = last_row.get('MA50', close_price)
    ma200 = last_row.get('MA200', close_price)
    
    tech_signal = "HOLD"
    
    # Check BUY conditions (Oversold OR Trend + Momentum alignment)
    if rsi < 35:
        tech_signal = "BUY"
    elif rsi < 50 and macd_hist > 0 and macd_hist > prev_macd_hist and close_price > ma50:
        tech_signal = "BUY"
        
    # Check SELL conditions (Overbought OR Trend + Momentum alignment)
    elif rsi > 65:
        tech_signal = "SELL"
    elif rsi > 50 and macd_hist < 0 and macd_hist < prev_macd_hist and close_price < ma50:
        tech_signal = "SELL"
        
    # Calculate unified technical score (0 - 100%)
    rsi_score = 100.0 - float(rsi)
    
    # MACD component (range 0 to 100)
    macd_dir = 10.0 if macd_hist > prev_macd_hist else -10.0
    macd_val = 40.0 if macd_hist > 0 else -40.0
    macd_score = 50.0 + macd_val + macd_dir
    
    # MA components
    ma50_score = 100.0 if close_price > ma50 else 0.0
    ma200_score = 100.0 if close_price > ma200 else 0.0
    
    # Weighted average
    raw_score = (rsi_score * 0.3) + (macd_score * 0.3) + (ma50_score * 0.2) + (ma200_score * 0.2)
    tech_score = max(0.0, min(100.0, raw_score))
    
    return {
        "ma50": float(last_row['MA50']) if not pd.isna(last_row['MA50']) else last_row['close'],
        "ma200": float(last_row['MA200']) if not pd.isna(last_row['MA200']) else last_row['close'],
        "rsi": float(rsi) if not pd.isna(rsi) else 50.0,
        "macd": float(last_row['MACD']) if not pd.isna(last_row['MACD']) else 0.0,
        "macd_signal": float(last_row['Signal']) if not pd.isna(last_row['Signal']) else 0.0,
        "macd_hist": float(macd_hist) if not pd.isna(macd_hist) else 0.0,
        "ytd_return": float(ytd_return),
        "tech_signal": tech_signal,
        "tech_score": round(tech_score, 1)
    }

def get_yahoo_data(symbol, yahoo_symbol, force_refresh=False):
    global YAHOO_CACHE
    now = time.time()
    # Cache for 4 hours (14400 seconds) if not forced
    if not force_refresh and symbol in YAHOO_CACHE:
        if (now - YAHOO_CACHE[symbol]["timestamp"]) < 14400:
            return YAHOO_CACHE[symbol]["history"], YAHOO_CACHE[symbol]["technical"]
            
    # Fetch from Yahoo
    print(f"Fetching fresh Yahoo history for {yahoo_symbol}...")
    history = fetch_yahoo_history(yahoo_symbol)
    if history:
        tech = compute_indicators(history)
        YAHOO_CACHE[symbol] = {
            "timestamp": now,
            "history": history,
            "technical": tech
        }
        return history, tech
    elif symbol in YAHOO_CACHE:
        print(f"Failed to fetch Yahoo history for {yahoo_symbol}. Falling back to cached data.")
        return YAHOO_CACHE[symbol]["history"], YAHOO_CACHE[symbol]["technical"]
    return None, None


def calculate_recommendations(stocks_data):
    """Generate the 3 buy and 3 sell recommendations dynamically with simplified explanations"""
    valid_stocks = [k for k, v in stocks_data.items() if v.get("price")]
    if len(valid_stocks) < 6:
        # Fallback to hardcoded recommendations if we don't have enough data
        return {
            "buy": [
                {
                    "symbol": "ONE", 
                    "name": "One United Properties S.A.", 
                    "term": "Termen Scurt - Riscant", 
                    "reason": "Prețul acțiunii a scăzut rapid în ultimele zile, devenind ieftin (indicatorul de viteză a prețului, RSI, arată o stare de 'supra-vânzare' - adică lumea a vândut din panică). Pe termen scurt, este foarte probabil ca prețul să își revină rapid în sus (momentum pozitiv). Atenție: este o oportunitate speculativă, ceea ce înseamnă că prețul se va mișca foarte rapid și riscul este ridicat."
                },
                {
                    "symbol": "TLV", 
                    "name": "Banca Transilvania S.A.", 
                    "term": "Termen Mediu - Nu foarte riscant", 
                    "reason": "Compania este una stabilă, cu profituri solide și un preț de cumpărare atractiv în raport cu valoarea ei reală. Indicatorii arată că acțiunea este subevaluată: plătești doar de aproximativ 9.6 ori profitul anual al companiei (P/E) și de 1.9 ori valoarea contabilă reală a activelor (P/BV). Este o investiție excelentă pentru câteva luni, cu un risc moderat, deoarece are o afacere sănătoasă în spate."
                },
                {
                    "symbol": "H2O", 
                    "name": "Hidroelectrica S.A.", 
                    "term": "Termen Lung - Câștig garantat în timp", 
                    "reason": "Este un gigant de importanță națională (lider în energie) cu afaceri sigure și monopol sau poziție dominantă în economie. Riscul de a pierde bani pe termen lung este extrem de mic (afacere defensivă). În plus, compania împarte regulat profitul cu acționarii, oferind un randament al dividendului ridicat (bani cash care îți intră în cont doar pentru că deții acțiunea), mult peste dobânzile bancare."
                }
            ],
            "sell": [
                {
                    "symbol": "TRP", 
                    "name": "TeraPlast S.A.", 
                    "term": "Termen Scurt - Riscant", 
                    "reason": "Prețul acțiunii a crescut accelerat în ultimele zile și acțiunea este 'supra-cumpărată' acum (indicatorul de viteză RSI arată că entuziasmul cumpărătorilor a atins un maxim). Este foarte probabil ca speculanții să înceapă să își marcheze profiturile, ceea ce va trage prețul rapid în jos în zilele următoare. Se recomandă vânzarea pe termen scurt pentru a securiza câștigurile."
                },
                {
                    "symbol": "DIGI", 
                    "name": "Digi Communications N.V.", 
                    "term": "Termen Mediu - Nu foarte riscant", 
                    "reason": "Prețul acțiunii a crescut considerabil și este evaluată destul de ridicat comparativ cu profiturile reale ale companiei (P/E ridicat). Pentru următoarele luni, creșterea este probabil să stagneze sau să scadă ușor, deoarece valoarea acțiunii a luat-o înaintea realității economice a firmei. O oportunitate bună de marcare a profitului pe termen mediu."
                },
                {
                    "symbol": "TTS", 
                    "name": "Transport Trade Services S.A.", 
                    "term": "Termen Lung - Câștig garantat în timp", 
                    "reason": "Pe termen lung, această acțiune este mai puțin eficientă pentru portofoliul tău: fie are performanțe sub media pieței, fie costul ei curent nu mai justifică beneficiile. Pe termen lung, blocarea banilor aici îți aduce un 'cost de oportunitate' mare - ai obține randamente garantat mai bune dacă ai muta banii în companii cu dividende mari sau creștere stabilă."
                }
            ]
        }
    
    # Calculate scores
    buy_scores = []
    sell_scores = []
    
    for symbol in valid_stocks:
        s = stocks_data[symbol]
        tech = s.get("technical", {})
        rsi = tech.get("rsi", 50)
        div = s.get("div_yield", 0.0)
        pe = s.get("pe", 20.0)
        pb = s.get("pb", 2.0)
        mcap = s.get("market_cap", 0.0)
        
        # Avoid zero division
        pe_score = 1.0 / pe if pe > 0 else 0.001
        pb_score = 1.0 / pb if pb > 0 else 0.5
        
        # 1. Short-term Score (focus on RSI oversold/overbought and momentum)
        st_buy_score = (100 - rsi) * 1.5 + (10 if tech.get("macd_hist", 0) > 0 else -10)
        st_sell_score = rsi * 1.5 + (10 if tech.get("macd_hist", 0) < 0 else -10)
        
        # 2. Medium-term Score (focus on PER, P/BV, valuation)
        mt_buy_score = pe_score * 50 + pb_score * 20 + (10 if s["price"] < tech.get("ma50", 0) else 0)
        mt_sell_score = pe * 2 + pb * 5
        
        # 3. Long-term Score (focus on Dividend Yield, Market Cap size, stability)
        lt_buy_score = div * 8 + (np.log10(mcap) if mcap > 0 else 1.0) * 2
        lt_sell_score = (15 if pe > 30 or pe < 0 else 0) + (10 if div < 1.0 else 0)
        
        buy_scores.append({
            "symbol": symbol,
            "st": st_buy_score,
            "mt": mt_buy_score,
            "lt": lt_buy_score
        })
        
        sell_scores.append({
            "symbol": symbol,
            "st": st_sell_score,
            "mt": mt_sell_score,
            "lt": lt_sell_score
        })
        
    # Sort and pick unique symbols for each slot
    buy_st = sorted(buy_scores, key=lambda x: x["st"], reverse=True)
    buy_mt = sorted(buy_scores, key=lambda x: x["mt"], reverse=True)
    buy_lt = sorted(buy_scores, key=lambda x: x["lt"], reverse=True)
    
    selected_buy = []
    # 1. Short term (Risky)
    st_symbol = buy_st[0]["symbol"]
    st_stock = stocks_data[st_symbol]
    selected_buy.append({
        "symbol": st_symbol,
        "name": TICKERS[st_symbol]["name"],
        "term": "Termen Scurt • Oportunitate Tactică",
        "reason": f"Acțiunea a suferit o corecție tehnică severă (RSI la {st_stock['technical']['rsi']:.1f}), semnalând o zonă clară de supravânzare. Această presiune de vânzare este temporară și disproporționată față de fundamente. Există un potențial ridicat de ricoșeu (rebound) pe termen scurt. Oportunitate excelentă de intrare tactică pentru a capta volatilitatea pozitivă."
    })
    
    # 2. Medium term (Moderate)
    next_mt_item = [x for x in buy_mt if x["symbol"] not in [b["symbol"] for b in selected_buy]][0]
    mt_symbol = next_mt_item["symbol"]
    mt_stock = stocks_data[mt_symbol]
    selected_buy.append({
        "symbol": mt_symbol,
        "name": TICKERS[mt_symbol]["name"],
        "term": "Termen Mediu • Subevaluare Fundamentală",
        "reason": f"Compania prezintă un discount semnificativ față de valoarea sa intrinsecă. Multiplul de profit (P/E {mt_stock['pe']:.1f}) și valoarea contabilă (P/BV {mt_stock['pb']:.1f}) indică o subevaluare clară a activelor. Fundamentele puternice și prețul atractiv fac din acest emitent un candidat ideal pentru acumulare cu un profil de risc/randament asimetric."
    })
    
    # 3. Long term (Safe)
    next_lt_item = [x for x in buy_lt if x["symbol"] not in [b["symbol"] for b in selected_buy]][0]
    lt_symbol = next_lt_item["symbol"]
    lt_stock = stocks_data[lt_symbol]
    selected_buy.append({
        "symbol": lt_symbol,
        "name": TICKERS[lt_symbol]["name"],
        "term": "Termen Lung • Core Portofoliu / Randament Generos",
        "reason": f"Lider de piață incontestabil, cu o capacitate robustă de a genera fluxuri de numerar chiar și în cicluri economice dificile. Remunerarea acționarilor rămâne prioritară, reflectată printr-un randament al dividendului excepțional de {lt_stock['div_yield']:.1f}%. Este o deținere defensivă perfectă pentru stabilizarea portofoliului pe termen lung și combaterea inflației."
    })
    
    # We want 3 unique sell recommendations
    sell_st = sorted(sell_scores, key=lambda x: x["st"], reverse=True)
    sell_mt = sorted(sell_scores, key=lambda x: x["mt"], reverse=True)
    sell_lt = sorted(sell_scores, key=lambda x: x["lt"], reverse=True)
    
    selected_sell = []
    # 1. Short term (Risky)
    sell_st_filtered = [x for x in sell_st if x["symbol"] not in [b["symbol"] for b in selected_buy]]
    if not sell_st_filtered: sell_st_filtered = sell_st
    sst_symbol = sell_st_filtered[0]["symbol"]
    sst_stock = stocks_data[sst_symbol]
    selected_sell.append({
        "symbol": sst_symbol,
        "name": TICKERS[sst_symbol]["name"],
        "term": "Termen Scurt • Marcare Profit / Evitare Corecție",
        "reason": f"Saturație pe partea de cumpărare (RSI supra-cumpărat la {sst_stock['technical']['rsi']:.1f}). Emitentul a avut un raliu nesustenabil, iar fluxurile de capital indică iminența unei corecții tehnice și a marcării de profituri. Recomandăm reducerea sau lichidarea expunerii pe termen scurt pentru a securiza câștigurile (take-profit)."
    })
    
    # 2. Medium term (Moderate)
    sell_mt_filtered = [x for x in sell_mt if x["symbol"] not in [b["symbol"] for b in selected_buy] and x["symbol"] not in [s["symbol"] for s in selected_sell]]
    if not sell_mt_filtered: sell_mt_filtered = [x for x in sell_mt if x["symbol"] not in [s["symbol"] for s in selected_sell]]
    smt_symbol = sell_mt_filtered[0]["symbol"]
    smt_stock = stocks_data[smt_symbol]
    selected_sell.append({
        "symbol": smt_symbol,
        "name": TICKERS[smt_symbol]["name"],
        "term": "Termen Mediu • Supraevaluare Fundamentală",
        "reason": f"Acțiunea tranzacționează cu o primă de evaluare nejustificată (P/E de {smt_stock['pe']:.1f}x), detașându-se periculos de performanța operațională. Prețul curentează un scenariu nerealist de creștere, iar potențialul de creștere organică pe termen mediu este sever limitat. Riscul de revizuire negativă a așteptărilor pieței (de-rating) este considerabil."
    })
    
    # 3. Long term (Safe)
    sell_lt_filtered = [x for x in sell_lt if x["symbol"] not in [b["symbol"] for b in selected_buy] and x["symbol"] not in [s["symbol"] for s in selected_sell]]
    if not sell_lt_filtered: sell_lt_filtered = [x for x in sell_lt if x["symbol"] not in [s["symbol"] for s in selected_sell]]
    slt_symbol = sell_lt_filtered[0]["symbol"]
    slt_stock = stocks_data[slt_symbol]
    selected_sell.append({
        "symbol": slt_symbol,
        "name": TICKERS[slt_symbol]["name"],
        "term": "Termen Lung • Cost de Oportunitate Ridicat",
        "reason": f"Alocarea capitalului în această companie prezintă o ineficiență structurală pentru deținerile pe termen lung. Compania generează un randament al dividendului dezamăgitor ({slt_stock['div_yield']:.1f}%) și subperformează media pieței, creând un cost de oportunitate inacceptabil. Capitalul poate fi realocat în vehicule financiare net superioare pentru acumularea averii (wealth generation)."
    })
    
    return {
        "buy": selected_buy,
        "sell": selected_sell
    }

SECTORS = {
    "TLV": "Financiar-Bancar",
    "BRD": "Financiar-Bancar",
    "SNP": "Energie & Utilități",
    "H2O": "Energie & Utilități",
    "SNG": "Energie & Utilități",
    "SNN": "Energie & Utilități",
    "EL": "Energie & Utilități",
    "TGN": "Energie & Utilități",
    "DIGI": "Telecomunicații",
    "ONE": "Imobiliar",
    "TRP": "Industrie / Materiale",
    "TTS": "Transporturi / Logistică",
    "REIT": "Imobiliar"
}

def build_stock_object(symbol, fallback_name, bvb_data, tech, history):
    price = bvb_data.get("price", 0.0)
    eps = bvb_data.get("eps", 0.0)
    pe = bvb_data.get("pe", 0.0)
    pb = bvb_data.get("pb", 0.0)
    
    # Calculate EPS from PE if EPS is missing
    if (eps is None or eps == 0.0) and pe and pe > 0:
        eps = price / pe
        
    intrinsic_value = 0.0
    margin_of_safety = 0.0
    
    if eps and eps > 0 and pb and pb > 0:
        try:
            bvps = price / pb
            val = 22.5 * eps * bvps
            if val > 0:
                import math
                intrinsic_value = math.sqrt(val)
                margin_of_safety = ((intrinsic_value - price) / intrinsic_value) * 100
        except Exception:
            pass

    # Ensure tech_score fallback
    if "tech_score" not in tech:
        tech["tech_score"] = 50.0

    return {
        "symbol": symbol,
        "name": bvb_data.get("name", fallback_name),
        "price": price,
        "variation": bvb_data.get("variation", "0.00%"),
        "market_cap": bvb_data.get("market_cap", 0),
        "pe": bvb_data.get("pe", 0.0),
        "pb": bvb_data.get("pb", 0.0),
        "eps": bvb_data.get("eps", 0.0),
        "div_yield": bvb_data.get("div_yield", 0.0),
        "beta": bvb_data.get("beta", 1.0),
        "intrinsic_value": round(intrinsic_value, 2) if intrinsic_value else 0.0,
        "margin_of_safety": round(margin_of_safety, 1) if margin_of_safety else 0.0,
        "sector": SECTORS.get(symbol, "Altele"),
        "technical": tech,
        "history": history[-30:] if history else []
    }

def perform_update_cycle(force_refresh=False):
    global DATA_CACHE, TICKERS
    DATA_CACHE["status"] = "Updating"
    tickers_snapshot = list(TICKERS.items())
    temp_stocks = {}
    
    for symbol, info in tickers_snapshot:
        print(f"Updating {symbol}...")
        # 1. Scrape BVB details
        bvb_data = parse_bvb_metrics(symbol)
        
        # 2. Get Yahoo history & technicals (cached)
        history, tech = get_yahoo_data(symbol, info["yahoo"], force_refresh=force_refresh)
        
        if not bvb_data:
            bvb_data = {
                "name": info["name"],
                "price": history[-1]["close"] if history else 0.0,
                "variation": "0.00%",
                "market_cap": 0,
                "pe": 0.0,
                "pb": 0.0,
                "eps": 0.0,
                "div_yield": 0.0,
                "beta": 1.0
            }
        elif bvb_data["price"] == 0.0 and history:
            bvb_data["price"] = history[-1]["close"]
            
        if not tech:
            tech = {
                "ma50": bvb_data["price"],
                "ma200": bvb_data["price"],
                "rsi": 50.0,
                "macd": 0.0,
                "macd_signal": 0.0,
                "macd_hist": 0.0,
                "ytd_return": 0.0,
                "tech_signal": "HOLD"
            }
            
        temp_stocks[symbol] = build_stock_object(symbol, info["name"], bvb_data, tech, history)
        
        time.sleep(0.4)
        
    try:
        recs = calculate_recommendations(temp_stocks)
        DATA_CACHE["stocks"] = temp_stocks
        DATA_CACHE["recommendations"] = recs
        DATA_CACHE["last_updated"] = int(time.time())
        DATA_CACHE["status"] = "Success"
        print("Update cycle completed successfully!")
        import sys
        sys.stdout.flush()
        return True
    except Exception as e:
        print(f"Error calculating recommendations: {e}")
        import sys
        sys.stdout.flush()
        DATA_CACHE["status"] = "Error"
        return False

def update_data_thread():
    """Background task to fetch and compute data with client activity detection"""
    global DATA_CACHE, LAST_CLIENT_ACTIVITY
    # Wait a bit after startup
    time.sleep(5)
    while True:
        now_ts = time.time()
        # If no client activity in the last 15 minutes AND no active alerts, sleep 30s and skip update to save bandwidth
        active_alerts = load_alerts()
        if now_ts - LAST_CLIENT_ACTIVITY > 900 and not active_alerts:
            print("No client activity in the last 15 minutes and no active alerts. Skipping background update...", flush=True)
            time.sleep(30)
            continue
            
        try:
            perform_update_cycle(force_refresh=False)
            check_alerts_backend()
        except Exception as e:
            print(f"Exception in background update cycle: {e}")
            DATA_CACHE["status"] = "Error"
            
        # Sleep interval based on trading hours (10:00 - 16:00, Monday to Friday)
        from datetime import datetime
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Europe/Bucharest"))
        weekday = now.weekday()
        hour = now.hour
        
        # BVB is open from 10:00 to 16:00
        is_market_hours = (0 <= weekday <= 4) and (10 <= hour < 16)
        
        if is_market_hours:
            print("BVB Market is open. Next refresh in 60 seconds...", flush=True)
            time.sleep(60)
        else:
            print("BVB Market is closed. Next refresh in 30 minutes...", flush=True)
            time.sleep(1800)

# Start background thread
bg_thread = threading.Thread(target=update_data_thread, daemon=True)
bg_thread.start()


# API endpoints
@app.route('/api/portfolio', methods=['GET'])
def get_portfolio():
    import json
    import os
    if not os.path.exists(PORTFOLIO_FILE):
        return jsonify([])
    try:
        with open(PORTFOLIO_FILE, 'r') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception:
        return jsonify([])

@app.route('/api/portfolio', methods=['POST'])
def save_portfolio():
    from flask import request
    import json
    import os
    try:
        data = request.json
        if not isinstance(data, list):
            return jsonify({"success": False, "error": "Format invalid."}), 400
        os.makedirs(os.path.dirname(PORTFOLIO_FILE), exist_ok=True)
        with open(PORTFOLIO_FILE, 'w') as f:
            json.dump(data, f, indent=4)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

REALIZED_FILE = 'data/realized.json'

@app.route('/api/realized', methods=['GET'])
def get_realized():
    import json
    import os
    if not os.path.exists(REALIZED_FILE):
        return jsonify([])
    try:
        with open(REALIZED_FILE, 'r') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception:
        return jsonify([])

@app.route('/api/realized', methods=['POST'])
def save_realized():
    from flask import request
    import json
    import os
    try:
        data = request.json
        if not isinstance(data, list):
            return jsonify({"success": False, "error": "Format invalid."}), 400
        os.makedirs(os.path.dirname(REALIZED_FILE), exist_ok=True)
        with open(REALIZED_FILE, 'w') as f:
            json.dump(data, f, indent=4)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/stocks', methods=['GET'])
def get_stocks():
    return jsonify({
        "stocks": list(DATA_CACHE["stocks"].values()),
        "last_updated": DATA_CACHE["last_updated"],
        "status": DATA_CACHE["status"]
    })

@app.route('/api/stocks/search', methods=['GET'])
def search_stocks():
    from flask import request
    import json
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify([])
        
    url = 'https://www.bvb.ro/proxyshld.aspx/GetInstrumentsList'
    headers = {
        'Content-Type': 'application/json',
        'User-Agent': BVB_HEADERS.get('User-Agent', 'Mozilla/5.0')
    }
    body = {"searchtext": query}
    
    try:
        res = requests.post(url, data=json.dumps(body), headers=headers, verify=False, timeout=5)
        if res.status_code == 200:
            data = res.json()
            results = []
            for item in data.get('d', []):
                symbol = item.get('Symbol', '').upper().strip()
                status = item.get('Status', '')
                name = item.get('Name', '')
                
                # Exclude delisted instruments ('D' status)
                if status == 'D':
                    continue
                
                # Filter out turbos, certificates, rights and warrants unless exact match
                # Standard symbols are usually 2 to 8 alphanumeric characters
                if not symbol or not symbol.isalnum() or len(symbol) > 8:
                    if symbol != query.upper():
                        continue
                
                results.append({
                    "symbol": symbol,
                    "name": name
                })
            return jsonify(results)
    except Exception as e:
        print(f"Error searching BVB: {e}")
        
    return jsonify([])


@app.route('/api/stocks/add/<symbol>', methods=['POST', 'GET'])
def add_custom_stock(symbol):
    symbol = symbol.upper().strip()
    
    if symbol in DATA_CACHE["stocks"]:
        return jsonify({
            "success": True, 
            "message": "Simbolul există deja.", 
            "stock": DATA_CACHE["stocks"][symbol]
        })
        
    print(f"Dynamically adding custom stock: {symbol}...")
    bvb_data = parse_bvb_metrics(symbol)
    
    yahoo_symbol = f"{symbol}.RO"
    history, tech = get_yahoo_data(symbol, yahoo_symbol, force_refresh=True)
    
    if not history and (not bvb_data or bvb_data["price"] == 0.0):
        return jsonify({
            "success": False, 
            "error": f"Simbolul {symbol} nu a fost găsit pe BVB sau Yahoo Finance."
        }), 404
        
    name = bvb_data["name"] if (bvb_data and bvb_data.get("name")) else symbol
    
    if not bvb_data:
        bvb_data = {
            "name": name,
            "price": history[-1]["close"] if history else 0.0,
            "variation": "0.00%",
            "market_cap": 0,
            "pe": 0.0,
            "pb": 0.0,
            "eps": 0.0,
            "div_yield": 0.0,
            "beta": 1.0
        }
    elif bvb_data["price"] == 0.0 and history:
        bvb_data["price"] = history[-1]["close"]
        
    if not tech:
        tech = {
            "ma50": bvb_data["price"],
            "ma200": bvb_data["price"],
            "rsi": 50.0,
            "macd": 0.0,
            "macd_signal": 0.0,
            "macd_hist": 0.0,
            "ytd_return": 0.0,
            "tech_signal": "HOLD"
        }
        
    TICKERS[symbol] = {"name": name, "yahoo": yahoo_symbol}
    
    new_stock = build_stock_object(symbol, name, bvb_data, tech, history)
    
    DATA_CACHE["stocks"][symbol] = new_stock
    
    try:
        DATA_CACHE["recommendations"] = calculate_recommendations(DATA_CACHE["stocks"])
    except Exception as e:
        print(f"Error recalculating recommendations after adding {symbol}: {e}")
        
    return jsonify({
        "success": True,
        "message": f"Simbolul {symbol} a fost adăugat cu succes.",
        "stock": new_stock
    })

@app.route('/api/stocks/remove/<symbol>', methods=['POST', 'DELETE'])
def remove_custom_stock(symbol):
    global TICKERS
    symbol = symbol.upper().strip()
    
    if symbol in TICKERS:
        del TICKERS[symbol]
        
    if symbol in DATA_CACHE["stocks"]:
        del DATA_CACHE["stocks"][symbol]
        
    # Check if watchlist is now completely empty
    if len(DATA_CACHE["stocks"]) == 0:
        print("Watchlist is completely empty. Automatically resetting to default BVB stocks...")
        TICKERS = get_initial_watchlist()
        
        def run_immediate_update():
            perform_update_cycle(force_refresh=True)
                
        threading.Thread(target=run_immediate_update, daemon=True).start()
        
        return jsonify({
            "success": True,
            "reset_triggered": True,
            "message": "Watchlist-ul a fost golit. Se auto-populează cu activele implicite..."
        })
        
    try:
        DATA_CACHE["recommendations"] = calculate_recommendations(DATA_CACHE["stocks"])
    except Exception as e:
        print(f"Error recalculating recommendations after removing {symbol}: {e}")
        
    return jsonify({
        "success": True,
        "reset_triggered": False,
        "message": f"Simbolul {symbol} a fost eliminat cu succes."
    })
@app.route('/api/stocks/clear', methods=['POST'])
def clear_stocks():
    global TICKERS
    TICKERS = {}
    DATA_CACHE["stocks"] = {}
    DATA_CACHE["recommendations"] = {
        "short_term": [],
        "medium_term": [],
        "long_term": [],
        "sell_short_term": [],
        "sell_medium_term": [],
        "sell_long_term": [],
        "all_recommendations": []
    }
    import time
    DATA_CACHE["last_updated"] = int(time.time())
    return jsonify({
        "success": True,
        "message": "Watchlist-ul a fost golit complet."
    })

@app.route('/api/stocks/reset', methods=['POST'])
def reset_stocks():
    global TICKERS
    TICKERS = get_initial_watchlist()
    
    def run_immediate_update():
        print("Running immediate database rebuild after reset...")
        perform_update_cycle(force_refresh=True)
            
    threading.Thread(target=run_immediate_update, daemon=True).start()
    
    return jsonify({
        "success": True,
        "message": "Resetarea a fost inițiată. Datele se reîncarcă în fundal."
    })

@app.route('/api/stocks/refresh', methods=['POST'])
def force_refresh_stocks():
    if DATA_CACHE["status"] == "Updating":
        return jsonify({"success": True, "message": "Actualizarea este deja în curs."})
        
    def run_force_update():
        print("Starting forced background update...")
        perform_update_cycle(force_refresh=True)
            
    threading.Thread(target=run_force_update, daemon=True).start()
    return jsonify({"success": True, "message": "Sincronizarea cu BVB a fost inițiată în fundal."})


def analyze_sentiment(title):
    """Simple rule-based sentiment analysis for Romanian financial news titles."""
    title_lower = title.lower()
    
    pos_keywords = [
        'crește', 'crestere', 'creșteri', 'creste', 'profit', 'avans', 'avansează', 
        'avanseaza', 'record', 'plus', 'depășește', 'depaseste', 'dividend', 
        'dividende', 'distribuie', 'achiziție', 'achizitie', 'succes', 'extinde', 
        'apreciază', 'apreciaza', 'creşteri', 'creştere', 'creşte', 'apreciere',
        'urcă', 'urca', 'boom', 'raliu', 'rallies', 'excedent', 'extindere', 
        'dublat', 'dublează', 'dubleaza', 'triplează', 'tripleaza', 'suprascris', 
        'majorat', 'majorare', 'randament', 'venituri', 'cifră de afaceri', 
        'cifra de afaceri', 'ebitda', 'venit', 'alocă', 'aloca', 'achiziționează', 
        'achizitioneaza', 'parteneriat', 'nou record', 'verde', 'investeşte', 
        'investeste', 'investiție', 'investitie', 'optimism', 'bullish', 'lider'
    ]
    
    neg_keywords = [
        'scade', 'scadere', 'scăderi', 'scaderi', 'pierdere', 'pierderi', 'minus', 
        'datorie', 'datorii', 'prăbușește', 'prabuseste', 'corecție', 'corectie', 
        'declin', 'involuție', 'involutie', 'amendă', 'amenda', 'pierde', 'deficit', 
        'criză', 'criza', 'prăbuşire', 'prabusire', 'coboară', 'coboara', 
        'depreciere', 'depreciază', 'depreciaza', 'prăbuşit', 'prabusit', 
        'scăzut', 'scazut', 'retragere', 'pauză', 'pauza', 'litigiu', 'dosar', 
        'inculpat', 'penalități', 'penalitati', 'sancțiune', 'sanctiune', 
        'suspendare', 'suspendat', 'restrângere', 'restrangere', 'concedieri', 
        'concediază', 'concediaza', 'insolvență', 'insolventa', 'faliment', 
        'blocat', 'blocaj', 'bearish', 'pesimism', 'reducere'
    ]
    
    pos_count = sum(1 for word in pos_keywords if word in title_lower)
    neg_count = sum(1 for word in neg_keywords if word in title_lower)
    
    if pos_count > neg_count:
        return "positive"
    elif neg_count > pos_count:
        return "negative"
    else:
        return "neutral"


NEWS_CACHE = {} # {symbol: {"timestamp": float, "news": list}}

@app.route('/api/news/<symbol>', methods=['GET'])
def get_symbol_news(symbol):
    global NEWS_CACHE
    import xml.etree.ElementTree as ET
    import re
    import email.utils
    symbol = symbol.upper().strip()
    if symbol not in TICKERS:
        return jsonify({"error": "Symbol not found"}), 404
        
    now = time.time()
    # Cache news for 1 hour (3600 seconds)
    if symbol in NEWS_CACHE and (now - NEWS_CACHE[symbol]["timestamp"]) < 3600:
        return jsonify(NEWS_CACHE[symbol]["news"])
        
    company_name = TICKERS[symbol]["name"]
    
    # Clean company name to remove S.A., SA, N.V., S.R.L. etc.
    company_clean = company_name.upper()
    for suffix in [" S.A.", " SA", " N.V.", " NV", " S.R.L.", " SRL", " S.P.A.", " SPA", " GROUP", " GRUP"]:
        if company_clean.endswith(suffix):
            company_clean = company_clean[:-len(suffix)]
    for prefix in ["S.N.G.N. ", "S.N.T.G.N. ", "C.N.T.E.E. ", "S.N. ", "C.N. "]:
        if company_clean.startswith(prefix):
            company_clean = company_clean[len(prefix):]
    company_clean = company_clean.strip()
    
    # Refined search query: if symbol is too short (less than 3 chars), search only by cleaned name
    if len(symbol) < 3:
        query = f'"{company_clean}" AND (bursa OR BVB OR actiuni)'
    elif symbol == "REIT":
        # Special case for REIT to avoid generic Real Estate Investment Trust articles
        query = '("Star Invest Imobiliare" OR "Star Residence Invest" OR "Star Residence") AND (bursa OR BVB OR actiuni)'
    else:
        query = f'("{company_clean}" OR {symbol}) AND (bursa OR BVB OR actiuni)'
        
    url = f"https://news.google.com/rss/search?q={requests.utils.quote(query)}&hl=ro&gl=RO&ceid=RO:ro"
    
    try:
        res = requests.get(url, headers=BVB_HEADERS, verify=False, timeout=8)
        if res.status_code != 200:
            if symbol in NEWS_CACHE:
                return jsonify(NEWS_CACHE[symbol]["news"])
            return jsonify([])
            
        root = ET.fromstring(res.text)
        news_items = []
        
        # Regex to validate symbol as a whole word in the title
        symbol_pattern = re.compile(rf'\b{symbol}\b', re.IGNORECASE)
        
        for item in root.findall('.//item'):
            title_full = item.find('title').text or ""
            link = item.find('link').text or ""
            pub_date = item.find('pubDate').text or ""
            
            # Filter out old articles based on years in URL or title (2010 to 2024)
            # Since the current year is 2026, years <= 2024 are outdated
            has_old_year_url = bool(re.search(r'/(201\d|202[0-4])([0-1]\d[0-3]\d)?/|[-_/](201\d|202[0-4])([0-1]\d[0-3]\d)?[-_./]', link))
            has_old_year_title = bool(re.search(r'\b(201\d|202[0-4])\b', title_full))
            
            if has_old_year_url or has_old_year_title:
                continue # Skip old historical news
                
            # Validation: Title must contain either the cleaned company name or the symbol as a whole word
            has_name = company_clean.lower() in title_full.lower()
            has_symbol = bool(symbol_pattern.search(title_full))
            
            # Additional validation to prevent false positives
            if symbol == "REIT":
                is_valid = ("star invest" in title_full.lower()) or ("star residence" in title_full.lower())
            elif len(symbol) < 3:
                is_valid = has_name or (f" {symbol} " in f" {title_full.upper()} ")
            else:
                is_valid = has_name or has_symbol
                
            if not is_valid:
                continue # Skip ambiguous or unrelated articles
                
            source = "Știri BVB"
            title = title_full
            if " - " in title_full:
                parts = title_full.rsplit(" - ", 1)
                title = parts[0]
                source = parts[1]
                
            formatted_date = pub_date
            dt = None
            try:
                if ',' in pub_date:
                    date_part = pub_date.split(',', 1)[1].strip()
                    formatted_date = " ".join(date_part.split()[:3])
                dt = email.utils.parsedate_to_datetime(pub_date)
            except Exception:
                pass
                
            sentiment = analyze_sentiment(title)
            
            news_items.append({
                "title": title,
                "link": link,
                "source": source,
                "date": formatted_date,
                "timestamp": dt.timestamp() if dt else 0,
                "sentiment": sentiment
            })
            
        # Sort chronologically (newest to oldest)
        news_items.sort(key=lambda x: x["timestamp"], reverse=True)
        
        # Limit to top 8 articles after sorting
        news_items = news_items[:8]
        
        NEWS_CACHE[symbol] = {
            "timestamp": now,
            "news": news_items
        }
        return jsonify(news_items)
    except Exception as e:
        print(f"Error fetching news for {symbol}: {e}")
        if symbol in NEWS_CACHE:
            return jsonify(NEWS_CACHE[symbol]["news"])
        return jsonify([])


@app.route('/api/recommendations', methods=['GET'])
def get_recommendations():
    return jsonify(DATA_CACHE["recommendations"])

@app.route('/api/stocks/<symbol>/chart', methods=['GET'])
def get_symbol_chart(symbol):
    symbol = symbol.upper()
    if symbol not in TICKERS:
        return jsonify({"error": "Symbol not found"}), 404
        
    yahoo_symbol = TICKERS[symbol]["yahoo"]
    history, _ = get_yahoo_data(symbol, yahoo_symbol, force_refresh=False)
    if not history:
        return jsonify({"error": "Failed to fetch history"}), 500
        
    return jsonify({
        "symbol": symbol,
        "name": TICKERS[symbol]["name"],
        "chart": history
    })

# Serve Frontend
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        response = send_from_directory(app.static_folder, path)
        if 'manifest.json' in path:
            response.headers['Content-Type'] = 'application/manifest+json'
        elif 'sw.js' in path:
            response.headers['Content-Type'] = 'application/javascript'
            response.headers['Service-Worker-Allowed'] = '/'
        return response
    else:
        return send_from_directory(app.static_folder, 'index.html')


DATA_DIR = "/app/data"
os.makedirs(DATA_DIR, exist_ok=True)
ALERTS_FILE = os.path.join(DATA_DIR, "alerts.json")
TELEGRAM_FILE = os.path.join(DATA_DIR, "telegram.json")
ALERT_HISTORY_FILE = os.path.join(DATA_DIR, "alert_history.json")

def load_alerts():
    if os.path.exists(ALERTS_FILE):
        try:
            with open(ALERTS_FILE, "r") as f:
                return json.load(f)
        except:
            return []
    return []

def save_alerts(alerts):
    with open(ALERTS_FILE, "w") as f:
        json.dump(alerts, f, indent=2)

def load_alert_history():
    if os.path.exists(ALERT_HISTORY_FILE):
        try:
            with open(ALERT_HISTORY_FILE, "r") as f:
                return json.load(f)
        except:
            return []
    return []

ALERT_LOCK = threading.RLock()

def log_triggered_alert(record):
    with ALERT_LOCK:
        try:
            history = load_alert_history()
            rec_id = str(record.get("id", ""))
            
            # Skip if this exact alert ID was already logged
            if rec_id:
                for h in history:
                    if str(h.get("id", "")) == rec_id:
                        return True # Already in history
            
            history.insert(0, record)
            history = history[:100] # Keep last 100 triggered alerts
            with open(ALERT_HISTORY_FILE, "w") as f:
                json.dump(history, f, indent=2)
            print(f"Logged triggered alert for {record.get('symbol')} into history.", flush=True)
            return True
        except Exception as e:
            print("Failed to log triggered alert:", e, flush=True)
            return False

def get_telegram_config():
    if os.path.exists(TELEGRAM_FILE):
        try:
            with open(TELEGRAM_FILE, "r") as f:
                return json.load(f)
        except:
            return {}
    return {}

@app.route('/api/telegram', methods=['GET'])
def api_get_telegram():
    return jsonify(get_telegram_config())

@app.route('/api/telegram', methods=['POST'])
def api_save_telegram():
    data = request.json or {}
    token = (data.get("token") or "").strip()
    chat_id = (data.get("chat_id") or "").strip()
    config = {"token": token, "chat_id": chat_id}
    with open(TELEGRAM_FILE, "w") as f:
        json.dump(config, f, indent=2)
    return jsonify({"status": "ok", "config": config})

@app.route('/api/telegram/test', methods=['POST'])
def api_test_telegram():
    data = request.json or {}
    token = data.get("token") or get_telegram_config().get("token")
    chat_id = data.get("chat_id") or get_telegram_config().get("chat_id")
    
    if not token or not chat_id:
        return jsonify({"status": "error", "message": "Bot Token și Chat ID sunt obligatorii!"}), 400
        
    from datetime import datetime
    from zoneinfo import ZoneInfo
    now_str = datetime.now(ZoneInfo("Europe/Bucharest")).strftime("%d.%m.%Y %H:%M:%S")
    msg = (
        f"🧪 *TEST CONEXIUNE TELEGRAM* 🧪\n\n"
        f"✅ Conexiunea dintre *BVB Trading Dashboard* și botul tău Telegram funcționează cu succes!\n\n"
        f"🕒 _Trimis la: {now_str}_"
    )
    tg_url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        resp = requests.post(tg_url, json={"chat_id": chat_id, "text": msg, "parse_mode": "Markdown"}, timeout=5)
        if resp.status_code == 200:
            return jsonify({"status": "ok", "message": "Mesajul de test a fost trimis cu succes pe Telegram!"})
        else:
            return jsonify({"status": "error", "message": f"Eroare Telegram ({resp.status_code}): {resp.text}"}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": f"Excepție la trimiterea mesajului: {str(e)}"}), 500

@app.route('/api/alerts/history', methods=['GET'])
def api_get_alert_history():
    return jsonify(load_alert_history())

@app.route('/api/alerts', methods=['GET'])
def api_get_alerts():
    alerts = load_alerts()
    # Ensure all alerts have an ID for frontend management
    updated = False
    for a in alerts:
        if 'id' not in a:
            a['id'] = str(time.time()) + str(hash(a.get('symbol', '')))
            updated = True
    if updated:
        save_alerts(alerts)
    return jsonify(alerts)

@app.route('/api/alerts', methods=['POST'])
def api_save_alerts():
    alerts = request.json
    save_alerts(alerts)
    return jsonify({"status": "ok"})

@app.route('/api/alerts/<alert_id>', methods=['PUT'])
def api_update_alert(alert_id):
    alerts = load_alerts()
    updated_alert = request.json
    for i, a in enumerate(alerts):
        if str(a.get('id', '')) == str(alert_id) or str(a.get('timestamp', '')) == str(alert_id):
            updated_alert['id'] = alert_id # preserve ID
            alerts[i] = updated_alert
            save_alerts(alerts)
            return jsonify({"status": "ok", "alert": updated_alert})
    return jsonify({"status": "error", "message": "Alert not found"}), 404

@app.route('/api/alerts/<alert_id>', methods=['DELETE'])
def api_delete_alert(alert_id):
    alerts = load_alerts()
    alerts = [a for a in alerts if str(a.get('id', '')) != str(alert_id) and str(a.get('timestamp', '')) != str(alert_id)]
    save_alerts(alerts)
    return jsonify({"status": "ok"})


def check_alerts_backend():
    print("Running check_alerts_backend()...", flush=True)
    with ALERT_LOCK:
        try:
            alerts = load_alerts()
            if not alerts:
                print("No alerts to check.", flush=True)
                return
                
            tg_config = get_telegram_config()
            tg_token = tg_config.get("token")
            tg_chat_id = tg_config.get("chat_id")
            
            triggered_any = False
            remaining_alerts = []
            
            from datetime import datetime
            from zoneinfo import ZoneInfo
            
            history = load_alert_history()
            
            for alert in list(alerts):
                alert_id = str(alert.get("id", ""))
                sym = alert.get("symbol")
                target = float(alert.get("target", 0))
                
                # Deduplication pre-check against alert_history by unique ID only
                already_triggered = False
                for h in history:
                    if alert_id and str(h.get("id", "")) == alert_id:
                        already_triggered = True
                        break
                
                if already_triggered:
                    print(f"Purging already-triggered alert for {sym} target {target} (ID {alert_id})", flush=True)
                    triggered_any = True
                    continue
                
                # Determine alert type (buy/sell) with backward compatibility
                alert_type = alert.get("type")
                if not alert_type:
                    direction = alert.get("direction", "up")
                    alert_type = "buy" if direction == "down" else "sell"
                
                # Find current price from cache or fetch live
                current_price = None
                if "stocks" in DATA_CACHE and sym in DATA_CACHE["stocks"]:
                    current_price = DATA_CACHE["stocks"][sym].get("price")
                
                if current_price is None or current_price == 0.0:
                    bvb_data = parse_bvb_metrics(sym)
                    if bvb_data and bvb_data.get("price"):
                        current_price = bvb_data.get("price")
                    
                if current_price and current_price > 0:
                    alert_triggered = False
                    if alert_type == "buy" and current_price <= target:
                        alert_triggered = True
                    elif alert_type == "sell" and current_price >= target:
                        alert_triggered = True
                    
                    if alert_triggered:
                        print(f"TRIGGERED: {sym} at {current_price} (Target: {target} {alert_type})", flush=True)
                        sent_success = False
                        
                        if tg_token and tg_chat_id:
                            action_label = "CUMPĂRĂ 🟢" if alert_type == "buy" else "VINDE (TAKE PROFIT) 🔴"
                            pct_diff = round(((current_price - target) / target) * 100, 2)
                            pct_str = f"+{pct_diff}%" if pct_diff > 0 else f"{pct_diff}%"
                            now_str = datetime.now(ZoneInfo("Europe/Bucharest")).strftime("%d.%m.%Y %H:%M")
                            
                            msg = (
                                f"🚨 *ALERTĂ DE PREȚ BVB* 🚨\n\n"
                                f"📈 Acțiune: *{sym}*\n"
                                f"🎯 Țintă setată: *{target:.4f} RON* ({alert_type.upper()})\n"
                                f"📊 Preț curent: *{current_price:.4f} RON* ({pct_str})\n\n"
                                f"👉 Recomandare: *{action_label}*\n"
                                f"🕒 Data/Ora: _{now_str}_\n\n"
                                f"🔗 [Deschide BVB Dashboard](https://cozlas3n3.home.ro)"
                            )
                            tg_url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
                            try:
                                resp = requests.post(tg_url, json={"chat_id": tg_chat_id, "text": msg, "parse_mode": "Markdown", "disable_web_page_preview": True}, timeout=5)
                                if resp.status_code == 200:
                                    print("Telegram alert sent successfully!", flush=True)
                                    sent_success = True
                                else:
                                    print(f"Telegram API returned status {resp.status_code}: {resp.text}. Retrying plain text...", flush=True)
                                    # Fallback to plain text if Markdown parsing fails
                                    resp_plain = requests.post(tg_url, json={"chat_id": tg_chat_id, "text": msg, "disable_web_page_preview": True}, timeout=5)
                                    if resp_plain.status_code == 200:
                                        print("Telegram plain text alert sent successfully!", flush=True)
                                        sent_success = True
                                    else:
                                        print(f"Telegram plain text API returned status {resp_plain.status_code}: {resp_plain.text}", flush=True)
                            except Exception as e:
                                print("Telegram send exception:", e, flush=True)
                        else:
                            print("Telegram config missing or invalid!", flush=True)
                        
                        if sent_success or not (tg_token and tg_chat_id):
                            log_triggered_alert({
                                "id": alert_id or str(time.time()),
                                "symbol": sym,
                                "target": target,
                                "type": alert_type,
                                "triggered_price": current_price,
                                "triggered_at": datetime.now(ZoneInfo("Europe/Bucharest")).strftime("%Y-%m-%d %H:%M:%S"),
                                "status": "Sent" if sent_success else "No Telegram Config"
                            })
                            triggered_any = True
                            # Alert is removed by not adding to remaining_alerts
                        else:
                            print(f"Keeping alert for {sym} to retry delivery later due to Telegram error.", flush=True)
                            remaining_alerts.append(alert)
                    else:
                        remaining_alerts.append(alert)
                else:
                    remaining_alerts.append(alert)
                
            if triggered_any:
                print("Saving remaining active alerts...", flush=True)
                save_alerts(remaining_alerts)
        except Exception as e:
            print("Backend alert check error:", e, flush=True)

# -----------------------------------

if __name__ == '__main__':
    # debug=True enables Werkzeug's auto-reloader, which re-executes this whole module
    # in a second process. Since bg_thread.start() above runs at import time, that spawned
    # a second, independent background scraping/update/Telegram loop - doubling BVB/Yahoo
    # load and duplicating Telegram alerts. Also disables the interactive debugger, which
    # would otherwise expose remote code execution on this internet-facing app.
    app.run(host='0.0.0.0', port=5050, debug=False)
