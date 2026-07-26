# BVB Trading Dashboard

Dashboard personal pentru urmărirea acțiunilor de la Bursa de Valori București (BVB), cu recomandări automate de tranzacționare, tracking de portofoliu și alerte de preț trimise pe Telegram. Rulează ca aplicație web (Flask) și poate fi instalat ca PWA pe telefon.

## Funcționalități

- **Watchlist live** — preț, variație, capitalizare, PER, P/BV, EPS, randament dividend, obținute prin scraping direct de pe [bvb.ro](https://www.bvb.ro).
- **Indicatori tehnici** — MA50/MA200, RSI(14), MACD, randament YTD, calculați din istoricul zilnic preluat de pe Yahoo Finance.
- **Recomandări automate** — 3 sugestii de cumpărare și 3 de vânzare (termen scurt/mediu/lung), generate dintr-un scor combinat (RSI + MACD + valuare fundamentală + dividend).
- **Portofoliu & tranzacții realizate** — evidența pozițiilor deschise și a câștigurilor/pierderilor realizate.
- **Alerte de preț cu notificare pe Telegram** — alerte de tip `buy` (preț ≤ țintă) și `sell` (preț ≥ țintă), verificate continuu în fundal, cu istoric al alertelor declanșate.
- **Știri per simbol** — agregate din Google News RSS, cu analiză simplă de sentiment (pozitiv/negativ/neutru) pentru titluri în limba română.
- **PWA responsive** — instalabil pe telefon (`display: standalone`), optimizat pentru toate dimensiunile de ecran, cu suport `safe-area-inset` pentru notch/gesture bar.

## Stack tehnic

- **Backend**: Python 3, Flask, BeautifulSoup4 (scraping BVB), pandas/numpy (indicatori tehnici)
- **Date de piață**: scraping [bvb.ro](https://www.bvb.ro) + Yahoo Finance (`query1.finance.yahoo.com`)
- **Frontend**: HTML/CSS/JS static, fără framework, cu Service Worker (self-unregister) și `manifest.json`
- **Deploy**: Docker + docker compose, reverse proxy Traefik

## Rulare locală

```bash
docker compose up -d --build
```

Aplicația pornește pe portul `5050`. Fișierele din `static/` și `app.py` sunt montate ca bind mount, deci editările se reflectă live fără rebuild.

## Configurare Telegram

Alertele de preț trimit notificări printr-un bot Telegram. Configurarea se face din UI (secțiunea de alerte) sau direct în `data/telegram.json`:

```json
{
  "token": "<bot-token>",
  "chat_id": "<chat-id>"
}
```

Acest fișier, împreună cu restul stării din `data/` (portofoliu, alerte active, istoric), **nu este urmărit în git** (`.gitignore`) — conține date personale și un token secret.

## Structură

```
app.py              # backend Flask: scraping, indicatori, recomandări, alerte, API
static/              # frontend (index.html, style.css, script.js, PWA assets)
data/                # stare runtime (gitignored): portofoliu, alerte, config Telegram
compose.yml          # definiție Docker + rutare Traefik
```
