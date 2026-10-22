# Projektregeln

- Für dieses Projekt ausdrücklich **keine Tests anlegen, schreiben oder ausführen** und keine Test-Abhängigkeiten hinzufügen. Dies ist eine Vorgabe des Nutzers.
- `npm run build` dient zur TypeScript-Kompilierung und zum Erstellen des Produktions-Bundles und ist zulässig.
- Bestehenden Checkout `/workspace/synthi` verwenden. Cloud-Aufgaben laufen bereits isoliert; keine zusätzlichen Git-Worktrees anlegen, außer auf ausdrücklichen Wunsch.
- Audio startet ausschließlich nach einer Benutzerinteraktion. Keine Autoplay-Umgehung einbauen.
- Samples, Presets und Projekte bleiben im Browser. Keine externen Dienste oder Uploads ohne ausdrückliche Anforderung ergänzen.
- Web-Audio-Knoten, Timer und MIDI-Verbindungen bei Stop/Dispose zuverlässig freigeben. AudioParameter zeitgesteuert ändern, um Knackser und Sequencer-Jitter zu vermeiden.
