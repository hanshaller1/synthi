# Desktop-Ausbau und Piano-Roll-Werkzeuge vom 23.10.2026

Basis: GitHub-`main` auf `4a8b771`. Umsetzung und Push nach `main` sind ausdrücklich beauftragt.

- Gemeinsames 128-Step-Limit für Factory-Daten, Import, Bearbeitung, acht Step-Seiten, Generator und Rückmigration. Alte Projekte werden mit leeren zusätzlichen Steps aufgefüllt. Bestehende Note-/Backup-Daten bleiben erhalten.
- Gespeicherte Skalen pro Pattern, Fold, Maus-Zoom am Zeitlineal, Zoom am Mauszeiger in beiden Achsen und Vorhören beim Verschieben. Horizontales Verschieben verändert keine Tonhöhe; Skalen-Pfeiltasten bleiben nicht zwischen zwei Tönen stecken.
- Melodie-/Euclid-/Arpeggio-Generator, neun Transformationen, Humanize mit begrenzten Abweichungen. Vorschau vor Anwendung, eine Undo-Aktion pro Übernahme. Neue MIDI-Aufnahmen invalidieren offene Vorschauen, damit sie nicht überschrieben werden.
- Desktop-Oberfläche ohne Smartphone-Media-Queries, mobile Navigation, Touch-Regeln oder verkürztes Smartphone-Keyboard. Footer, zusätzliche Editor-Toolbar und Roll-Hilfe entfernt; Shortcuts im oberen `?`. Track-Auswahl und Noten-Locks in vorhandene Werkzeugleisten integriert.
- Modulation und alle Master-FX gleichzeitig im Synthesizer-Moduldesign; angeglichene Amp-/Filter-Hüllkurven, mehr Platz für die Filter-Response. Preset-Paar, Stimmenmodus, MIDI und Register neu angeordnet. Keyboard-Höhe halbierbar, Track-Abstände reduziert, BPM per Maus und mit löschbarer Texteingabe.

Validierung: statische Durchsicht, TypeScript-/Produktions-Build und Erzeugen der HTML-Veröffentlichungsdateien mit `npm run build:pages`; Whitespace-Prüfung mit `git diff --check`. Keine Tests angelegt oder ausgeführt, keine Test-Abhängigkeiten hinzugefügt. Browserbedienung und Klang wurden nicht praktisch geprüft.

---

# Codeprüfung und Piano Roll vom 23.10.2026

Basis: ausdrücklich neu von GitHub geladenes `main`, Commit `a7f202d`. Der ursprünglich bereitgestellte Vier-Track-Checkout wurde vor jeder Änderung verworfen bzw. per Fast-forward aktualisiert. Die acht vorhandenen Tracks bleiben erhalten; vier weitere ergeben zwölf Tracks. Keine Veröffentlichung und kein Push.

## Korrigierte Befunde

- **Amplitudenmodulation:** Direkte Addition zur Amp-Hüllkurve konnte trotz Sustain 0 oder während Release ein Signal erzeugen. Ein separater multiplikativer Gain erhält die Artikulation.
- **Mono / Legato:** Überlappende Live-Tasten ersetzten zuvor die Stimme und sprangen auf Sustain. Bei unverändertem Patch wird die Stimme nun weitergeführt und ihre Tonhöhe gleitend geändert; Last-Note-Priority, Keytracking und Pitch Bend bleiben erhalten. Ein erster, nicht überlappender Mono-Anschlag gleitet nicht von der letzten alten Note. Der Worklet-Detune-Bereich deckt auch weite Legato-Intervalle ab.
- **Paraphonic Release:** Gemeinsame Bus-Hüllkurve und letzte Einzelstimme wurden gleichzeitig abgesenkt, wodurch die Release-Kurve quadriert wurde. Die letzte Stimme folgt jetzt ausschließlich dem gemeinsamen Release.
- **Physical-Tonhöhe:** Ganzzahlige Delay-Länge und die Phasenverschiebung der Saitenglättung verstimmten die erzeugte Saite. Die Wiedergaberate gleicht die aus dem Umlauf berechnete Grundfrequenz aus.
- **Kurze Noten:** Die pauschale Mindest-Gate-Dauer von 10 ms verfälschte kurze Noten und schnelle Ratchets. Minimum ist jetzt eine Audio-Sampleperiode.
- **Live-Scheduling:** Lange Ratchets wurden vollständig vor später eintreffenden, aber früher klingenden Noten anderer Tracks angelegt. Eine sortierte Ereigniswarteschlange vereinheitlicht die Reihenfolge mit dem Offline-Pfad. Negative Microtiming-Werte vergrößern den Planungsvorlauf. Überfällige Ereignisse nach stark gedrosselten Tabs werden nicht als Noten-Burst nachgeholt.
- **Step-Locks / Stop:** Bus-Locks werden an folgenden Trigger-Grenzen auf den Patch zurückgeführt; planbare Bus-/FX-Werte wechseln mit kurzer Glättung. Transport-Warteschlangen werden bei Stop geleert, und beim Dispose werden auch Limiter und Analyser getrennt.
- **MIDI-Überlappungen:** Das Note-off einer älteren Sequencer-Note konnte eine neuere, gleich hohe Note vorzeitig beenden. Die Ausgabe zählt überlappende Stimmen pro Kanal/Tonhöhe und verschickt das letzte Note-off erst nach deren Freigabe. Panic leert auch diese Warteschlange und sendet All Notes Off / All Sound Off.

## Ergänzungen und Datenbestand

- Zwölf unabhängige Tracks, MIDI-Kanäle 1–12; Import alter Vier-/Acht-Track-Projekte und Projektformat 2.
- Pro Track Step oder Piano Roll; eigene Register mit passender Track-Auswahl, gemeinsamer Wiedergabe, Mute/Solo, Recording und Export.
- Piano Roll mit polyphonen Noten, Raster/freier Platzierung, Zoom und Hand-Werkzeug, Mehrfach-/Rechteckauswahl, Verschieben, beidseitiger Längenänderung, Velocity-Spur, präzisem Inspector, Transposition, Quantisierung, Zwischenablage, Undo/Redo, Bedingungen und Noten-Locks.
- Automatische Step-Übernahme einschließlich Akkord-/Ratchet-Gruppen und ursprünglicher Step-Daten. Die Rückmigration zeigt ihre Auswirkungen auf alle acht Patterns und erfordert die Bestätigung in der App. Das vollständige Original bleibt samt Timing im lokalen Projekt wiederherstellbar.
- Gehaltene polyphone Live-/MIDI-Noten zeichnen ihre Dauer einschließlich Loop-Grenzen auf; Vorhören ist davon getrennt. Außerhalb eines verkürzten Patterns liegende Noten werden nicht gelöscht.

## Verifikation und Grenzen

Statische Prüfung der Daten-, Synthese-, Modulations-, Effekt-, Transport-, MIDI- und Editorpfade. `npm run build:pages` kompiliert TypeScript, baut das Produktions-Bundle und erzeugt die drei lokalen HTML-Artefakte. `git diff --check` prüft Whitespace. Gemäß `AGENTS.md` wurden keine Tests angelegt oder ausgeführt und keine Test-Abhängigkeiten ergänzt. Hörprüfung, Browser-Bedienung und Hardware-MIDI wurden nicht praktisch geprüft; der erfolgreiche Build allein belegt diese Eigenschaften nicht.

Externe Clock kann negative Zeitverschiebungen nur innerhalb verfügbarer Clock-Informationen planen. Track-Effekte bleiben gemeinsame Busse; widersprüchliche gleichzeitige FX-Locks besitzen keine unabhängige Effektinstanz pro Note. Zufallsquellen und Wahrscheinlichkeiten werden beim WAV-Export neu ausgewertet. Der erweiterte Vorlauf für negative Microtiming-Werte kann Änderungen an bereits geplanten Noten verzögern.

---

# Codeprüfung vom 22.10.2026

Basis ist `main` auf `e5e8175`, einschließlich Backlog-Umsetzung und der neuen Multimode-/Comb-Filter. Die Prüfung erfolgte statisch; die Projektvorgabe untersagt das Schreiben und Ausführen von Tests.

## Korrigierte Befunde

- **Audio-Start / Comb:** Gleichzeitige erste Noten konnten die Engine verwenden, bevor das Worklet registriert war. Die Initialisierung wird jetzt gemeinsam abgewartet; Audio wird innerhalb der Benutzerinteraktion aktiviert. Ein fehlgeschlagenes Worklet blockiert klassische Filter nicht mehr. Nicht verfügbare Comb-Auswahlen werden mit einer Meldung abgefangen.
- **Hüllkurven:** Das Entfernen zukünftiger Rampen-Endpunkte veränderte auch den bereits geplanten Attack-/Decay-Verlauf. Beim Release und beim Fortsetzen paraphoner Artikulationen wird der laufende Wert jetzt gehalten. Filter-Envelope-Modulationsrouten erhalten ebenfalls eine Release-Phase.
- **Freigabe von Stimmen:** Die frühere Toleranz von 100 ms konnte Filter vor dem tatsächlichen Stimmenende trennen. Bereinigung folgt jetzt der Audio-Zeit, berücksichtigt suspendierte Kontexte und wird bei Mono-Wechsel und Panic vorgezogen. Beim LFO-Wechsel werden alte Quellen entfernt und neue Quellen mit dem bestehenden Stimmenende gestoppt. Panic schließt die gemeinsame Para-Amplitude und setzt Comb-Puffer zurück.
- **WAV-Export:** Die feste Ausklangreserve berücksichtigte lange Step-Gates, Release-Locks und Master-Effekte nicht. Die Exportdauer ergibt sich jetzt aus den tatsächlich geplanten Noten und den Track-/Master-Effektfahnen. Noten werden zeitlich sortiert geplant; auch Fehler während der Vorbereitung geben die Offline-Engine frei.
- **Step-Editor:** Eine bei jeder Änderung neu erzeugte Schließen-Funktion löste wiederholt den Fokus-Effekt des Dialogs aus. Die Funktion ist jetzt stabil. Pattern-Längen werden auf ganze Steps gerundet.
- **Noten und Import:** Step-Auswahl und Import erhalten den vollständigen MIDI-Notenbereich 0–127. Ein numerisch eingelesener EQ-Modus wird auch als Zahl gespeichert, damit die richtige Gain-Bank verwendet wird.
- **Filteranzeigen:** Frequenzgänge verwenden nach Audio-Start die tatsächliche Samplerate und dieselbe Resonanz-Vorgabe wie der Signalweg. P-Lock-Hüllkurven und das Vorzeichen der Filtertiefe zeigen die gesperrten Werte.

## Weitere geprüfte Bereiche

- Backlog-Datenmodell und Bedienpfade für Step-Auswahl, variable Step-Längen, Notennamen, Unison, LFO-Modi und zusätzliche Syntheseparameter.
- 32 Wavetables aus acht Familien, 32 Granular-Texturen und 64 Sampler-Sounds aus 16 Kategorien; Ressourcen werden lokal erzeugt.
- Serielle, umsortierbare Track-FX mit separatem Bypass sowie Master-Drive, EQ, Dynamics, Stereo und Space.
- Multimode-Zuordnung zu nativen Biquads, zwei Filterstufen für 24-dB-Modi, Peak-Gain und Comb-Rückkopplung mit fraktionaler Verzögerung, Dämpfung, Polarität und begrenztem Feedback. Import, P-Locks, MIDI-Zuordnung und Offline-Pfad wurden mit betrachtet.

## Verifikation und Grenzen

Die spätere Damping-Nachprüfung ergab keinen DSP-Fehler: Im Comb sind Tiefpass-Koeffizient und Rückkopplungsfrequenzgang konsistent zwischen Worklet und Anzeige. Die Tiefpass-Grenze wird an die Samplerate angepasst; der Rückkopplungsbetrag bleibt unter eins. Der gemeinsame Steuerpfad überträgt manuelle Änderungen, Locks und Modulation. Im Physical-Modell bildet die nichtnegative, auf eins summierte Nachbarglättung zusammen mit `damping < 1` und dem zusätzlichen Decay-Faktor einen verlustbehafteten Saitenumlauf. `damping` ist hier ein Rückhaltefaktor, keine Verlustprozentzahl; die im Voraus erzeugte Saite übernimmt Änderungen ab dem nächsten Anschlag. Diese Bediensemantik ist jetzt in der README erklärt.

`npm run build:pages` kompiliert TypeScript, baut das Produktions-Bundle und erzeugt `index.html`, `docs/index.html` und `release/PHASE.html` neu. `git diff --check` prüft die Änderungen auf Whitespace-Fehler.

Es wurden keine Tests angelegt oder ausgeführt. Klang, Gerätekompatibilität, Hardware-MIDI und das sichtbare Layout wurden nicht praktisch geprüft; ein erfolgreicher Build belegt diese Eigenschaften nicht.
