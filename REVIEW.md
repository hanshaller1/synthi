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
