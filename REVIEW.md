# Filter-Ausbau vom 23.10.2026

Basis: GitHub-`main` auf `53d2c6f`. Bereits abgeschlossene FM-, Sequencer-, Hold- und Layout-Arbeiten wurden beibehalten. Keine Tests, Testabhängigkeiten, Browser-/Hörprüfungen oder Benchmarks für diesen Ausbau ausgeführt; ausschließlich statische Durchsicht und Produktionsbuild.

- Base-Width aus zwei TPT-Einpolfiltern vor dem Main Filter, eigener weich modulierbarer Bypass. Open/Open überbrückt beide Stufen. Alle acht Engines durchlaufen dieselbe Stimmen-/Para-Filterabstraktion.
- Neue Multimode-Endpunkte bis 48 dB, LP/BP/HP-Morph, negative Peak-Gains, Butterworth-Polverteilung, State-Variable-TPT, rückgekoppelte Ladder-/Acid-Kaskaden, Resonanzkompensation, Dry/Wet und umschaltbares Pre-/Post-Drive. Laufende Topologiewechsel überblenden die Signalpfade; Modulations-/Envelope-Steuerquellen bleiben über den Wechsel erhalten.
- Comb Feedback/Feedforward, Wet-Gain mit Begrenzung, musikalisches Keytracking, Fine, Stereo-Spread, Feedback-HP/Sättigung und wählbare kubische Lagrange-Interpolation. Feedback unter eins, gedämpfte Schleife, begrenzte interne Zustände und endlicher Ausgang. Der Legacy-Comb-DSP bleibt unverändert auswählbar und ist weiterhin der Default.
- Drei Filter-Envelope-Curves und Velocity-Einfluss. Kurve 0 verwendet die vorherigen AudioParam-Rampen/Release-Konstanten. Kurven werden als unterbrechbare zeitgesteuerte Rampen geplant; Para-Fortsetzung und Release berücksichtigen sie ebenfalls. Keytracking skaliert die Frequenz exakt exponentiell zur MIDI-Distanz von C4.
- Neue numerische Ziele im gemeinsamen Parameterkatalog: Locks, MIDI Learn, Matrix, Import/Export und Undo/Redo. Shape-/Kurven-Parameter sind als Matrixziele beim Anschlag abgetastet. Classic/neutral erhält die vorherigen nativen Biquads; ein Worklet wird nur bei Bedarf verwendet. Alte Peak-Gains, Lock-Werte einschließlich Backups, Modulationsbeträge/-Begrenzung, MIDI-Bindings und Multimode-Auswahlrouten werden kompatibel migriert.
- DSP und Anzeige verwenden dieselbe geteilte Koeffizienten-/Transferfunktion. Frequenzgang bei Base/Peak/Sustain, wählbare Vorschau-Note/Velocity, beide Stereo-Comb-Kanäle. Nichtlineare Signalwege zeigen die Kleinsignalantwort; die native Drive-Oversampling-Entzerrung wird nicht modelliert. Filter-Envelope zeigt den Hz-Verlauf vor Keytracking. Frequenzgänge werden außerhalb der Bildschirmschleife vorbereitet und bei unveränderten Filterwerten zwischengespeichert.
- DSP-Steuerwerte werden nur bei Änderung neu abgeleitet, feste Parameter einmal pro Audioblock eingelesen, Koeffizienten-/Delay-Speicher wiederverwendet. Kein zusätzliches Audio-Autoplay, kein externer Dienst und keine neue Abhängigkeit. Offline-WAV und Live nutzen dieselben Filterklassen und Worklet-Module. Dispose trennt Steuerverbindungen und beendet Worklets/Quellen; fehlende Worklet-Unterstützung führt zu einer verständlichen Fehlermeldung.

Abschluss: TypeScript-/Produktionsbuild und portable App-Dateien mit `npm run build:pages`; `git diff --check`. Die Vite-Warnung zur Bundlegröße über 500 kB besteht fort. Klanggleichheit alter Presets folgt dem unveränderten Default-DSP-Pfad; sie wurde nicht durch eine Hörprüfung oder einen Audiovergleich bestätigt. Keine Aussage über gemessene CPU-Last im Zielbrowser.

---

# FM-Ausbau: sechs Algorithmen und drei Operator-ADSRs

Basis: GitHub-`main` auf `bcae49b`. Die bestehenden vier Synthese-Panels bleiben erhalten; zuvor abgeschlossene Sequencer-/Hold-/Layout-Arbeiten wurden beibehalten.

- Alle sechs angeforderten Verschaltungen teilen dieselbe Routing-Definition zwischen Editor, Schaltbild und DSP: Serial, Parallel, Branched, Dual Carrier, Hybrid und Triple Carrier. Modulationspfeile 2→1, 3→2, 3→1 besitzen getrennte Indizes; Audioausgänge werden mit angepasstem Summenpegel gemischt.
- Drei vollständige Operatoren mit Waveform, Ratio/Fixed Hz, Fine, Level, eigenem Feedback und ADSR samt drei Kurven. OP-Auswahl in Oscillator und separat für die Envelope in Character / Unison. Level und ADSR liegen vor Audio-, FM- und Feedback-Ausgängen. OP-3-Waveform ist in die Oszillatoransicht integriert. Globale Amp-/Filter-ADSR und Unison bleiben erhalten.
- Ein Stereo-AudioWorklet pro Note enthält alle Unison-Layer. Frequenzmodulation und selbstbegrenztes Feedback werden samplegenau berechnet. Bandbegrenzte Tabellen sowie gemeinsame Envelope-/Steuerwert-Berechnung reduzieren CPU-Arbeit. Release/Stop/Dispose steuern die Audio-Zeitachse und geben die Worklets frei.
- Fixed Hz folgt bei Mono-Legato und Glide nicht der gespielten Note. Globale Transposition, Pitch Bend, Fine und gezielte Pitch-Modulation bleiben wirksam. Laufende Ratio-/Hz-/Fine-/Level-/Index-/Feedback-Änderungen sind geglättet und in die vorhandenen Modulationsbindungen integriert; Envelope-/Routing-/Waveform-Änderungen werden beim Anschlag übernommen.
- FM-Parameter sind in Locks, Modulationsauswahl, MIDI Learn, Preset-/Projekt-Serialisierung, Undo/Redo und Offline-Rendering integriert. Waveform/Frequenzmodus unterstützen MIDI Learn per Kontextmenü. Der FM-DSP ist im portablen HTML eingebettet; kein zusätzlicher Download ist nötig.
- Legacy-Presets, Factory-Rezepte, Modulationsrouten, Step-/Noten-Locks und Piano-Backups werden vor Nutzung automatisch migriert. Die alten Index-/Ratio-Skalierungen, OP-2-Index-Decay/-End und exponentielle Kontur werden übertragen. Ratio-Locks passen auch die Indizes an, um die alte absolute Abweichung zu erhalten. Alte Datenfelder und MIDI-Zuordnungen bleiben kompatibel; neue FM-Daten werden nicht erneut migriert.

Kompatibilitätsgrenzen: Der neue samplegenaue Feedbackpfad ersetzt die frühere zyklische DelayNode-Verbindung. Feedback wird jetzt von der OP-ADSR mitgeformt, und Release folgt einer echten Operator-ADSR. Alte laufende Ratio-Modulation kann unter der expliziten Indexdefinition anders wirken. Klanggleichheit ist deshalb keine Bitidentität; eine Hörprüfung im Zielbrowser wurde nicht durchgeführt.

## Gezielte Performance-Messung

Die aktuelle Anforderung erlaubt ausdrücklich CPU-/Polyphonie-Messungen. Dafür wurde `npm run benchmark:fm` ergänzt und ausgeführt; keine Test-Suite, Test-Assertions oder Test-Abhängigkeiten wurden hinzugefügt. Der Benchmark führt den tatsächlichen Worklet-DSP in Node aus, ohne VM-Proxy für globale Mathematikfunktionen. 48 kHz, 128 Frames, 96 Warmup-Blöcke, drei Messungen à 256 ms Audio; angegeben ist der Median. Waveforms sind gemischt, Feedback beträgt 95 %, Verbindungs-Indizes 6.

| Algorithmus | 16 Noten × 8 Unison: CPU / 256 ms Audio | Mit Audio-Rate-Modulation und Release |
| --- | ---: | ---: |
| Serial | 72,6 ms | 124,3 ms |
| Parallel | 78,5 ms | 119,7 ms |
| Branched | 67,7 ms | 134,5 ms |
| Dual Carrier | 67,0 ms | 115,6 ms |
| Hybrid | 73,1 ms | 125,7 ms |
| Triple Carrier | 72,7 ms | 120,1 ms |

Alle 30 Profile (auch 1/8 Noten ohne Unison und 32 × 8 als zusätzliche Überlast) lieferten ausschließlich endliche Samples. 16 × 8 bedeutet 384 Operatorinstanzen; je nach Algorithmus etwa 26–31 % einer Kern-Zeitspanne, mit Audio-Rate-Modulation/Release etwa 45–53 %. Das sind Messungen dieser Cloud-CPU inklusive Ergebnis-Erfassung, keine Garantie für die Echtzeitfähigkeit des gesamten Studios. Native Filter, Effekte, AudioParam-Verarbeitung, Browser-/Gerätepuffer und Rendering sind darin nicht enthalten.

Die Engine begrenzt aktive FM-Arbeit einschließlich Releases auf 32 Noten und 128 Unison-Layer. Zuerst werden ausklingende, dann die ältesten Stimmen über 15 ms ausgeblendet. Die zusätzlich gemessenen 32 × 8 Layer liegen über diesem dauerhaften Runtime-Budget. Kein automatisches Absenken der eingestellten Unison-Zahl.

Abschlussprüfung: statische Durchsicht von Migration, Routing, Stimmen-/Gate-Lebenszyklus, Modulation, Mono/Legato, Locks/MIDI und Export; TypeScript-/Produktions-Build und drei Veröffentlichungsdateien über `npm run build:pages`, außerdem `git diff --check`. Keine allgemeinen Funktions-, Browser- oder Hardware-Tests ausgeführt.

---

# Track-Wiedergabe und Bedienung vom 23.10.2026

Basis: GitHub-`main` auf `6318ee6`, identisch mit dem lokalen Commitstand bei der Übernahme. Vorhandene uncommittete Änderungen wurden geprüft und vervollständigt; die bereits veröffentlichten Erweiterungen wurden beibehalten.

- Eigene vorwärts laufende Piano-Track-Wiedergabe mit Start, Pause, Stop, Loop-Schalter und gespeicherten Bereichsmarkern. Mute wird berücksichtigt; andere Solo-Zustände beeinflussen diese Wiedergabe nicht und werden nicht verändert. Haupttransport und MIDI-Start beenden die Einzelwiedergabe, damit keine zwei Scheduler gleichzeitig spielen.
- Audio- und MIDI-Warteschlangen werden bei Pause/Stop bzw. Bereichsänderungen geleert, Locks zurückgesetzt und Live-Aufnahmen abgeschlossen. Aufnahme und Notenbearbeitung aktualisieren zukünftige Ereignisse ohne Clock-Neustart oder erneutes Auslösen gerade aufgenommener Noten. Eine fortlaufende Position erhält Aufnahmedauern über Loop-Grenzen. Nach gedrosselten Tabs werden keine veralteten Ereignisse als Burst nachgeholt.
- Hold hält freigegebene Live-/MIDI-Noten, löst gleiche Noten beim erneuten Anschlag sauber ab und berücksichtigt noch laufende Audioinitialisierung. Ausschalten von Hold, Stop und MIDI-Panic geben die gehaltenen Noten frei.
- Piano-Tracks sind im Step-Register schreibgeschützt sichtbar; Mute/Solo und Seitennavigation bleiben bedienbar. Einfügen verändert nur Tracks des aktiven Editorregisters. Belegte Steps werden zuerst ausgewählt und erst beim erneuten Klick auf die Auswahl deaktiviert.
- Gemeinsame größere Lock-Steuerung im Step-Editor, Rechtsklick-Dialog und Piano-Inspector: gruppierte Auswahl mit ausgeschriebenen Namen, Maus-Slider und frei bearbeitbare Zahlenfelder. Die zuvor ausgeschlossenen, pro Stimme erzeugten Unison-/Wavetable-/Sampler-/Additive-Parameter sind verfügbar. Gemeinsame Effekt-Kurven/Impulse (distortion/reverbSize) und separate FX-Zusatzparameter bleiben außerhalb der Note-Locks.
- Alle Synthesizer-/Master-Knöpfe verwenden die Oscillator-Größe von 55 px und dieselbe Geometrie. Space-Titel und Schalter sind an Dynamics angeglichen. Eine zu breite Space-SVG-Regel, die auch Icons und Knopf-Ringe erfasste, ist auf die Visualisierungen begrenzt. Env depth ist breiter und auf 0,01 einstellbar.
- Kompakte Piano-Symbolbuttons samt Tooltips, deutlich aktives Fill, Hold neben der Keyboard-Höhenwahl und Fokusfreigabe nach Combo-Auswahl. Follow und Fill sind in Hilfe und README erklärt.

Verifikation: statische Code-Durchsicht, TypeScript-/Produktions-Build und generierte HTML-Dateien über `npm run build:pages`, außerdem `git diff --check`. Keine Tests angelegt oder ausgeführt und keine Test-Abhängigkeiten hinzugefügt. Sichtbare Browserbedienung, Klang und Hardware-MIDI wurden nicht praktisch geprüft. Änderungen können innerhalb des bereits geplanten Audio-Vorlaufs von 120 ms verzögert hörbar werden; gemeinsam genutzte Track-FX bleiben nicht pro Note unabhängig.

---

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
