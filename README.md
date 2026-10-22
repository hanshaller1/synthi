# PHASE — Sound in motion

Eine Synthesizer-Webapplikation mit echter Klangerzeugung im Browser, acht Instrument-Tracks und einem Elektron-inspirierten Parameter-Lock-Sequencer. React, TypeScript, Vite und die native Web Audio API. Kein Backend und kein Konto erforderlich.

Der freigegebene [Backlog](BACKLOG.md) ist umgesetzt. Neue, dort künftig offene Punkte werden erst nach ausdrücklicher Aufforderung umgesetzt.

## Starten

Node.js 22.12+ oder 24 und npm verwenden.

```bash
cd /workspace/synthi
npm ci --cache /workspace/.npm-cache
npm run dev -- --port 5173
```

Im Browser die vom Entwicklungsserver angezeigte Adresse öffnen. **AUDIO START**, eine Keyboard-Taste oder **Play** aktiviert die Audio-Engine. Eine Demo-Session ist bereits programmiert. Kopfhörer anschließen und mit niedrigem Master-Pegel beginnen.

```bash
npm run build      # TypeScript kompilieren und Produktions-Bundle erstellen
npm run preview    # das erstellte Bundle lokal bereitstellen
```

`dist/` kann auf einem beliebigen statischen HTTPS-Host veröffentlicht werden. Für dieses Projekt werden auf ausdrücklichen Wunsch keine Tests angelegt oder ausgeführt.

## Auf GitHub Pages veröffentlichen

Die App unterstützt **Deploy from a branch → main → /(root)** und **main → /docs**. Beide Ordner enthalten dieselbe fertig gebaute Anwendung als eigenständige `index.html` und jeweils eine `.nojekyll`-Datei. GitHub Pages muss kein npm oder TypeScript ausführen. JavaScript, Styles und Icon sind eingebettet und funktionieren unter dem Projektpfad `/synthi/` sowie auf einer eigenen Domain.

1. Im GitHub-Repository **Settings → Pages** öffnen.
2. Bei **Build and deployment → Source** die Option **Deploy from a branch** auswählen.
3. **Branch: main** und **Folder: /(root)** auswählen; eine bereits vorhandene **/docs**-Konfiguration funktioniert ebenfalls.
4. **Save** anklicken und warten, bis GitHub den Deployment-Vorgang als erfolgreich anzeigt. Die erwartete Adresse ist `https://hanshaller1.github.io/synthi/`; die tatsächliche Adresse steht in den Pages-Einstellungen.

Nach Codeänderungen alle Veröffentlichungsdateien neu erzeugen:

```bash
npm run build:pages
```

Dadurch werden `index.html`, `docs/index.html` und `release/PHASE.html` aktualisiert. Diese Dateien zusammen mit dem Quellcode committen und nach `main` pushen. GitHub Pages übernimmt die Änderungen automatisch. Für diesen Weg sind keine eigenen GitHub-Actions-Workflows oder Tests erforderlich.

Die Entwicklungsdatei liegt separat unter `app/index.html`; sie lädt über `app/main.tsx` den Quellcode aus `src/`. Die Dateien im Repository-Wurzelverzeichnis und unter `docs/` enthalten fertig kompiliertes JavaScript. So wird bei Veröffentlichung von `/(root)` keine TSX-Entwicklungsdatei ausgeliefert.

Falls nach einer Veröffentlichung noch die alte Seite erscheint, den abgeschlossenen Pages-Deployment-Vorgang abwarten und anschließend mit **Strg + F5** neu laden. Eine Ladeanzeige und eine Fehlermeldung bei Startproblemen verhindern eine kommentarlos leere Oberfläche.

## Fertige HTML-Datei von GitHub laden

Die eigenständige Anwendung liegt unter `release/PHASE.html`. In GitHub die Datei öffnen und mit **Download raw file** herunterladen. Die heruntergeladene Datei mit Chrome oder Edge öffnen, dann **AUDIO START** und **Play** anklicken. Kein npm oder lokaler Entwicklungsserver erforderlich. Die Datei öffnet die Anwendung lokal und ist keine gehostete Webvorschau.

Der aktuelle Quellcode kann zusätzlich über **Code → Download ZIP** heruntergeladen werden.

## Ohne Installation öffnen

```bash
npm run build:portable
```

Das erzeugt zusätzlich `dist/PHASE.html`. Diese einzelne Datei enthält den gesamten Synthesizer, einschließlich JavaScript, Styles und Icon. Auf den eigenen Rechner kopieren und mit Chrome oder Edge öffnen; für die Klangerzeugung sind weder Node.js noch ein Server erforderlich. Nach dem Öffnen **AUDIO START** und **Play** anklicken.

Browser können lokalen HTML-Dateien Speicher- oder MIDI-Berechtigungen verweigern. Projekte dann als JSON exportieren; für Hardware-MIDI weiterhin die über HTTPS oder localhost bereitgestellte Anwendung verwenden. Eine Vorschau-Fehlermeldung der Cloud-Einrichtungsoberfläche wird durch diesen Export nicht repariert; die HTML-Datei ist ein davon unabhängiger Startweg.

## Klangerzeugung

Jeder der acht Tracks besitzt eine eigene Engine, einen Resonanzfilter, zwei ADSR-Hüllkurven, drei LFOs, eine Modulationsmatrix und eine Effektkette.

| Engine      | Klanggestaltung                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Subtractive | Zwei einzeln visualisierte Oszillatoren, Osc-2-Transpose, Pulsbreite, analoger Drift, Detune, Mix, Sub und Noise                           |
| Wavetable   | 32 Tabellen aus acht Familien; Morph-Position, spektrale Helligkeit, Phase-Warp, Formanten und Detune                                      |
| FM          | Bis zu drei Operatoren, serieller/paralleler Algorithmus, zwei Modulationsverhältnisse und Indizes, Feedback sowie Index-Decay und Endwert |
| Additive    | 1–32 Teiltöne, gerade/ungerade Harmonische, Helligkeit, Tilt, Partial-Peak mit Boost und Inharmonizität                                    |
| Ring / AM   | Eigene Oszillatoranzeigen, AM/Ring-Übergang, Tiefe, Dry-Carrier, Bias und Modulator-Frequenzoffset                                         |
| Granular    | 32 Texturen, Grain-Größe und Dichte, Position/Jitter, Scan, Pitch-Streuung, Reverse-Wahrscheinlichkeit, Pan-Streuung und Fenster-Attack    |
| Sampler     | 64 Sounds, chromatische Wiedergabe mit Root Note und Fine Tune, Trim, Loop-Start/-Ende, Reverse und Edge-Fade                              |
| Physical    | Karplus-Strong-Saitenmodell mit Noise/Pick/Bow-Anregung, Pick-Position, Dämpfung, Decay, Dispersion und Körperresonanz                     |

Im Klangquellen-Modul trennen **Source**, **Character** und **Unison** die Parameter. Unison ist je Track mit **1–8 Stimmen**, eigener Verstimmung und Stereo-Breite einstellbar und funktioniert mit allen acht Engines. Der Sub-Oszillator bleibt zentriert.

Die Bibliotheken werden deterministisch im Browser als PCM erzeugt und sind vollständig offline verfügbar. Es handelt sich um synthetische Samples, keine externen Aufnahmen. Granular bietet acht Gruppen mit jeweils vier Texturen: Nature, Vocal, Tonal, Metal, Digital, Rhythmic, Bass und Atmosphere. Der Sampler enthält je vier Varianten in Kick, Hat, Percussion, Tom, Ride, Shaker, Rimshot, Snare, FX, Chord, Lead, Bass, Acid, Piano, Stab und Pad. Die Wavetable-Familien heißen Analog, Digital, Formant, Harmonic, Metal, Organ, Chiptune und Texture; jede umfasst vier morphbare Tabellen.

Sampler und Granular akzeptieren außerdem eigene Audiodateien (maximal 15 MB und 60 Sekunden). Unterstützte Formate hängen vom Browser-Decoder ab. Eigene Samples werden in Projekt- und Preset-Dateien eingebettet; bei eingebauten Sounds genügt die gespeicherte Bibliotheks-ID. Aufwendige Klangquellen-Einstellungen gelten ab dem nächsten Anschlag; Filter und laufende LFOs lassen sich während gehaltener Noten ändern.

### Mono, para und poly

Der **VOICE**-Schalter gilt pro Track:

- **Monophonic:** eine Tonhöhe, Last-Note-Priority, Legato und Portamento.
- **Paraphonic:** mehrere Tonhöhen durch einen gemeinsamen Filter und eine gemeinsame Filter-/Amp-Artikulation.
- **Polyphonic:** getrennte Filter und Hüllkurven pro Stimme.

Die Engine begrenzt gleichzeitig gehaltene Noten auf 32 (jeweils zuzüglich der gewählten Unison-Layer) und gibt bei Überlastung die älteste Stimme frei. Granular-Noten benötigen je nach Dichte zusätzliche Buffer-Source-Knoten.

### Filter, Modulation und Effekte

- Resonanter 12-dB-Lowpass, Highpass, Bandpass oder Notch; Drive vor dem Filter.
- Zusätzlich im Filter-Typ-Menü: **Multimode** mit LP 12/24 dB, HP 12/24 dB, Bandpass, Notch/Bandstop und Peak sowie **Comb** mit positiver/negativer Rückkopplung, Frequency, Feedback, Damping und Dry/Wet. Im Peak-Modus regelt „Peak gain“ die Anhebung. Beide Modelle sind vom Digitakt-II-Konzept inspiriert; die DSP-Implementierung ist eigenständig.
- Die Modelle arbeiten in Mono/Poly pro Stimme und in Para hinter der gemeinsamen Stimmsumme. Filter-Envelope und Cutoff-Modulation steuern beim Comb die Frequenz der Verzögerungsschleife; Feedback, Damping und Dry/Wet sind ebenfalls per Step sperrbar und über MIDI Learn zuweisbar. MIDI-CC 71 steuert beim Comb das Feedback, bei den übrigen Filtern die Resonanz.
- Der Comb verarbeitet eine fraktionale Verzögerung und eine gedämpfte Rückkopplung in einem lokalen AudioWorklet; damit entsteht keine Mindest-Verzögerung durch eine Web-Audio-Feedbackschleife. Er benötigt einen aktuellen Browser mit AudioWorklet-Unterstützung (GitHub Pages über HTTPS oder lokal über den Entwicklungsserver). Das Worklet ist auch in der einzelnen HTML-Datei enthalten, ohne externe Nachlade-Datei. Die Frequenzanzeige zeigt die Grundstellung ohne laufende Modulation; beim WAV-Export laufen dieselben Filtermodelle.
- Separate ADSR-Hüllkurven für Filter und Lautstärke; bipolare Filter-Envelope-Tiefe.
- Drei LFOs mit Sinus, Dreieck, Rechteck, Sägezahn, **Exp**, **Ramp** und **Random**; freie Rate oder Tempo-Synchronisation, Retrigger und Tiefe.
- **Free:** wiederholter Verlauf; **Hold:** Wert beim Anschlag abtasten und halten; **One:** ein voller Zyklus; **Half:** ein halber Zyklus. One/Half enden danach auf null. Random liefert im Free-Modus stufenweise Zufallswerte, im Hold-Modus einen Zufallswert je Anschlag.
- Bis zu acht Modulationsrouten: LFO 1/2/3, Velocity, Keytracking, Modwheel oder Filter-Envelope auf die Parameter aller acht Engines, Filter und Amp. Die Zielauswahl ist nach Klangquelle, Filter und Hüllkurven gruppiert. Dazu gehören etwa PWM, Osc-Mix/Transpose, Wavetable-Auswahl/-Position/Warp/Formant, FM-Verhältnisse/Indizes/Feedback, additive Teiltöne und Spektralform, Ring/AM, sämtliche Grain-Parameter, Sample-Pitch, Filterresonanz, Comb-Feedback/-Damping/-Mix, Drive und Filter-Envelope-Tiefe.
- Kontinuierliche Ziele verändern auch gehaltene Noten. PWM, Wavetable- und additive Spektralmodulation sowie moduliertes Filter-Drive verwenden ein lokales AudioWorklet, einschließlich beim WAV-Export. Granular-Ziele werden je Grain ausgewertet. Mit **„Anschlag“** gekennzeichnete Ziele – unter anderem Modell-/Sample-Wechsel, Unison-Anzahl, Sample-Trim/Loop, Saiten-Anregung und Hüllkurvenzeiten/-Sustain – werden auf der Audio-Zeitachse je Note abgetastet. So verändern sie neue Artikulationen, ohne laufende Samples oder Filtergraphen abzureißen.
- Amp-Level und seine Modulation wirken pro Stimme vor den Track-FX. Mute/Solo schaltet den gemeinsamen Track-Ausgang einschließlich Effektfahnen.
- Vier FX-Slots pro Track mit jeweils fünf Varianten:
  - **Saturation:** Soft clip, Hard clip, Wavefolder, Bit crush, Diode.
  - **Modulation:** Chorus, Flanger, Vibrato, Phaser, Tremolo.
  - **Delay:** Digital, Tape, Ping-pong, Multi-tap, Dub.
  - **Reverb:** Room, Hall, Plate, Spring, Gated.
- Jeder Effekt hat passende eigene Parameter und eine eigene, parameterabhängige Visualisierung: unter anderem Bit-Tiefe, Folds, Bias, Modulationsrate/-tiefe, Flanger-Feedback, Tape-Age/Wow, Tap-Spacing, Reflections, Spring-Tension und Gate-Länge.
- Die Slots liegen **seriell** im Signalweg. Neue Patches und Factory-Sounds starten mit allen vier Track-FX-Slots auf **BYPASS**. Mit den Pfeilen die Reihenfolge ändern; **ON/BYPASS** schaltet jeden Slot einzeln um. Parameter und ausdrücklich gespeicherte ON/BYPASS-Zustände bleiben beim Laden erhalten.
- Die Varianten schalten echte Signalwege, Kennlinien und Impulsantworten um. Spring ist eine synthetische Federhall-Näherung; Bit crush quantisiert die Amplitude.
- Master-Limiter, Oszilloskop und Pegelanzeige.

Regler ziehen; **Shift** für Feineinstellung. Mit den Pfeiltasten lassen sich fokussierte Regler bedienen, mit Home/End die Grenzen setzen. Doppelklick stellt den Standardwert wieder her. Rechtsklick startet MIDI Learn.

## Arbeitsbereiche

Alle drei Panels verwenden denselben kompakten Header mit Titel, Kontext und Aktionen nach dem Sequencer-Aufbau. Hintergrund, Rahmen, Schrift und Akzente folgen gemeinsam dem Synthesizer-Design; Master FX besitzt keine eigene gelb-grüne Gestaltung oder kursive Titelzeile mehr.

**Synthesizer**, **Sequencer** und **Master FX** sind getrennte Hauptregister; nur der ausgewählte Editor ist sichtbar. Die Wiedergabe läuft beim Umschalten weiter. Das Layout nutzt die Browserhöhe ohne Seiten-Scrollleiste. Texte und Bedienelemente sind bei normalem Browserzoom größer ausgelegt. Hilfe, Einstellungen und Speicherstatus stehen in der Topbar; eine zusätzliche Workspace-Bar entfällt. Auf schmalen Displays haben Klangquelle, Filter, Amp, LFOs/Matrix und FX-Slots eigene Unterregister; die Modulationsmatrix zeigt dort vier Routen pro Seite. Das Keyboard zeigt auf Smartphones zwei Oktaven mit 25 Tasten, auch im Touch-Querformat; auf größeren Bildschirmen vier Oktaven mit 49 Tasten, jeweils einschließlich des abschließenden C. Die Anzeige passt sich beim Drehen oder Ändern der Fenstergröße automatisch an. Über −/+ oder Z/X lässt sich der angezeigte Bereich verschieben.

Bestehende Projekte mit vier Tracks werden beim Laden um vier leere Tracks erweitert. Bestehende Presets erhalten fehlende LFO-Modi, Klangparameter und FX-Einstellungen. Ältere Steps erhalten die bisherige Standardlänge; ältere Projekte starten mit neutralen Master-FX. Die nun serielle Track-FX-Kette kann den Klang bestehender Patches gegenüber der früheren parallelen Anordnung verändern.

## Sequencer

Acht Pattern-Speicher **A01–A08**, jeder mit acht Tracks. Pro Track unabhängig:

- 1–64 Steps; vier Seiten mit jeweils 16 Steps.
- Auflösung 1/8, 1/16 oder 1/32; Forward, Reverse, Ping-pong oder Random.
- Notenname je Step über eine Auswahl im vollständigen MIDI-Bereich (0–127), Single/Major/Minor/Fifth/Seventh-Akkord, Velocity und Gate. Auch sehr tiefe oder hohe Live-Rec-Noten bleiben beim Speichern und Import erhalten.
- Individuelle Step-Länge: ½, 1, 1½, 2, 3, 4, 6 oder 8 Rastereinheiten. Angezeigt werden musikalische Werte wie 1/32, 1/16, 1/8 und punktierte Längen; bei 1/32-Raster ist auch 1/64 möglich. Die Länge bestimmt den Abstand zum nächsten Step, Gate die Notendauer innerhalb dieses Abstands.
- Alle Track-Zeilen verwenden dieselbe Zeitskala mit 1/64-Noten als kleinster Einheit. Ein 1/8-Step belegt exakt den Platz zweier 1/16-Rasterzellen einschließlich des Zwischenraums. Folgenoten beginnen an der richtigen Rasterposition; kürzere Zeilen lassen rechts Platz frei. Die Anzeige berücksichtigt auch die Track-Auflösung und die vorigen Step-Seiten. Die Zeitmarkierungen oben zählen 1/16-Einheiten; die kleinen Zahlen im Step bleiben die Trig-Nummern.
- Wahrscheinlichkeit, Microtiming und 1–8-fache Ratchets.
- Always, 1:2, 2:2, 1:4, Fill und Not-Fill-Bedingungen.
- Parameter-Locks für Klangerzeugung, Filter, Envelopes sowie planbare Effektparameter.
- Globales Tempo, Tap Tempo, Swing, Mute/Solo, Kopieren/Einfügen, Duplizieren und musikalische Pattern-Generierung.

**Step klicken:** Trig ein-/ausschalten. **Shift + Klick** oder **Rechtsklick:** den Step-Dialog öffnen, ohne den Trig zu verändern. Dort Notenname, Länge und sämtliche Trig-Eigenschaften einstellen; die Pfeile wechseln zum benachbarten Step. Ein kompakter Editor steht außerdem direkt unter dem Raster.

**P-LOCK im Sequencer aktivieren**, ins Hauptregister **Synthesizer** wechseln und einen Instrument-Regler bewegen: Der Wert wird nur für den ausgewählten Step gespeichert. Locks können auch direkt im Lock-Editor ergänzt, editiert und entfernt werden. Drive-Kennlinie, Hallraum-Größe, Unison-Anzahl, Wavetable-Auswahl, Sampler-Reverse/-Fade sowie additive Topologieparameter sind keine Step-Lock-Ziele. Effekt-spezifische Zusatzparameter werden im Patch gespeichert. Die globalen Pattern- und FX-Regler bleiben separat verfügbar.

**Live Rec:** Keyboard-/MIDI-Noten werden am aktuellen Step aufgenommen. Im Stillstand werden Noten schrittweise eingetragen. Ein Step speichert eine Root Note und den gewählten Akkordtyp; Live Rec ist keine zeitlich freie Mehrspuraufnahme.

Die Wiedergabe verwendet einen Lookahead-Scheduler auf der AudioContext-Zeitachse. Sehr stark gedrosselte Hintergrund-Tabs können browserbedingt dennoch Aussetzer verursachen.

## Master FX

Das dritte Hauptregister bearbeitet den gesamten Stereo-Bus. **MASTER FX ON / BYPASS ALL** schaltet die Master-Verarbeitung um. Der Ausgangslimiter bleibt aktiv.

- **Heat / Drive:** acht eigene Kennlinien – Clean Boost, Saturation, Enhancement, Mid Drive, Rough Crunch, Classic Distortion, Round Fuzz und High Gain – mit Drive, Bias, Tone, Low Cut, Dry/Wet und Output. Die Sektion ist vom Bedienkonzept des Analog Heat MK II inspiriert, keine Emulation der Hardware.
- **Equalizer:** umschaltbar zwischen 2-Band (Low-/High-Shelf), 3-Band (Low-Shelf, Mitten-Bell, High-Shelf) und 8-Band (63 Hz bis 8 kHz). Jeder Modus behält seine eigenen Gain-Werte; Doppelklick auf einen Fader setzt ihn auf 0 dB.
- **Dynamics / Stereo:** Glue-Kompressor mit Threshold, Ratio, Attack, Release und Makeup. Stereo-Breite von Mono (0 %) über unverändertes Stereo (100 %) bis erweiterte Seitenanteile (200 %).
- **Space:** separat schaltbares Ping-pong-Delay und Stereo-Hall.

Signalweg: Track-Summe → Drive → EQ → Kompressor → Stereo-Breite → Delay → Hall → Master-Pegel → Limiter. Master-Einstellungen werden mit dem Projekt gespeichert und beim WAV-Export berücksichtigt.

## MIDI und Keyboard

Web MIDI in **Chrome oder Edge** über **HTTPS oder localhost** verwenden. In den MIDI-Einstellungen Zugriff erteilen und Geräte auswählen. Ein- und Ausgänge werden bei Gerätewechsel aktualisiert.

- Eingehende Noten spielen den ausgewählten Track; Omni oder ein bestimmter Eingangskanal.
- Keyboard- und Sequencer-Noten gehen optional an den ausgewählten MIDI-Ausgang, Tracks 1–8 auf Kanälen 1–8.
- Pitch Bend ±2 Halbtöne; Sustain CC64; Modwheel CC1; Level CC7; Resonanz CC71; Cutoff CC74.
- MIDI Learn pro Drehregler, lokal gespeicherte CC-Zuordnungen.
- Interne oder externe Clock; ausgehende Clock mit 24 PPQN und Start/Stop.
- Stop/Panic beendet Noten und leert die ausgehende MIDI-Warteschlange, sofern der Browser dies unterstützt.

| Taste                     | Funktion                             |
| ------------------------- | ------------------------------------ |
| Leertaste                 | Sequencer starten/stoppen            |
| A W S E D F T G Y H U J K | Chromatisches Keyboard               |
| Z / X                     | Oktave abwärts/aufwärts              |
| Escape                    | Noten stoppen; in Dialogen schließen |

## Speichern und Export

- **Autosave:** Projekt inklusive Samples in IndexedDB auf diesem Gerät.
- **Sound Library:** Factory-Presets und eigene gespeicherte Sounds; Suche und Engine-Filter.
- **Projekt-JSON:** alle Tracks, acht Patterns, Patches und eingebettete Samples.
- **Preset-JSON:** einzelner Patch inklusive Sample; über den Projekt-Import wieder laden.
- **WAV:** Offline-Rendering des aktuellen Patterns über 1/2/4/8/16 Takte, Stereo, 44,1 kHz / 16 Bit. Lange Gates, Release-Locks sowie der Ausklang von Track- und Master-Delay/-Hall bestimmen die zusätzliche Exportdauer; Delay-Wiederholungen werden bis unter −60 dB berücksichtigt.
- Größere Bearbeitungsaktionen wie Laden, Generieren, Leeren und Duplizieren lassen sich mit **Undo** rückgängig machen.

Wahrscheinlichkeiten und zufallsbasierte Klangerzeugung werden bei jedem WAV-Export neu berechnet. Lokales Autosave ersetzt keine Datei-Sicherung: Browserdaten löschen, privater Modus oder Speicherlimits können lokale Sessions entfernen.

## Hinweise zur Implementierung

Die acht Engines sind native Web-Audio-Implementierungen. Wavetables werden aus 32 definierten spektralen Rezepten erzeugt; FM verwendet bis zu drei Operatoren; Physical ist ein Saitenmodell. Es werden keine VSTs oder proprietären Hardware-Engines emuliert. Granular hält Live-Noten über einen nachgefüllten Grain-Scheduler und gibt beendete Grains laufend frei. Effekte pro Track sind gemeinsam für alle Stimmen des Tracks.

Die Anwendung wurde als Produktions-Bundle kompiliert; es wurden keine Tests ausgeführt. Hardware-MIDI erfordert die lokale Verbindung eines tatsächlichen Geräts.

## Dateien

- `src/model.ts`: Datenmodell, Factory-Presets, Importvalidierung und WAV-Codierung.
- `src/audio.ts`: Stimmen, Synthese, Filter/Envelopes/FX, Transport und Offline-Rendering.
- `src/midi.ts`: Web-MIDI-Verbindungen, Nachrichten und Ausgabe.
- `src/storage.ts`: IndexedDB sowie Dateiimport/-export.
- `src/Instrument.tsx`, `src/SourceEditor.tsx`, `src/Sequencer.tsx`, `src/components.tsx`: Instrumentenoberfläche.
- `src/catalog.ts`: 32 Wavetables und 96 synthetische Samples mit lokalen Erzeugungsrezepten.
- `src/lfo.ts`: LFO-Verläufe und Modi.
- `src/effects.ts`, `src/fx-spec.ts`, `src/FxRack.tsx`: serieller Effekt-Rack, Parameter und Visualisierungen.
- `src/master-audio.ts`, `src/MasterFX.tsx`: Master-Signalweg und Bedienoberfläche.
- `src/modulation.ts`, `src/spectral-worklet.ts`: Modulationsauswertung und laufende spektrale Klangerzeugung.
- `src/panels.css`: gemeinsame Gestaltung aller drei Panels und gemeinsames Step-Zeitraster.
- `src/studio.css`: größere Bedienelemente und Layout der erweiterten Bereiche.
- `src/App.tsx`: Session-Verwaltung, Routing und Dialoge.
- `src/styles.css`: Responsives Studio-Design und barrierearme Fokuszustände.
