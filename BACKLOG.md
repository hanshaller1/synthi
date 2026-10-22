# PHASE – Backlog

**Status: nur aufgenommen, noch nicht zur Implementierung freigegeben.**

Diese Anforderungen werden erst umgesetzt, wenn der Nutzer ausdrücklich dazu auffordert. Ergänzungen am Backlog sind keine Freigabe zur Implementierung. Alle folgenden Punkte sind offen.

## Sequencer

- [ ] **SEQ-01 – Step-Auswahl reparieren:** Laut Nutzer haben Shift + Klick und Rechtsklick derzeit keine Funktion. Beide sollen einen Step zum Bearbeiten auswählen, ohne den Trig umzuschalten.
- [ ] **SEQ-02 – Unterschiedliche Schrittlängen:** Steps innerhalb desselben Tracks sollen unterschiedliche Längen haben können. Die jeweilige Länge muss im Sequencer erkennbar sein; derzeit sieht jeder Step wie ein 1/16-Step aus.
- [ ] **SEQ-03 – Notenauswahl pro Step:** Noten je Step über eine verständliche Auswahl mit Notennamen einstellen können, statt über eine MIDI-Zahl.

## UI

- [ ] **UI-01 – Größe bei normalem Browserzoom:** Elemente und insbesondere Texte bei 100 % so skalieren, dass ihre Größe der bisher als passend empfundenen Darstellung bei 110–120 % Browserzoom entspricht. Das bestehende Ziel, die Oberfläche ohne Seiten-Scrollleiste anzuzeigen, beibehalten.
- [ ] **UI-02 – Workspace-Bar auflösen:** Die Workspace-Bar entfernen und ihre Buttons an geeigneten Stellen in die Topbar verschieben.

## Synthesizer

- [ ] **SYN-01 – Oszillator-Visualisierungen:** Bei Subtractive und „Ring/FM“ pro Oszillator eine eigene Visualisierung direkt über dem jeweiligen Oszillator anzeigen.
- [ ] **SYN-02 – Wavetable-Auswahl:** Insgesamt 32 auswählbare Wavetables aus acht verschiedenen Typen bereitstellen.
- [ ] **SYN-03 – Granular-Sample-Auswahl:** Insgesamt 32 auswählbare Samples mit breiter, für unterschiedliche granulare Anwendungen geeigneter Variation bereitstellen.
- [ ] **SYN-04 – Sampler-Bibliothek:** Jeweils vier Samples für jede der folgenden 16 Kategorien bereitstellen, insgesamt 64 Samples: Kick, Hat, Percussion, Tom, Ride, Shaker, Rimshot, Snare, FX, Chord, Lead, Bass, Acid, Piano, Stab und Pad.
- [ ] **SYN-05 – FX-Reihenfolge:** Die Reihenfolge der vier Effekt-Slots veränderbar machen; die eingestellte Reihenfolge muss auch die Signalverarbeitung bestimmen.
- [ ] **SYN-06 – Unison:** Unison je Track einstellbar machen.
- [ ] **SYN-07 – FX deaktivieren:** Jeden Effekt-Slot einzeln deaktivieren beziehungsweise auf Bypass schalten können. Nachtrag des Nutzers zum Backlog.

## Master FX

- [ ] **MFX-01 – Eigener Arbeitsbereich:** Ein neues Register „Master FX“ neben „Synthesizer“ und „Sequencer“ ergänzen.
- [ ] **MFX-02 – Master-Effekte und Drive:** Eine sinnvolle Auswahl an Master-Effekten sowie eine von Analog Heat MK II inspirierte Drive-Sektion mit verschiedenen Modi bereitstellen.
- [ ] **MFX-03 – Umschaltbarer EQ:** Einen Band-EQ mit wählbarem 2-Band-, 3-Band- und 8-Band-Modus bereitstellen.

## Weiter geltende Projektvorgaben

- Keine Tests anlegen, schreiben oder ausführen; keine Test-Abhängigkeiten hinzufügen.
- Die bestehenden acht Tracks, drei LFOs je Track und das Keyboard mit vier Oktaven berücksichtigen.
- Details, die für die Umsetzung noch offen sind, erst im Rahmen einer späteren Implementierungsfreigabe klären.
