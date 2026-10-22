# PHASE – Backlog

**Status: durch „Setze backlog um“ freigegeben und umgesetzt.**

Die Umsetzung der folgenden Anforderungen wurde ausdrücklich freigegeben. Neue Ergänzungen am Backlog sind weiterhin keine automatische Implementierungsfreigabe. Bedienung und Umsetzungsdetails stehen in `README.md`.

## Sequencer

- [x] **SEQ-01 – Step-Auswahl reparieren:** Laut Nutzer haben Shift + Klick und Rechtsklick derzeit keine Funktion. Beide sollen einen Step zum Bearbeiten auswählen, ohne den Trig umzuschalten.
- [x] **SEQ-02 – Unterschiedliche Schrittlängen:** Steps innerhalb desselben Tracks sollen unterschiedliche Längen haben können. Die jeweilige Länge muss im Sequencer erkennbar sein; derzeit sieht jeder Step wie ein 1/16-Step aus.
- [x] **SEQ-03 – Notenauswahl pro Step:** Noten je Step über eine verständliche Auswahl mit Notennamen einstellen können, statt über eine MIDI-Zahl.

## UI

- [x] **UI-01 – Größe bei normalem Browserzoom:** Elemente und insbesondere Texte bei 100 % so skalieren, dass ihre Größe der bisher als passend empfundenen Darstellung bei 110–120 % Browserzoom entspricht. Das bestehende Ziel, die Oberfläche ohne Seiten-Scrollleiste anzuzeigen, beibehalten.
- [x] **UI-02 – Workspace-Bar auflösen:** Die Workspace-Bar entfernen und ihre Buttons an geeigneten Stellen in die Topbar verschieben.

## Synthesizer

- [x] **SYN-01 – Oszillator-Visualisierungen:** Bei Subtractive und „Ring/FM“ pro Oszillator eine eigene Visualisierung direkt über dem jeweiligen Oszillator anzeigen.
- [x] **SYN-02 – Wavetable-Auswahl:** Insgesamt 32 auswählbare Wavetables aus acht verschiedenen Typen bereitstellen.
- [x] **SYN-03 – Granular-Sample-Auswahl:** Insgesamt 32 auswählbare Samples mit breiter, für unterschiedliche granulare Anwendungen geeigneter Variation bereitstellen.
- [x] **SYN-04 – Sampler-Bibliothek:** Jeweils vier Samples für jede der folgenden 16 Kategorien bereitstellen, insgesamt 64 Samples: Kick, Hat, Percussion, Tom, Ride, Shaker, Rimshot, Snare, FX, Chord, Lead, Bass, Acid, Piano, Stab und Pad.
- [x] **SYN-05 – FX-Reihenfolge:** Die Reihenfolge der vier Effekt-Slots veränderbar machen; die eingestellte Reihenfolge muss auch die Signalverarbeitung bestimmen.
- [x] **SYN-06 – Unison:** Unison je Track einstellbar machen.
- [x] **SYN-07 – FX deaktivieren:** Jeden Effekt-Slot einzeln deaktivieren beziehungsweise auf Bypass schalten können. Nachtrag des Nutzers zum Backlog.
- [x] **SYN-08 – Individuelle Effekt-Bedienung und Bilder:** Jede Effektvariante soll eigene, für den jeweiligen Effekt sinnvolle Parameter und ein eigenes passendes Bild beziehungsweise eine eigene Visualisierung bekommen. Das bisher überall gleiche Standardbild ersetzen.
- [x] **SYN-09 – LFO-Typen und Modi erweitern:** Zusätzlich zu den bisherigen LFO-Typen **exp**, **ramp** und **random** anbieten. Als zusätzliche Modi **hold**, **one** und **half** ergänzen.
- [x] **SYN-10 – Syntheseformen vertiefen:** Bei allen acht Syntheseformen zusätzliche Parameter ergänzen, wo sie musikalisch und technisch sinnvoll sind. Ziel ist mehr Klanggestaltungstiefe; laut Nutzer wirken die bisherigen Engines überwiegend wie Light-Varianten.

## Master FX

- [x] **MFX-01 – Eigener Arbeitsbereich:** Ein neues Register „Master FX“ neben „Synthesizer“ und „Sequencer“ ergänzen.
- [x] **MFX-02 – Master-Effekte und Drive:** Eine sinnvolle Auswahl an Master-Effekten sowie eine von Analog Heat MK II inspirierte Drive-Sektion mit verschiedenen Modi bereitstellen.
- [x] **MFX-03 – Umschaltbarer EQ:** Einen Band-EQ mit wählbarem 2-Band-, 3-Band- und 8-Band-Modus bereitstellen.

## Weiter geltende Projektvorgaben

- Keine Tests anlegen, schreiben oder ausführen; keine Test-Abhängigkeiten hinzufügen.
- Die bestehenden acht Tracks, drei LFOs je Track und das Keyboard mit vier Oktaven berücksichtigen.
- Neue offene Backlog-Punkte erst nach ausdrücklicher Aufforderung umsetzen.
