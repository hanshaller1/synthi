import { parameterEdits, PARAMETER_REGISTRY } from "./parameters";
import { normalizeTrackSampleLocks } from "./model";
import { enginePatchEdits, needsEngineWorklet, sampleSliceSelection } from "./engine-config";
import { filterPatchEdits, needsAdvancedFilter } from "./filter-config";
import { FM_ALGORITHMS, randomizeFmPatch, fmPatchEdits } from "./fm-config";
import MasterFX from "./MasterFX";
import { TrackPlayback } from "./track-playback";
import type { TrackPlaybackState } from "./track-playback";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  Circle,
  CircleHelp,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Headphones,
  Keyboard as KeyboardIcon,
  Layers3,
  LoaderCircle,
  Pause,
  Play,
  PlugZap,
  Power,
  Radio,
  RotateCcw,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  Square,
  Undo2,
  Upload,
  Volume2,
  Waves,
  X,
} from "lucide-react";
import {
  IconButton,
  TempoInput,
  Keyboard,
  LevelMeter,
  Modal,
  Scope,
  Select,
  Waveform,
} from "./components";
import Instrument from "./Instrument";
import Sequencer from "./Sequencer";
import { makeNote, migrateToSteps, stepsToNotes } from "./sequence";
import { generateNotes } from "./piano-tools";
import type { MigrationReport } from "./sequence";
import { SynthEngine, Transport, renderProject } from "./audio";
import { effectiveSwing } from "./swing";
import { lfoParameterId } from "./lfo-migration";
import { MidiController } from "./midi";
import {
  TRACK_COUNT,
  MAX_STEPS,
  SCALES,
  ENGINES,
  LOCK_PARAMS,
  PARAMS,
  PRESETS,
  clamp,
  clone,
  encodeWav,
  makePattern,
  makeProject,
  makeStep,
  stepAtPosition,
  sanitizePatch,
  sanitizeProject,
} from "./model";
import type { EditorMode, MidiTarget, Param, Patch, Pattern, PianoNote, Project, Step, Track } from "./model";
import { download, fileData, readStored, writeStored } from "./storage";

type ModalName =
  | "library"
  | "midi"
  | "project"
  | "help"
  | "export"
  | "settings"
  | "preset"
  | null;
type Binding = { cc: number; track: number; param: MidiTarget; legacyPeak?: boolean; legacyRetrigger?:boolean };
const KEYBOARD_KEYS = [
  "a",
  "w",
  "s",
  "e",
  "d",
  "f",
  "t",
  "g",
  "y",
  "h",
  "u",
  "j",
  "k",
  "o",
  "l",
  "p",
  ";",
];
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const [project, setProject] = useState<Project>(makeProject),
    [track, setTrack] = useState(0),
    [tab, setTab] = useState("synth"),
    [view, setView] = useState<"synthesizer" | "sequencer" | "master">(
      "synthesizer",
    ),
    [selectedPosition, setSelectedStep] = useState(0),
    [page, setPage] = useState(0),
    [modal, setModal] = useState<ModalName>(null);
  const selectedStep = stepAtPosition(
    project.tracks[track].patterns[project.activePattern], selectedPosition,
  ).index;
  const [hold, setHold] = useState(false);
  const holdRef = useRef(false);
  const latchedNotes = useRef(new Map<string, { note: number; track: number; sendMidi: boolean }>());
  const previewRef = useRef<TrackPlayback | null>(null);
  const [preview, setPreview] = useState<TrackPlaybackState>({ track: -1, state: "stopped" });
  const [playing, setPlaying] = useState(false),
    [audioReady, setAudioReady] = useState(false),
    [audioBusy, setAudioBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [playheads, setPlayheads] = useState(
      Array(TRACK_COUNT).fill(-1) as number[],
    ),
    [lockMode, setLockMode] = useState(false),
    [fill, setFill] = useState(false);
  const [octave, setOctave] = useState(3),
    [activeNotes, setActiveNotes] = useState(new Set<number>()),
    [keyboardVisible, setKeyboardVisible] = useState(true),
    [toast, setToast] = useState(""),
    [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved"),
    [loaded, setLoaded] = useState(false);
  const [userPresets, setUserPresets] = useState<Patch[]>([]),
    [search, setSearch] = useState(""),
    [engineFilter, setEngineFilter] = useState("all"),
    [clipboard, setClipboard] = useState<{ pattern: Pattern; mode: EditorMode }[] | null>(null),
    [undoAvailable, setUndoAvailable] = useState(false);
  const [midiConnected, setMidiConnected] = useState(false),
    [midiError, setMidiError] = useState(""),
    [midiVersion, setMidiVersion] = useState(0),
    [externalClock, setExternalClock] = useState(false),
    [midiLearn, setMidiLearn] = useState<{
      track: number;
      param: MidiTarget;
    } | null>(null),
    [bindings, setBindings] = useState<Binding[]>([]);
  const [exportBars, setExportBars] = useState(4),
    [rendering, setRendering] = useState(false),
    [audioInfo, setAudioInfo] = useState({ sampleRate: 0, latency: 0 });
  const [presetName, setPresetName] = useState("");
  const [redoAvailable, setRedoAvailable] = useState(false);
  const [noteClipboard, setNoteClipboard] = useState<PianoNote[]>([]);
  const [migration, setMigration] = useState<{ track: number; patterns: Pattern[]; reports: MigrationReport[] } | null>(null);
  const migrationRef = useRef(migration);
  migrationRef.current = migration;
  const closeMigration = useCallback(() => setMigration(null), []);
  const redoRef = useRef<Project[]>([]);
  const recordedNotes = useRef(new Map<string, { id: string; track: number; pattern: number; absolute: number; time: number; unit: number; live: boolean }>());
  const pendingNotes = useRef(new Map<string, symbol>());
  const playRequest = useRef(0);
  const audioInit = useRef<Promise<SynthEngine> | null>(null);
  const clockTimes = useRef<number[]>([]);
  const engineRef = useRef<SynthEngine | null>(null),
    transportRef = useRef<Transport | null>(null),
    midiRef = useRef(new MidiController()),
    projectRef = useRef(project),
    trackRef = useRef(track),
    recordRef = useRef(recording),
    headsRef = useRef(playheads),
    octaveRef = useRef(octave),
    modalRef = useRef(modal),
    learnRef = useRef(midiLearn),
    bindingsRef = useRef(bindings),
    externalRef = useRef(externalClock);
  const toastTimer = useRef<number | undefined>(undefined),
    undoRef = useRef<Project[]>([]),
    keyboardHeld = useRef(new Map<string, { note: number; track: number }>()),
    midiHeld = useRef(new Map<string, { track: number; note: number }>()),
    sustainRef = useRef(new Set<number>()),
    deferredNotes = useRef(new Map<string, { track: number; note: number }>()),
    liveVoices = useRef(new Map<number, number>());
  projectRef.current = project;
  trackRef.current = track;
  recordRef.current = recording;
  headsRef.current = playheads;
  octaveRef.current = octave;
  modalRef.current = modal;
  learnRef.current = midiLearn;
  bindingsRef.current = bindings;
  externalRef.current = externalClock;
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 4200);
  }, []);
  const checkpoint = useCallback(() => {
    redoRef.current = [];
    setRedoAvailable(false);
    undoRef.current.push(clone(projectRef.current));
    if (undoRef.current.length > 20) undoRef.current.shift();
    setUndoAvailable(true);
  }, []);
  const updateProject = useCallback(
    (fn: (p: Project) => Project) => {
      const previous = projectRef.current, proposed = fn(previous);
      const next = { ...proposed, tracks: proposed.tracks.map((track, i) =>
        track === previous.tracks[i] ? track : normalizeTrackSampleLocks(track, previous.tracks[i])) };
      projectRef.current = next;
      setProject(next);
      redoRef.current = [];
      setRedoAvailable(false);
    },
    [],
  );
  const changePatch = useCallback(
    (partial: Partial<Patch>, which = trackRef.current) => {
      const edits = enginePatchEdits(filterPatchEdits(partial), projectRef.current.tracks[which].patch);
      if (engineRef.current && !engineRef.current.combAvailable && (needsAdvancedFilter({ ...projectRef.current.tracks[which].patch, ...edits }) || needsEngineWorklet({ ...projectRef.current.tracks[which].patch, ...edits }))) {
        notify("Diese Klangfunktionen benötigen AudioWorklet über HTTPS oder localhost."); return;
      }
      updateProject((p) => ({
        ...p,
        tracks: p.tracks.map((t, i) =>
          i === which ? { ...t, patch: parameterEdits(t.patch, fmPatchEdits(t.patch, edits)) } : t,
        ),
      }));
    },
    [updateProject, notify],
  );
  const changeStep = useCallback(
    (which: number, index: number, partial: Partial<Step>) => {
      updateProject((p) => ({
        ...p,
        tracks: p.tracks.map((t, i) =>
          i === which
            ? {
                ...t,
                patterns: t.patterns.map((pat, j) =>
                  j === p.activePattern
                    ? {
                        ...pat,
                        steps: pat.steps.map((s, k) =>
                          k === index ? { ...s, ...partial } : s,
                        ),
                      }
                    : pat,
                ),
              }
            : t,
        ),
      }));
    },
    [updateProject],
  );
  const changeTrack = (which: number, partial: Partial<Track>) =>
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t, i) => (i === which ? { ...t, ...partial } : t)),
    }));
  const changePattern = (which: number, partial: Partial<Pattern>) =>
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t, i) =>
        i === which
          ? {
              ...t,
              patterns: t.patterns.map((pat, j) =>
                j === p.activePattern ? { ...pat, ...partial } : pat,
              ),
            }
          : t,
      ),
    }));
  const setParam = (key: Param, value: number) => {
    if (lockMode && project.tracks[track].mode === "step") {
      if (!LOCK_PARAMS.includes(key)) {
        notify(
          "Dieser Effekt verändert den Audiographen. Bitte außerhalb des P-Lock-Modus einstellen.",
        );
        return;
      }
      const s =
        project.tracks[track].patterns[project.activePattern].steps[
          selectedStep
        ];
      changeStep(track, selectedStep, {
        on: true,
        locks: { ...s.locks, [key]: value },
      });
    } else changePatch({ [key]: value });
  };
  const finishRecording = useCallback((key: string) => {
    const take = recordedNotes.current.get(key);
    if (!take) return;
    recordedNotes.current.delete(key);
    const position = (previewRef.current?.state === "playing" ? previewRef.current.position(take.track) : null) ?? transportRef.current?.position(take.track);
    const elapsed = take.live && position && projectRef.current.activePattern === take.pattern
      ? position.absolute - take.absolute
      : ((engineRef.current?.context.currentTime ?? take.time) - take.time) / take.unit;
    const duration = clamp(elapsed, .01, 256);
    updateProject((p) => ({ ...p, tracks: p.tracks.map((t) => t.id === take.track ? { ...t, patterns: t.patterns.map((pat, i) => i === take.pattern ? { ...pat,
      notes: pat.notes.map((n) => n.id === take.id ? { ...n, duration } : n),
    } : pat) } : t) }));
    if (!take.live && ![...recordedNotes.current.values()].some((n) => n.track === take.track))
      setSelectedStep((selectedPosition + 1) % projectRef.current.tracks[take.track].patterns[take.pattern].length);
  }, [updateProject, selectedPosition]);
  const finishRecordingRef = useRef(finishRecording);
  finishRecordingRef.current = finishRecording;
  const releaseLiveNotes = useCallback(() => {
    for (const key of [...recordedNotes.current.keys()]) finishRecordingRef.current(key);
    for (const key of pendingNotes.current.keys()) {
      const [which, note] = key.split(":").map(Number);
      engineRef.current?.noteOff(which, note);
    }
    midiRef.current.panic();
    latchedNotes.current.clear();
    pendingNotes.current.clear();
    keyboardHeld.current.clear();
    midiHeld.current.clear();
    deferredNotes.current.clear();
    liveVoices.current.clear();
    sustainRef.current.clear();
    setActiveNotes(new Set());
  }, []);
  const stop = useCallback(() => {
    releaseLiveNotes();
    playRequest.current++;
    transportRef.current?.stop();
    previewRef.current?.stop();
    engineRef.current?.panic();
    engineRef.current?.restore(projectRef.current);
    setPlaying(false);
    setPlayheads(Array(TRACK_COUNT).fill(-1));
  }, [releaseLiveNotes]);
  const ensureAudio = useCallback(() => {
    if (audioInit.current) return audioInit.current;
    if (!engineRef.current || engineRef.current.context.state !== "running")
      setAudioBusy(true);
    const initialize = async () => {
      if (!engineRef.current || engineRef.current.context.state === "closed") {
        const context = new AudioContext({ latencyHint: "interactive" }),
          engine = new SynthEngine(context),
          transport = new Transport(engine, () => projectRef.current);
        engineRef.current = engine;
        transportRef.current = transport;
        const preview = new TrackPlayback(engine, () => projectRef.current);
        previewRef.current = preview;
        preview.onState = (state) => {
          setPreview(state);
          if (state.state === "stopped") setPlayheads((prev) => prev.map((head, i) => i === state.track ? -1 : head));
        };
        preview.onSilence = releaseLiveNotes;
        preview.onPosition = (track, step) => setPlayheads((prev) => prev[track] === step ? prev : prev.map((head, i) => i === track ? step : head));
        engine.update(projectRef.current);
        transport.onStep = (e) => {
          setPlayheads((prev) =>
            prev.map((x, i) => (i === e.track ? e.step : x)),
          );
        };
        transport.onClock = (status, time) => {
          const midi = midiRef.current;
          if (midi.clockOut && !externalRef.current)
            midi.send(
              [status],
              performance.now() +
                Math.max(0, time - context.currentTime) * 1000,
            );
        };
        transport.onNote = (track, note, velocity, time, duration) => {
          const midi = midiRef.current,
            at =
              performance.now() +
              Math.max(0, time - context.currentTime) * 1000;
          midi.scheduleNote(track, note, velocity, at, duration);
        };
        preview.onNote = transport.onNote;
        context.onstatechange = () =>
          setAudioReady(context.state === "running");
        setAudioInfo({
          sampleRate: context.sampleRate,
          latency: context.baseLatency,
        });
        // Resume within the user gesture, and share worklet/sample preparation
        // with simultaneous notes instead of exposing a half-ready engine.
        await Promise.all([context.resume(), engine.prepare(projectRef.current)]);
        engine.update(projectRef.current);
      }
      const engine = engineRef.current!;
      if (
        engine.context instanceof AudioContext &&
        engine.context.state !== "running"
      )
        await engine.context.resume();
      await engine.prepare(projectRef.current);
      setAudioReady(true);
      return engine;
    };
    const pending = initialize()
      .catch((error: unknown) => {
        const context = engineRef.current?.context;
        transportRef.current?.stop();
        previewRef.current?.stop(false);
        releaseLiveNotes();
        engineRef.current?.dispose();
        if (context instanceof AudioContext) void context.close();
        engineRef.current = null;
        transportRef.current = null;
        previewRef.current = null;
        notify(`Audio: ${errorMessage(error)}`);
        throw error;
      })
      .finally(() => {
        audioInit.current = null;
        setAudioBusy(false);
      });
    audioInit.current = pending;
    return pending;
  }, [notify, releaseLiveNotes]);
  const play = useCallback(async () => {
    if (previewRef.current && previewRef.current.state !== "stopped") stop();
    const request = ++playRequest.current;
    try {
      await ensureAudio();
      if (request !== playRequest.current) return;
      transportRef.current!.fill = fill;
      transportRef.current!.start(externalRef.current);
      setPlaying(true);
      if (externalRef.current) notify("Bereit für eingehende MIDI Clock.");
    } catch {
      /* Audio error is displayed at its source. */
    }
  }, [ensureAudio, fill, notify, stop]);
  const playTrack = async (which: number) => {
    const resume = previewRef.current?.state === "paused" && previewRef.current.track === which;
    if (!resume) stop();
    const request = ++playRequest.current;
    try {
      await ensureAudio();
      if (request !== playRequest.current) return;
      previewRef.current!.fill = fill;
      previewRef.current!.start(which);
      setPlaying(false);
    } catch { /* ensureAudio displays the error. */ }
  };
  const playRef = useRef(play);
  playRef.current = play;
  const togglePlay = () => (playing ? stop() : void play());
  const noteOn = useCallback(
    async (
      note: number,
      velocity = 0.8,
      which = trackRef.current,
      sendMidi = true,
    ) => {
      const key = `${which}:${note}`, token = Symbol();
      const latched = latchedNotes.current.get(key);
      if (latched) {
        latchedNotes.current.delete(key);
        finishRecordingRef.current(key);
        engineRef.current?.noteOff(which, note);
        if (latched.sendMidi) midiRef.current.send([0x80 + which, note, 0]);
      }
      pendingNotes.current.set(key, token);
      try {
        const engine = await ensureAudio();
        if (pendingNotes.current.get(key) !== token) return;
        const p = projectRef.current,
          t = p.tracks[which];
        engine.noteOn(which, note, velocity, t.patch);
        setActiveNotes((prev) => new Set(prev).add(note));
        liveVoices.current.set(note, which);
        const midi = midiRef.current;
        if (sendMidi)
          midi.send([0x90 + which, note, Math.round(velocity * 127)]);
        if (recordRef.current) {
          const pat = t.patterns[p.activePattern];
          if (t.mode === "piano") {
            if (pat.notes.length >= 4096) { notify("Maximal 4096 Noten pro Pattern."); return; }
            if (!recordedNotes.current.size) checkpoint();
            const position = (previewRef.current?.state === "playing" ? previewRef.current.position(which) : null) ?? transportRef.current?.position(which);
            const start = clamp(position ? position.step % pat.length : selectedStep, 0, pat.length - .001);
            const n = { ...makeNote(start, note), velocity };
            recordedNotes.current.set(key, { id: n.id, track: which, pattern: p.activePattern,
              absolute: position?.absolute ?? start, time: engine.context.currentTime,
              unit: 240 / p.tempo / pat.division, live: !!position });
            updateProject((q) => ({ ...q, tracks: q.tracks.map((x) => x.id === which ? { ...x, patterns: x.patterns.map((pattern, i) => i === p.activePattern ? { ...pattern, notes: [...pattern.notes, n] } : pattern) } : x) }));
          } else {
            const head = headsRef.current[which], entry = stepAtPosition(pat, (head < 0 ? selectedStep : head) % pat.length);
            changeStep(which, entry.index, { on: true, note, velocity });
            if (head < 0) setSelectedStep((entry.index + entry.slots) % pat.length);
          }
        }
      } catch (error) {
        if (pendingNotes.current.get(key) === token) {
          pendingNotes.current.delete(key);
          latchedNotes.current.delete(key);
        }
        notify(`Audio: ${errorMessage(error)}`);
      }
    },
    [ensureAudio, changeStep, selectedStep, notify, checkpoint, updateProject],
  );
  const noteOff = useCallback(
    (
      note: number,
      which = liveVoices.current.get(note) ?? trackRef.current,
      sendMidi = true,
      force = false,
    ) => {
      const key = `${which}:${note}`;
      if (!pendingNotes.current.has(key) && !latchedNotes.current.has(key) && liveVoices.current.get(note) !== which) return;
      if (holdRef.current && !force) {
        latchedNotes.current.set(key, { note, track: which, sendMidi });
        return;
      }
      latchedNotes.current.delete(`${which}:${note}`);
      finishRecordingRef.current(`${which}:${note}`);
      pendingNotes.current.delete(`${which}:${note}`);
      engineRef.current?.noteOff(which, note);
      if (sendMidi) midiRef.current.send([0x80 + which, note, 0]);
      if (![...pendingNotes.current.keys()].some((key) => key.endsWith(`:${note}`))) {
        setActiveNotes((prev) => {
          const s = new Set(prev); s.delete(note); return s;
        });
      }
      if (liveVoices.current.get(note) === which) liveVoices.current.delete(note);
    },
    [],
  );
  const toggleHold = () => {
    const enabled = !holdRef.current; holdRef.current = enabled; setHold(enabled);
    if (!enabled) for (const held of [...latchedNotes.current.values()]) noteOff(held.note, held.track, held.sendMidi, true);
  };
  const noteOnRef = useRef(noteOn);
  noteOnRef.current = noteOn;
  const undo = useCallback(() => {
    const p = undoRef.current.pop();
    if (p) {
      stop();
      redoRef.current.push(clone(projectRef.current));
      setRedoAvailable(true);
      projectRef.current = p;
      setProject(p);
      setUndoAvailable(undoRef.current.length > 0);
      notify("Letzte Aktion rückgängig gemacht.");
    }
  }, [stop, notify]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop(); if (!next) return;
    stop(); undoRef.current.push(clone(projectRef.current));
    projectRef.current = next; setProject(next);
    setUndoAvailable(true); setRedoAvailable(redoRef.current.length > 0);
  }, [stop]);
  useEffect(() => {
    if (!recording) for (const key of [...recordedNotes.current.keys()]) finishRecordingRef.current(key);
  }, [recording]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      readStored<unknown>("project"),
      readStored<Patch[]>("presets"),
      readStored<Binding[]>("midiBindings"),
    ])
      .then(([p, presets, mapping]) => {
        if (cancelled) return;
        const restored = p ? sanitizeProject(p) : null;
        if (restored) setProject(restored);
        if (Array.isArray(presets)) setUserPresets(presets.map(sanitizePatch));
        if (Array.isArray(mapping))
          setBindings(
            mapping.map((m) => m && m.param === "resonance" && restored?.tracks[m.track]?.patch.legacyPeakModulation ? { ...m, param: "filterPeakGain" as const, legacyPeak: true } : m&&/^lfo\.[1-3]\.retrigger$/.test(m.param)?{...m,param:lfoParameterId(m.param) as MidiTarget,legacyRetrigger:true}:m).filter(
              (m) =>
                m &&
                (Object.hasOwn(PARAMS, m.param) || m.param === "fmAlgorithm") &&
                m.cc >= 0 &&
                m.cc <= 127 &&
                m.track >= 0 &&
                m.track < TRACK_COUNT,
            ),
          );
      })
      .catch(() =>
        notify(
          "Lokaler Speicher ist nicht verfügbar. Projekte bitte als Datei exportieren.",
        ),
      )
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [notify]);
  useEffect(() => {
    if (!loaded) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void writeStored("project", project)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 600);
    return () => clearTimeout(timer);
  }, [project, loaded]);
  useEffect(() => {
    const engine = engineRef.current;
    if (engine) {
      engine.update(project);
      void engine
        .prepare(project)
        .catch((e) =>
          notify(`Sample konnte nicht geladen werden: ${errorMessage(e)}`),
        );
    }
  }, [project, notify]);
  useEffect(() => {
    if (transportRef.current) transportRef.current.fill = fill;
    if (previewRef.current) previewRef.current.fill = fill;
  }, [fill]);
  useEffect(() => {
    const midi = midiRef.current;
    midi.onPorts = () => setMidiVersion((v) => v + 1);
    midi.onNote = (note, velocity, ch) => {
      const which = trackRef.current;
      const id = `${ch}:${note}`;
      midiHeld.current.set(id, { track: which, note });
      deferredNotes.current.delete(id);
      void noteOnRef.current(note, velocity, which, false);
    };
    midi.onOff = (note, ch) => {
      const id = `${ch}:${note}`,
        held = midiHeld.current.get(id);
      if (!held) return;
      midiHeld.current.delete(id);
      if (sustainRef.current.has(ch)) deferredNotes.current.set(id, held);
      else noteOff(note, held.track, false);
    };
    midi.onCC = (cc, value, ch) => {
      if (learnRef.current) {
        const target = learnRef.current;
        const next = [
          ...bindingsRef.current.filter(
            (b) =>
              b.cc !== cc &&
              !(b.track === target.track && b.param === target.param),
          ),
          { cc, ...target },
        ];
        setBindings(next);
        void writeStored("midiBindings", next).catch(() => {});
        setMidiLearn(null);
        notify(`CC ${cc} → ${target.param}`);
        return;
      }
      const binding = bindingsRef.current.find((b) => b.cc === cc);
      if (binding) {
        if (binding.param === "fmAlgorithm") {
          const fmAlgorithm = FM_ALGORITHMS[Math.min(FM_ALGORITHMS.length - 1, Math.floor(value * FM_ALGORITHMS.length))].id;
          if (projectRef.current.tracks[binding.track].patch.fmAlgorithm !== fmAlgorithm) {
            checkpoint(); changePatch({ fmAlgorithm }, binding.track);
          }
          return;
        }
        const range = binding.legacyPeak ? [0, 20] : binding.param === "sampleSlice"
          ? [0, sampleSliceSelection(projectRef.current.tracks[binding.track].patch.sampleSlices, 0).sampleSlices - 1]
          : PARAMS[binding.param];
        const meta=PARAMETER_REGISTRY[binding.param];
        let mapped=meta.scale==="log"&&range[0]>0?range[0]*Math.pow(range[1]/range[0],value):range[0]+value*(range[1]-range[0]);
        if(meta.options)mapped=meta.options[Math.min(meta.options.length-1,Math.floor(value*meta.options.length))].value;
        if(binding.legacyRetrigger){
          const patch=projectRef.current.tracks[binding.track].patch,index=+binding.param.split(".")[1]-1;
          changePatch({lfos:patch.lfos.map((l,i)=>i===index?{...l,mode:value>=.5?"trig":"free"}:l) as Patch["lfos"]},binding.track);return;
        }
        changePatch({[binding.param]:mapped},binding.track);
        return;
      }
      if (cc === 1 && engineRef.current) engineRef.current.modwheel = value;
      if (cc === 74) changePatch({ cutoff: 30 * Math.pow(600, value) });
      if (cc === 71)
        changePatch(
          projectRef.current.tracks[trackRef.current].patch.filterType ===
            "comb"
            ? { combFeedback: value * 0.98 }
            : projectRef.current.tracks[trackRef.current].patch.filterType === "multimode" && projectRef.current.tracks[trackRef.current].patch.multimodeType === "peak" ? { filterPeakGain: value * 20 } : { resonance: value * 20 },
        );
      if (cc === 7) changePatch({ level: value });
      if (cc === 123 || cc === 120) {
        releaseLiveNotes();
        engineRef.current?.panic();
      }
      if (cc === 64) {
        if (value >= 0.5) sustainRef.current.add(ch);
        else {
          sustainRef.current.delete(ch);
          for (const [id, note] of deferredNotes.current)
            if (id.startsWith(`${ch}:`)) {
              noteOff(note.note, note.track, false);
              deferredNotes.current.delete(id);
            }
        }
      }
    };
    midi.onPressure=(value,_channel,note)=>engineRef.current?.pressure(trackRef.current,value,note);
    midi.onBend = (value) =>
      engineRef.current?.pitchBend(trackRef.current, value);
    midi.onClock = (status) => {
      if (!externalRef.current) return;
      if (status === 0xfa || status === 0xfb) {
        previewRef.current?.stop();
        transportRef.current?.stop();
        transportRef.current?.start(true);
        setPlaying(true);
      }
      if (status === 0xfc) stop();
      if (status === 0xf8) {
        const now = performance.now(),
          times = clockTimes.current;
        times.push(now);
        if (times.length > 25) times.shift();
        if (times.length === 25 && transportRef.current?.running) {
          const bpm = clamp(
            Math.round(60000 / (((times[24] - times[0]) / 24) * 24)),
            40,
            240,
          );
          if (Math.abs(bpm - projectRef.current.tempo) > 1)
            updateProject((p) => ({ ...p, tempo: bpm }));
        }
        transportRef.current?.clock();
      }
    };
    return () => midi.dispose();
  }, [changePatch, noteOff, notify, stop, releaseLiveNotes]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        el.closest(
          'input,select,textarea,[role="slider"],[role="dialog"],[contenteditable="true"]',
        ) ||
        modalRef.current ||
        migrationRef.current ||
        document.querySelector('[role="dialog"]') ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      const key = e.key.toLowerCase();
      if (el.closest("[data-piano-roll]") && e.code !== "Space" && e.key !== "Escape") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (e.repeat) return;
        if (transportRef.current?.running) stop();
        else void playRef.current();
        return;
      }
      if (e.key === "Escape") {
        stop();
        return;
      }
      if (e.repeat) return;
      if (key === "z") {
        setOctave((n) => Math.max(2, n - 1));
        return;
      }
      if (key === "x") {
        setOctave((n) => Math.min(4, n + 1));
        return;
      }
      const i = KEYBOARD_KEYS.indexOf(key);
      if (i >= 0) {
        e.preventDefault();
        const note = octaveRef.current * 12 + i,
          which = trackRef.current;
        keyboardHeld.current.set(key, { note, track: which });
        void noteOnRef.current(note, 0.8, which);
      }
    };
    const keyup = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase(),
        held = keyboardHeld.current.get(key);
      if (held) {
        noteOff(held.note, held.track);
        keyboardHeld.current.delete(key);
      }
    };
    const blur = () => {
      for (const held of keyboardHeld.current.values())
        noteOff(held.note, held.track);
      keyboardHeld.current.clear();
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
    };
  }, [noteOff, stop]);
  useEffect(
    () => () => {
      transportRef.current?.stop();
      previewRef.current?.stop(false);
      const ctx = engineRef.current?.context;
      engineRef.current?.dispose();
      if (ctx instanceof AudioContext) void ctx.close();
      midiRef.current.dispose();
    },
    [],
  );

  const current = project.tracks[track],
    patch = current.patch,
    currentPattern = current.patterns[project.activePattern],
    currentStep = currentPattern.steps[selectedStep];
  const selectTrack = (i: number) => {
    setTrack(i);
    setLockMode(false);
  };
  const loadPreset = (preset: Patch) => {
    if (
      (preset.filterType === "comb" || needsAdvancedFilter(preset) || needsEngineWorklet(preset)) &&
      engineRef.current &&
      !engineRef.current.combAvailable
    ) {
      notify(
        "Dieses Filtermodell benötigt AudioWorklet über HTTPS oder localhost.",
      );
      return;
    }
    checkpoint();
    engineRef.current?.panic(track);
    changeTrack(track, { patch: clone(preset), name: preset.name });
    setLockMode(false);
    notify(`${preset.name} geladen.`);
  };
  const cyclePreset = (offset: number) => {
    const all = [...PRESETS, ...userPresets],
      index = all.findIndex((p) => p.name === patch.name);
    loadPreset(all[(index + offset + all.length) % all.length]);
  };
  const openSavePreset = () => {
    setPresetName(patch.name);
    setModal("preset");
  };
  const savePreset = async () => {
    if (!presetName.trim()) return;
    const preset = { ...clone(patch), name: presetName.trim().slice(0, 80) },
      next = [...userPresets.filter((p) => p.name !== preset.name), preset];
    try {
      await writeStored("presets", next);
      setUserPresets(next);
      changePatch({ name: preset.name });
      setModal("library");
      notify("Preset in deiner Library gespeichert.");
    } catch {
      notify(
        "Preset konnte lokal nicht gespeichert werden. Bitte als Datei exportieren.",
      );
    }
  };
  const randomizePatch = () => {
    checkpoint();
    changePatch({
      cutoff: 200 + Math.random() * 7000,
      resonance: Math.random() * 8,
      shape: Math.random(),
      detune: Math.random() * 30,
      mix: Math.random(),
      brightness: Math.random(),
      harmonics: Math.ceil(Math.random() * 24),
      decay: 0.08 + Math.random() * 0.9,
      delay: Math.random() * 0.35,
      reverb: Math.random() * 0.4,
      ...(patch.engine === "fm" ? randomizeFmPatch() : patch.engine === "ring" ? { fmRatio: [0.5, 1, 1.5, 2, 3, 4, 7][Math.floor(Math.random() * 7)] } : {}),
    });
    notify(
      "Sound variiert. Mit Undo lässt sich der vorherige Klang wiederherstellen.",
    );
  };
  const uploadSample = async (file: File) => {
    const which = track;
    if (file.size > 15 * 1024 * 1024) {
      notify("Bitte ein Sample unter 15 MB verwenden.");
      return;
    }
    try {
      const data = await fileData(file),
        engine = await ensureAudio();
      const buffer = await engine.loadSample(data);
      if (buffer.duration > 60) {
        notify("Bitte ein Sample mit maximal 60 Sekunden verwenden.");
        return;
      }
      checkpoint();
      changePatch({ sample: data, sampleName: file.name }, which);
      notify(`Sample geladen: ${file.name} · ${buffer.duration.toFixed(1)} s`);
    } catch (e) {
      notify(`Sample: ${errorMessage(e)}`);
    }
  };
  const connectMidi = async () => {
    setMidiError("");
    try {
      await ensureAudio();
      await midiRef.current.connect();
      setMidiConnected(true);
      setMidiVersion((v) => v + 1);
      notify(
        "MIDI verbunden. Eingehende Noten spielen den ausgewählten Track.",
      );
    } catch (e) {
      setMidiError(errorMessage(e));
    }
  };
  const saveNow = async () => {
    try {
      await writeStored("project", project);
      setSaveState("saved");
      notify("Projekt lokal gespeichert.");
    } catch {
      setSaveState("error");
      notify(
        "Lokales Speichern fehlgeschlagen. Bitte das Projekt als JSON exportieren.",
      );
    }
  };
  const exportJson = () => {
    download(
      new Blob([JSON.stringify(project, null, 2)], {
        type: "application/json",
      }),
      `${project.name.replace(/[^a-z0-9_-]/gi, "-")}.phase.json`,
    );
    notify("Projekt inklusive Samples exportiert.");
  };
  const importFile = async (file: File) => {
    if (file.size > 40 * 1024 * 1024) {
      notify("Die Projektdatei ist zu groß (maximal 40 MB).");
      return;
    }
    try {
      const raw = JSON.parse(await file.text());
      if ([1, 2].includes(raw.version) && raw.tracks) {
        const imported = sanitizeProject(raw);
        if (engineRef.current) await engineRef.current.prepare(imported);
        checkpoint();
        stop();
        setProject(imported);
        setModal(null);
        notify("Projekt importiert.");
      } else {
        const imported = sanitizePatch(raw);
        if (engineRef.current && imported.sample)
          await engineRef.current.loadSample(imported.sample);
        loadPreset(imported);
        setModal(null);
      }
    } catch (e) {
      notify(`Import fehlgeschlagen: ${errorMessage(e)}`);
    }
  };
  const renderWav = async () => {
    setRendering(true);
    try {
      const rendered = await renderProject(clone(project), exportBars, fill);
      download(
        encodeWav(rendered),
        `${project.name.replace(/[^a-z0-9_-]/gi, "-")}-${exportBars}bars.wav`,
      );
      notify("Stereo-WAV exportiert · 44,1 kHz / 16 Bit.");
      setModal(null);
    } catch (e) {
      notify(`WAV-Export: ${errorMessage(e)}`);
    } finally {
      setRendering(false);
    }
  };
  const duplicatePattern = () => {
    const target = (project.activePattern + 1) % 8;
    checkpoint();
    updateProject((p) => ({
      ...p,
      activePattern: target,
      tracks: p.tracks.map((t) => ({
        ...t,
        patterns: t.patterns.map((pat, i) =>
          i === target ? clone(t.patterns[p.activePattern]) : pat,
        ),
      })),
    }));
    notify(`Pattern nach A0${target + 1} dupliziert.`);
  };
  const changeMode = (which: number, mode: EditorMode) => {
    if (projectRef.current.tracks[which].mode === mode) return;
    stop(); setLockMode(false); setRecording(false); recordRef.current = false;
    const source = projectRef.current.tracks[which];
    if (mode === "piano") {
      checkpoint();
      changeTrack(which, { mode, patterns: source.patterns.map((pat) => ({ ...pat, notes: stepsToNotes(pat) })) });
      notify(`Track ${which + 1}: alle Patterns als Piano Roll übernommen.`);
    } else {
      const result = source.patterns.map((pat) => migrateToSteps(pat, effectiveSwing(pat, projectRef.current)));
      setMigration({ track: which, patterns: source.patterns.map((pat, i) => ({ ...pat, steps: result[i].steps, pianoBackup: clone({ notes: pat.notes, steps: pat.steps, length: pat.length, division: pat.division, direction: pat.direction, swingMode:pat.swingMode,swing:pat.swing,swingResolution:pat.swingResolution }) })), reports: result.map((r) => r.report) });
    }
  };
  const confirmMigration = () => {
    if (!migration) return;
    checkpoint();
    changeTrack(migration.track, { mode: "step", patterns: migration.patterns });
    setLockMode(false); setMigration(null);
    notify("Track migriert. Die ursprüngliche Piano Roll bleibt wiederherstellbar.");
  };
  const restorePiano = (which: number) => {
    stop(); checkpoint(); setLockMode(false);
    const t = projectRef.current.tracks[which];
    changeTrack(which, { mode: "piano", patterns: t.patterns.map((pat) => ({ ...pat, ...(pat.pianoBackup ? clone(pat.pianoBackup) : {}) })) });
    notify("Ursprüngliche Piano Roll wiederhergestellt.");
  };
  const randomPattern = () => {
    checkpoint();
    if (current.mode === "piano") {
      const scale = currentPattern.scale.enabled ? currentPattern.scale : { enabled: true, root: 0, name: "minorPentatonic" as const };
      const notes = generateNotes({ kind: "melody", from: 0, to: currentPattern.length, grid: 1, density: .45, pulses: 5, cycle: 16, octave: 3, octaves: 2, gate: .8, velocity: .8, order: "up" }, scale, []);
      changePattern(track, { notes });
      notify(`Pattern generiert · ${["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][scale.root]} ${SCALES[scale.name].label}.`);
      return;
    }
    const scale = [0, 3, 5, 7, 10],
      root = track === 1 ? 36 : track === 2 ? 72 : 48;
    const generated = Array.from({ length: MAX_STEPS }, (_, i) => ({
        ...makeStep(),
        on:
          i < currentPattern.length &&
          Math.random() < (track === 1 ? 0.28 : 0.45),
        note:
          track === 1 || track === 2
            ? root
            : root +
              scale[Math.floor(Math.random() * scale.length)] +
              (Math.random() > 0.85 ? 12 : 0),
        velocity: 0.45 + Math.random() * 0.5,
        probability: Math.random() > 0.8 ? 0.7 : 1,
      }));
    changePattern(track, { steps: generated });
    notify("Pattern generiert · C-Moll-Pentatonik.");
  };
  const allPresets = [...PRESETS, ...userPresets].filter(
    (p) =>
      (engineFilter === "all" || p.engine === engineFilter) &&
      `${p.name} ${p.engine}`.toLowerCase().includes(search.toLowerCase()),
  );
  const midi = midiRef.current;
  void midiVersion;
  const closeModal = useCallback(() => setModal(null), []);

  return (
    <div className="app-shell studio-viewport">
      {migration && <Modal title={`Track ${migration.track + 1} in Step-Sequencer migrieren?`} subtitle="Vorschau für alle acht Patterns dieses Tracks" onClose={closeMigration}>
        <div className="migration-details">
          <p>Die Step-Ansicht unterstützt pro Position eine Note oder einen festen Akkord mit gemeinsamer Länge, Velocity und Trigger-Einstellungen. Nicht darstellbare Teile können beim Migrieren verloren gehen.</p>
          <ul>{migration.reports.map((r, i) => <li key={i}><b>A0{i + 1}:</b> {r.dropped + r.timing + r.lengths + r.expression === 0 ? "Verlustfrei übertragbar." : `${r.dropped} Noten entfallen · ${r.timing} Zeitpunkte/Richtungsabläufe angepasst · ${r.lengths} Längen angepasst · ${r.expression} Ausdrucks-/Trigger-Einstellungen vereinheitlicht.`}</li>)}</ul>
          <p>Die Zuordnung behält möglichst viele passende Akkordtöne. Bei Konflikten bestimmen die stärksten Noten die gemeinsamen Werte. Es werden keine zusätzlichen Akkordtöne erzeugt.</p>
          <p>Deine ursprünglichen Piano-Roll-Noten bleiben im Projekt gespeichert und lassen sich über „Original-Piano-Roll wiederherstellen“ zurückholen.</p>
        </div>
        <div className="migration-actions"><button className="small-button" onClick={closeMigration}>Abbrechen</button><button className="primary-button" onClick={confirmMigration}>Jetzt migrieren</button></div>
      </Modal>}
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("synth");
            setView("synthesizer");
          }}
          aria-label="PHASE Studio"
        >
          <span className="brand-mark">
            <svg viewBox="0 0 34 32">
              <path d="M3 25V7l9 18V7l10 18V7l9 18" />
            </svg>
          </span>
          <span>
            PHASE<small>SOUND IN MOTION</small>
          </span>
          <span className="brand-version">01</span>
        </a>
        <div className="topbar-divider" />
        <button className="project-switch" onClick={() => setModal("project")}>
          <span>
            <i className={saveState === "error" ? "error" : ""} />
            {project.name}
          </span>
          <small>STUDIO SESSION / A0{project.activePattern + 1}</small>
          <ChevronDown size={13} />
        </button>
        <div className="transport">
          <div className="tempo-control">
            <TempoInput value={project.tempo} onChange={(tempo) => updateProject((p) => ({ ...p, tempo }))} />
            <button
              onClick={() => {
                const now = performance.now();
                const taps = tapRef.current.filter((t) => now - t < 2200);
                taps.push(now);
                tapRef.current = taps.slice(-5);
                if (taps.length > 1) {
                  const bpm =
                    60000 /
                    ((taps[taps.length - 1] - taps[0]) / (taps.length - 1));
                  updateProject((p) => ({
                    ...p,
                    tempo: clamp(Math.round(bpm), 40, 240),
                  }));
                }
              }}
              title="Tempo tappen"
            >
              TAP
            </button>
          </div>
          <div className="transport-buttons">
            <button
              className={`play-button ${playing ? "playing" : ""}`}
              onClick={togglePlay}
              aria-label={playing ? "Sequencer pausieren" : "Sequencer starten"}
              title="Play / Stop · Leertaste"
            >
              {playing ? (
                <Pause size={16} fill="currentColor" />
              ) : (
                <Play size={16} fill="currentColor" />
              )}
            </button>
            <IconButton label="Stop und alle Noten beenden" onClick={stop}>
              <Square size={12} fill="currentColor" />
            </IconButton>
            <IconButton
              label="Live-Aufnahme in Steps"
              onClick={() => {
                setRecording(!recording);
                notify(
                  !recording
                    ? "Live Rec: Noten werden im gewählten Track-Editor aufgenommen."
                    : "Live-Aufnahme beendet.",
                );
              }}
              active={recording}
              className="record-button"
            >
              <Circle size={13} fill={recording ? "currentColor" : "none"} />
            </IconButton>
          </div>
          <div className="position-display">
            <span>{String(track + 1).padStart(2, "0")}</span>
            <b>:</b>
            <span>
              {String(Math.max(0, playheads[track]) + 1).padStart(2, "0")}
            </span>
            <small>TRACK / TRIG</small>
          </div>
        </div>
        <div className="topbar-actions">

          <IconButton label="Projekt speichern" onClick={() => void saveNow()}>
            <Save size={16} />
          </IconButton>
          <IconButton
            label="Projekt und Audio exportieren"
            onClick={() => setModal("export")}
          >
            <ArrowDownToLine size={16} />
          </IconButton>
          <button
            className={`audio-button ${audioReady ? "enabled" : ""}`}
            onClick={async () => {
              if (audioReady) {
                stop();
                await (engineRef.current?.context as AudioContext)?.suspend();
                setAudioReady(false);
              } else
                try {
                  await ensureAudio();
                } catch {
                  /* displayed */
                }
            }}
            disabled={audioBusy}
          >
            {audioBusy ? (
              <LoaderCircle size={13} className="spin" />
            ) : (
              <Power size={13} />
            )}
            <span>{audioReady ? "AUDIO ON" : "AUDIO START"}</span>
            <i />
          </button>
        </div>
        <div className="topbar-utilities">
          {" "}
          <span
            className={`local-status save-${saveState}`}
            title={
              saveState === "saved"
                ? "Lokal gespeichert"
                : saveState === "error"
                  ? "Speichern fehlgeschlagen – Projekt exportieren"
                  : "Wird gespeichert"
            }
            aria-live="polite"
          >
            {saveState === "saved" ? (
              <Check size={11} />
            ) : saveState === "error" ? (
              <Circle size={10} />
            ) : (
              <LoaderCircle size={11} className="spin" />
            )}
            {saveState === "saved"
              ? "SAVED LOCALLY"
              : saveState === "error"
                ? "EXPORT TO SAVE"
                : "SAVING…"}
          </span>
          <IconButton
            label="Bedienung und Tastenkürzel"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={14} />
          </IconButton>
          <IconButton
            label="MIDI-Einstellungen"
            active={midiConnected}
            onClick={() => setModal("midi")}
          >
            <PlugZap size={16} />
          </IconButton>
          <IconButton
            label="Studio-Einstellungen"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={14} />
          </IconButton>
        </div>
      </header>
      <div className="studio-body">
        <aside className="rack-sidebar">
          <div className="rack-heading">
            <span className="eyebrow">INSTRUMENT RACK</span>
            <span>{String(TRACK_COUNT).padStart(2, "0")}</span>
          </div>
          <div className="rack-tracks">
            {project.tracks.map((t, i) => (
              <button
                key={t.id}
                className={`rack-track ${track === i ? "selected" : ""} ${t.mute ? "is-muted" : ""}`}
                onClick={() => selectTrack(i)}
                style={{ "--track-color": t.color } as CSSProperties}
              >
                <div className="rack-track-top">
                  <span className="rack-number">{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    {ENGINES.find((e) => e.id === t.patch.engine)?.short}
                  </span>
                  <i
                    className={
                      playing &&
                      (t.mode === "piano" ? t.patterns[project.activePattern].notes.some((n) => n.start <= playheads[i] && n.start + n.duration > playheads[i]) : t.patterns[project.activePattern].steps[playheads[i]]?.on) &&
                      !t.mute
                        ? "lit"
                        : ""
                    }
                  />
                </div>
                <strong>{t.name}</strong>
                <Waveform patch={t.patch} compact />
                <div className="rack-track-bottom">
                  <span>
                    {t.mode === "piano" ? "PIANO" : "STEP"} <b>·</b>{" "}
                    {t.mute ? "MUTED" : t.solo ? "SOLO" : "ACTIVE"}
                  </span>
                  <ArrowRight size={12} />
                </div>
              </button>
            ))}
          </div>
          <div className="sidebar-bottom">
            <div className="master-heading">
              <span className="eyebrow">MASTER OUTPUT</span>
              <Headphones size={13} />
            </div>
            <Scope analyser={engineRef.current?.analyser} active={audioReady} />
            <LevelMeter
              analyser={audioReady ? engineRef.current?.analyser : undefined}
            />
            <label className="master-volume">
              <Volume2 size={14} />
              <input
                aria-label="Master volume"
                type="range"
                min="0"
                max="1"
                step=".01"
                value={project.master}
                onChange={(e) =>
                  updateProject((p) => ({ ...p, master: +e.target.value }))
                }
              />
              <output>{Math.round(project.master * 100)}%</output>
            </label>
            <div className="master-meta">
              <span>
                {audioInfo.sampleRate
                  ? `${audioInfo.sampleRate / 1000} kHz`
                  : "WEB AUDIO"}
              </span>
              <span>STEREO OUT</span>
            </div>
          </div>
        </aside>
        <main className="studio-main">
          <div className="main-heading">
            <nav
              className="workspace-tabs"
              role="tablist"
              aria-label="Arbeitsbereich"
            >
              <button
                role="tab"
                aria-selected={view === "synthesizer"}
                className={view === "synthesizer" ? "active" : ""}
                onClick={() => setView("synthesizer")}
              >
                <AudioLines size={15} /> Synthesizer
              </button>
              <button
                role="tab"
                aria-selected={view === "sequencer"}
                className={view === "sequencer" ? "active" : ""}
                onClick={() => setView("sequencer")}
              >
                <Layers3 size={15} /> Sequencer <span>8 TRACKS</span>
              </button>
              <button
                role="tab"
                aria-selected={view === "master"}
                className={view === "master" ? "active" : ""}
                onClick={() => setView("master")}
              >
                <SlidersHorizontal size={15} /> Master FX
              </button>
            </nav>
            <div className="swing-control">
              <Waves size={12} />
              <label>
                SWING
                <input
                  aria-label="Swing"
                  type="range"
                  min="0"
                  max="1"
                  step=".01"
                  value={project.swing}
                  onChange={(e) =>
                    updateProject((p) => ({ ...p, swing: +e.target.value }))
                  }
                />
                <output>{Math.round(project.swing * 100)}%</output>
              </label>
              <Select label="Globale Swing-Auflösung" value={project.swingResolution} onChange={v=>{checkpoint();updateProject(p=>({...p,swingResolution:+v as 8|16}));}}><option value="8">1/8</option><option value="16">1/16</option></Select>
            </div>
            <div className="main-heading-actions">
              {lockMode && (
                <span className="lock-context" role="status">
                  P-LOCK · T{track + 1} / STEP {selectedStep + 1}
                </span>
              )}
              <button
                className="heading-action"
                onClick={duplicatePattern}
                aria-label="Pattern duplizieren"
                title="Pattern duplizieren"
              >
                <Copy size={14} /> <span>Duplicate pattern</span>
              </button>
              <button
                onClick={() => setKeyboardVisible((v) => !v)}
                className={`heading-action ${keyboardVisible ? "active" : ""}`}
                aria-pressed={keyboardVisible}
                aria-label={keyboardVisible ? "Keyboard ausblenden" : "Keyboard einblenden"}
                title={keyboardVisible ? "Keyboard ausblenden" : "Keyboard einblenden"}
              >
                <KeyboardIcon size={14} /> <span>Keyboard</span>
              </button>
              <IconButton
                label="Letzte größere Aktion rückgängig"
                disabled={!undoAvailable}
                onClick={undo}
              >
                <Undo2 size={15} />
              </IconButton>
              <button
                className="text-button browse-sounds"
                onClick={() => setModal("library")}
                aria-label="Sound-Bibliothek öffnen"
                title="Sound-Bibliothek öffnen"
              >
                <FolderOpen size={13} /> <span>Browse sounds</span> <ArrowRight size={12} />
              </button>
            </div>
          </div>
          {view === "synthesizer" && (
            <Instrument
              patch={patch}
              color={current.color}
              track={track}
              tempo={project.tempo}
              sampleRate={audioInfo.sampleRate || 48000}
              readModulation={()=>engineRef.current?.modulationReading(track)}
              tab={tab}
              setTab={setTab}
              onPatch={(partial) => {
                if (
                  partial.filterType === "comb" &&
                  engineRef.current &&
                  !engineRef.current.combAvailable
                ) {
                  notify(
                    "Comb ist in diesem Audiokontext nicht verfügbar. Bitte AudioWorklet über HTTPS oder localhost verwenden.",
                  );
                  return;
                }
                if (partial.mods && (partial.mods.length !== patch.mods.length || partial.mods.some((m, i) => m.target !== patch.mods[i]?.target || m.source !== patch.mods[i]?.source))) checkpoint();
                if (partial.voiceMode || partial.engine) engineRef.current?.panic(track);
                changePatch(partial);
              }}
              onCheckpoint={checkpoint}
              onParam={setParam}
              locks={lockMode && current.mode === "step" ? currentStep.locks : {}}
              onLearn={(param) => {
                setMidiLearn({ track, param });
                notify(
                  `MIDI Learn: Bewege einen Hardware-Regler für ${param}.`,
                );
                if (!midiConnected) setModal("midi");
              }}
              onLibrary={() => setModal("library")}
              onSave={openSavePreset}
              onRandom={randomizePatch}
              onPreset={cyclePreset}
              onSample={(file) => void uploadSample(file)}
            />
          )}
          {view === "master" && (
            <MasterFX
              value={project.masterFx}
              onChange={(masterFx) =>
                updateProject((p) => ({ ...p, masterFx }))
              }
            />
          )}
          {view === "sequencer" && (
            <Sequencer
              project={project}
              onMode={changeMode}
              onRestorePiano={restorePiano}
              onNotes={(which, notes) => { checkpoint(); changePattern(which, { notes }); }}
              onAudition={(which, note, velocity) => { const request = playRequest.current; void ensureAudio().then((engine) => { if (request === playRequest.current) engine.noteOn(which, note, velocity, projectRef.current.tracks[which].patch, engine.context.currentTime, .2); }).catch((e) => notify(errorMessage(e))); }}
              onUndo={undo} onRedo={redo} canUndo={undoAvailable} canRedo={redoAvailable}
              noteClipboard={noteClipboard} onNoteClipboard={setNoteClipboard}
              getPosition={(which) => previewRef.current?.position(which)?.step ?? transportRef.current?.position(which)?.step ?? null}
              preview={preview} onPlayTrack={(which) => void playTrack(which)} onPauseTrack={() => previewRef.current?.pause()} onStopTrack={stop}
              track={track}
              selectTrack={selectTrack}
              selectedStep={selectedStep}
              setStep={setSelectedStep}
              page={page}
              setPage={setPage}
              playheads={playheads}
              playing={playing || preview.state === "playing"}
              recording={recording}
              lockMode={lockMode}
              setLockMode={setLockMode}
              fill={fill}
              setFill={setFill}
              onStep={changeStep}
              onTrack={changeTrack}
              onPattern={changePattern}
              onSelectPattern={(activePattern) => {
                setLockMode(false);
                updateProject((p) => ({ ...p, activePattern }));
              }}
              onCopy={() => {
                setClipboard(
                  project.tracks.map((t) =>
                    ({ pattern: clone(t.patterns[project.activePattern]), mode: t.mode }),
                  ),
                );
                notify("Pattern aller zwölf Tracks kopiert.");
              }}
              onPaste={(editor) => {
                if (!clipboard) return;
                if (project.tracks.some((t, i) => t.mode === editor && t.mode === "step" && clipboard[i].mode === "piano")) {
                  notify("Einfügen würde Piano-Roll-Noten auf einen Step-Track übertragen. Diese Tracks zuerst auf Piano Roll umstellen."); return;
                }
                checkpoint();
                updateProject((p) => ({
                  ...p,
                  tracks: p.tracks.map((t, i) => t.mode !== editor ? t : ({
                    ...t,
                    patterns: t.patterns.map((pat, j) =>
                      j === p.activePattern ? (t.mode === clipboard[i].mode ? clone(clipboard[i].pattern) : t.mode === "piano" ? { ...clone(clipboard[i].pattern), notes: stepsToNotes(clipboard[i].pattern) } : pat) : pat,
                    ),
                  })),
                }));
                notify(`Pattern der ${editor === "step" ? "Step" : "Piano-Roll"}-Tracks eingefügt.`);
              }}
              onClear={() => {
                checkpoint();
                changePattern(track, current.mode === "piano" ? { notes: [] } : { steps: Array.from({ length: MAX_STEPS }, makeStep) });
                notify(
                  `Pattern von Track ${track + 1} geleert. Undo ist verfügbar.`,
                );
              }}
              onRandom={randomPattern}
              hasClipboard={!!clipboard}
            />
          )}
          {keyboardVisible && (
            <Keyboard
              active={activeNotes}
              hold={hold}
              onHold={toggleHold}
              onDown={(note) => void noteOn(note)}
              onUp={noteOff}
              octave={octave}
              setOctave={setOctave}
            />
          )}

        </main>
      </div>

      {midiLearn && (
        <div className="midi-learn-banner">
          <Radio size={14} className="pulse" /> MIDI LEARN{" "}
          <b>{midiLearn.param}</b>
          <span>Hardware-Regler bewegen</span>
          <button
            onClick={() => setMidiLearn(null)}
            aria-label="MIDI Learn abbrechen"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="Hinweis schließen">
            <X size={13} />
          </button>
        </div>
      )}

      {modal === "library" && (
        <Modal
          title="A sound for every idea."
          subtitle="Entdecke einen Ausgangspunkt. Mach ihn zu deinem."
          onClose={closeModal}
          wide
        >
          <div className="library-toolbar">
            <label className="search-field">
              <Search size={15} />
              <input
                placeholder="Find a sound…"
                aria-label="Presets durchsuchen"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <Select
              label="Preset engine filter"
              value={engineFilter}
              onChange={setEngineFilter}
            >
              <option value="all">All engines</option>
              {ENGINES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </Select>
            <button className="small-button" onClick={openSavePreset}>
              <Save size={12} /> Save current
            </button>
          </div>
          <div className="preset-grid">
            {allPresets.map((preset, i) => (
              <button
                className={`preset-card ${preset.name === patch.name ? "selected" : ""}`}
                key={`${preset.name}-${i}`}
                onClick={() => {
                  loadPreset(preset);
                  setModal(null);
                }}
              >
                <div>
                  <span className="eyebrow">
                    {ENGINES.find((e) => e.id === preset.engine)?.short}
                  </span>
                  <span>
                    {userPresets.some((p) => p.name === preset.name)
                      ? "USER"
                      : String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <Waveform patch={preset} />
                <strong>{preset.name}</strong>
                <span className="preset-card-meta">
                  {preset.voiceMode.toUpperCase()} <b>·</b>{" "}
                  {preset.cutoff < 1000 ? "DARK" : "BRIGHT"}{" "}
                  <ArrowRight size={13} />
                </span>
              </button>
            ))}
          </div>
          {allPresets.length === 0 && (
            <div className="empty-state">
              <Search size={24} />
              <h3>No sounds found.</h3>
              <p>
                Versuche einen anderen Suchbegriff oder eine andere
                Syntheseform.
              </p>
            </div>
          )}
          <div className="modal-footer">
            <span>
              {allPresets.length} SOUNDS / TRACK 0{track + 1}
            </span>
            <button
              className="text-button"
              onClick={() =>
                download(
                  new Blob([JSON.stringify(patch, null, 2)], {
                    type: "application/json",
                  }),
                  `${patch.name}.phase-preset.json`,
                )
              }
            >
              <Download size={12} /> Export current patch
            </button>
          </div>
        </Modal>
      )}

      {modal === "midi" && (
        <Modal
          title="Connect your instruments."
          subtitle="Noten, Controller und Clock. Direkt mit deiner Hardware."
          onClose={closeModal}
        >
          <div className="connection-status">
            <span className={`status-orb ${midiConnected ? "connected" : ""}`}>
              <PlugZap size={23} />
            </span>
            <div>
              <strong>
                {midiConnected ? "MIDI connected" : "MIDI is waiting"}
              </strong>
              <p>
                {midiConnected
                  ? `${midi.inputs.length} inputs · ${midi.outputs.length} outputs`
                  : "Chrome oder Edge · HTTPS oder localhost"}
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => void connectMidi()}
            >
              {midiConnected ? "Refresh" : "Connect MIDI"}
            </button>
          </div>
          {midiError && <p className="error-message">{midiError}</p>}
          <div className="settings-grid">
            <label>
              INPUT DEVICE
              <Select
                label="MIDI Input"
                value={midi.input}
                onChange={(v) => {
                  midi.input = v;
                  setMidiVersion((n) => n + 1);
                }}
              >
                <option value="all">All MIDI inputs</option>
                {midi.inputs.map((port) => (
                  <option value={port.id} key={port.id}>
                    {port.name}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              INPUT CHANNEL
              <Select
                label="MIDI input channel"
                value={midi.channel}
                onChange={(v) => {
                  midi.channel = +v;
                  setMidiVersion((n) => n + 1);
                }}
              >
                <option value="0">Omni / all channels</option>
                {Array.from({ length: 16 }, (_, i) => (
                  <option value={i + 1} key={i}>
                    {i + 1}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              OUTPUT DEVICE
              <Select
                label="MIDI Output"
                value={midi.output}
                onChange={(v) => {
                  midi.panic();
                  midi.output = v;
                  setMidiVersion((n) => n + 1);
                }}
              >
                <option value="none">No MIDI output</option>
                {midi.outputs.map((port) => (
                  <option value={port.id} key={port.id}>
                    {port.name}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              CLOCK SOURCE
              <Select
                label="MIDI clock source"
                value={externalClock ? "external" : "internal"}
                onChange={(v) => {
                  stop();
                  setExternalClock(v === "external");
                }}
              >
                <option value="internal">Internal tempo</option>
                <option value="external">External MIDI clock</option>
              </Select>
            </label>
          </div>
          <label className="toggle-row">
            <span>
              <strong>Send MIDI clock</strong>
              <small>24 PPQN und Start/Stop zum ausgewählten Ausgang</small>
            </span>
            <input
              type="checkbox"
              checked={midi.clockOut}
              onChange={(e) => {
                midi.clockOut = e.target.checked;
                setMidiVersion((n) => n + 1);
              }}
            />
          </label>
          <p className="info-note">
            Eingehende Noten spielen den ausgewählten Track. Ausgehende
            Keyboard- und Sequencer-Noten: Track 1–12 auf Kanal 1–12. Pitch Bend:
            ±2 Halbtöne. Sustain: CC64. CC1: Modwheel, CC7: Level, CC71:
            Resonanz, CC74: Cutoff.
          </p>
          <div className="midi-mapping">
            <div className="module-title">
              <h3>MIDI Learn mappings</h3>
              <button
                className="small-button"
                onClick={() => {
                  setBindings([]);
                  void writeStored("midiBindings", []);
                }}
              >
                Clear all
              </button>
            </div>
            <p>
              Rechtsklick auf einen Drehregler, dann Hardware-Regler bewegen.
            </p>
            {bindings.map((b) => (
              <div className="mapping-row" key={b.cc}>
                <span>CC {b.cc}</span>
                <span>
                  → TRACK {String(b.track+1).padStart(2,"0")} / {b.param==="fmAlgorithm"?"FM algorithm":PARAMETER_REGISTRY[b.param].label}
                </span>
                <button
                  onClick={() => {
                    const next = bindings.filter((x) => x.cc !== b.cc);
                    setBindings(next);
                    void writeStored("midiBindings", next);
                  }}
                  aria-label={`CC ${b.cc} Mapping entfernen`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {modal === "preset" && (
        <Modal
          title="Keep that sound."
          subtitle="Dein Preset wird inklusive aller Klangparameter und Samples gespeichert."
          onClose={closeModal}
        >
          <label className="field-label">
            PRESET NAME
            <input
              className="text-input"
              value={presetName}
              maxLength={80}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void savePreset();
              }}
            />
          </label>
          <div className="preset-preview">
            <Waveform patch={patch} />
            <span>
              {ENGINES.find((e) => e.id === patch.engine)?.label} ·{" "}
              {patch.voiceMode.toUpperCase()}
            </span>
          </div>
          <button
            className="primary-button full-width"
            disabled={!presetName.trim()}
            onClick={() => void savePreset()}
          >
            <Save size={14} /> Save to my sound library
          </button>
        </Modal>
      )}

      {modal === "project" && (
        <Modal
          title="Your next late-night idea."
          subtitle="Projekte bleiben auf diesem Gerät. JSON-Exporte enthalten auch Samples."
          onClose={closeModal}
        >
          <label className="field-label">
            PROJECT NAME
            <input
              className="text-input"
              value={project.name}
              maxLength={80}
              onChange={(e) =>
                updateProject((p) => ({ ...p, name: e.target.value }))
              }
            />
          </label>
          <div className="project-actions">
            <button
              onClick={() => {
                void saveNow();
              }}
            >
              <Save size={20} />
              <strong>Save project</strong>
              <span>Im Browser speichern</span>
            </button>
            <label>
              <Upload size={20} />
              <strong>Open project / patch</strong>
              <span>PHASE JSON importieren</span>
              <input
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importFile(file);
                  e.target.value = "";
                }}
              />
            </label>
            <button onClick={exportJson}>
              <Download size={20} />
              <strong>Export project</strong>
              <span>Mit eingebetteten Samples</span>
            </button>
            <button
              onClick={() => {
                checkpoint();
                stop();
                const next = makeProject();
                next.name = "Untitled idea";
                next.tracks.forEach(
                  (t) => (t.patterns = Array.from({ length: 8 }, makePattern)),
                );
                setProject(next);
                setModal(null);
                notify(
                  "Leeres Projekt angelegt. Vorheriges Projekt ist per Undo wiederherstellbar.",
                );
              }}
            >
              <FilePlus2 size={20} />
              <strong>New project</strong>
              <span>Zwölf Tracks, ein leeres Blatt</span>
            </button>
          </div>
          <p className="info-note">
            Automatisches Speichern über IndexedDB. Browserdaten löschen oder
            privater Modus können lokale Projekte entfernen. Bewahre wichtige
            Sessions als Export auf.
          </p>
        </Modal>
      )}

      {modal === "export" && (
        <Modal
          title="Take the sound with you."
          subtitle="Deine Session als Projekt, Sound oder fertiges Audio."
          onClose={rendering ? () => {} : closeModal}
        >
          <div className="export-options">
            <button onClick={exportJson}>
              <Layers3 size={23} />
              <div>
                <strong>PHASE project</strong>
                <p>Alle Tracks, Patterns, Sounds und Samples · JSON</p>
              </div>
              <Download size={16} />
            </button>
            <button
              onClick={() =>
                download(
                  new Blob([JSON.stringify(patch, null, 2)], {
                    type: "application/json",
                  }),
                  `${patch.name}.phase-preset.json`,
                )
              }
            >
              <AudioLines size={23} />
              <div>
                <strong>Current patch</strong>
                <p>{patch.name} · wiederverwendbares Preset</p>
              </div>
              <Download size={16} />
            </button>
          </div>
          <div className="wav-export">
            <div>
              <span className="eyebrow">OFFLINE AUDIO RENDER</span>
              <h3>Stereo WAV</h3>
              <p>
                Aktuelles Pattern, hörbare Tracks und Effekte.
                <br />
                44,1 kHz · 16 Bit · mit Effekt-Ausklang.
              </p>
            </div>
            <Select
              label="WAV export bars"
              value={exportBars}
              onChange={(v) => setExportBars(+v)}
            >
              {[1, 2, 4, 8, 16].map((n) => (
                <option value={n} key={n}>
                  {n} {n === 1 ? "bar" : "bars"}
                </option>
              ))}
            </Select>
          </div>
          <button
            className="primary-button full-width"
            onClick={() => void renderWav()}
            disabled={rendering}
          >
            {rendering ? (
              <>
                <LoaderCircle size={15} className="spin" /> Rendering audio…
              </>
            ) : (
              <>
                <Download size={15} /> Render & download WAV
              </>
            )}
          </button>
          <p className="info-note">
            Wahrscheinlichkeits-Trigs und Granular-/Physical-Zufall werden für
            jeden Export neu berechnet. Bei langen Track-Patterns entsprechend
            viele Takte wählen.
          </p>
        </Modal>
      )}

      {modal === "settings" && (
        <Modal
          title="Fine-tune your studio."
          subtitle="Audio, Spielweise und Session-Werkzeuge."
          onClose={closeModal}
        >
          <div className="settings-stats">
            <div>
              <span>AUDIO ENGINE</span>
              <strong>{audioReady ? "Running" : "Standby"}</strong>
            </div>
            <div>
              <span>SAMPLE RATE</span>
              <strong>
                {audioInfo.sampleRate
                  ? `${audioInfo.sampleRate / 1000} kHz`
                  : "Auto"}
              </strong>
            </div>
            <div>
              <span>BASE LATENCY</span>
              <strong>
                {audioInfo.latency
                  ? `${(audioInfo.latency * 1000).toFixed(1)} ms`
                  : "Auto"}
              </strong>
            </div>
          </div>
          <label className="settings-master">
            <Volume2 size={16} />
            <span>Master volume</span>
            <input
              aria-label="Master volume settings"
              type="range"
              min="0"
              max="1"
              step=".01"
              value={project.master}
              onChange={(e) =>
                updateProject((p) => ({ ...p, master: +e.target.value }))
              }
            />
            <output>{Math.round(project.master * 100)}%</output>
          </label>
          <label className="toggle-row">
            <span>
              <strong>On-screen keyboard</strong>
              <small>
                Vier Oktaven · Maus und Computer-Tastatur
              </small>
            </span>
            <input
              type="checkbox"
              checked={keyboardVisible}
              onChange={(e) => setKeyboardVisible(e.target.checked)}
            />
          </label>
          <div className="settings-text">
            <h3>32 voices. Three ways to play.</h3>
            <p>
              Poly: Filter und Hüllkurven pro Stimme. Para: gemeinsame
              Filter-/Amp-Hüllkurven. Mono: eine Note mit Legato und Portamento.
              Der Modus lässt sich pro Track im Instrument umschalten.
            </p>
            <h3>Everything stays here.</h3>
            <p>
              Klangerzeugung und WAV-Export laufen lokal im Browser. Keine
              Registrierung, kein Upload deiner Samples. Für MIDI wird eine
              sichere Verbindung (HTTPS oder localhost) benötigt.
            </p>
          </div>
          <div className="modal-footer">
            <button
              className="small-button"
              onClick={() => {
                stop();
                notify("Alle Noten und die Wiedergabe gestoppt.");
              }}
            >
              <Square size={11} /> Panic / all notes off
            </button>
            <button
              className="small-button"
              onClick={() => {
                checkpoint();
                stop();
                setProject(makeProject());
                notify("Demo-Session wiederhergestellt.");
                setModal(null);
              }}
            >
              <RotateCcw size={12} /> Restore demo
            </button>
          </div>
        </Modal>
      )}

      {modal === "help" && (
        <Modal
          title="A few keys to get going."
          subtitle="PHASE ist ein Instrument. Hör hin, dreh auf, experimentiere."
          onClose={closeModal}
          wide
        >
          <div className="help-grid">
            <section>
              <h3>Play & explore</h3>
              <p>
                <kbd>Space</kbd> Sequencer starten / stoppen
              </p>
              <p>
                <kbd>A W S E D F T G Y H U J K</kbd> Keyboard
              </p>
              <p>
                <kbd>Z</kbd> / <kbd>X</kbd> Oktave wechseln
              </p>
              <p>
                <kbd>Esc</kbd> Alle Noten stoppen
              </p>
              <p>
                <kbd>Shift</kbd> + Regler ziehen: fein einstellen
              </p>
              <p>Doppelklick auf Regler: Standardwert</p>
              <p>BPM ziehen: Tempo ändern; Shift für feine Schritte. Den Wert anklicken, löschen und neu eingeben; Enter übernimmt, Esc verwirft.</p>
              <p>Der Button im Keyboard halbiert seine Höhe und gibt dem Editor mehr Platz.</p>
              <p><b>Hold:</b> Hält Keyboard- und MIDI-Noten nach dem Loslassen. Hold ausschalten lässt diese Noten los; Stop oder Esc stoppt alle Noten.</p>
              <p>Auswahlfelder geben nach einer Auswahl den Fokus frei, damit das Computer-Keyboard wieder spielt.</p>
              <p>Rechtsklick auf Regler: MIDI Learn</p>
            </section>
            <section>
              <h3>Sequence & lock</h3>
              <p>Leeren Step klicken: aktivieren. Belegten Step klicken: auswählen. Den bereits ausgewählten Step erneut klicken: deaktivieren.</p>
              <p>
                <kbd>Shift</kbd> + Klick oder Rechtsklick: Step und Parameter-Locks direkt bearbeiten. Lock-Werte mit dem Maus-Slider oder als Zahl einstellen.
              </p>
              <p>
                <b>P-LOCK aktivieren</b>, zu <b>Synthesizer</b> wechseln und
                einen Regler bewegen: Der Wert gilt nur für diesen Step.
              </p>
              <p>
                Wahrscheinlichkeit, Gate, Microtiming, Retrig und Bedingungen im
                Trig-Editor bearbeiten.
              </p>
              <p><b>Fill:</b> Schaltet Noten mit Bedingung <code>fill</code> frei und unterdrückt <code>!fill</code>. Always-Noten spielen weiter. FILL ON zeigt den aktiven Zustand.</p>
              <p>
                Jeder Track hat eigene Länge (1–128), Geschwindigkeit und
                Richtung. Acht Pattern-Speicher enthalten jeweils alle zwölf
                Tracks.
              </p>
              <p>
                <b>Live Rec:</b> Im Step-Modus werden Trigs eingetragen. In der
                Piano Roll werden polyphone Noten mit Anschlagstärke und gemessener
                Dauer aufgenommen, auch über Loop-Grenzen hinweg.
              </p>
            </section>
            <section>
              <h3>Piano Roll</h3>
              <p>Den Editortyp pro Track im Sequencer wählen. Das Step-Register zeigt Piano-Tracks als schreibgeschützte Notenübersicht; Mute und Solo bleiben bedienbar.</p>
              <p><b>Track-Wiedergabe:</b> Play spielt nur diesen Track ab der Startmarkierung, Pause hält die Position, Stop beendet die Wiedergabe. Die Solo-Einstellungen bleiben erhalten; Mute wird berücksichtigt. Der Bereich spielt vorwärts, unabhängig von der Richtung des gemeinsamen Transports.</p>
              <p><b>Bereich:</b> Die beiden Marker oben im Lineal ziehen. Shift+Klick setzt den Anfang, Alt+Klick das Ende. Fokussierte Marker mit Links/Rechts verschieben (Shift: vier Steps); Home/End setzt an die jeweilige Grenze. Loop wiederholt den Bereich; ausgeschaltet endet die Wiedergabe am Endmarker.</p>
              <p><b>Follow:</b> Die Ansicht scrollt während der Wiedergabe automatisch mit dem Abspielkopf.</p>
              <p>Zeichnen: Note setzen und Länge ziehen. Noten verschieben, an beiden Rändern skalieren, mit Shift mehrfach auswählen. Das Hand-Werkzeug verschiebt den Ausschnitt.</p>
              <p>Velocity unten ziehen; genaue Werte, Chance, Microtiming, Bedingungen und Noten-Locks im Inspector bearbeiten. Ctrl/Cmd+C/V/D kopiert, fügt am Cursor ein und dupliziert; Ctrl/Cmd+Z macht rückgängig. Shift+Pfeile oben/unten transponieren um eine Oktave.</p>
              <p><b>Scale:</b> Grundton und Skala wählen; neue und vertikal verschobene Noten rasten in der Skala ein. Fold zeigt verwendete Noten und bei aktiver Skala deren Töne. Bestehende Noten bleiben erhalten.</p>
              <p><b>Zoom:</b> Im Zeitlineal vertikal ziehen zum Zoomen, horizontal zum Verschieben. Ctrl/Cmd + Mausrad zoomt die Zeitachse am Mauszeiger, Alt + Mausrad die Tonhöhenachse. Doppelklick auf das Lineal oder H passt das Pattern ein; +/− zoomt zur Mitte.</p>
              <p><b>Werkzeuge:</b> Melodie, Euclid-Rhythmus und Arpeggio generieren; Zeit/Tonhöhen spiegeln, Legato, Zeit strecken/stauchen, rotieren und quantisieren. Humanize variiert Timing, Velocity und Länge. Bereich wählen, Vorschau erzeugen, übernehmen; jede Anwendung lässt sich mit Undo zurücknehmen.</p>
              <p>Rechtsklick oder Doppelklick löscht eine Note, Alt + Ziehen kopiert sie. Ctrl/Cmd+A wählt alle Noten, Ctrl/Cmd+X schneidet aus, Ctrl/Cmd+Shift+Z wiederholt. Ränder ziehen ändert die Länge. Alle Änderungen der Notenposition werden vorgehört.</p>
              <p>Step → Piano Roll übernimmt alle Patterns. Piano Roll → Step zeigt vorab mögliche Verluste und verlangt eine Bestätigung. Die ursprünglichen Patterns bleiben wiederherstellbar.</p>
            </section>
            <section>
              <h3>FM · drei Operatoren</h3>
              <p>In Oscillator OP 1/2/3 wählen: Waveform, Ratio oder Fixed Hz, Fine, Level und Feedback. Nur die zum Algorithmus passenden Verbindungs-Indizes werden angezeigt. Level und OP-ADSR wirken vor Modulations- und Audioausgängen; jeder Modulationspfeil hat eine eigene Tiefe.</p>
              <p>Character / Unison bietet Serial, Parallel, Branched, Dual Carrier, Hybrid und Triple Carrier samt Schaltbild. Die separate OP-Auswahl darunter wechselt zwischen drei vollständigen ADSRs mit Attack-/Decay-/Release-Kurven. Kurve 0 ist linear; positive Werte beginnen langsamer, negative schneller. Globale Amp-ADSR und Filter bleiben zusätzlich aktiv.</p>
              <p>Fixed Hz folgt nicht der gespielten Note; globale Transposition, Fine und Pitch Bend wirken weiterhin. Routing, Waveform, Frequenzmodus und Operator-ADSR werden beim nächsten Anschlag übernommen. Randomize variiert alle drei Operatoren, ihre Hüllkurven und die sechs Routings mit moderaten Indizes. Neue FM-Patches starten mit wirksamen OP-3-Verbindungen; importierte Indexwerte bleiben erhalten. Laufende Ratio-/Hz-/Level-/Fine-/Feedback-/Index-Änderungen sind geglättet. Rechtsklick auf Operator-Waveform, Frequenzmodus oder Algorithmusauswahl: MIDI Learn. Der Algorithmus wird in sechs gleich großen MIDI-CC-Bereichen gewählt.</p>
              <p>Alte FM-Presets und Locks werden automatisch migriert. Feedback und Release können durch den neuen Signalweg anders klingen. FM benötigt AudioWorklet über HTTPS/localhost. Maximal 32 FM-Noten beziehungsweise insgesamt 128 Unison-Layer; bei acht Layern sind dies bis zu 16 Noten einschließlich Release-Phasen.</p>
            </section>
            <section>
              <h3>Filter & envelope</h3>
              <p><b>Base-Width:</b> 6-dB-Hochpass und Tiefpass vor dem Main Filter, für alle acht Engines. Base = untere Grenze, Width = Bandbreite in Oktaven. Base und Width auf Open: neutral, auch bei eingeschaltetem Filter.</p>
              <p><b>Main:</b> Classic behält die bisherige Abstimmung. Butterworth, Ladder, State Variable und Acid bieten neue Resonanzverläufe; Multimode ergänzt 36/48 dB und Morph LP ↔ BP ↔ HP. Ladder/Acid bieten unter Main Character optional 2×-Oversampling gegen Aliasing, mit zusätzlicher CPU-Last und 31 Samples Latenz; 1× bleibt Standard. Peak gain erlaubt Absenkung und Anhebung. Main Character enthält Keytrack, Resonance compensation, Mix und Drive Pre/Post.</p>
              <p><b>Comb:</b> Feedback oder Feedforward, ±-Polarität, Wet gain, Keytrack, Fine und Stereo spread. Feedback HP und Saturation bearbeiten nur den Feedback-Pfad. HD verwendet Lagrange-Interpolation; Legacy bewahrt alte Klänge. Wet gain verstärkt den gesamten Wet-Pfad, auch ohne Feedback; seine Umbenennung ändert keine gespeicherten Werte.</p>
              <p><b>ENV DEPTH:</b> ±6 Oktaven, separate Attack-/Decay-/Release-Kurven. Kurve 0 erhält den bisherigen Verlauf. Velocity → depth skaliert die Tiefe mit dem Anschlag. Keytrack 100 % verschiebt die Frequenz pro zwölf Halbtönen um eine Oktave, Referenz C4.</p>
              <p>Die normierte Filter-ADSR zeigt 0–100 %, ihre Kurven und proportionalen Zeitverhältnisse, unabhängig von Cutoff, Env depth und Velocity. Auch bei Tiefe 0 oder negativer Tiefe bleibt die Form sichtbar. Die vier ADSR-Regler stehen in einer Reihe. Die Response zeigt Base, Peak und Sustain für die ausgewählte Vorschau-Note und Velocity, einschließlich Base-Width und Filter-Mix. Bei Sättigung ist sie eine Kleinsignalantwort. Ohne laufende Matrix/LFOs. Neue Parameter unterstützen Locks und MIDI Learn; mit „Anschlag“ markierte Matrixziele gelten ab dem nächsten Anschlag.</p>
            </section>
            <section>
              <h3>Erweiterte Klangquellen</h3>
              <p>Character / Unison enthält die neuen Einstellungen im gemeinsamen Moduldesign. Subtractive: Hard Sync, zwei Pulsbreiten, Phase, Sub-Wellenform/Oktave und Noise Color. Wavetable: Bend/Fold/Sync/Mirror, Unison-Positionen, Morph Skew, Phase und Blur. Additive: acht Bänder für alle 32 Partials, Spectral Decay, Detune/Drift, Blur und Random Phase.</p>
              <p>Ring/AM: Ratio oder Fixed Hz, Modulatorphase, eigene Pitch- und Depth-ADSR, Sideband Tilt/LP und echter DC-Modulator-Bias. Granular: vier Fensterformen mit Attack/Release, Skalenquantisierung, Tempo Sync, Freeze und Stereo Motion/Drift. Freeze hält die aktuelle Cloud; Änderungen greifen bei neuen Grains innerhalb des 150-ms-Vorlaufs.</p>
              <p>Sampler: One-shot, Gate oder Loop; bis zu 32 gleiche Slices, Velocity → Start, Loop Crossfade und Ping-pong. Time Stretch trennt Dauer von Tonhöhe; Duration wirkt in diesem Modus, starke Dehnungen können körnig klingen. One-shot ignoriert das Loslassen und plant sein Ende aus Slice-Länge und Anschlagstonhöhe. Physical: Pick Hardness, Pickup, Anregungsdauer, Body-Frequenz/Q, Steifigkeit, kontinuierlicher Bogen und drei gekoppelte Saiten.</p>
              <p>Rechtsklick startet MIDI Learn. Neue Parameter sind in Presets, Projekten, Undo/Redo, Locks, Matrix und WAV integriert. Mit „Anschlag“ markierte Ziele greifen ab der nächsten Note. Alte Sounds behalten ihren Legacy-Pfad; neue Klangfunktionen benötigen AudioWorklet. Sieben zusätzliche Expansion-Sounds stehen im Soundbrowser.</p>
            </section>
            <section>
              <h3>Make it yours</h3>
              <p>
                Acht Engines: Subtractive, Wavetable, FM, Additive, Ring/AM,
                Granular, Sampler und Physical. Die Sound Library enthält zusätzlich acht neue Presets je Syntheseform außer Sampler, insgesamt 56 Sounds. Alle bisherigen Presets bleiben verfügbar.
              </p>
              <p>
                Granular und Sampler enthalten eine interne Textur. Eigene 32
                Wavetables, 32 Granular-Texturen und 64 Sampler-Sounds sind
                integriert. Eigene Samples über <b>Import sample</b> laden (max.
                15 MB / 60 s).
              </p>
              <p>
                Modulation: 24 Routen mit eigener Linear-/Exp-/Log-Kurve. Drei LFOs bieten Free Run, Note Retrigger, One Shot, Half Cycle und Sample &amp; Hold, Sync von 1/64 bis acht Takten einschließlich Triolen und punktierter Werte, Phase, Delay/Fade, Skew, Slew, Polarität und Pulsbreite. Amp-/Filter-Envelope, zwei Mod-ADSRs, Random, Aftertouch, Pitch Bend und vier Macros ergänzen die Quellen.
              </p>
              <p>
                Alle FX-Regler, LFO-Regler sowie Slot-Bypass und Variante stehen in Matrix, Locks und MIDI Learn bereit. „Anschlag“ bedeutet Note-On/Step; Zyklen zwischen Generatoren sind gesperrt. Neue Stimmen-Ziele greifen ab der nächsten Note. Die Knöpfe zeigen Grundwert, möglichen Modulationsbereich und einen Punkt für den wirksamen Wert.
              </p>
              <p>
                Vier serielle FX-Slots mit je fünf Varianten: zusätzliche Klangregler, dauerhaftes BPM-Sync für Delay sowie Vibrato/Tremolo, sichere kurze Überblendungen für Varianten und Struktur. Track-FX verwenden die zuletzt gehaltene Note, danach deren Release; Track-LFOs laufen während der Effekt-Tails weiter. Gemeinsame FX-Locks folgen der Ereignisreihenfolge. Master FX bleiben separat.
              </p>
              <p>
                Alte Sounds behalten ihre bisherigen FX-/LFO-Pfade. Alte eingefrorene Hold-LFOs sind als „Legacy Hold“ bezeichnet; eine Bearbeitung der erweiterten LFO-Funktionen aktiviert das neue Verhalten. Effektgrafiken zeigen wirksame Einstellungen als schematische Vorschau.
              </p>
              <p>
                Sounds über die Library speichern, Projekte inklusive Samples
                als JSON exportieren. Stereo-WAV über das Download-Symbol
                exportieren.
              </p>
            </section>
          </div>
          <div className="help-callout">
            <Headphones size={19} />
            <div>
              <strong>Start with a little volume.</strong>
              <p>
                Audio startet nach deiner ersten Interaktion. Drehe den
                Master-Pegel nach Bedarf auf. Für MIDI empfehlen wir Chrome oder
                Edge.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
const tapRef = { current: [] as number[] };
