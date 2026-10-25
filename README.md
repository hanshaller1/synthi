# PHASE — Sound in motion

Eine Synthesizer-Webapplikation mit echter Klangerzeugung im Browser, zwölf Instrument-Tracks und einem Elektron-inspirierten Parameter-Lock-Sequencer. React, TypeScript, Vite und die native Web Audio API. Kein Backend und kein Konto erforderlich.

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

Jeder der zwölf Tracks besitzt eine eigene Engine, einen Resonanzfilter, zwei ADSR-Hüllkurven, drei LFOs, eine Modulationsmatrix und eine Effektkette.

| Engine      | Klanggestaltung                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Subtractive | Zwei Oszillatoren, Hard Sync, getrennte Pulsbreiten, Startphasen/Reset, Sub-Wellenform/Oktave und Noise Color                           |
| Wavetable   | 32 Tabellen, Bend/Fold/Sync/Mirror, Table Spread, Morph Skew, Phase/Random Phase und Spectral Blur                                      |
| FM          | Drei Operatoren, sechs Algorithmen, Ratio/Fixed Hz, Fine Tune, Level, eigene ADSRs mit Kurven, getrennte Verbindungs-Indizes und Feedback je Operator |
| Additive    | 32 Partials in acht Harmonic-Bändern, Spectral Decay, Detune/Drift, Blur und zufällige Startphasen                                    |
| Ring / AM   | Ratio/Fixed Hz, Modulatorphase, Pitch- und Depth-ADSR, tatsächlicher DC-Bias, Sideband Tilt/Filter                                         |
| Granular    | 32 Texturen, vier Fensterformen, Grain-Attack/Release, Skalenquantisierung, Tempo Sync, Cloud Freeze und Stereo Motion/Drift    |
| Sampler     | 64 Sounds, One-shot/Gate/Loop, bis zu 32 Slices, Velocity → Start, Crossfade/Ping-pong und unabhängiger Time Stretch                              |
| Physical    | Saitenmodell mit Pick Hardness, Pickup, Anregungsdauer, Body-Frequenz/Q, Steifigkeit, kontinuierlichem Bogen und Saitenkopplung                     |

Die Syntheseform wird über die Combobox im Synthesizer-Header direkt vor dem Preset-Namen ausgewählt. Das Synthese-Raster zeigt **Klangquelle**, **Character / Unison**, **Filter** und **Amplifier**. Die vier Bereiche sind gleich breit und nehmen jeweils ein Viertel des Rasters ein. Alle Engines verwenden gleich hohe Visualisierungen mit direkt darunter liegender Auswahl, auch beide Oszillatoren beziehungsweise Carrier und Modulator. Physical wählt dort die Anregung, Additive bietet vier Spektralvorlagen; manuelle Änderungen erscheinen als „Custom spectrum“. Noise steht bei allen Engines zentriert zwischen zwei Trennlinien. Character-Parameter und sämtliche Unison-Einstellungen sind in der zweiten Spalte gemeinsam sichtbar. Unison ist je Track mit **1–8 Stimmen**, eigener Verstimmung und Stereo-Breite einstellbar und funktioniert mit allen acht Engines. Der Sub-Oszillator bleibt zentriert. Der Noise-Regler mischt Rauschen mit einer festen Pegelabsenkung von 20 dB bei; Modulation und Parameter-Locks nutzen dieselbe Skalierung.

Die Bibliotheken werden deterministisch im Browser als PCM erzeugt und sind vollständig offline verfügbar. Es handelt sich um synthetische Samples, keine externen Aufnahmen. Granular bietet acht Gruppen mit jeweils vier Texturen: Nature, Vocal, Tonal, Metal, Digital, Rhythmic, Bass und Atmosphere. Der Sampler enthält je vier Varianten in Kick, Hat, Percussion, Tom, Ride, Shaker, Rimshot, Snare, FX, Chord, Lead, Bass, Acid, Piano, Stab und Pad. Die Wavetable-Familien heißen Analog, Digital, Formant, Harmonic, Metal, Organ, Chiptune und Texture; jede umfasst vier morphbare Tabellen.

Sampler und Granular akzeptieren außerdem eigene Audiodateien (maximal 15 MB und 60 Sekunden). Unterstützte Formate hängen vom Browser-Decoder ab. Eigene Samples werden in Projekt- und Preset-Dateien eingebettet; bei eingebauten Sounds genügt die gespeicherte Bibliotheks-ID. Aufwendige Klangquellen-Einstellungen gelten ab dem nächsten Anschlag; Filter und laufende LFOs lassen sich während gehaltener Noten ändern.

### Erweiterte Klangquellen

Die neuen Bereiche stehen in **Character / Unison**, im bestehenden Moduldesign mit denselben 55-px-Reglern. Alle Werte gehören zu Preset und Projekt und bleiben bei Undo/Redo erhalten. Rechtsklick auf neue Regler und Auswahllisten startet MIDI Learn. Numerische und diskrete Einstellungen stehen auch für Step-/Noten-Locks sowie die Modulationsmatrix zur Verfügung. „Anschlag“ bezeichnet beim Notenstart abgetastete Einstellungen; Granular wertet seine Ziele je Grain aus. Neue Worklet-Klangquellen benötigen HTTPS/localhost und AudioWorklet. Der WAV-Export verwendet dieselben Prozessoren.

- **Subtractive:** Sync Amount setzt OSC 2 am Zyklusanfang von OSC 1 zurück und erhöht seine Frequenz bis vier Oktaven zusätzlich. Getrennte Square-Pulsbreiten und Startphasen, Phase Reset/Free, vier Sub-Wellenformen und Oktaven −3 bis 0. Noise Color 0 bleibt weiß; negative Werte betonen tiefe, positive Werte hohe Anteile.
- **Wavetable:** Bend, Fold, Sync und Mirror arbeiten mit Warp Amount; Table Spread verteilt Morph-Positionen über Unison-Stimmen. Morph Skew verändert die Positionskurve. Startphase, freie Phase oder zufällige Phase sowie harmonische Spektralglättung ergänzen die Quelle. Die gewarpte Tabelle wird erneut bandbegrenzt.
- **Additive:** Acht separat regelbare Harmonic-Bänder mit jeweils vier Partials decken alle 32 Teiltöne ab. Detune und langsamer Drift wirken je Partial unterschiedlich, Random Phase verteilt Startphasen. Spectral Decay 0 ist aus; höhere Partials klingen sonst schneller aus. Blur glättet benachbarte spektrale Gewichte.
- **Ring / AM:** Modulator in Ratio oder Fixed Hz, eigene Startphase/Reset, vierstufige Pitch- und Modulationstiefen-Hüllkurven. DC modulator bias verschiebt den Modulator vor der Multiplikation. Sideband Tilt gewichtet tiefe/hohe Ausgangsanteile; Sideband LP filtert den Wet-Pfad. Legacy dry bias bleibt für alte Sounds erhalten. Die Ring-Hüllkurven haben je eine normierte Vorschau und vier nebeneinanderliegende ADSR-Regler.
- **Granular:** Hann, Triangle, Gaussian und Tukey plus Legacy-Fenster. Separate Attack/Release-Werte; 0 verwendet die Window-Attack-Balance. Quantisierung: Halbtöne, Dur, Moll oder Pentatonik mit eigenem Grundton. Sync ersetzt Density durch 1/64 bis zwei Takte. Freeze wiederholt die aktuell aktiven Grains mit ihren Positionen, Tonhöhen, Fenstern und Pan-Werten; beim Loslassen von Freeze geht der Scan weiter. Motion erzeugt periodische Pan-Bewegung, Drift eine langsamere zweite Bewegung. Live-Änderungen erreichen neue Grains im 150-ms-Planungsfenster.
- **Sampler:** One-shot ignoriert das Loslassen der Taste und plant sein Ende nach Slice-Länge und Anschlagstonhöhe; Gate folgt der Taste, Loop wiederholt den relativen Loop-Bereich innerhalb des Slices. Slices teilt den getrimmten Bereich in bis zu 32 gleiche Abschnitte, Slice wählt den Abschnitt (Anzeige 1–32, gespeicherter Index 0–31). Velocity → Start kann in beide Richtungen wirken. Loop Crossfade überblendet vorwärts am Übergang, Ping-pong rundet die Richtungswechsel. Time Stretch verwendet vier überlappende Hann-Fenster; Duration 0,25–4× steuert unabhängig von der Tonhöhe die Abspielgeschwindigkeit. Starke Dehnung oder Transposition kann körnige Artefakte erzeugen. Der Export berücksichtigt den One-shot-Ausklang über die Patternlänge hinaus.
- **Physical:** Pick Hardness formt die Anregung, Pickup Position erzeugt die virtuelle Differenzabnahme. Excitation Length verlängert die Rauschanregung. Body Frequency und Q haben bei 0 den bisherigen Auto-Zusammenhang mit Body. String Stiffness nutzt einen dispersiven Allpass. Continuous Bow regt die Saite während des Gates über eine begrenzte Reibungsfunktion an, mit Pressure und Speed. String Coupling koppelt drei Delay-Saiten über einen begrenzten Energieaustausch.

Alle bisherigen Factory-Sounds und importierten Projekte behalten ihren Legacy-Klangpfad. Alte Pulsbreiten werden auf beide Oszillatoren übertragen, einschließlich alter Step-Locks. Neue Funktionen aktivieren den erweiterten Klangpfad; bei dessen erster Aktivierung greift die Änderung ab dem nächsten Anschlag. Sieben zusätzliche Expansion-Sounds demonstrieren die neuen Funktionen im Soundbrowser, ohne vorhandene Presets zu ersetzen. Klanggleichheit und CPU-Last wurden nicht durch Hörprüfungen oder Benchmarks beurteilt.

### FM: drei Operatoren, sechs Algorithmen

Die vier Synthese-Spalten bleiben erhalten. **Oscillator** schaltet zwischen OP 1/2/3 um und zeigt Waveform (Sine, Triangle, Saw, Square), Ratio oder Fixed Hz, Fine Tune, Level und Feedback. Die FM-Index-Regler erscheinen für die aktiven Verbindungen des gewählten Operators. **Character / Unison** enthält die Algorithmuswahl mit Schaltbild und eine eigene OP-Auswahl für die Hüllkurve: Attack, Decay, Sustain, Release sowie Attack-/Decay-/Release-Kurve. Unison bleibt darunter. Filter und globale Amp-ADSR bearbeiten weiterhin das Gesamtsignal; Level, Pan und Transpose bleiben erhalten.

| Algorithmus | Modulation | Hörbare Operatoren |
| --- | --- | --- |
| 01 · Serial | OP 3 → OP 2 → OP 1 | OP 1 |
| 02 · Parallel | OP 2 → OP 1, OP 3 → OP 1 | OP 1 |
| 03 · Branched | OP 3 → OP 2 → OP 1, zusätzlich OP 3 → OP 1 | OP 1 |
| 04 · Dual Carrier | OP 3 → OP 2 | OP 1 + OP 2 |
| 05 · Hybrid | OP 3 → OP 2 → OP 1 | OP 1 + OP 2 |
| 06 · Triple Carrier | Keine Verbindung zwischen Operatoren | OP 1 + OP 2 + OP 3 |

**Randomize und Initialwerte:** FM-Randomize wählt eines der sechs Routings und variiert Waveform, Ratio/Hz-Modus, Frequenzen, Fine, Level, Feedback, ADSR/Kurven und alle drei Verbindungs-Indizes. Die Bereiche sind für musikalische Variationen begrenzt. Neue Patches starten mit `fmIndex32 = 0.65` und `fmIndex31 = 0.45`, sodass OP 3 in den entsprechenden Routings mitwirkt. Legacy-Migration und gespeicherte Nullwerte bleiben erhalten. Die Algorithmusauswahl unterstützt MIDI Learn per Rechtsklick; der CC-Bereich wird in sechs gleich große Abschnitte aufgeteilt.

**Level und Index:** Jeder Operator erhält zuerst seinen Level und seine ADSR. Dieses Signal wird sowohl an Audioausgänge als auch an Modulationsverbindungen weitergegeben. Jeder Pfeil besitzt einen eigenen Index: 2→1, 3→2 und 3→1. Ein Index von 1 bedeutet eine maximale Frequenzabweichung in Höhe der nominalen Modulatorfrequenz bei vollem Operatorpegel. Mehrere hörbare Operatoren werden summiert und nach ihrer Anzahl im Pegel ausgeglichen. Feedback ist für alle drei Operatoren unabhängig verfügbar und führt das vorherige Sample desselben Operators zurück. Signalpegel und momentane Frequenzen werden numerisch begrenzt; extreme Indizes können dadurch anders klingen als unbegrenzte FM.

**Artikulation und Tuning:** Ratio folgt der gespielten Note; Fixed Hz behält beim Notenwechsel seine Frequenz, auch bei Mono-Legato/Glide. Fine Tune, globale Transposition, Pitch Bend und bewusst zugewiesene Pitch-Modulation wirken weiterhin. Die OP-ADSRs sind zusätzlich zur globalen Amp-ADSR aktiv: Eine kurze globale Release-Zeit kann eine längere OP-Release abschneiden. Kurve 0 ist linear, positive Werte verlaufen zunächst langsamer, negative zunächst schneller. Routing, Waveform, Frequenzmodus und ADSR-/Kurvenwerte werden beim Anschlag übernommen. Ratio, Hz, Fine, Level, Index und Feedback sind laufend modulierbar und bei manuellen Änderungen geglättet. Waveform und Frequenzmodus unterstützen MIDI Learn per Rechtsklick auf die Auswahl, die Regler per Rechtsklick wie bisher. Alle numerischen Operatorparameter stehen als Locks und Modulationsziele bereit; Algorithmus-Modulation wird pro Anschlag ausgewertet. Reglergesten und die FM-Auswahl lassen sich rückgängig machen.

**Alte FM-Presets:** Import, lokaler Speicher und Factory-Presets migrieren automatisch nach `fmVersion: 2`. Die bisherigen Waveforms und Ratios werden OP 1/2/3 zugeordnet; OP 1 startet mit Ratio 1. Alte Indizes werden unter Berücksichtigung der Modulator-Ratio auf die jeweiligen Verbindungen umgerechnet. Index-Decay und -Endwert werden zu OP-2-Decay/Sustain; eine passende negative Decay-Kurve erhält den alten exponentiellen Verlauf. Sehr späte OP-Releases erhalten die bisher hauptsächlich globale Lautstärkeartikulation möglichst weitgehend. Alte Locks, Migrations-Backups und Modulationsziele werden ebenfalls übernommen, vorhandene MIDI-Zuordnungen bleiben bedienbar. Die alten Parameterfelder bleiben für Kompatibilität in den Daten, erscheinen aber nicht mehr als FM-Regler. `fmRatio` bleibt separat für Ring/AM nutzbar. Moderne FM-Presets werden beim erneuten Laden nicht nochmals migriert.

Die Umstellung ist nicht bitidentisch: Samplegenaues Feedback ersetzt die frühere zyklische DelayNode-Verbindung; OP-Envelopes formen nun auch Feedback, und Release bei während Decay losgelassenen Tasten folgt der neuen ADSR. Laufend modulierte alte Ratios können wegen der expliziten Indexdefinition andere Modulationstiefen erzeugen. WAV-Export und Echtzeit verwenden denselben neuen DSP. FM benötigt AudioWorklet über HTTPS oder localhost.

**FM-Performance:** Ein Stereo-Prozessor pro Note enthält alle Unison-Layer. Gemeinsam verwendete Hüllkurven und Steuerwerte werden einmal pro Sample berechnet; bandbegrenzte Waveform-Tabellen ersetzen laufende trigonometrische Oszillatorberechnungen. Gleichzeitig gelten maximal 32 FM-Noten und insgesamt 128 FM-Unison-Layer, einschließlich Release-Phasen (also bis zu 16 Noten bei acht Layern). Bei Überschreitung werden zuerst ausklingende, dann die ältesten Stimmen kurz ausgeblendet. Kurze Überlappungen dienen dem weichen Wechsel.

Der ausdrücklich angeforderte DSP-Benchmark ist mit `npm run benchmark:fm` wiederholbar. Er misst sechs Algorithmen, 1/8/16/32 Stimmen, achtfache Unison-Belegung, alle Waveforms, hohes Feedback sowie Audio-Rate-Modulation und Release. Er enthält keine Test-Assertions und benötigt keine zusätzlichen Abhängigkeiten. Er ersetzt keine Messung des gesamten Studios im Zielbrowser: Filter, Effekte, native AudioParam-Verarbeitung und Gerätepuffer sind darin nicht enthalten. Ergebnisse dieser Umgebung stehen in `REVIEW.md`.

### Mono, para und poly

Der **VOICE**-Schalter gilt pro Track:

- **Monophonic:** eine Tonhöhe, Last-Note-Priority, Legato und Portamento. Überlappende Live-Tasten im unveränderten Patch führen die vorhandene Stimme samt Hüllkurven weiter; ein frischer erster Anschlag beginnt ohne Glide von einer früheren Note.
- **Paraphonic:** mehrere Tonhöhen durch einen gemeinsamen Filter und eine gemeinsame Filter-/Amp-Artikulation.
- **Polyphonic:** getrennte Filter und Hüllkurven pro Stimme.

Die Engine begrenzt gleichzeitig gehaltene Noten auf 32 (jeweils zuzüglich der gewählten Unison-Layer) und gibt bei Überlastung die älteste Stimme frei. Granular-Noten benötigen je nach Dichte zusätzliche Buffer-Source-Knoten.

### Filter, Modulation und Effekte

- **Base-Width**, für alle acht Engines vor dem Main Filter: ein sanfter 6-dB/Oktave-Hochpass und ein ebenso sanfter Tiefpass. Base setzt die untere Grenze; die obere ist `Base × 2^Width`, Width wird in Oktaven eingestellt. Base **Open** überbrückt den HP, Width **Open** den LP. Beide Open sind auch bei eingeschaltetem Base-Width klangneutral. Eigener Bypass, Locks und Modulationsziele.
- **Main Filter:** Lowpass, Highpass, Bandpass, Notch; Multimode mit LP/HP **12/24/36/48 dB**, Bandpass, Notch/Bandstop, Peak **−24 bis +24 dB** sowie **Morph LP ↔ BP ↔ HP** mit 24-dB-Endpunkten. Morph mischt die komplexen Signale kontinuierlich, einschließlich ihrer Phasenlage.
- **Charakteristik:** Classic erhält die bisherige native Biquad-Abstimmung. Butterworth verteilt die Polgüten passend zur Flankensteilheit; State Variable verwendet TPT-Zustandsfilter. Ladder und Acid verwenden rückgekoppelte TPT-Einpol-Kaskaden mit nichtlinearer Sättigung; Acid hat eine steilere Resonanzansprache und asymmetrische Sättigung. Bei Ladder/Acid verwenden Notch und Peak resonante Biquads. Die neuen Profile nutzen eine gemeinsame normierte Resonanzregelung, statt LP/HP-dB und BP-Linear-Q direkt gleichzusetzen.
- **Ladder-/Acid-Qualität:** Optional **2×-Oversampling** mit zwei polyphasen 63-Tap-Halbband-FIR-Stufen gegen Aliasing. Der Dry-Anteil wird für phasenrichtiges Mischen um dieselben 31 Basissamples verzögert (ca. 0,65 ms bei 48 kHz). Der Frequenzgang berücksichtigt die FIR-Stufen und den verzögerten Dry-Pfad. 1× bleibt für bestehende Patches Standard. 2× benötigt mehr CPU und wirkt nur im Ladder-/Acid-Pfad, nicht bei Notch/Peak und nicht auf das separate Post-Drive. Die Reduktion der Aliasing-Artefakte ist keine vollständige Eliminierung.
- **Main Character:** Keytrack, Resonance compensation, Filter Dry/Wet, Drive und **Drive Pre/Post**. Die Kompensation gleicht insbesondere den Durchlasspegelverlust rückgekoppelter Ladder-Filter aus. Filter Mix mischt den Main Filter; Base-Width bleibt davor aktiv. Post-Drive folgt dieser Mischung. Manuelle Änderungen sind geglättet; Topologiewechsel werden überblendet.
- **Comb:** Feedback oder Feedforward, positive/negative Polarität, Frequency, Feedback/Feedforward-Anteil, Damping, Comb-Mix und **Wet gain 0…18 dB** im gesamten Wet-Pfad, auch bei Feedback 0. Feedback bleibt unter eins; interne Zustände und Ausgang besitzen eine numerische Schutzbegrenzung. Fine Tune reicht von −100 bis +100 Cent. Stereo spread verstimmt die Delay-Frequenzen symmetrisch bis insgesamt 100 Cent. Feedback HP und Feedback saturation wirken nur im Feedback-Modus. **Legacy · Linear** bewahrt die bisherige Interpolation; **HD · Lagrange** verwendet einen kubischen Fractional Delay mit vier Stützstellen.
- **Keytracking:** getrennt für normalen Filter und Comb, 0–100 %. Referenz ist MIDI 60/C4; 100 % ergibt innerhalb der Frequenzgrenzen exakt eine Oktave pro zwölf Halbtöne. Beim Comb verschiebt Keytrack die Delay-Frequenz, nicht den Grund-Cutoff. Damping und fractional-delay-Phasenlage beeinflussen die genaue Lage der Resonanzspitzen.
- **Filter Envelope:** ENV DEPTH von −6 bis +6 Oktaven, ADSR und Attack-/Decay-/Release-Curves von −100 bis +100. Kurve 0 erhält die bisherigen exponentiellen Hz-Rampen und die asymptotische Release-Phase; negative Kurven beginnen schneller, positive langsamer. Velocity → depth skaliert die Tiefe zwischen konstant (0 %) und proportional zum Anschlag (100 %). Die Filter-Envelope als Matrixquelle berücksichtigt ebenfalls die Kurven; ihre normalisierte Release-Phase fällt auf null. Hüllkurvenform, Sustain und Velocity-Einfluss werden beim Anschlag übernommen.
- Alle Modelle arbeiten in Mono/Poly pro Stimme und in Para hinter der gemeinsamen Stimmsumme; dort gilt die Artikulation der ersten gehaltenen Note und die letzte noch gehaltene Note bestimmt das Keytracking. Neue numerische Parameter stehen in **Locks, Modulationsmatrix und MIDI Learn** bereit, Regler-/Auswahländerungen in Undo/Redo. Diskrete Charakteristik-/Routing-Auswahlen und Envelope-Curves sind als Matrixziele mit „Anschlag“ gekennzeichnet. Base-Width-Bypass ist weich modulierbar. MIDI-CC 71 steuert beim Comb Feedback, beim Peak Gain (für alte Belegungen 0–20 dB), sonst Resonance.
- **Kompatibilität:** Neue Parameter starten neutral: Base-Width aus/Open, Classic, Pre-Drive, Mix 100 %, Compensation/Keytracking/Velocity/Curves 0, Comb Feedback/Legacy ohne zusätzliche Färbung. Bestehende Presets behalten damit ihre nativen Filter beziehungsweise das bisherige Comb-Worklet. Alte Peak-Gains, Routen, Step-/Noten-Locks und Piano-Backups werden migriert; alte automatisierte Multimode-Auswahlen behalten ihre bisherige Zuordnung. Eine manuelle neue Multimode-Auswahl aktiviert die erweiterte Zuordnung. Manuelle Bearbeitung des migrierten Peak-Gains gibt den neuen bipolaren Bereich frei.
- **Anzeigen:** Base, Envelope-Peak und Sustain besitzen getrennte Frequenzgangkurven. Vorschau-Note und Velocity sind wählbar, Stereo-Comb zeigt beide Kanäle. DSP und Anzeige teilen Koeffizienten, Fractional Delay und Übertragungsfunktionen. Die Anzeige enthält Base-Width, Mix, Keytracking und den Kleinsignal-Drive-Gain, ohne laufende Matrix/LFOs und ohne Oversampling-Entzerrung des nativen Pre-Drive. Sättigung und Schutzbegrenzung sind pegelabhängig; die Kurve ist deshalb keine Pegelgarantie für ein beliebiges Audiosignal. Die Filter-ADSR-Grafik zeigt die **normierte Steuerhüllkurve von 0–100 %** mit Attack-/Decay-/Release-Kurven. Attack, Decay und Release werden proportional zu ihren Zeiten gezeichnet; die Sustain-Haltephase dient als Vorschau. Cutoff, Env depth, Velocity und das Vorzeichen der Tiefe ändern die Form nicht. Dadurch bleibt sie auch bei Tiefe 0 sichtbar. Der Frequenzgang zeigt die resultierenden Frequenzbewegungen einschließlich negativer Tiefe. Die vier Filter-ADSR-Regler stehen in einer Reihe; die doppelte obere Trennlinie wurde entfernt.
- Comb und die erweiterten Filterpfade verwenden ein lokales AudioWorklet über HTTPS/localhost. Classic funktioniert weiterhin nativ. Das Worklet ist in der portablen HTML eingebettet. **WAV-Export verwendet dieselben Filter und Hüllkurven** wie Echtzeit.
- **Damping:** Beim Comb ist der Hz-Wert die Grenzfrequenz des Schleifen-Tiefpasses; niedrigere Werte dämpfen hohe Frequenzen stärker. Beim Physical-Modell bezeichnet Damping den erhaltenen Pegel pro Saitenumlauf: höher bedeutet weniger Verlust und längeres Ausschwingen. Physical-Damping wird beim nächsten Anschlag übernommen.
- Drei erweiterte LFOs mit acht Formen, Tempo-Sync, Retrigger, Phase, Fade/Delay und Kurvensteuerung; Details im Abschnitt **Modulation und Track Effects**.
- **Free Run / Note Retrigger / One Shot / Half Cycle / Sample & Hold** sind getrennte Modi. One/Half enden auf null; alte eingefrorene Hold-Einstellungen bleiben als Legacy erhalten.
- Bis zu 24 Modulationsrouten: LFOs, Expression, vier Hüllkurven, Random und Macros auf die Parameter aller acht Engines, Filter, Amp und Track-FX. Die Zielauswahl ist nach Klangquelle, Filter und Hüllkurven gruppiert. Dazu gehören etwa PWM, Osc-Mix/Transpose, Wavetable-Auswahl/-Position/Warp/Formant, FM-Verhältnisse/Indizes/Feedback, additive Teiltöne und Spektralform, Ring/AM, sämtliche Grain-Parameter, Sample-Pitch, Filterresonanz, Comb-Feedback/-Damping/-Mix, Drive und Filter-Envelope-Tiefe.
- Kontinuierliche Ziele verändern auch gehaltene Noten. PWM, Wavetable- und additive Spektralmodulation sowie moduliertes Filter-Drive verwenden ein lokales AudioWorklet, einschließlich beim WAV-Export. Granular-Ziele werden je Grain ausgewertet. Mit **„Anschlag“** gekennzeichnete Ziele – unter anderem Modell-/Sample-Wechsel, Unison-Anzahl, Sample-Trim/Loop, Saiten-Anregung und Hüllkurvenzeiten/-Sustain – werden auf der Audio-Zeitachse je Note abgetastet. So verändern sie neue Artikulationen, ohne laufende Samples oder Filtergraphen abzureißen.
- Amp-Level und seine Modulation wirken pro Stimme vor den Track-FX. Mute/Solo schaltet den gemeinsamen Track-Ausgang einschließlich Effektfahnen.
- Vier FX-Slots pro Track mit jeweils fünf Varianten:
  - **Saturation:** Soft clip, Hard clip, Wavefolder, Bit crush, Diode.
  - **Modulation:** Chorus, Flanger, Vibrato, Phaser, Tremolo.
  - **Delay:** Digital, Tape, Ping-pong, Multi-tap, Dub.
  - **Reverb:** Room, Hall, Plate, Spring, Gated.
- Jeder Effekt hat passende eigene Parameter und eine eigene, parameterabhängige Visualisierung: unter anderem Bit-Tiefe, Folds, Bias, Modulationsrate/-tiefe, Flanger-Feedback, Tape-Age/Wow, Tap-Spacing, Reflections, Spring-Tension und Gate-Länge.
- Die Slots liegen **seriell** im Signalweg. Neue Initial-Patches und bisherige Demo-Sounds starten mit allen vier Track-FX-Slots auf **BYPASS**. Einige Presets der neuen Soundbank speichern bewusst eingeschalteten Chorus, Delay oder Reverb. Mit den Pfeilen die Reihenfolge ändern; **ON/BYPASS** schaltet jeden Slot einzeln um. Parameter und ausdrücklich gespeicherte ON/BYPASS-Zustände bleiben beim Laden erhalten.
- Die Varianten verwenden echte Signalwege und Kennlinien; der Legacy-Hall arbeitet mit Impulsantworten, der erweiterte Hall mit einem steuerbaren Delay-Netzwerk. Spring ist eine synthetische Federhall-Näherung; Bit crush quantisiert Amplitude und Samplerate.
- Master-Limiter, Oszilloskop und Pegelanzeige.

Regler ziehen; **Shift** für Feineinstellung. Mit den Pfeiltasten lassen sich fokussierte Regler bedienen, mit Home/End die Grenzen setzen. Doppelklick stellt den Standardwert wieder her. Rechtsklick startet MIDI Learn.

## Arbeitsbereiche

Alle drei Panels verwenden denselben kompakten Header mit Titel, Kontext und Aktionen nach dem Sequencer-Aufbau. Hintergrund, Rahmen, Schrift und Akzente folgen gemeinsam dem Synthesizer-Design; Master FX besitzt keine eigene gelb-grüne Gestaltung oder kursive Titelzeile mehr.

**Synthesizer**, **Sequencer** und **Master FX** sind getrennte Hauptregister; die Wiedergabe läuft beim Umschalten weiter. Das Studio ist für Desktop ab 1280 × 600 CSS-Pixeln ausgelegt. Auf kleineren Fenstern bleibt die Desktop-Struktur erhalten. Smartphone-Layouts, Touch-Anpassungen und mobile Unterregister sind entfernt. Die Panels nutzen die frei gewordene Fläche ohne Studio-/Sequencer-Footer. Alle Shortcuts stehen im **?** in der Topbar; MIDI steht direkt vor den Studio-Einstellungen.

Synthesis, Modulation und Effects stehen direkt im Synthesizer-Header. Modulation zeigt drei LFOs, darunter zwei Mod-Envelopes und Macros/Random, anschließend die Matrix über die volle Breite. Die Desktop-Seite scrollt im Panel und verwendet das gemeinsame Moduldesign. Master-FX zeigt Drive, EQ, Dynamics/Stereo und Space nebeneinander, mit Echo und Hall untereinander. Filter- und Amp-Hüllkurve verwenden dieselbe normierte 0–100-%-Grafik mit identischer Geometrie, Höhe, Farbe, Linien, Prozentachse und A/D/S/R-Wertezeile. Beide zeigen die jeweiligen Parameter einschließlich Locks; die Filteranzeige berücksichtigt zusätzlich ihre Kurven. Attack, Decay und Release bleiben proportional zu ihren Zeiten; 20 % der Filter-Hüllkurvenhöhe stehen zusätzlich der Response-Anzeige zur Verfügung.

Das Keyboard zeigt vier Oktaven mit 49 Tasten. Ein Button in seinen Controls halbiert die Höhe; der Editor darüber wächst entsprechend. Über −/+ oder Z/X lässt sich der angezeigte Bereich verschieben. **BPM** per Maus vertikal ziehen (Shift: fein), oder den Wert anklicken, löschen und neu eingeben; Enter übernimmt, Esc verwirft die Texteingabe.

Bestehende Projekte mit vier oder acht Tracks werden beim Laden auf zwölf Tracks mit zusätzlichen leeren Patterns erweitert. Neue Projektdateien verwenden Version 2 und speichern auch Editortyp, Piano-Roll-Noten und gegebenenfalls das Original einer Migration; Version-1-Projekte bleiben importierbar. Bestehende Presets erhalten fehlende LFO-Modi, Klangparameter und FX-Einstellungen. Ältere Steps erhalten die bisherige Standardlänge; ältere Projekte starten mit neutralen Master-FX. Die nun serielle Track-FX-Kette kann den Klang bestehender Patches gegenüber der früheren parallelen Anordnung verändern.

## Modulation und Track Effects

Der gemeinsame Parameterkatalog verbindet Klangerzeugung, Filter, Amp, LFOs und alle Regler der 20 Track-FX-Varianten mit Matrix, Parameter-Locks und MIDI Learn. Individuelle IDs folgen `fx.<slot>.<variante>.<parameter>` und `lfo.<1–3>.<feld>`. Gemeinsame FX-Werte wie Delay-Mix oder Feedback sind kanonische Aliase; die variantenspezifischen Alias-Routen wirken ausschließlich bei der betreffenden Variante. Neue FX-Regler werden aus `FX_CONTROLS` automatisch registriert.

**24 Modulationsrouten:** Quellen und Ziele sind gruppiert, Amount bleibt bipolar. Jede Route bietet Linear, Exponential oder Logarithmic. Mehrere Routen werden vor der Begrenzung addiert; Frequenz-/Zeitregler mit logarithmischer Skalierung werden multiplikativ moduliert. Rückkopplungen zwischen LFOs, Macros, Mod-Envelopes und Smooth Random werden beim Bearbeiten und Import gesperrt. „Anschlag“ markiert diskrete bzw. beim Note-On/Step abgetastete Ziele. Neue physische Stimmen-Verbindungen entstehen beim nächsten Anschlag; Änderungen bestehender kontinuierlicher Routen folgen laufend. Ein Ring am Knopf zeigt den möglichen gemeinsamen Bereich, ein Punkt den wirksamen Wert; der Zeiger bleibt der Grundwert.

**LFO 1–3:** Free Run folgt der Audiouhr; Note Retrigger beginnt pro Anschlag neu. One Shot beendet einen Zyklus, Half Cycle einen halben. Sample & Hold erzeugt pro Zyklus einen neuen Zufallswert und kann ebenfalls retriggern; die Waveform ist in diesem Modus ohne Bedeutung. Ohne Sync gilt Hz, mit Sync eine musikalische Division von 1/64 bis acht Takten, einschließlich Triolen und punktierter Werte. Start Phase 0–360°, Delay, Fade In, Skew/Symmetry, Slew, Pulsbreite und bipolare/unipolare Ausgabe sind gespeichert und modulierbar. Slew glättet Random-Übergänge; Smooth Random interpoliert kontinuierlich. Eine Rate-Modulation integriert die Phase, statt bei jeder Änderung neu zu starten.

**Weitere Quellen:** Amp Envelope, Filter Envelope, zwei eigene Mod-ADSRs mit Attack-/Decay-/Release-Kurve, Random per Note, Smooth Random mit Rate/Slew, Channel Pressure und polyphoner Aftertouch, Pitch Bend sowie Macro 1–4. Mod-ADSRs werden beim Anschlag abgetastet. Pitch Bend bleibt zusätzlich zur frei zuweisbaren Quelle die bisherige direkte Tonhöhensteuerung. Ein Macro kann beliebig viele der 24 Routen speisen.

**Scope:** Stimmenparameter verwenden die jeweilige Note. Track-FX verwenden die zuletzt gehaltene Note, danach die zuletzt freigegebene Note mit ihrem Release. Polyphoner Aftertouch betrifft deren konkrete Note, Channel Pressure den Track. FX-Locks bleiben auf dem gemeinsamen Track-Bus: gleichzeitige widersprüchliche Locks folgen der Ereignisreihenfolge. Track-LFOs laufen während Delay-/Reverb-Tails weiter. Die separate Master-Verarbeitung empfängt keine Track-Matrixrouten.

| Slot | Erweiterte Audiofunktionen |
| --- | --- |
| Saturation | Gemeinsamer Output Trim, Soft Clip mit 2×-FIR-Oversampling und angepasstem Dry-Pfad, Hard-Clip-Symmetry, Wavefolder-Postfilter, Bitcrusher-Sample-Rate/Jitter, Diode-Pre-/Post-Tone |
| Modulation | Chorus mit 2–6 Stimmen, Base Delay und Stereo Phase; Flanger mit Manual Delay und Feedback-Polarität; Vibrato mit Phase/Fade/Sync; Phaser mit Depth/Feedback und 2/4/6/8 Stufen; Tremolo mit vier Formen, Stereo Phase und Sync |
| Delay | Dauerhaftes Tempo-Sync einschließlich Triolen und punktierter Divisionen; Digital-HP/Ducking/Stereo-Offset; getrennte Tape-Wow-/Flutter-/Saturation-Regler; Ping-pong mit eigener rechter Zeit bzw. Division und Cross Feedback; drei Multi-tap-Pegel/Pans; Dub-Ducking, Modulation und Feedback-Sättigung |
| Reverb | Gemeinsame Low-/High-Cuts und Stereo Width; Room-Pre-delay; Hall-Early/Late; Plate-Diffusion; Spring-Drive/1–4 Federn; Gated-Threshold/Hold/Release |

Die vier Slots bleiben seriell, umsortierbar und separat bypassbar; Mix entspricht Dry/Wet. Kontinuierliche Steuerung erfolgt über AudioParams und geglättete DSP-Werte ohne Graph-Neuaufbau, Kurven- oder Impuls-Neuberechnung pro LFO-Sample. Varianten und strukturelle Regler werden über 32 ms überblendet; schnelle weitere Änderungen warten die laufende Überblendung ab. Auswahl und Power-Button bearbeiten ausdrücklich den **Basiswert**. Ein separates **DSP-Statusfeld** zeigt die gemeldete wirksame Variante, ON/BYPASS und einen gegebenenfalls laufenden Übergang; es schaltet die Basis-Bedienelemente nicht um. Ohne Live-Daten steht dort „Basisansicht“. Die Effektgrafiken verwenden wirksame DSP-Werte und laufende Phase, sind sichtbar als schematische Vorschauen gekennzeichnet und keine vollständige Audioanalyse. Der Bitcrusher zeigt ein Beispielsignal mit Sample & Hold/Quantisierung sowie schematischem Jitter; Tone und Mix werden dabei nicht simuliert. Der Wavefolder zeigt die statische Kennlinie und den separaten normierten Postfilter-Frequenzgang. Der neue Hall verwendet ein kontinuierlich steuerbares Feedback-Delay-Netzwerk.

**Delay-Grenze:** DSP, Vorschau und WAV-Tail-Berechnung verwenden dieselbe Grenze von **16 Sekunden pro Kanal beziehungsweise Tap**. Divisionen, die beim aktuellen BPM-Wert einschließlich rechter Ping-pong-Zeit oder Multi-tap-Spacing darüber liegen, sind im Auswahlmenü deaktiviert. Beispielsweise sind 8 Beats bei 20 BPM (= 24 Sekunden) nicht auswählbar. Bereits gespeicherte Werte sowie durch Tempoänderung oder Modulation entstehende Überschreitungen bleiben als Basiswert erhalten; die FX-Seite zeigt die angeforderten und wirksamen begrenzten Grundzeiten an. Wow/Flutter modulieren diese Grundzeiten innerhalb der DSP-Grenze.

**Smooth Random und Modulationsanzeige:** Smooth Random interpoliert bereits bei Slew 0 über die volle Periode mit kubischem Smoothstep. Slew blendet zusätzlich zu quintischem Smootherstep mit weicherem Beschleunigungsverlauf an den Endpunkten. Random/Sample & Hold behält seine gesonderte Slew-Dauer. Der Regler-Ring ist ein **theoretischer Modulationsbereich**, der abhängige Macro-/LFO-Depth-/Polarity-Routen und bedingte FX-Aliase konservativ berücksichtigt; Phasenkorrelationen und Note-/Step-Abtastung können den tatsächlich erreichten Bereich einschränken. Der Punkt übernimmt weiterhin den zuletzt gemeldeten DSP-Wert, ohne Live-Daten den Basiswert.

**Rechenaufwand:** Stimmen mit ausschließlich FX- oder Anschlag-Routen erzeugen keinen zusätzlichen Stimmen-Modulationsprozessor. Stimmenprozessoren reservieren nur ihre benötigten Ausgangskanäle; Track-Prozessoren behalten die Reserve für nachträglich ergänzte Routen. Die laufende Generator-Zeitachse bleibt erhalten. Nicht benötigte Amp-/Filter-Quellen werden übersprungen, Random per Note wird gecacht, und der WAV-Export verschickt keine UI-Telemetrie. Daraus folgt keine gemessene CPU-/Polyphonie-Garantie; Hörartefakte bei Wechseln und Live-/Export-Klanggleichheit sind weiterhin nicht praktisch verifiziert.

**Kompatibilität und Export:** Alte Presets/Projekte behalten `modVersion: 1` und `fxVersion: 1` sowie die native FX-Verarbeitung. Neue Modulations-/FX-Funktionen aktivieren Version 2; die neuen FX-Algorithmen können dann anders klingen. Legacy Hold bleibt eingefroren und wird so beschriftet, bis die erweiterten LFO-Funktionen bearbeitet werden. Parameter, Routen und MIDI-Zuordnungen bleiben gespeichert; Undo/Redo nutzt die vorhandenen Projektsnapshots. Live und WAV verwenden dieselben neuen Worklets. Der Export reserviert konservativ auch modulierte/synchronisierte Delay-Zeiten, Feedback und Reverb-/Gate-Tails; sehr lange Feedback-Tails benötigen entsprechend große WAV-Puffer. Zufall und Free-Run-Phase ergeben keine sampleidentische Aufnahme einer vorherigen Live-Wiedergabe. Klang, Browser-Bedienung, Hardware-MIDI und CPU-Last wurden gemäß Projektvorgabe nicht praktisch geprüft.

## Sequencer

Acht Pattern-Speicher **A01–A08**, jeder mit zwölf Tracks. Pro Track unabhängig:

- 1–128 Steps; acht Seiten mit jeweils 16 Steps.
- Auflösung 1/8, 1/16 oder 1/32; Forward, Reverse, Ping-pong oder Random.
- Notenname je Step über eine Auswahl im vollständigen MIDI-Bereich (0–127), Single/Major/Minor/Fifth/Seventh-Akkord, Velocity und Gate. Auch sehr tiefe oder hohe Live-Rec-Noten bleiben beim Speichern und Import erhalten.
- Individuelle Step-Länge: ½, 1, 1½, 2, 3, 4, 6 oder 8 Rastereinheiten. Die Pattern-Länge zählt feste Rasterpositionen. Ein 1/8-Step auf Position 1 im 1/16-Raster belegt die Positionen 1 und 2; danach folgt Position 3. Die folgenden Noten verschieben sich nicht und das Pattern wird nicht länger. Überdeckte Steps bleiben gespeichert und werden nach dem Verkürzen wieder sichtbar; sie lösen während der Überdeckung keine Noten oder Locks aus. Kürzere und punktierte Längen lassen gegebenenfalls eine Pause bis zur nächsten freien Rasterposition. Gate skaliert die Notendauer. Längen am Pattern-Ende werden auf den verfügbaren Platz begrenzt.
- Alle Track-Zeilen verwenden dieselbe Zeitskala mit 1/64-Noten als kleinster Einheit. Ein 1/8-Step belegt exakt den Platz zweier 1/16-Rasterzellen einschließlich des Zwischenraums. Die Anzeige berücksichtigt die Track-Auflösung und zeigt über Seitengrenzen reichende Steps als Fortsetzung. Die Zeitmarkierungen oben zählen 1/16-Einheiten; die kleinen Zahlen im Step bleiben die festen Positionsnummern. Darstellung, Wiedergabe, MIDI und WAV-Export verwenden dieselbe Belegungslogik. Step-Dialog, Parameter-Locks und schrittweise Aufnahme überspringen überdeckte Positionen.
- Wahrscheinlichkeit, Microtiming und 1–8-fache Ratchets.
- Always, 1:2, 2:2, 1:4, Fill und Not-Fill-Bedingungen.
- Parameter-Locks für Klangerzeugung, Filter, Envelopes sowie planbare Effektparameter.
- Globales Tempo, Tap Tempo, Swing, Mute/Solo, Kopieren/Einfügen, Duplizieren und musikalische Pattern-Generierung.

**Step klicken:** Ein leerer Step wird aktiviert. Ein belegter Step wird zunächst ausgewählt; erst ein weiterer Klick auf den bereits ausgewählten Step deaktiviert ihn. **Shift + Klick** oder **Rechtsklick:** den Step-Dialog öffnen, ohne den Trig zu verändern. Dort Notenname, Länge, sämtliche Trig-Eigenschaften und Parameter-Locks einstellen; die Pfeile wechseln zum benachbarten Step. Ein Editor steht außerdem direkt unter dem Raster.

**P-LOCK im Sequencer aktivieren**, ins Hauptregister **Synthesizer** wechseln und einen Instrument-Regler bewegen: Der Wert wird nur für den ausgewählten Step gespeichert. Locks können auch direkt im vergrößerten Lock-Editor oder im Rechtsklick-Dialog ergänzt, mit Maus-Slidern bzw. Zahlenfeldern editiert und entfernt werden. Die Auswahl ist nach Bereichen gruppiert und verwendet ausgeschriebene Parameternamen. Unison-Anzahl, Wavetable-Auswahl, Sampler-Reverse/-Fade und additive Spektralparameter werden pro Stimme erzeugt und sind ebenfalls verfügbar. Alle individuellen FX- und LFO-Regler einschließlich Drive, Hallgröße, Bypass und Variantenwahl sind verfügbar. Strukturelle Ziele schalten auf der Note-/Step-Zeitachse mit kurzer Überblendung. Effekt-spezifische Zusatzparameter werden im Patch gespeichert. Die FX-Reihenfolge bleibt eine globale Track-Einstellung und ist kein Modulationsziel.

**Fill:** Der Button schaltet die Fill-Bedingung ein und zeigt dann deutlich **FILL ON**. Noten mit `fill` spielen nur bei aktivem Fill, Noten mit `!fill` nur bei ausgeschaltetem Fill. `always` bleibt davon unabhängig; der Button erzeugt selbst keine zusätzlichen Noten.

**Hold im Keyboard:** Hält gespielte Keyboard- und MIDI-Noten nach dem Loslassen. Ausschalten gibt die gehaltenen Noten frei; Stop bzw. Esc beendet alle Noten. Erneutes Anschlagen derselben gehaltenen Tonhöhe ersetzt die vorige Live-Note. Die Halbierung der Keyboard-Höhe bleibt separat verfügbar. Auswahlfelder verlieren nach einer Auswahl den Fokus, damit Tastatureingaben wieder das Computer-Keyboard erreichen.

**Live Rec im Step-Modus:** Keyboard-/MIDI-Noten werden am aktuellen Step aufgenommen. Im Stillstand werden Noten schrittweise eingetragen. Ein Step speichert eine Root Note und den gewählten Akkordtyp. In der Piano Roll werden Startzeit, Anschlagstärke und tatsächliche Notendauer polyphon aufgenommen, einschließlich gehaltener Noten über Loop-Grenzen. Aufgenommen wird der ausgewählte Track; im Stillstand rückt die Einfügeposition nach dem Loslassen des Akkords weiter.

Die Wiedergabe verwendet einen Lookahead-Scheduler auf der AudioContext-Zeitachse. Sehr stark gedrosselte Hintergrund-Tabs können browserbedingt dennoch Aussetzer verursachen.

### Piano Roll und Editorwechsel

Im Sequencer gibt es die Register **Step-Sequencer** und **Piano Roll**. Das Piano-Roll-Register zeigt die Piano-Tracks. Das Step-Register zeigt alle zwölf Tracks; Piano-Tracks erscheinen dort als schreibgeschützte Notenübersicht mit bedienbaren Mute-/Solo-Schaltern. Auch bei ausgewähltem Piano-Track bleibt die Step-Seitennavigation verfügbar. Beide Gruppen laufen gemeinsam im Haupttransport. Pattern-Einfügen betrifft nur Tracks des geöffneten Editorregisters. Track im Rack auswählen und den Editor über die Auswahl im Sequencer umstellen. Jeder der zwölf Tracks besitzt weiterhin acht eigene Patterns, Instrument, Mute/Solo und Effekte.

- Polyphone Noten im gesamten MIDI-Bereich 0–127; unabhängige Startzeit, Dauer und Velocity. Bis zu 4096 Noten pro Pattern.
- Zeichnen, Verschieben, linke/rechte Notenkante skalieren, Radieren, Rechteck- und Shift-Mehrfachauswahl. **Hand** verschiebt den Ausschnitt mit der Maus; Zoom, Scrollen, Playhead und optionales Follow sind verfügbar.
- Frei oder gerastert bearbeiten, ausgewählte Noten quantisieren, transponieren und duplizieren. Start und Dauer werden im Inspector in Track-Rastereinheiten angezeigt; Start zählt ab 1.
- Velocity-Spuren und numerischer Inspector; Wahrscheinlichkeit, Microtiming, Bedingungen und Parameter-Locks pro Note. Track-FX bleiben für alle Stimmen gemeinsam: Gleichzeitige widersprüchliche FX-Locks werden in Notenreihenfolge angewendet.
- **Ctrl/Cmd+A/C/X/V/D:** alles auswählen, kopieren, ausschneiden, am Lineal-Cursor einfügen und duplizieren. **Entf/Backspace** löscht die Auswahl. **Ctrl/Cmd+Z / Shift+Z** oder die Toolbar bieten Undo/Redo. Pfeile verschieben die Auswahl; **Shift+↑/↓** transponiert um eine Oktave.
- Pattern-Länge bestimmt den Loop. Außerhalb liegende Noten bleiben sichtbar und gespeichert, lösen aber nicht aus. Noten dürfen über die Loop-Grenze hinaus klingen. Eine verkürzte Ansicht löscht keine Noten.
- Projekt-JSON, Autosave, Pattern-Kopieren/Generieren/Duplizieren, Live Rec, MIDI-Ausgabe und WAV-Export berücksichtigen den jeweiligen Editor. Vorhören zeichnet keine Noten auf.

**Eigene Track-Wiedergabe:** Die Play-/Pause-/Stop-Symbole in der Piano-Roll-Toolbar spielen nur diesen Track, ohne seine Solo-Einstellungen zu ändern; Mute wird berücksichtigt. Play startet am Anfangsmarker, Pause hält die Position und Play setzt sie fort. Stop setzt die Wiedergabe zurück. Loop an wiederholt den markierten Bereich; Loop aus spielt ihn einmal. Die Bereichswiedergabe läuft vorwärts und nutzt internes Tempo, Auflösung, Swing, Microtiming, Bedingungen, Wahrscheinlichkeit, Noten-Locks und MIDI-Ausgabe. Sie ist unabhängig von der Richtung und externer Clock des Haupttransports. An den Bereichsgrenzen werden Noten abgeschnitten; beim Fortsetzen werden überlappende Noten für die Restdauer neu angeschlagen. Der Haupttransport und WAV-Export behalten ihren bisherigen Ablauf.

**Start-/Endmarker:** Oben im Lineal ziehen; Shift+Klick setzt den Anfang, Alt+Klick das Ende. Marker lassen sich fokussieren und mit Links/Rechts (Shift: vier Steps) sowie Home/End ändern. Der Bereich umfasst mindestens einen Step und wird pro Pattern gespeichert. Bereichs-/Tempoänderungen schließen laufende Aufnahmen ab und setzen die Wiedergabe im gültigen Bereich fort. Neue bzw. bearbeitete Noten aktualisieren zukünftige Ereignisse, ohne den Abspielkopf zurückzusetzen. Pause und Stop schließen gehaltene Aufnahme-Noten ab.

**Follow:** Die Ansicht scrollt während der Wiedergabe automatisch mit dem Abspielkopf. Das Symbol schaltet nur dieses Mitlaufen um. Fold, Generieren, Transformieren, Humanize, Werkzeuge, Duplizieren, Quantisieren und Follow sind kompakte Symbolbuttons mit erklärenden Tooltips.

**Skalen und Fold:** Grundton plus Major, Minor, Kirchentonarten, harmonisch/melodisch Moll, Pentatonik, Blues oder Chromatik wählen. Bei aktiver Skala werden Zeichnen und vertikales Verschieben auf Skalentöne gerastert; Pfeiltasten wechseln zum nächsten Skalenton. Die Skala wird pro Pattern gespeichert. Fold zeigt benutzte Tonhöhen und, bei aktiver Skala, deren Töne. Vorhandene Noten außerhalb der Skala bleiben erhalten. Beim Verschieben werden die Noten vorgehört; bei Mehrfachauswahl maximal acht gleichzeitig.

**Generieren / Transformieren / Humanize:** Ein Dialog bietet Melodie, Euclid-Rhythmus und Arpeggio (aus Auswahl bzw. vorhandenen Noten), jeweils mit Raster, Bereich, Gate, Velocity und passenden Zusatzparametern. Ersetzen betrifft nur den angegebenen Zeitbereich und die gewählte Auswahl; alternativ lassen sich Noten ergänzen. Transformationen umfassen Spiegeln der Zeit/Tonhöhe, Legato, Zeit ×2/÷2, Rotation, Quantisierung und Skalenanpassung. Humanize variiert Timing, Velocity und Länge mit einstellbaren Grenzen. Vorschau erzeugen und **Übernehmen** anwenden; jede Anwendung erzeugt einen Undo-Schritt. Überschreitungen der 128-Step-Grenze werden bei Transformationen mit einem Hinweis abgelehnt.

**Zoom:** Zeitlineal vertikal ziehen zum Zoomen und horizontal zum Verschieben; Ctrl/Cmd + Mausrad zoomt die Zeitachse am Zeiger, Alt + Mausrad die Tonhöhenachse. Doppelklick aufs Lineal, **Fit** oder **H** passt die Loop-Länge ein; **+/−** zoomt zur Mitte. Die Track-Auswahl samt Mute/Solo steht in der Pattern-Toolbar; Parameter-Locks sind Teil des Noten-Inspectors.

**Step → Piano Roll** übernimmt automatisch alle acht Patterns einschließlich Akkorden, Ratchets, Microtiming, Bedingungen, gemeinsamer Wahrscheinlichkeit und Locks. Nicht aktive bzw. durch lange Steps verdeckte Step-Daten bleiben im Projekt. Unveränderte Übertragungen behalten auch spezielle Step-Belegung und Abspielrichtungen.

**Piano Roll → Step-Sequencer** öffnet immer eine Migrationsvorschau. Wenn möglich, wird verlustfrei übertragen. Andernfalls ordnet die Anwendung Noten der nächstgelegenen Step-Position zu, erhält passende Akkord-Untergruppen, nutzt vorhandene Step-Längen und Microtiming zur möglichst genauen Abbildung und begrenzt erst danach auf den darstellbaren Bereich und bevorzugt bei Konflikten stärkere Noten. Fehlende Akkordtöne werden nicht hinzugefügt. Die Vorschau nennt entfallende Noten und geänderte Zeitpunkte, Längen bzw. Ausdruckswerte je Pattern. Erst **Jetzt migrieren** führt den Wechsel aus; **Abbrechen** behält die Piano Roll. Das Original einschließlich Timing und ursprünglicher Step-Daten bleibt im Projekt gespeichert und kann über **Original-Piano-Roll wiederherstellen** zurückgeholt werden.

Die Live-Wiedergabe und der WAV-Export verwenden dieselben musikalischen Ereignisse und planen sie zeitlich sortiert. Negative Microtiming-Werte erweitern intern den Vorlauf; Änderungen an bereits vorgemerkten Ereignissen können daher verzögert hörbar werden. Bei externer MIDI-Clock lassen sich unvorhersehbare zukünftige Clock-Impulse nicht vorwegnehmen; zu frühe Trigs werden auf den verfügbaren Audiotermin begrenzt. Überlappende gleich hohe Sequencer-Noten am MIDI-Ausgang erhalten erst nach der letzten Freigabe ein Note-off.

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
- Keyboard- und Sequencer-Noten gehen optional an den ausgewählten MIDI-Ausgang, Tracks 1–12 auf Kanälen 1–12.
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
- **Sound Library:** Bisherige Factory-Presets plus **56 neue Sounds**, jeweils acht für Subtractive, Wavetable, FM, Additive, Ring/AM, Granular und Physical. Sampler behält seine vorhandenen Presets. Die neue Bank reicht von Bass/Lead/Pad und perkussiven Klängen bis zu spektralen, granularen und Saitentexturen; die FM-Bank verwendet alle sechs Algorithmen. Laden über Browse sounds und den Engine-Filter. Eigene gespeicherte Sounds bleiben zusätzlich verfügbar.
- **Projekt-JSON:** alle Tracks, acht Patterns, Patches und eingebettete Samples.
- **Preset-JSON:** einzelner Patch inklusive Sample; über den Projekt-Import wieder laden.
- **WAV:** Offline-Rendering des aktuellen Patterns über 1/2/4/8/16 Takte, Stereo, 44,1 kHz / 16 Bit. Lange Gates, Release-Locks sowie der Ausklang von Track- und Master-Delay/-Hall bestimmen die zusätzliche Exportdauer; Delay-Wiederholungen werden bis unter −60 dB berücksichtigt.
- Größere Bearbeitungsaktionen wie Laden, Generieren, Leeren und Duplizieren lassen sich mit **Undo** rückgängig machen.

Wahrscheinlichkeiten und zufallsbasierte Klangerzeugung werden bei jedem WAV-Export neu berechnet. Lokales Autosave ersetzt keine Datei-Sicherung: Browserdaten löschen, privater Modus oder Speicherlimits können lokale Sessions entfernen.

## Hinweise zur Implementierung

Die acht Engines verwenden Web Audio und lokale AudioWorklets. Wavetables werden aus 32 definierten spektralen Rezepten erzeugt; FM verwendet einen AudioWorklet-Prozessor mit drei Operatoren pro Unison-Layer; Physical ist ein Saitenmodell. Es werden keine VSTs oder proprietären Hardware-Engines emuliert. Granular hält Live-Noten über einen nachgefüllten Grain-Scheduler und gibt beendete Grains laufend frei. Effekte pro Track sind gemeinsam für alle Stimmen des Tracks.

Die Anwendung wurde als Produktions-Bundle kompiliert; es wurden keine Tests ausgeführt. Hardware-MIDI erfordert die lokale Verbindung eines tatsächlichen Geräts.

## Dateien

- `src/fm-config.ts`: FM-Parameter, sechs Routing-Definitionen und Preset-/Lock-Migration.
- `src/fm-worklet.ts`: Stereo-FM-DSP, Operator-ADSRs, Feedback und integriertes Unison.
- `src/FmEditor.tsx`: Operatorwahl, Schaltbilder und Hüllkurven-Bedienung.
- `scripts/benchmark-fm.mjs`: gezielte FM-CPU-/Polyphonie-Messung.
- `src/model.ts`: Datenmodell, Demo-Presets, Importvalidierung und WAV-Codierung.
- `src/factory-presets.ts`: 56 eigene Soundrezepte mit je acht Presets für sieben Engines.
- `src/sequence.ts`: gemeinsame musikalische Ereignisse, verlustfreie Übernahme und bestätigte Rückmigration.
- `src/PianoTools.tsx`, `src/piano-tools.ts`: Generatoren, Transformationen und Humanize mit Vorschau.
- `src/desktop.css`: Desktop-Layout und gemeinsame Modulgestaltung.
- `src/PianoRoll.tsx`, `src/piano.css`: Piano-Roll-Bearbeitung, Auswahl, Zwischenablage, Bereichsmarker und Inspector.
- `src/track-playback.ts`: unabhängige Piano-Track-Wiedergabe mit Pause und markiertem Loop-Bereich.
- `src/ParameterLocks.tsx`: gemeinsame Lock-Auswahl, Maus-Slider und Zahlenfelder.
- `src/filter-config.ts`: Filterparameter, neutrale Defaults, Envelope-Kurven und Kompatibilität.
- `src/filter-dsp.ts`: geteilte DSP-/Frequenzgangberechnung; `advanced-filter-worklet.ts` bettet sie samplegenau ein.
- `src/FilterEditor.tsx`: gemeinsame Filteroberfläche, Envelope- und Frequenzgang-Vorschau.
- `src/audio.ts`: Stimmen, Synthese, Filter/Envelopes/FX, Transport und Offline-Rendering.
- `src/midi.ts`: Web-MIDI-Verbindungen, Nachrichten und Ausgabe.
- `src/storage.ts`: IndexedDB sowie Dateiimport/-export.
- `src/Instrument.tsx`, `src/SourceEditor.tsx`, `src/Sequencer.tsx`, `src/components.tsx`: Instrumentenoberfläche.
- `src/catalog.ts`: 32 Wavetables und 96 synthetische Samples mit lokalen Erzeugungsrezepten.
- `src/lfo.ts`: LFO-Verläufe und Modi.
- `src/effects.ts`, `src/fx-spec.ts`, `src/FxRack.tsx`: serieller Effekt-Rack, Parameter und Visualisierungen.
- `src/master-audio.ts`, `src/MasterFX.tsx`: Master-Signalweg und Bedienoberfläche.
- `src/parameter-spec.ts`, `src/parameters.ts`, `src/modulation-spec.ts`: gemeinsame Parameter-Metadaten, Aliase, Generatorgraph und Migration.
- `src/modulation.ts`, `src/modulation-worklet.ts`, `src/modulation-math.ts`: Trigger-/Audio-Modulation und gemeinsame Quellen.
- `src/fx-dsp.ts`, `src/fx-worklet.ts`, `src/worklet-rack.ts`: kontinuierlich steuerbare Track-FX.
- `src/ModulationEditor.tsx`, `src/modulation-ui.tsx`: Editor, Matrix und Modulationsanzeigen.
- `src/spectral-worklet.ts`: laufende spektrale Klangerzeugung.
- `src/panels.css`: gemeinsame Gestaltung aller drei Panels und gemeinsames Step-Zeitraster.
- `src/studio.css`: größere Bedienelemente und Layout der erweiterten Bereiche.
- `src/synthesis.css`: vier Synthese-Spalten und einheitliche Quellenanzeigen.
- `src/App.tsx`: Session-Verwaltung, Routing und Dialoge.
- `src/styles.css`: Grundgestaltung des Studios und barrierearme Fokuszustände.
