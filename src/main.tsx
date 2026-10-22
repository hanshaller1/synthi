import { Component, StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

class StartupBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.error)
      return (
        <main className="startup-error" role="alert">
          <span>PHASE</span>
          <h1>Das Studio konnte nicht gestartet werden.</h1>
          <p>
            Bitte die Seite neu laden. Falls das Problem bleibt, diese
            Fehlermeldung weitergeben.
          </p>
          <pre>{this.state.error}</pre>
          <button onClick={() => window.location.reload()}>
            Seite neu laden
          </button>
        </main>
      );
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StartupBoundary>
      <App />
    </StartupBoundary>
  </StrictMode>,
);
