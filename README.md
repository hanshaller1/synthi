# PHASE — Sound in motion

Eine Synthesizer-Webapplikation mit echter Klangerzeugung im Browser, vier Instrument-Tracks und einem Elektron-inspirierten Parameter-Lock-Sequencer. React, TypeScript, Vite und die native Web Audio API. Kein Backend und kein Konto erforderlich.

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

Jeder der vier Tracks besitzt eine eigene Engine, einen Resonanzfilter, zwei ADSR-Hüllkurven, zwei LFOs, eine Modulationsmatrix und eine Effektkette.

| Engine      | Klangparameter                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------ |
| Subtractive | Zwei Oszillatoren mit Sinus, Dreieck, Sägezahn oder Rechteck; Detune, Mix, Sub-Oszillator, Noise |
| Wavetable   | Spektrales Morphing zwischen Sinus, Dreieck, Sägezahn und Rechteck; zwei verstimmte Oszillatoren |
| FM          | Zwei Operatoren, frei einstellbares Frequenzverhältnis und Modulationsindex                      |
| Additive    | 1–32 harmonische Teiltöne, spektrale Helligkeit und Gewichtung gerader/ungerader Harmonischer    |
| Ring / AM   | Amplituden-/Ringmodulation mit einstellbarem Verhältnis und stufenlosem Modulationstyp           |
| Granular    | Überlappende, gefensterte Sample-Grains; Größe, Dichte, Position und Streuung                    |
| Sampler     | Chromatische Wiedergabe, Root Note, Start-/Endpunkt und Loop                                     |
| Physical    | Karplus-Strong-Saitenmodell mit Dämpfung und Anregung                                            |

Sampler und Granular enthalten eine interne Textur und akzeptieren eigene Audiodateien (maximal 15 MB und 60 Sekunden). Unterstützte Formate hängen vom Audio-Decoder des Browsers ab. Samples werden in Projekt- und Preset-Dateien eingebettet.

### Mono, para und poly

Der **VOICE**-Schalter gilt pro Track:

- **Monophonic:** eine Tonhöhe, Last-Note-Priority, Legato und Portamento.
- **Paraphonic:** mehrere Tonhöhen durch einen gemeinsamen Filter und eine gemeinsame Filter-/Amp-Artikulation.
- **Polyphonic:** getrennte Filter und Hüllkurven pro Stimme.

Die Engine begrenzt gleichzeitig gehaltene Stimmen auf 32 und gibt bei Überlastung die älteste Stimme frei. Granular-Noten benötigen je nach Dichte zusätzliche Buffer-Source-Knoten.

### Filter, Modulation und Effekte

- Resonanter 12-dB-Lowpass, Highpass, Bandpass oder Notch; Drive vor dem Filter.
- Separate ADSR-Hüllkurven für Filter und Lautstärke; bipolare Filter-Envelope-Tiefe.
- Zwei LFOs mit Sinus, Dreieck, Rechteck und Sägezahn; freie Rate oder Tempo-Synchronisation, Retrigger und Tiefe.
- Bis zu acht Modulationsrouten: LFO 1/2, Velocity, Keytracking, Modwheel oder Filter-Envelope auf Cutoff, Pitch, Amplitude, Pan oder FM-Index.
- Saturation, Stereo-Chorus, Feedback-Delay und Stereo-Faltungshall pro Track.
- Master-Limiter, Oszilloskop und Pegelanzeige.

Regler ziehen; **Shift** für Feineinstellung. Mit den Pfeiltasten lassen sich fokussierte Regler bedienen, mit Home/End die Grenzen setzen. Doppelklick stellt den Standardwert wieder her. Rechtsklick startet MIDI Learn.

## Sequencer

Acht Pattern-Speicher **A01–A08**, jeder mit vier Tracks. Pro Track unabhängig:

- 1–64 Steps; vier Seiten mit jeweils 16 Steps.
- Auflösung 1/8, 1/16 oder 1/32; Forward, Reverse, Ping-pong oder Random.
- Tonhöhe, Single/Major/Minor/Fifth/Seventh-Akkord, Velocity und Gate.
- Wahrscheinlichkeit, Microtiming und 1–8-fache Ratchets.
- Always, 1:2, 2:2, 1:4, Fill und Not-Fill-Bedingungen.
- Parameter-Locks für Klangerzeugung, Filter, Envelopes sowie planbare Effektparameter.
- Globales Tempo, Tap Tempo, Swing, Mute/Solo, Kopieren/Einfügen, Duplizieren und musikalische Pattern-Generierung.

**Step klicken:** Trig ein-/ausschalten. **Shift + Klick** oder **Rechtsklick:** auswählen, ohne den Trig zu verändern. Der Trig-Editor bearbeitet den ausgewählten Step.

**P-LOCK aktivieren**, anschließend Instrument-Regler bewegen: Der Wert wird nur für den ausgewählten Step gespeichert. Locks können auch direkt im Lock-Editor ergänzt, editiert und entfernt werden. Saturation und Hallraum-Größe verändern Knoten-/Buffer-Konfigurationen und sind daher keine Step-Lock-Ziele. Die globalen Pattern- und FX-Regler bleiben separat verfügbar.

**Live Rec:** Keyboard-/MIDI-Noten werden am aktuellen Step aufgenommen. Im Stillstand werden Noten schrittweise eingetragen. Ein Step speichert eine Root Note und den gewählten Akkordtyp; Live Rec ist keine zeitlich freie Mehrspuraufnahme.

Die Wiedergabe verwendet einen Lookahead-Scheduler auf der AudioContext-Zeitachse. Sehr stark gedrosselte Hintergrund-Tabs können browserbedingt dennoch Aussetzer verursachen.

## MIDI und Keyboard

Web MIDI in **Chrome oder Edge** über **HTTPS oder localhost** verwenden. In den MIDI-Einstellungen Zugriff erteilen und Geräte auswählen. Ein- und Ausgänge werden bei Gerätewechsel aktualisiert.

- Eingehende Noten spielen den ausgewählten Track; Omni oder ein bestimmter Eingangskanal.
- Keyboard- und Sequencer-Noten gehen optional an den ausgewählten MIDI-Ausgang, Tracks 1–4 auf Kanälen 1–4.
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
- **WAV:** Offline-Rendering des aktuellen Patterns über 1/2/4/8/16 Takte, Stereo, 44,1 kHz / 16 Bit, mit Effekt-Ausklang.
- Größere Bearbeitungsaktionen wie Laden, Generieren, Leeren und Duplizieren lassen sich mit **Undo** rückgängig machen.

Wahrscheinlichkeiten und zufallsbasierte Klangerzeugung werden bei jedem WAV-Export neu berechnet. Lokales Autosave ersetzt keine Datei-Sicherung: Browserdaten löschen, privater Modus oder Speicherlimits können lokale Sessions entfernen.

## Hinweise zur Implementierung

Die acht Engines sind native Web-Audio-Implementierungen. Wavetable bietet vier integrierte Spektralanker; FM verwendet zwei Operatoren; Physical ist ein Saitenmodell. Es werden keine VSTs oder proprietären Hardware-Engines emuliert. Granular hält Live-Noten über einen nachgefüllten Grain-Scheduler und gibt beendete Grains laufend frei. Effekte pro Track sind gemeinsam für alle Stimmen des Tracks.

Die Anwendung wurde als Produktions-Bundle kompiliert; es wurden keine Tests ausgeführt. Hardware-MIDI erfordert die lokale Verbindung eines tatsächlichen Geräts.

## Dateien

- `src/model.ts`: Datenmodell, Factory-Presets, Importvalidierung und WAV-Codierung.
- `src/audio.ts`: Stimmen, Synthese, Filter/Envelopes/FX, Transport und Offline-Rendering.
- `src/midi.ts`: Web-MIDI-Verbindungen, Nachrichten und Ausgabe.
- `src/storage.ts`: IndexedDB sowie Dateiimport/-export.
- `src/Instrument.tsx`, `src/Sequencer.tsx`, `src/components.tsx`: Instrumentenoberfläche.
- `src/App.tsx`: Session-Verwaltung, Routing und Dialoge.
- `src/styles.css`: Responsives Studio-Design und barrierearme Fokuszustände.
