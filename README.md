Eine einfache Pen and Paper Würfel-App die online unter https://misut13.github.io/DiceForge/
verfügbar ist. Man kann Profile für seine Spielecharakter erstellen und diesen verschiedene Funktionen hinzufügen.

## Formeln

| Formel | Bedeutung |
|---|---|
| `3w6+3` | drei W6 plus 3 (`d` statt `w` geht auch) |
| `3w6+3+2w6-2` | beliebig kombinierbar, maximal 100 Würfel pro Teil |
| `2w20h+5` | Vorteil: zwei W20, der höhere zählt |
| `2w20n+5` | Nachteil: zwei W20, der niedrigere zählt |
| `4w6h3` | die besten 3 von 4 W6 (auch `kh3` / `kl3`) |

Eine natürliche 20 oder 1 auf einem W20 wird im Ergebnis hervorgehoben.

## Bedienung

Im Profil würfelt ein Tipp auf eine Karte. Wer will, blendet in den Einstellungen unten ein Feld ein,
um eine Formel frei zu würfeln, ohne sie zu speichern.
Über das Zahnrad: Funktionen und Würfel hinzufügen, bearbeiten oder löschen, das Profil umbenennen sowie
Animation, Sound und den freien Wurf ein- und ausschalten. Im Bearbeiten-Modus lassen sich Einträge am ☰ an
eine andere Position ziehen.
Solange die App offen ist, bleibt der Bildschirm an.

## Daten

Profile liegen nur im Browser (localStorage). Über "Exportieren" auf der Startseite lässt sich eine
JSON-Sicherung herunterladen und mit "Importieren" wieder einspielen. Safari löscht die Daten von
Websites, die 7 Tage nicht benutzt wurden, deshalb regelmässig exportieren.

## Entwicklung

Kein Build nötig. `model.js` enthält die Würfel- und Datenlogik ohne DOM, `app.js` die Oberfläche.
Regeln für die Weiterentwicklung (Test-first, Datenkompatibilität, Layout) stehen in `CLAUDE.md`.

```sh
npm install          # nur Testwerkzeuge, die App selbst hat keine Abhängigkeiten
npm test             # Unit-Tests der Würfellogik
npm run test:e2e     # Browser-Tests (Handy, iPhone/WebKit, Laptop)
npm run serve        # http://localhost:8000 (ES-Module laufen nicht über file://)
```
