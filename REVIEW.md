# LFO-Modi und Track-Swing vom 25.10.2026

Basis: ausschließlich GitHub-`main`, Commit `74aa9e0`; sauberer Checkout vor Beginn. Die lokale Bearbeitung erfolgt auf Branch `main`. Keine Tests, Hörprüfungen, Browserprüfungen oder Benchmarks angelegt oder ausgeführt; keine Smartphone-Anpassungen.

## Abgleich und Umsetzung

- **Übernommen:** bestehende Hz-/Sync-Bedienung, Start Phase 0–360°, Fade-In-Feld, acht Wellenformen, Skew/Slew/Pulsbreite/Polarität, globaler Swing-Regler sowie die gemeinsame Step-/Piano-Sequenzfunktion. Die vorhandenen Module, Auswahlfelder und Regler werden weiterverwendet.
- **FREE:** Drei gemeinsame Phasen je Track kommen aus einem persistenten AudioWorklet, auch ohne gehaltene Stimmen. Ein diskreter Sieben-Kanal-Bus überträgt drei getrennte Fraction-/Cycle-Paare und das Clock-Alter an Stimmen und Track-FX. Dadurch verlieren neue polyphone Stimmen bei Tempo-/Rate-Änderungen nicht die gemeinsame Phase. Note-On setzt diese Phase nicht zurück. Ein expliziter Transportstart initialisiert den Zeitursprung aller Tracks; Offline-Export verwendet entsprechend Ursprung 0. Die Phasen- und Parameterereignisse werden auf derselben Audio-Zeitachse verarbeitet.
- **TRIG/HOLD:** TRIG startet pro Note-On neu, auch beim Wiederverwenden einer Mono-Legato-Stimme, ohne zusätzliche Amp-/Filter-Retrigger. Eine Rückkehr zu einer gehaltenen Mono-Note beim Note-Off löst keinen zusätzlichen LFO-Trigger aus. HOLD tastet bei Note-On die tatsächlich gewählte Wellenform an der laufenden Track-Phase inklusive Start Phase ab; es ersetzt sie nicht mehr durch einen zyklischen Random-Generator. Der Rohwert bleibt bis zum nächsten Note-On stehen, Depth/Polarität/Fades liegen danach.
- **ONE/HALF:** Ein vollständiger beziehungsweise halber integrierter Zyklus; danach bleibt die Quelle auf null. Das Zyklusende besitzt eine kubische Ausblendung von mindestens 5 ms. Ein längerer Fade-Out-Wert wird auf die Zyklusdauer begrenzt. Fade Out wirkt außerdem nach Note-Off; Fade In bleibt vorhanden. FREE-Fade-In/Delay beziehen sich auf die Track-Clock. Die übrige Parameter-Glättung bleibt bestehen; hörbare Artefaktfreiheit wurde nicht praktisch bestätigt.
- **Parameter und Anzeige:** Separater Retrigger-Schalter und sein reguläres Registry-Ziel entfallen. Die fünf Modi heißen FREE, TRIG, HOLD, ONE und HALF; bestehende numerische Modus-Indizes bleiben erhalten. LFO-Sync bietet musikalische Divisionen bis 4 Bars einschließlich punktierter und triolischer Werte innerhalb des Bereichs. Der freie Hz-Wert wird bei Sync weiterhin durch die Division ersetzt. Depth ist −100…+100 %. Vorschau, CPU-Snapshots und Worklet teilen Wellenform und Fade-Kennlinie; Modus, Start Phase, Note-Off, Fade In und Fade Out erscheinen in der Vorschau.
- **Migration:** `FREE + retrigger:true` und der alte `retrigger`-Modus werden TRIG. `lfoVersion:2` verhindert wiederholte Migration. Alte Retrigger-IDs in Presets, Step-/Piano-Locks, Routen und MIDI-Bindings werden auf den Modus abgebildet. Ein Migrationsmarker begrenzt bisherige Boolean-Modulation auf FREE/TRIG, bis die Modusauswahl manuell bearbeitet wird; bisher wirkungslose Zusatz-Bits bei ONE/HALF ändern diese Modi nicht. Alte MIDI-Retrigger-Bindings schalten weiterhin gezielt FREE/TRIG. Beträge alter Depth-Routen werden wegen des verdoppelten Wertebereichs halbiert. Die neue negative Depth kann bei starker Modulation unterhalb null nun invertieren; der frühere Null-Anschlag des ausschließlich positiven Bereichs ist nicht erhalten. Alte zu lange Sync-Divisionen werden auf 4 Bars begrenzt. Native Legacy-FX-Versionen bleiben erhalten; für alte LFO-Routen werden die bisherigen linearen Cutoff-/Amplitude-Modulationstiefen berücksichtigt.
- **Swing:** Der globale Wert bleibt bestehen und erhält 1/8-/1/16-Auflösung. Pro Track/Pattern werden GLOBAL, CUSTOM oder OFF sowie Custom-Wert und -Auflösung gespeichert. Alte Projekte starten mit GLOBAL und globalem 1/16-Raster. Kopien/Duplikate, Piano-Backups und Projektimport übernehmen die Felder. Eine gemeinsame Funktion verschiebt Trigger innerhalb fester Swing-Paare; Paargrenzen, BPM-/MIDI-Clock, Playhead, Pattern-Dauer und Gate-Längen werden nicht verschoben. Feinere Unterteilungen werden stetig abgebildet, damit Trigger allein durch Swing nicht ihre Reihenfolge tauschen. Das frühere von der Step-Auflösung abhängige Verhalten wird durch das gewählte musikalische Raster ersetzt.
- **Timing-Integration:** Haupttransport, Step-/Piano-Noten, Ratchets, unabhängige Piano-Track-Wiedergabe, Migration zum Step-Editor und WAV-Export verwenden dieselbe Swing-Funktion. Unabhängige Swing-Werte verändern nicht die nominalen Track-Cursor. Für LFO-Anschlag-/Grain-Snapshots gibt es eine gemeinsame Basisrate-/Tempo-Timeline; Offline-Rendering registriert zukünftige Clock-Parameter vor dem Planen von Stimmen. Audio-Rate-Ziele lesen die tatsächliche Worklet-Phase, komplexe laufende Matrix-Modulation der LFO-Rate bleibt für vorausgeplante CPU-Snapshots eine Kontrollraten-Näherung. Die Generator-Uhren und ihre Eingangsverbindungen werden bei Dispose freigegeben; Offline-Kontexte verschicken weiterhin keine UI-Telemetrie.

## Verifikation und Grenzen

Statische Durchsicht der Modi, Registry, Migration, Ereignisreihenfolge, Phasen-Bus-Verbindungen, Note-On/Legato/Release-/Panic-Pfade, Swing-Zeitfunktion und des Offline-Pfads. TypeScript-/Produktionsbuild mit `npm run build:pages`; syntaktische Kompilierung des gebündelten/minifizierten Modulations-Worklet-Quelltexts mit esbuild ohne Prozessor-/DSP-Ausführung; `git diff --check`. Die drei Veröffentlichungsdateien werden neu erzeugt. Die bestehende Bundlegrößenwarnung bleibt bestehen. Keine Testdateien, Test-Abhängigkeiten oder Testausführung.

Klang, reale CPU-Last, Hardware-MIDI und praktische Live-/Export-Übereinstimmung wurden nicht gemessen. Zufalls-Klangquellen außerhalb der LFOs und eine vor Transportstart bereits manuell laufende FREE-Session sind keine bitidentische Aufzeichnung eines späteren WAV-Exports. Keine unbeteiligten Synthese-, FX-Algorithmus- oder Smartphone-Erweiterungen.

---

# Modulations-/FX-Korrekturen vom 25.10.2026

Basis: GitHub-`main`, Commit `9fcc85c`; sauberer Checkout vor Beginn. Die fünf gemeldeten Befunde wurden bearbeitet. Keine Tests, Hörprüfungen oder Benchmarks angelegt oder ausgeführt.

## Korrekturen

- **P1 / Smooth Random:** Die gemeinsame LFO-Funktion interpoliert im Smooth-Modus über eine vollständige Periode, auch bei Slew 0. Kubisches Smoothstep wird mit steigendem Slew in quintisches Smootherstep überführt. Beide besitzen stetige Werte und eine Ableitung von null an den Periodengrenzen; quintisch ist dort zusätzlich die zweite Ableitung null. Die Slew-Dauer von Random/Sample & Hold bleibt separat. Dieselbe Funktion wird in den AudioWorklet-Quelltext eingebettet und für die Vorschau und das Abtasten von Anschlagparametern verwendet.
- **P1 / Delay-Zeiten:** Die bestehende Speichergrenze wird explizit auf 16 Sekunden je Kanal/Tap vereinheitlicht. `FX_DELAY_LIMIT_SECONDS` ist die gemeinsame Quelle für Worklet-Puffer, DSP-Lesegrenzen, Vorschau, Optionsauswahl und Export-Tail-Reserve. Multi-tap war bisher nicht ausdrücklich auf dieselbe Zeit begrenzt und ist jetzt einbezogen. Bei 20 BPM sind 8 Beats (= 24 s) in der UI gesperrt; Ping-pong-Rechtszeit und Multi-tap-Spacing werden mitgeprüft. Importierte Werte und Überschreitungen durch Tempo/Modulation werden als Basiswerte erhalten und sichtbar mit angeforderter sowie begrenzter wirksamer Grundzeit ausgewiesen. Wow/Flutter bewegen die Lesezeit innerhalb dieser Grenze. Die Korrektur entscheidet sich damit für klar begrenzte Auswahlmöglichkeiten, nicht für zusätzliche große Delay-Puffer pro Track und Übergangsmodell.
- **P2 / FX-Vorschauen:** Der Bitcrusher zeigt ein 12-ms-Beispielsignal mit sampleratenabhängiger Sample-&-Hold-/Quantisierungs-Treppe; Jitter ist eine deterministische Illustration. Tone/Mix sind ausdrücklich nicht simuliert. Beim Wavefolder ist zusätzlich ein separater normierter Postfilter-Tiefpassgang sichtbar. Alle Grafiken besitzen eine sichtbare Beschriftung als schematische Vorschau; statische Kennlinien, nicht simulierte Verarbeitung und fehlende Live-Daten sind entsprechend benannt.
- **P2 / Wirksamer FX-Zustand:** Variantenauswahl, Power-Button und zugehörige Parameter bleiben Basis-Bedienelemente. Daneben zeigt ein eigenes DSP-Statusfeld die gemeldete effektive Variante, ON/BYPASS und einen eventuell laufenden Algorithmusübergang. Modul-Abdunklung und Grafik folgen diesem Zustand. Die Telemetrie liefert dafür auch den vorherigen Algorithmus und den Übergangsfortschritt. Ohne Effektprozessor-Telemetrie erscheint eine Basisansicht; unbestätigte Modulations-Sollwerte werden nicht als Effektprozessor-Zustand ausgegeben.
- **P2 / Reglerbereiche:** Der aktuelle Punkt bleibt an die Prozessor-Telemetrie gebunden. Eine gecachte Intervallrechnung berücksichtigt nun abhängige Macros, modulierte LFO-Tiefe/Polarität, diskrete Optionen und bedingte kanonische FX-Aliase einschließlich einer möglichen Nichtaktivierung. Basiswerte während geglätteter Aktivierung/Deaktivierung werden eingeschlossen. Tooltips und Modulationseditor bezeichnen den Ring ausdrücklich als theoretischen, konservativen Bereich. Phasenkorrelationen, Ereignisabtastung und gegenseitig ausschließende Varianten werden nicht als exakt gemeinsam erreichbare Extrema dargestellt.

## Begrenzte Optimierungen und Verifikation

- Kein zusätzlicher Stimmen-Modulationsprozessor bei ausschließlich FX-/Anschlag-Zielen. Vorhandene Stimmenprozessoren reservieren nur die tatsächlich benötigten Ausgänge; die Track-Reserve für dynamische Routen bleibt bestehen.
- Prozessor-Konfigurationen enthalten nur ihre Ausgangsziele sowie die Generator-/FX-Modus-Routen. Generatoren laufen weiter, damit Routenänderungen keine laufenden LFOs einfrieren oder neu starten. Nicht benötigte Amp-/Filter-Quellen werden nicht sampleweise ausgewertet, und Random per Note wird je Notenstart/Seed zwischengespeichert.
- Im Offline-Kontext entfallen UI-Telemetrie und deren Objektserialisierung. DSP, Glättung und 32-ms-Algorithmusüberblendung bleiben ansonsten gemeinsam mit dem Echtzeitpfad. Dispose-Nachrichten werden vor dem Schließen des Ports vom Prozessor empfangen; der Hauptthread trennt seine Listener und Audioverbindungen.
- Statische Durchsicht, TypeScript-/Produktionsbuild mit `npm run build:pages`, syntaktische Kompilierung der eingebetteten Worklet-Quellen ohne DSP-Ausführung und `git diff --check`. Die drei Veröffentlichungsdateien werden aus dem aktuellen Quellcode erzeugt. Die bestehende Bundlegrößenwarnung bleibt bestehen.

Es wurden keine CPU-/Polyphonie-Werte gemessen und keine Klanggleichheit oder Artefaktfreiheit durch eine Hörprüfung bestätigt. Die Änderungen reduzieren konkret vermeidbare Arbeit; sie ersetzen keine Messung der vollständigen Anwendung auf dem Zielgerät. Zufallsquellen und Free-Run-Phasen bleiben zudem keine sampleidentische Aufzeichnung einer vorausgegangenen Live-Session.

---

# Modulation und Track-FX vom 23.10.2026

Basis: GitHub-`main`, Commit `575fd3a`, sauberer Checkout und identischer Remote-Stand bei Beginn. Umsetzung direkt auf `main`. Vorher abgeschlossene Synthese-/Filter-/Sequencer-Korrekturen wurden nicht erneut umgesetzt. Keine Tests, Hörprüfungen, Browserprüfungen oder Benchmarks angelegt oder ausgeführt.

## Parameter und Modulation

- Gemeinsame Registry aus numerischen Synthese-/Filter-/Amp-Parametern, LFO-Feldern und sämtlichen `FX_CONTROLS`. Metadaten enthalten ID, Gruppe, Beschriftung, Wertebereich, Default, Skalierung, Scope und kontinuierliche bzw. Trigger-Art. Jeder FX-Regler erzeugt automatisch eine eindeutige `fx.<slot>.<variante>.<parameter>`-ID. Gemeinsame Parameter wie Feedback und Mix werden über kanonische Aliase geführt; Alias-Routen beachten die tatsächlich aktive Variante. FX-Reihenfolge bleibt außerhalb der Matrix. Die sieben bisher fehlenden gemeinsamen FX-Ziele und zusätzliche gemeinsame Trim-/Reverb-Regler sind enthalten.
- 24 Routen mit Linear-/Exponential-/Logarithmic-Kurve, gemeinsamer Summierung und anschließender Begrenzung. Logarithmische Frequenz-/Zeitwerte werden multiplikativ skaliert. Ein gerichteter Generatorgraph sperrt Selbstmodulation und Rückkopplungszyklen zwischen LFOs, Macros, Mod-ADSRs und Smooth Random; Import entfernt ungültige Quellen/Ziele und unzulässige Routen.
- Ein AudioWorklet wertet kontinuierliche Modulation auf der Audio-Zeitachse aus und liefert geglättete Differenzen an die tatsächlichen AudioParams. LFO-Rate-Modulation integriert die Phase. Event-Ziele werden auf Note-/Step-Ereignissen abgetastet; Optionen werden auf gültige Werte gerundet. Bestehende Stimmentopologie-Verbindungen bleiben bis zum nächsten Anschlag bestehen; neue Routen-Ziele werden dort angeschlossen. Track-FX-Routen können ohne Neuaufbau des Audiographen ergänzt/entfernt werden.
- Drei erweiterte LFOs: Free Run, Note Retrigger, One Shot, Half Cycle und Sample & Hold; musikalische Divisionen 1/64 bis acht Takte mit punktierten Werten/Triolen, Phase, Delay/Fade, Skew, Slew, Pulsbreite und Polarität. Zwei Mod-ADSRs mit drei Kurvenreglern; Amp Envelope, Random per Note, Smooth Random, Channel/Poly Pressure, Pitch Bend und vier Macros als zusätzliche Quellen. Mod-ADSR- und Amp-/Filter-Envelope-Werte bleiben dem Anschlag zugeordnet. Polyphoner Druck und Mono-Retune werden auch an den passenden Track-FX-Noteneintrag weitergeleitet.

## Track-FX und Integration

- Vier serielle Worklet-Slots mit je fünf Varianten und tatsächlicher Verarbeitung aller ergänzten Regler: Saturation-Trim, Soft-Clip-2×-Oversampling mit 63-Tap-FIRs und zeitlich angepasstem Dry-Pfad, Hard-Symmetry, Fold-Postfilter, Crush-Samplerate/Jitter, Diode-Tone; Chorus-Voices/Delay/Phase, Flanger-Manual/Polarität, Vibrato-Phase/Fade/Sync, Phaser-Depth/Feedback/Stufen, Tremolo-Form/Phase/Sync; Delay-Sync sowie HP/Ducking/Offset, Wow/Flutter/Saturation, Ping-pong-L/R-Zeit bzw. Division und Cross Feedback, Multi-tap-Pegel/Pans, Dub-Modulation/Feedback-Sättigung; Reverb-Cuts/Width, Room-Pre-delay, Hall-Early/Late, Plate-Diffusion, Spring-Drive/Count und Gated-Threshold/Hold/Release.
- Geglättete kontinuierliche DSP-Steuerung ohne Curve-/IR-Neuberechnung pro LFO-Sample. Strukturänderungen verwenden zwei vorbereitete Modelle und 32-ms-Überblendung; weitere Variantenwechsel warten eine laufende Überblendung ab. Bypass wird geglättet und überspringt danach aufwendige DSP-Schleifen; Track-Modulationsgeneratoren laufen weiter. Koeffizienten werden gecacht, Delay-Puffer ohne vollständiges Löschen zurückgesetzt, schnelle Fluktuationen numerisch begrenzt.
- Pro-Voice-Quellen steuern jeweils ihre Stimme. Track-FX verwenden die zuletzt gehaltene Note, danach die zuletzt freigegebene Note mit Release. LFOs laufen im Effekt-Ausklang weiter. Gemeinsame FX-Locks folgen der Ereignisreihenfolge; eine Effektinstanz je polyphoner Note wird nicht erzeugt. Master-FX erhalten keine Track-Routen. Panic entfernt ausstehende Noten-/Step-Konfigurationen und FX-Automation und führt die Basiswerte zurück.
- Gruppierte Matrix und FX-/LFO-Auswahlen, konsistente Desktop-Module und 55-px-Regler. Knöpfe zeigen Grundwert, gemeinsamen Modulationsbereich und wirksame Position. FX-Grafiken übernehmen geglättete Prozessorwerte, tatsächliche Variante und interne Phase; sie sind ausdrücklich schematische Vorschauen, keine Spektralanalyse. Der erweiterte Modulationsbereich scrollt im Panel und bietet die Matrix über die volle Breite.
- Individuelle FX-/LFO-IDs funktionieren in Step-/Piano-Noten-Locks und MIDI Learn einschließlich logarithmischer und diskreter Zuordnung. Die P-Lock-Ansicht zeigt auch gesperrte Varianten und LFO-Werte. Presets, Projekte und Undo/Redo verwenden den vorhandenen serialisierten State; dynamische IDs werden in kanonische verschachtelte Felder übersetzt. Import ergänzt Defaults, begrenzt Werte und migriert neue Felder. Alte Sounds behalten versionierte native FX-/LFO-Pfade; Legacy Hold bleibt eingefroren und entsprechend beschriftet. Erst die neuen Funktionen aktivieren den erweiterten Klangpfad.
- Live und WAV nutzen dieselben Worklets, Generatoren, Locks und Ereigniszeitachsen. Die Tail-Reserve berücksichtigt mögliche FX-Umschaltung, modulierte Feedback-/Zeitwerte, Sync-Divisionen und Gate-/Reverb-Ausklang. Lange Feedback-Tails können große Exportpuffer benötigen. Zufallsquellen und Free-Run-Phase sind keine sampleidentische Aufzeichnung einer vorausgegangenen Live-Session.

## Verifikation und Grenzen

Statische Durchsicht der Registry-, DSP-, UI-, MIDI-, Lock-, Import- und Offline-Pfade. Zusätzlich syntaktische Kompilierung der minifiziert eingebetteten neuen Worklet-Quellen mit esbuild, ohne die Prozessoren oder DSP-Schleifen auszuführen. `npm run build:pages` kompiliert TypeScript, erstellt das Produktions-Bundle und erzeugt `index.html`, `docs/index.html` und `release/PHASE.html` neu. `git diff --check` prüft Whitespace. Die bestehende Vite-Warnung zur Bundlegröße bleibt bestehen. Keine Testdateien oder Test-Abhängigkeiten ergänzt.

Klang, CPU-Last, Browserdarstellung, Gerätekompatibilität und Hardware-MIDI sind nicht praktisch verifiziert. Die neuen FX-Modelle können nach Aktivierung neuer Funktionen von den Legacy-Modellen abweichen; unveränderte alte Presets bleiben auf dem alten Pfad. Keine Smartphone-Anpassungen, kein Master-FX-Umbau und keine unbeteiligten Sequencer-/Synthese-Erweiterungen.

---

# Subtractive / OSC 1 Free Phase bei Detune vom 23.10.2026

Basis: GitHub-`main`, Commit `1d24f1d`, sauberer Checkout und gleicher Remote-Stand bei Beginn. Die Free-Phase-Initialisierung von OSC 1 verwendet jetzt `hz * 2 ** (-detune / 2400)`. Startphase und laufender DSP teilen dieselbe Frequenzfunktion; die bisherige laufende Frequenzberechnung bleibt identisch. Phase Reset, gespeicherte Phasenwerte, andere Engines sowie das Desktop-UI bleiben unverändert. Echtzeit-Audio und WAV-Export verwenden denselben korrigierten Worklet.

Verifikation: statische Durchsicht, TypeScript-/Produktionsbuild und erneutes Erzeugen der drei App-Dateien mit `npm run build:pages`, außerdem `git diff --check`. Keine Tests, Hörprüfungen oder Benchmarks angelegt oder ausgeführt. Die bestehende Vite-Warnung zur Bundlegröße bleibt bestehen.

---

# Gezielte Synthese-Korrekturen vom 23.10.2026

Basis: ausschließlich GitHub-`main`, Commit `9b1d07e`; sauberer Checkout und gleicher Remote-Stand bei Beginn. Bearbeitet wurden nur die fünf ausgeführten Review-Punkte. Punkt 6 enthielt keinen Befund. Keine Tests, Hörprüfungen, Browserprüfungen oder Benchmarks angelegt oder ausgeführt.

1. **Subtractive / OSC 2 – korrigiert:** Free Phase verwendet die tatsächliche Slave-Frequenz einschließlich OSC-2-Tuning, halbem Detune-Anteil, Sync Amount, globaler Tonhöhe und bestehender Nyquist-Begrenzung. Initialisierung und Phasenschritt teilen dieselbe Funktion, ohne die laufende Frequenzformel zu ändern. Die Startzeit berücksichtigt den Sample-Index innerhalb des Audioblocks; Phase Reset und gespeicherte Startphasen bleiben erhalten.
2. **Ring / AM – korrigiert:** Die freie Modulatorphase verwendet dieselbe Frequenzfunktion wie der laufende Modulator. Ratio folgt der effektiven Carrier-Frequenz; Fixed Hz bleibt unabhängig von der gespielten Note und berücksichtigt weiterhin Transpose und Pitch-Steuerung. Offset, Anfangswert der Pitch-ADSR und Frequenzbegrenzung gehen ebenfalls ein. Reset-Verhalten und laufender Modulations-DSP bleiben erhalten.
3. **Physical / Pickup Position – korrigiert:** Zwischen 0 und 10 % wird der differenzielle Abnahmetap mit einer glatten Smoothstep-Gewichtung eingeblendet. Bei 0 bleibt der bisherige neutrale Ausgang exakt bestehen; ab 10 % gilt wieder die volle bisherige Differenzabnahme. Der Grenzübergang zu 0 ist damit stetig und löst nicht unmittelbar eine nahezu vollständige Auslöschung aus. Feedback, Anregung, Body und weitere Saitenparameter wurden nicht verändert.
4. **Subtractive / subOctave – auf main bereits korrekt integriert:** Der Parameter ist in `ENGINE_PARAMS`, `ENGINE_DISCRETE`, `ENGINE_TRIGGER` und damit im Matrixkatalog enthalten. `triggerPatch` wertet seine Routen beim Anschlag aus, begrenzt und rundet die Oktave; die Sub-Quelle verwendet anschließend `frequency * 2 ** p.subOctave`. Presets, Locks, MIDI und der gemeinsame Live-/WAV-Notenpfad nutzen diese Daten bereits. Keine erneute oder zusätzliche Audio-Rate-Bindung ergänzt.
5. **Sampler / Slice-Invariante – korrigiert:** Eine geteilte Funktion begrenzt die ganze Slice-Anzahl auf 1–32 und den ganzen Index auf 0 bis Anzahl−1. Sie gilt bei Patch-Erzeugung, Preset-/Projekt-Import, Patch-/MIDI-Änderungen, Projektbearbeitung, Lock-Anwendung und anschließender Trigger-Modulation. Bestehende Step-/Piano-Locks und Piano-Migrationsbackups werden bei geändertem Count passend begrenzt; ein eigener Count-Lock hat Vorrang vor dem Patch-Count. Es werden keine zusätzlichen Slice-Locks erzeugt, wenn nur die Anzahl gesperrt ist. Unveränderte Daten behalten ihre Referenzen. DSP-Initialisierung und WAV-Dauerberechnung verwenden dieselbe Begrenzung. Knopf, Lock-Editor und MIDI-CC verwenden den aktuellen gültigen Slice-Bereich; der Ein-Slice-Fall mit Min=Max=0 erzeugt keine NaN-Knopfgeometrie. Undo stellt die vorherige Anzahl samt vorherigen Locks aus dem vorhandenen Projektsnapshot wieder her.

Verifikation: statische Durchsicht der betroffenen Daten-, DSP-, UI-, MIDI-, Modulations- und WAV-Pfade, TypeScript-/Produktionsbuild mit `npm run build:pages` und `git diff --check`. Die drei generierten App-Dateien wurden neu erzeugt. Die bestehende Vite-Warnung zur Bundlegröße bleibt bestehen. Kein Desktop-Layout, keine Smartphone-Regeln, keine Preset-Rezepte, Projektformate oder unbeteiligten Klangfunktionen geändert. Klang und Laufzeitverhalten wurden nicht praktisch geprüft.

---

# Syntheseformenerweiterung vom 23.10.2026

Basis: GitHub-`main` auf `85bef5e`, sauberer Checkout und unveränderter Remote-Stand bei Beginn. Die vorher abgeschlossenen FM-/Filter-/Sequencer-Arbeiten bleiben erhalten. Keine Tests, Browser-/Hörprüfungen oder Benchmarks angelegt oder ausgeführt.

- Gemeinsamer numerischer Parameterkatalog für die sieben erweiterten Engines. Import-Sanitizer, diskrete Werte, Preset-/Projekt-JSON, Undo/Redo, MIDI Learn, sprechende Matrix-/Lock-Gruppen und Auswahlwerte im Lock-Editor. Aufwendige Topologie-/Phasen-/ADSR-Einstellungen werden beim Anschlag übernommen; Granular-Ziele pro Grain. Vorhandene Sounds erhalten `engineVersion: 1`, alte PWM-Werte werden auf beide Oszillatoren kopiert, auch bei Step-/Noten-Locks. Legacy-Ring-Bias und initialer Bogen bleiben kompatibel auswählbar. Neue Funktionen aktivieren den erweiterten Pfad. Alle bisherigen Factory-Sounds/Indizes bleiben erhalten, ergänzt um sieben Expansion-Presets.
- Lokaler Worklet für Hard Sync mit getrennter PWM, Phasenstart und Reset/Free. Getrennte Sub-Wellenform/Oktave und Noise Color im gemeinsamen Native-Pfad. Sync Amount erhöht die Slave-Frequenz; Rücksetzen wird mit einem kurzen ausklingenden Korrekturwert geglättet. Es handelt sich nicht um vollständig aliasfreien BLEP-Sync.
- Wavetable: Bend/Fold/Sync/Mirror, Spread je Unison-Position, Morph Skew, Reset/Random Phase und geglättete spektrale Koeffizienten. Neue Warp-Tabellen werden nach der Phasentransformation erneut per FFT bandbegrenzt und bei Änderungen überblendet. Der bisherige Phase-Warp bleibt im Legacy-Pfad erhalten.
- Additive: acht Harmonic-Bänder für je vier der 32 Partials, individuelle feste Verstimmung und langsamer Drift, spektral gestaffelter Decay, Blur und zufällige Startphasen. Sinus-Lookuptabelle und wiederverwendeter Partial-Speicher. Gain-Bänder werden nicht durch eine anschließende automatische Pegelnormalisierung wieder aufgehoben.
- Ring/AM: Ratio/Fixed Hz, Modulator-Startphase/Reset, getrennte Pitch-/Depth-ADSR mit Vorschauen, musikalisch begrenztes Sideband Tilt und Lowpass. Neuer Bias wirkt im Modulatorsignal vor der Multiplikation; alte Sounds behalten ihren Dry-Bias. Ratio-Referenzen gleiten bei Legato, Fixed Hz bleibt unabhängig von der gespielten Note. Pitch Bend/Transpose bleiben wirksam.
- Granular: Hann/Triangle/Gaussian/Tukey plus Legacy-Rampen, separate Attack/Release-Zeiten, chromatische/Dur/Moll/Pentatonik-Quantisierung mit Grundton, 1/64 bis zwei Takte, Freeze der aktiven Grain-Rezepte sowie Stereo Motion/Drift. Freeze hält Position, Rate, Fenster und Pan der Cloud und setzt den Scan anschließend fort. Live-Änderungen folgen dem bestehenden 150-ms-Scheduler. Beendete Knoten und Bindungen werden weiterhin entfernt.
- Sampler: gemeinsam gecachte PCM-Daten, kubische Abtastinterpolation, One-shot/Gate/Loop, gleiche Slices mit selektierbarem Index und Velocity-Versatz, Crossfade und geglätteter Ping-pong-Richtungswechsel. Pitch-unabhängiger Time Stretch über vier überlappende Hann-Fenster mit gemeinsamer Lookup-Tabelle. Der Cache wird auf 64 MiB begrenzt; aktive Stimmen behalten ihre PCM-Referenzen. One-shot-Ende wird aus Slice-Länge und Tonhöhe beim Anschlag geplant, unabhängig von Note-off. Nachträgliche starke Pitch-/Duration-Modulation kann deshalb das geplante Ende und den tatsächlichen PCM-Verlauf auseinanderlaufen lassen. Extreme Dehnung/Transposition kann Körnungsartefakte erzeugen; kein transientenerhaltender Phase-Vocoder.
- Physical: laufendes Fractional-Delay-Saitenmodell mit Pick Hardness, differenzieller Pickup-Abnahme, verlängerter Anregung, Body-Frequenz/Q und dispersiver Allpass-Steifigkeit. Begrenzte kontinuierliche Bogenreibung mit Pressure/Speed während des Gates. Drei Saiten tauschen begrenzt Energie aus; Dämpfung, Sättigung und DC-Block begrenzen den Umlauf. Saiten-/Body-Koeffizienten werden nur bei geänderten Werten berechnet. Sehr tiefe Physical-Noten sind auf 20 Hz begrenzt.
- Audio-Lebenszyklus: neue Quellen erhalten geplante Active/Gate-Werte, Release und Dispose; Ports, Timer, AudioNodes und Modulationsbindungen werden freigegeben. Live und WAV laden dieselben eingebetteten Worklets. Der Offline-Renderer decodiert importierte Samples einmal vor der Größenberechnung und reserviert One-shot-Ausklang samt Release und FX. Bestehendes Desktop-Raster und 55-px-Knöpfe, aufklappbare Character-Bereiche, Ring-ADSR-Regler in einer Reihe. Keine Smartphone-Regeln, Netzwerkdienste oder Abhängigkeiten ergänzt.

Verifikation: statische Code-Durchsicht, TypeScript-/Produktionsbuild und neu erzeugte portable App-Dateien über `npm run build:pages`; `git diff --check`. Die bestehende Vite-Warnung zur Bundlegröße bleibt bestehen. DSP-Klang, sichtbare Bedienung, Polyphonie und tatsächliche CPU-Last wurden gemäß Vorgabe nicht praktisch geprüft. Die Quellenvorschauen sind schematische Darstellungen und kein Oszilloskop des laufenden Signals.

---

# FM-/Filter-Korrekturen und neue Soundbank vom 23.10.2026

Basis: GitHub-`main` auf `ff77f42`, sauberer Checkout und unveränderter Remote-Stand bei Arbeitsbeginn. Keine Tests, Browser-/Hörprüfungen oder Benchmarks ausgeführt.

- FM-Randomize verwendet die tatsächlichen drei Operatoren samt Modi, Waveforms, Tuning, Pegeln, Feedback, ADSRs/Kurven, drei Indizes und sechs Algorithmen. Die alten FM-Ratio/Index-Felder werden nicht mehr für FM randomisiert; Ring/AM behält seinen Ratio-Regler. Neue FM-Patches beginnen mit wirksamen OP-3-Indizes. Nur explizite Legacy-Rezepte werden migriert; importierte Legacy-Patches und vorhandene Null-Indizes, auch in partiellen v2-Importen, behalten ihre Werte.
- MIDI Learn an der Algorithmusauswahl, sechs gleich große CC-Bereiche, persistente Bindings und Undo beim Routingwechsel. Numerische Operator-Bindings bleiben unverändert.
- Comb-Regler und Katalogziel heißen Wet gain; gespeicherter Schlüssel und Pegelwirkung bleiben unverändert. Die Beschriftung erklärt die Anhebung des gesamten Wet-Signals auch bei Feedback 0.
- Optionales 2×-Oversampling für Ladder/Acid mit zwei polyphasen 63-Tap-Halbband-FIR-Stufen, intern doppelter DSP-Rate und um 31 Basissamples verzögertem Dry-Pfad. Umschaltung verwendet die bestehende Topologie-Überblendung, Locks/MIDI/Matrix und WAV-Export. 1× bleibt Default. Notenlokale Filter-Locks und abgetastete Topologie bleiben bei unbeteiligten Projektänderungen erhalten; explizite Filteränderungen wirken weiter live. Notch/Peak und separates Post-Drive werden nicht oversampled. Kleinsignal-Response enthält beide FIRs, die beiden Multirate-Frequenzzweige und die Dry-Verzögerung.
- Der Filter berechnet pro Biquad-Cutoff-Aktualisierung nur ein Sinus-/Cosinus-Paar für alle Stufen/Branches. Polgüten, Resonanz-Kennlinien und Gain-Potenzen werden bei Änderung separat aktualisiert; ungenutzte SVF/Biquad/Ladder-Berechnungen entfallen. Ladder-Gewichte werden ohne neue Arrays rekursiv berechnet; die Worklet-Liste variierender Parameter wird wiederverwendet. Audio-Rate-Steuerung bleibt erhalten. Das reduziert berechnete Operationen; die tatsächliche CPU-Last wurde nicht gemessen.
- Filter-ADSR-Grafik auf 0–100 % normalisiert und vollständig von Cutoff, Tiefe, Vorzeichen und Velocity entkoppelt. Sie verwendet dieselben normierten Kurvenfunktionen wie die Filter-Envelope als Modulationsquelle; die bestehende asymptotische Hz-Rückkehr zur Basis bleibt im Klangpfad erhalten. Phasengrenzen werden exakt abgetastet, damit auch ein sehr kurzer Attack den 100-%-Peak zeigt. Zeitverhältnisse bleiben proportional. Vier ADSR-Knöpfe wieder nebeneinander, doppelter oberer Divider und Leerabstand entfernt.
- 56 handgeschriebene Soundrezepte, acht je Engine außer Sampler. Als feste Acht-Tupel typisiert. Alle bisherigen zwölf Demo-Presets und deren Indizes bleiben erhalten. Neue Presets sind im bestehenden Browser mit Suche/Engine-Filter ladbar; ausgewählte Sounds speichern bewusst FX-ON. Keine externen Audiodateien oder Dienste.

Abschlussprüfung: statische Durchsicht, TypeScript-/Produktionsbuild und portable App-Dateien über `npm run build:pages`, außerdem `git diff --check`. Die bestehende Vite-Warnung für das große Bundle bleibt bestehen. Preset-Klang und Oversampling wurden nicht gehörmäßig oder per Audiovergleich beurteilt.

---

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
