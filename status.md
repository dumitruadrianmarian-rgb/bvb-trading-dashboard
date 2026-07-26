# BVB Trading Dashboard - Status

## Istoric Acțiuni (22 Iulie 2026)
- **Take Profit (Sell) Alerts**: Am adăugat suport pentru alerte de tip "Sell" (Take Profit) în `app.py`. Backend-ul a fost actualizat (funcția `check_alerts_backend`) să verifice câmpul `type` din `alerts.json`. Acum se trimit mesaje către Telegram corecte pentru tipurile `buy` (când prețul scade sub target) și `sell` (când prețul crește peste target), păstrând compatibilitatea cu alertele mai vechi care foloseau câmpul `direction`.
- **API Endpoints pentru Alerte**: Au fost adăugate și îmbunătățite rutele API din `app.py` pentru a susține CRUD pe alerte: o nouă rută de DELETE (`/api/alerts/<alert_id>`), PUT și completarea ID-urilor lipsă pe apelurile de GET.
- **Interfață UI Management Alerte**:
  - Am adăugat o secțiune nouă de **Management Alerte Preț** în `index.html`, încorporând un design sleek, cu un card pentru adăugarea de noi alerte și un tabel interactiv pentru a lista alertele active.
  - S-au adăugat butoane noi în meniul de navigare (`sidebar` și `mobile-nav`).
  - S-au actualizat funcțiile JavaScript din `script.js` pentru a prelua, adăuga și șterge alertele direct din interfață, legându-se de noile endpoint-uri API, cu tot cu actualizarea observer-ului de intersecție pentru evidențierea secțiunii active în sidebar.

- **Flux Alerte Preț & Telegram Înnoit**:
  - **Execuție Continuă în Fundal**: Am rezolvat problema unde thread-ul de fundal oprea verificarea alertelor dacă nu exista activitate în browser mai mult de 15 minute. Acum, dacă există alerte active setate în `alerts.json`, backend-ul continuă să actualizeze cotațiile BVB și să verifice alertele în fundal, garantând livrarea pe Telegram chiar și când utilizatorul nu are tab-ul deschis.
  - **Protecție Pierdere Alerte (Safe Delivery)**: Alertele declanșate sunt șterse din lista activă *doar* dacă API-ul Telegram returnează răspuns afirmativ (`200 OK`). În caz de eroare temporară de rețea, alerta rămâne salvată pentru reîncercare ulterioară.
  - **Formatare Mesaj Rich & Istoric Alerte**: Mesajele de pe Telegram conțin acum diferența procentuală față de țintă, timestamp exact și link direct. Alertele declanșate se salvează automat în `data/alert_history.json` (ultimele 50).
  - **API & UI Telegram Config & Test**: Au fost adăugate endpoint-uri (`/api/telegram`, `/api/telegram/test`, `/api/alerts/history`) și o nouă secțiune în UI pentru salvarea credențialelor de bot și trimiterea unui mesaj de test instanțiat direct din consolă.
  - **Sincronizare Widget Alerte în Analiză Tehnică**: Am actualizat widget-ul de alerte din sidebar-ul secțiunii *Analiză Grafică & Indicatori Tehnici* (`index.html` și `script.js`). Acesta permite acum selectarea explicită a tipului de alertă (`BUY` / `SELL`), afișează badge-uri tridimensionale moderne pe fiecare alertă setată pentru acțiunea curentă și sincronizează instantaneu datele cu lista globală de pe server și Telegram.
- **Rezolvare Integrală RPI Dashboard Docker Container**:
  - 🎬 **Jellyfin Media Section**: Configurat `JELLYFIN_HOST` dinamic (`http://jellyfin:8096`). Toate colecțiile media (filme, seriale, piese audio, coperți și subtitrări VTT) funcționează impecabil din container.
  - 📜 **Loguri Sistem & Docker**: Adăugat binarul oficial static Docker CLI și montate jurnalele `/var/log/journal`. Toate logurile de sistem (`journalctl`) și logurile containerelor se încarcă și se transmit live.
  - 🔄 **Actualizări Sistem & Watchtower**: Execuția actualizărilor de sistem și a containerelor Watchtower funcționează direct în container fără blocurile `sudo`.
  - 📺 **Design Responsive Header (TV/Tablete)**: Ajustat `.main-header`, `.title-container` și `.header-actions` cu `flex-wrap: wrap` și `margin-left: auto`. Badge-ul `Online` și cele 5 butoane de acțiune nu se mai suprapun pe niciun ecran de televizor, tabletă sau telefon.

- **Configurare Origin Separat PWA cu DuckDNS & Let's Encrypt**:
  - Configurat Traefik cu resolver **DNS-01 DuckDNS** (`duckresolver`) folosind token-ul de utilizator.
  - Domeniul `cozla.duckdns.org` rutează acum spre `rpi-admin-dashboard` cu certificat Let's Encrypt valid.
  - Fișierele `manifest.json` și `sw.js` au fost actualizate la scopul root (`/`), permisiunile de acces au fost reglate (eliminat Basic Auth duplicat din Traefik deoarece aplicația are login propriu), permițând instalarea ca **două PWA-uri / WebAPK-uri native separate pe Android** (BVB pe `cozlas3n3.home.ro` și RPi pe `cozla.duckdns.org`).
- **Remediere Containerizare RPI Dashboard**:
  - 🚀 **Viteză Rețea în Timp Real**: Implementat `get_host_net_io()` pentru citirea `/proc/1/net/dev`, calculând precis traficul pe interfețele fizice gazdă (`wlan0`/`eth0`).
  - 📁 **Utilitar Încărcare/Ștergere Fișiere**: Montat volumul `- /home/pi:/home/pi:rw` direct în `compose.yml` pentru operare direct pe fișierele reale RPi.
  - 📲 **PWA Prompt Unic Nativ**: Eliminat bannerul custom `showPWABanner()` din JS pentru a lăsa doar bara nativă a browserului.
  - 🐳 **Control Containere & Script Update**: Înlocuit apelurile directe `subprocess.run(["sudo", ...])` cu `run_cmd`/`popen_cmd`, rezolvând erorile la citirea `updater_config.json`, comenzi docker și loguri.

## Stadiu Actual
Ambele aplicații rulează ca containere Docker native izolate în rețeaua `proxy` cu PWA-uri separate:
- 📈 **RoInvest Hub BVB**: `bvb-trading-dashboard` (Port 5050) -> `https://cozlas3n3.home.ro` (PWA Nativ 1)
- 🖥️ **RPI5 Command Center**: `rpi-admin-dashboard` (Port 5000) -> `https://cozla.duckdns.org` (PWA Nativ 2 via DuckDNS Let's Encrypt)

