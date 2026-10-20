# Roadmap

Ideen für die Weiterentwicklung, noch nicht beschlossen. Reihenfolge innerhalb der Abschnitte nach
geschätztem Nutzen. Umsetzung wie immer test-first nach `CLAUDE.md`.

## Grössere Features

- [ ] **Installierbar und offline (PWA).** Manifest und Service Worker, der alle App-Dateien vorhält.
  Bringt kontrollierte Updates ("Neue Version verfügbar, neu laden") statt Cache-Mix, Nutzung ohne Empfang
  und schützt auf dem iPhone vor der 7-Tage-Löschregel von Safari. Hinweis: Die Originalversion hatte
  PWA-Dateien, die der Autor wieder entfernt hat (`576a086`, `289469c`). Grund vorher klären.
- [ ] **Werte als Variablen in Formeln.** Pro Profil Werte wie `STR = 3` oder `Übung = 2` definieren und in
  Formeln nutzen (`1w20+STR+Übung`). Beim Stufenaufstieg nur den Wert ändern.
- [ ] **Lebenspunkte und Ressourcen.** Pro Profil frei benannte Zähler mit + und − (LP, Zauberplätze,
  Munition, Glückspunkte).
- [ ] **Profil teilen per Link oder QR-Code.** Profil komprimiert im Link, Öffnen importiert es. Ohne Server,
  z. B. für NPC-Sets der Spielleitung oder den Wechsel vom Handy aufs Tablet.

## Kleinere Ergänzungen

- [ ] **Gruppen im Profil.** Funktionen unter Überschriften wie "Waffen", "Zauber" oder "Proben" ordnen.
- [ ] **Mehrfachangriff.** Einen Angriff mehrmals auf einmal würfeln, alle Ergebnisse im selben Fenster.
- [ ] **Profil duplizieren.** Profil als Vorlage kopieren.
- [ ] **Reihenfolge der Profile** auf der Startseite per Ziehen ändern, wie bei den Funktionen.
- [ ] **Vibration beim Würfeln** auf Android (`navigator.vibrate`), abschaltbar.
- [ ] **Schalter für "Bildschirm anlassen".** Heute immer aktiv, solange die App sichtbar ist.
- [ ] **Verschieben per Tastatur.** Drag-and-Drop im Bearbeiten-Modus geht nur mit Finger oder Maus.

## Abhängig vom Spielsystem

- [ ] **Vorteil und Nachteil (D&D 5e).** Zwei W20 würfeln, der höhere bzw. niedrigere zählt. Kann bei jedem
  Wurf vorkommen, gehört also nicht in die Formel (sonst bräuchte jede Funktion drei Varianten). Umsetzung
  offen. Eine frühere Formel-Schreibweise (`2w20h`, `4w6h3`) wurde deshalb wieder entfernt.
- [ ] **Kritischer Schaden.** Bei natürlicher 20 im Angriff die Schadenswürfel verdoppeln (D&D), als Option
  pro Angriff.
- [ ] **DSA-Probe.** 3W20 gegen drei Eigenschaftswerte samt Talentwert, Auswertung "gelungen,
  Qualitätsstufe X".
- [ ] **Explodierende Würfel.** `3w6!`: bei Höchstwert erneut würfeln und addieren (Savage Worlds und
  ähnliche Systeme).

## Qualität und Technik

- [ ] **Visuelle Regressionstests.** Screenshots der wichtigsten Bildschirme in Handy-, Tablet- und
  Laptop-Grösse mit Referenzbildern vergleichen (`toHaveScreenshot`). Hätte die verzerrten Header-Icons und
  den verrutschten Titel automatisch gefunden.
- [ ] **Barrierefreiheits-Check** mit axe in den Browser-Tests.
- [ ] **Dependabot** für Playwright und die GitHub Actions.
