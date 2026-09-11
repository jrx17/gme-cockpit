# GME Cockpit

Privates Ein-Seiten-Dashboard zur GameStop-Aktie ($GME): Live-Kurs, Kursverlauf-Chart, News, eigene Positionen aus einem Google Sheet und eine kuratierte Link-Sammlung zu Themen, die für GME-Timing relevant sind (Short Interest, Insider-Trades, Sentiment).

Reines Frontend (HTML/CSS/JS), kein Server, kein Build-Schritt. Läuft als statische Seite z. B. über GitHub Pages.

## Setup (einmalig, direkt im Dashboard unter „Einstellungen“)

### 1. Passwort
Beim ersten Aufruf fragt die Seite nach einem neuen Passwort — das wird als Hash nur lokal im Browser gespeichert (`localStorage`). Es ist ein einfacher Besucherschutz, **keine echte Zugriffskontrolle**: Der Quelltext der Seite ist technisch weiter abrufbar, wer die URL kennt und im Quelltext nachsieht, kann den Client-Code lesen. Für echten Zugriffsschutz bräuchte es GitHub Pro/Team (private Pages) oder einen Dienst wie Cloudflare Access davor.

### 2. Live-Kurs (Finnhub — nötig, damit Kurs/Chart/News überhaupt funktionieren)
Ohne API-Key bleiben Kurs, Chart und News leer. Das ist bewusst so: Freie Kursquellen ohne Anmeldung (Stooq, Yahoo Finance) blockieren mittlerweile automatisierte Browser-Abfragen (Bot-Check bzw. keine CORS-Freigabe) — ein scheinbar funktionierender „Gratis-Fallback ohne Key“ wäre nur Fake-Verzögerung, die in der Praxis nicht lädt. Finnhub ist die einzige geprüft zuverlässige, kostenlose und aus dem Browser direkt abrufbare Quelle:

1. Kostenlosen Account auf [finnhub.io/register](https://finnhub.io/register) anlegen (keine Kreditkarte nötig, ca. 30 Sekunden).
2. API-Key aus dem Finnhub-Dashboard kopieren.
3. In GME Cockpit → Einstellungen → „Finnhub API-Key“ einfügen und speichern.

Mit Key gibt es: echten Live-Tick-Kurs per WebSocket, Tageshoch/-tief/Eröffnung, Marktkapitalisierung, nächsten Earnings-Termin und aktuelle News. Der Key wird nur in deinem Browser (`localStorage`) gespeichert, niemals im Code oder Repo.

Der Kursverlauf-Chart zeigt bewusst nur den Verlauf seit App-Start (live mitgeschrieben) statt einer historischen Kurve — Finnhubs Candle-Historie für US-Aktien ist im kostenlosen Tier nicht zuverlässig verfügbar, und ein Fallback darauf wäre wieder nur Fake.

### 3. Eigene Positionen (Google Sheet)
1. Google Sheet anlegen mit den Spalten: `Plattform | Stück | Kaufkurs | Kaufdatum` (Notiz-Spalte optional). Eine Zeile pro Kauf — mehrere Zeilen derselben Plattform werden automatisch zusammengerechnet.
2. Datei → Freigeben → **Im Web veröffentlichen** → als **CSV** veröffentlichen.
3. Den generierten Link (endet auf `output=csv`) in Einstellungen → „Google Sheet — CSV-Link“ einfügen.

Hinweis: Ein per „Im Web veröffentlichen“ freigegebenes Sheet ist über den (langen, nicht erratbaren) Link öffentlich abrufbar, taucht aber nicht in Google-Suchergebnissen auf und wird nirgends im Repo gespeichert.

### 4. Aktualisierungsintervall
Standard 15 Sekunden (Kennzahlen-Polling; der Live-Kurs selbst läuft per WebSocket-Tick, unabhängig vom Intervall).

## Datenquellen
- Kurs live: Finnhub WebSocket + REST (kostenloser Tier, geprüft CORS-fähig)
- Kursverlauf-Chart: live seit App-Start mitgeschriebene Kurse (kein historischer Fallback, siehe oben)
- News: Finnhub Company News (gleicher Key, keine zusätzliche Anmeldung nötig)
- Positionen: dein eigenes Google Sheet (CSV-Export, mit Proxy-Fallback falls der direkte Abruf blockiert wird)
- Themen & Quellen: kuratierte, statische Links (Fintel, SEC EDGAR, StockTwits, Reddit, offizielle IR)

## Deployment
Statische Seite, keine Secrets im Code. Kann direkt über GitHub Pages aus dem `main`-Branch ausgeliefert werden.
