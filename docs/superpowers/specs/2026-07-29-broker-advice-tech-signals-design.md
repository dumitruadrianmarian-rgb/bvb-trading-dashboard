# Sfatul Brokerului — Recomandări Dinamice pe Semnale Tehnice

## Context

Secțiunea "Sfatul Brokerului" din tab-ul Portofoliu (`Alocare Portofoliu`) afișează în prezent
un singur mesaj static, generat de `renderPortfolio()` în `static/script.js` (linia ~2592-2642):
verifică doar dacă un sector depășește 50% din valoarea portofoliului și afișează un text
pre-scris pentru 2-3 sectoare cunoscute, sau un mesaj generic de felicitare dacă portofoliul e
diversificat. Nu ia deloc în calcul date de piață (preț, RSI, semnale tehnice), deși aceste date
sunt deja disponibile client-side, per acțiune, în array-ul global `stocks` (populat din
`/api/stocks`, fiecare element are `technical.rsi` — vezi utilizarea existentă la linia 475 în
tabelul Watchlist).

Utilizatorul consideră secțiunea prea săracă și vrea recomandări dinamice, legate de mișcările
reale din piață, nu doar de alocarea statică pe sectoare.

## Scop

Extinde generarea sfatului din `renderPortfolio()` ca să combine:

1. Concentrarea pe sector (logica existentă, nemodificată).
2. Semnale tehnice RSI extreme pe deținerile curente din portofoliu (nou).

Fără schimbări de backend — `technical.rsi` e deja livrat de `/api/stocks` și disponibil în
variabila globală `stocks` din `script.js` în momentul în care `renderPortfolio()` rulează.

## Design

### Structura cardurilor

Fiecare "insight" e un obiect `{ severity, html }`. Se colectează toate insight-urile posibile,
se sortează, se afișează primele 3 ca listă verticală de carduri sub titlul secțiunii.

**Sector concentration card** (severitate fixă, cea mai mare — e un risc structural de
portofoliu, nu tactic): păstrează exact textul/logica actuală (pragul de 50%, cele 3 ramuri de
recomandare pentru Financiar-Bancar / Energie / generic), doar reîmpachetat ca un card din listă
în loc de singurul mesaj posibil.

**RSI extreme card** (unul per deținere cu RSI <30 sau >70): pentru fiecare item din
`enrichedItems`, caută `stock.technical.rsi` prin `stocks.find(s => s.symbol === item.symbol)`
(același pattern folosit deja la linia 2429 pentru variația zilnică). Dacă RSI e în afara
intervalului [30, 70], generează un card:

- **RSI > 70 (supracumpărat)**:
  - dacă `item.pl > 0`: sugerează concret luarea parțială a profitului ("ia în calcul
    securizarea parțială a câștigului").
  - dacă `item.pl <= 0`: avertizează asupra riscului de corecție tehnică, fără să sugereze
    vânzare în pierdere ("posibilă presiune de corecție pe termen scurt; nu există motiv tehnic
    să vinzi în pierdere doar din acest semnal").
- **RSI < 30 (supravândut)**: sugerează concret evaluarea unei achiziții suplimentare pentru
  medierea costului ("zonă tehnică de supravânzare; ai putea evalua o achiziție suplimentară
  pentru a media prețul de cost").

Fiecare card RSI conține: simbolul, valoarea RSI curentă (o zecimală), ponderea poziției în
portofoliu (`sharePercent`, deja calculat), textul de recomandare, și un tag vizibil
**"Educativ — nu constituie sfat financiar"** (stil mic, distinct, pe fiecare card RSI — cardul
de sector păstrează formularea actuală, care e deja despre alocare, nu despre tranzacționare
punctuală).

Severitate RSI (pentru sortare/cap): `Math.abs(rsi - 50)`, descrescător — cele mai extreme
citiri RSI apar primele dintre cardurile RSI. Tie-break: `sharePercent` descrescător (poziția
mai mare în portofoliu iese în față la egalitate).

### Compunere finală

```
insights = []
if (sector concentration triggered) insights.push({ severity: Infinity, html: sectorCardHtml })
for each holding with RSI extreme: insights.push({ severity: |rsi-50|, html: rsiCardHtml })
insights.sort by severity desc
insights.slice(0, 3)
```

Dacă `insights` e gol → păstrează mesajul actual "✨ Portofoliu bine diversificat!".
Dacă `enrichedItems.length === 0` → comportament neschimbat (secțiunea rămâne ascunsă).

### Ce NU se schimbă / nu intră în scop

- Nu se introduce prag de concentrare pe o singură acțiune (doar sector, ca acum).
- Nu se evidențiază mișcări zilnice mari (variație %) — doar RSI.
- Nu se adaugă alte semnale tehnice (MACD, medii mobile) — doar RSI, care e deja pragul folosit
  vizual în Watchlist, deci consistent cu restul aplicației.
- Fără endpoint nou de backend, fără fetch suplimentar.

## Testare

Verificare manuală live (Playwright, conform practicii din sesiunile anterioare):

1. Portofoliu cu o deținere având RSI simulat >70 și P&L pozitiv → cardul de profit-taking
   apare, cu tag educativ.
2. Portofoliu cu o deținere având RSI simulat <30 → cardul de achiziție suplimentară apare.
3. Portofoliu cu concentrare de sector >50% ȘI 2+ semnale RSI extreme → exact 3 carduri, sectorul
   primul, RSI-urile sortate după extremitate.
4. Portofoliu fără niciun semnal → mesajul "bine diversificat" neschimbat.
5. Verificare font/culori consistente cu restul aplicației (mono pentru cifre, `--font-mono`,
   culori `--color-emerald`/`--color-blue` ca în cardurile existente).

Nu necesită restart de container (doar `script.js`, bind-mount live). Bump cache-busting
`script.js?v=X.Y` în `index.html` la final.
