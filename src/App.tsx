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
  Maximize2,
  Pause,
  Play,
  PlugZap,
  Power,
  Radio,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Square,
  Undo2,
  Upload,
  Volume2,
  Waves,
  X,
} from "lucide-react";
import {
  IconButton,
  Keyboard,
  LevelMeter,
  Modal,
  Scope,
  Select,
  Waveform,
} from "./components";
import Instrument from "./Instrument";
import Sequencer from "./Sequencer";
import { SynthEngine, Transport, renderProject } from "./audio";
import { MidiController } from "./midi";
import {
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
  sanitizePatch,
  sanitizeProject,
} from "./model";
import type { Param, Patch, Pattern, Project, Step, Track } from "./model";
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
type Binding = { cc: number; track: number; param: Param };
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
    [selectedStep, setSelectedStep] = useState(0),
    [page, setPage] = useState(0),
    [modal, setModal] = useState<ModalName>(null);
  const [playing, setPlaying] = useState(false),
    [audioReady, setAudioReady] = useState(false),
    [audioBusy, setAudioBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [playheads, setPlayheads] = useState([-1, -1, -1, -1]),
    [lockMode, setLockMode] = useState(false),
    [fill, setFill] = useState(false);
  const [octave, setOctave] = useState(4),
    [activeNotes, setActiveNotes] = useState(new Set<number>()),
    [keyboardVisible, setKeyboardVisible] = useState(true),
    [toast, setToast] = useState(""),
    [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved"),
    [loaded, setLoaded] = useState(false);
  const [userPresets, setUserPresets] = useState<Patch[]>([]),
    [search, setSearch] = useState(""),
    [engineFilter, setEngineFilter] = useState("all"),
    [clipboard, setClipboard] = useState<Pattern[] | null>(null),
    [undoAvailable, setUndoAvailable] = useState(false);
  const [midiConnected, setMidiConnected] = useState(false),
    [midiError, setMidiError] = useState(""),
    [midiVersion, setMidiVersion] = useState(0),
    [externalClock, setExternalClock] = useState(false),
    [midiLearn, setMidiLearn] = useState<{
      track: number;
      param: Param;
    } | null>(null),
    [bindings, setBindings] = useState<Binding[]>([]);
  const [exportBars, setExportBars] = useState(4),
    [rendering, setRendering] = useState(false),
    [audioInfo, setAudioInfo] = useState({ sampleRate: 0, latency: 0 });
  const [presetName, setPresetName] = useState("");
  const pendingNotes = useRef(new Map<string, symbol>());
  const playRequest = useRef(0);
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
    undoRef.current.push(clone(projectRef.current));
    if (undoRef.current.length > 20) undoRef.current.shift();
    setUndoAvailable(true);
  }, []);
  const updateProject = useCallback(
    (fn: (p: Project) => Project) => setProject((p) => fn(p)),
    [],
  );
  const changePatch = useCallback(
    (partial: Partial<Patch>, which = trackRef.current) => {
      updateProject((p) => ({
        ...p,
        tracks: p.tracks.map((t, i) =>
          i === which ? { ...t, patch: { ...t.patch, ...partial } } : t,
        ),
      }));
    },
    [updateProject],
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
    if (lockMode) {
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
  const stop = useCallback(() => {
    playRequest.current++;
    midiRef.current.panic();
    transportRef.current?.stop();
    engineRef.current?.panic();
    engineRef.current?.restore(projectRef.current);
    setPlaying(false);
    setPlayheads([-1, -1, -1, -1]);
    setActiveNotes(new Set());
    keyboardHeld.current.clear();
    midiHeld.current.clear();
    deferredNotes.current.clear();
    liveVoices.current.clear();
    pendingNotes.current.clear();
    sustainRef.current.clear();
  }, []);
  const ensureAudio = useCallback(async () => {
    if (!engineRef.current || engineRef.current.context.state === "closed") {
      setAudioBusy(true);
      try {
        const context = new AudioContext({ latencyHint: "interactive" }),
          engine = new SynthEngine(context),
          transport = new Transport(engine, () => projectRef.current);
        engineRef.current = engine;
        transportRef.current = transport;
        engine.update(projectRef.current);
        await engine.prepare(projectRef.current);
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
          midi.send([0x90 + track, note, Math.round(velocity * 127)], at);
          midi.send([0x80 + track, note, 0], at + duration * 1000);
        };
        context.onstatechange = () =>
          setAudioReady(context.state === "running");
        setAudioInfo({
          sampleRate: context.sampleRate,
          latency: context.baseLatency,
        });
      } catch (error) {
        const context = engineRef.current?.context;
        if (context instanceof AudioContext) void context.close();
        engineRef.current = null;
        transportRef.current = null;
        notify(`Audio: ${errorMessage(error)}`);
        throw error;
      } finally {
        setAudioBusy(false);
      }
    }
    const engine = engineRef.current!;
    if (
      engine.context instanceof AudioContext &&
      engine.context.state !== "running"
    )
      await engine.context.resume();
    setAudioReady(true);
    return engine;
  }, [notify]);
  const play = useCallback(async () => {
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
  }, [ensureAudio, fill, notify]);
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
      const key = `${which}:${note}`,
        token = Symbol();
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
          const head = headsRef.current[which],
            index = head < 0 ? selectedStep : head;
          changeStep(which, index, { on: true, note, velocity });
          if (head < 0)
            setSelectedStep((index + 1) % t.patterns[p.activePattern].length);
        }
      } catch {
        /* Error is already shown. */
      }
    },
    [ensureAudio, changeStep, selectedStep],
  );
  const noteOff = useCallback(
    (
      note: number,
      which = liveVoices.current.get(note) ?? trackRef.current,
      sendMidi = true,
    ) => {
      pendingNotes.current.delete(`${which}:${note}`);
      engineRef.current?.noteOff(which, note);
      if (sendMidi) midiRef.current.send([0x80 + which, note, 0]);
      setActiveNotes((prev) => {
        const s = new Set(prev);
        s.delete(note);
        return s;
      });
      liveVoices.current.delete(note);
    },
    [],
  );
  const noteOnRef = useRef(noteOn);
  noteOnRef.current = noteOn;
  const undo = useCallback(() => {
    const p = undoRef.current.pop();
    if (p) {
      stop();
      setProject(p);
      setUndoAvailable(undoRef.current.length > 0);
      notify("Letzte Aktion rückgängig gemacht.");
    }
  }, [stop, notify]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      readStored<unknown>("project"),
      readStored<Patch[]>("presets"),
      readStored<Binding[]>("midiBindings"),
    ])
      .then(([p, presets, mapping]) => {
        if (cancelled) return;
        if (p) setProject(sanitizeProject(p));
        if (Array.isArray(presets)) setUserPresets(presets.map(sanitizePatch));
        if (Array.isArray(mapping))
          setBindings(
            mapping.filter(
              (m) =>
                m &&
                Object.hasOwn(PARAMS, m.param) &&
                m.cc >= 0 &&
                m.cc <= 127 &&
                m.track >= 0 &&
                m.track < 4,
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
        const range = PARAMS[binding.param];
        changePatch(
          { [binding.param]: range[0] + value * (range[1] - range[0]) },
          binding.track,
        );
        return;
      }
      if (cc === 1 && engineRef.current) engineRef.current.modwheel = value;
      if (cc === 74) changePatch({ cutoff: 30 * Math.pow(600, value) });
      if (cc === 71) changePatch({ resonance: value * 20 });
      if (cc === 7) changePatch({ level: value });
      if (cc === 123 || cc === 120) {
        engineRef.current?.panic();
        setActiveNotes(new Set());
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
    midi.onBend = (value) =>
      engineRef.current?.pitchBend(trackRef.current, value);
    midi.onClock = (status) => {
      if (!externalRef.current) return;
      if (status === 0xfa || status === 0xfb) {
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
  }, [changePatch, noteOff, notify, stop]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        el.closest(
          'input,select,textarea,[role="slider"],[contenteditable="true"]',
        ) ||
        modalRef.current ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      const key = e.key.toLowerCase();
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
        setOctave((n) => Math.min(6, n + 1));
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
      const ctx = engineRef.current?.context;
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
      fmRatio: [0.5, 1, 1.5, 2, 3, 4, 7][Math.floor(Math.random() * 7)],
      fmIndex: Math.random() * 8,
      brightness: Math.random(),
      harmonics: Math.ceil(Math.random() * 24),
      decay: 0.08 + Math.random() * 0.9,
      delay: Math.random() * 0.35,
      reverb: Math.random() * 0.4,
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
      if (raw.version === 1 && raw.tracks) {
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
  const randomPattern = () => {
    checkpoint();
    const scale = [0, 3, 5, 7, 10],
      root = track === 1 ? 36 : track === 2 ? 72 : 48;
    changePattern(track, {
      steps: Array.from({ length: 64 }, (_, i) => ({
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
      })),
    });
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
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("synth");
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
            <label>
              BPM
              <input
                aria-label="Tempo BPM"
                type="number"
                min="40"
                max="240"
                value={project.tempo}
                onChange={(e) =>
                  updateProject((p) => ({
                    ...p,
                    tempo: clamp(+e.target.value || 40, 40, 240),
                  }))
                }
              />
            </label>
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
                    ? "Live Rec: Gespielte Noten werden in Steps aufgenommen."
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
            <span>
              {String(Math.floor(Math.max(0, playheads[0]) / 16) + 1).padStart(
                2,
                "0",
              )}
            </span>
            <b>:</b>
            <span>
              {String(Math.max(0, playheads[0]) + 1).padStart(2, "0")}
            </span>
            <small>BAR / STEP</small>
          </div>
        </div>
        <div className="topbar-actions">
          <IconButton
            label="MIDI-Einstellungen"
            active={midiConnected}
            onClick={() => setModal("midi")}
          >
            <PlugZap size={16} />
          </IconButton>
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
      </header>
      <div className="workspace-bar">
        <div>
          <span className="workspace-label">
            <AudioLines size={12} /> STUDIO
          </span>
          <span className="workspace-separator">/</span>
          <span className="workspace-subtitle">
            An idea. A little voltage. A whole new sound.
          </span>
        </div>
        <div>
          <span className="local-status">
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
            label="Studio-Einstellungen"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={14} />
          </IconButton>
        </div>
      </div>
      <div className="studio-body">
        <aside className="rack-sidebar">
          <div className="rack-heading">
            <span className="eyebrow">INSTRUMENT RACK</span>
            <span>04</span>
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
                  <span className="rack-number">0{i + 1}</span>
                  <span>
                    {ENGINES.find((e) => e.id === t.patch.engine)?.short}
                  </span>
                  <i
                    className={
                      playing &&
                      t.patterns[project.activePattern].steps[playheads[i]]
                        ?.on &&
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
                    {t.patch.voiceMode.toUpperCase()} <b>·</b>{" "}
                    {t.mute ? "MUTED" : t.solo ? "SOLO" : "ACTIVE"}
                  </span>
                  <ArrowRight size={12} />
                </div>
              </button>
            ))}
          </div>
          <button
            className="library-button"
            onClick={() => setModal("library")}
          >
            <FolderOpen size={15} />
            <span>
              Sound library
              <small>
                {PRESETS.length + userPresets.length} patches to explore
              </small>
            </span>
            <ArrowRight size={13} />
          </button>
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
            <div>
              <span className="eyebrow">YOUR SONIC PLAYGROUND</span>
              <h1>
                Make something <span>move.</span>
                <i />
              </h1>
            </div>
            <div className="main-heading-actions">
              <IconButton
                label="Letzte größere Aktion rückgängig"
                disabled={!undoAvailable}
                onClick={undo}
              >
                <Undo2 size={15} />
              </IconButton>
              <button
                className="text-button"
                onClick={() => setModal("library")}
              >
                <FolderOpen size={13} /> Browse sounds <ArrowRight size={12} />
              </button>
            </div>
          </div>
          <Instrument
            patch={patch}
            color={current.color}
            track={track}
            tempo={project.tempo}
            tab={tab}
            setTab={setTab}
            onPatch={(partial) => {
              if (partial.voiceMode || partial.engine)
                engineRef.current?.panic(track);
              changePatch(partial);
            }}
            onParam={setParam}
            locks={lockMode ? currentStep.locks : {}}
            onLearn={(param) => {
              setMidiLearn({ track, param });
              notify(`MIDI Learn: Bewege einen Hardware-Regler für ${param}.`);
              if (!midiConnected) setModal("midi");
            }}
            onLibrary={() => setModal("library")}
            onSave={openSavePreset}
            onRandom={randomizePatch}
            onPreset={cyclePreset}
            onSample={(file) => void uploadSample(file)}
          />
          <div className="between-panels">
            <div className="swing-control">
              <Waves size={12} />
              <label>
                SWING
                <input
                  aria-label="Swing"
                  type="range"
                  min="0"
                  max=".6"
                  step=".01"
                  value={project.swing}
                  onChange={(e) =>
                    updateProject((p) => ({ ...p, swing: +e.target.value }))
                  }
                />
                <output>{Math.round(project.swing * 100)}%</output>
              </label>
            </div>
            <div className="between-panel-actions">
              <button onClick={duplicatePattern}>
                <Copy size={12} /> Duplicate pattern
              </button>
              <button
                onClick={() => setKeyboardVisible((v) => !v)}
                className={keyboardVisible ? "active" : ""}
              >
                <KeyboardIcon size={14} /> Keyboard
              </button>
              <IconButton
                label="Sequencer vergrößern"
                onClick={() =>
                  document
                    .querySelector(".sequencer")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                <Maximize2 size={13} />
              </IconButton>
            </div>
          </div>
          <Sequencer
            project={project}
            track={track}
            selectTrack={selectTrack}
            selectedStep={selectedStep}
            setStep={setSelectedStep}
            page={page}
            setPage={setPage}
            playheads={playheads}
            playing={playing}
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
                  clone(t.patterns[project.activePattern]),
                ),
              );
              notify("Pattern aller vier Tracks kopiert.");
            }}
            onPaste={() => {
              if (!clipboard) return;
              checkpoint();
              updateProject((p) => ({
                ...p,
                tracks: p.tracks.map((t, i) => ({
                  ...t,
                  patterns: t.patterns.map((pat, j) =>
                    j === p.activePattern ? clone(clipboard[i]) : pat,
                  ),
                })),
              }));
              notify("Pattern eingefügt.");
            }}
            onClear={() => {
              checkpoint();
              changePattern(track, {
                steps: Array.from({ length: 64 }, makeStep),
              });
              notify(
                `Pattern von Track ${track + 1} geleert. Undo ist verfügbar.`,
              );
            }}
            onRandom={randomPattern}
            hasClipboard={!!clipboard}
          />
          {keyboardVisible && (
            <Keyboard
              active={activeNotes}
              onDown={(note) => void noteOn(note)}
              onUp={noteOff}
              octave={octave}
              setOctave={setOctave}
            />
          )}
          <footer className="studio-footer">
            <span className="footer-brand">
              PHASE <span>01</span>
            </span>
            <span>BUILT FOR THE MOMENTS BETWEEN THE NOTES.</span>
            <button onClick={() => setModal("help")}>
              SHORTCUTS <KeyboardIcon size={12} />
            </button>
          </footer>
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
            Keyboard- und Sequencer-Noten: Track 1–4 auf Kanal 1–4. Pitch Bend:
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
                  → TRACK 0{b.track + 1} / {b.param}
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
              <span>Vier Tracks, ein leeres Blatt</span>
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
              <small>Zwei Oktaven, Touch und Computer-Tastatur</small>
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
              <p>Rechtsklick auf Regler: MIDI Learn</p>
            </section>
            <section>
              <h3>Sequence & lock</h3>
              <p>Step klicken: Trig aktivieren/deaktivieren.</p>
              <p>
                <kbd>Shift</kbd> + Klick oder Rechtsklick: Step bearbeiten.
              </p>
              <p>
                <b>P-LOCK aktivieren</b> und Instrument-Regler bewegen: Der Wert
                gilt nur für diesen Step.
              </p>
              <p>
                Wahrscheinlichkeit, Gate, Microtiming, Retrig und Bedingungen im
                Trig-Editor bearbeiten.
              </p>
              <p>
                Jeder Track hat eigene Länge (1–64), Geschwindigkeit und
                Richtung. Acht Pattern-Speicher enthalten jeweils alle vier
                Tracks.
              </p>
              <p>
                <b>Live Rec:</b> Keyboard-/MIDI-Noten werden am aktuellen Step
                eingetragen. Ohne Wiedergabe rückt der Editor nach jeder Note
                weiter.
              </p>
            </section>
            <section>
              <h3>Make it yours</h3>
              <p>
                Acht Engines: Subtractive, Wavetable, FM, Additive, Ring/AM,
                Granular, Sampler und Physical.
              </p>
              <p>
                Granular und Sampler enthalten eine interne Textur. Eigene
                Samples über <b>Load sample</b> laden (max. 15 MB / 60 s).
              </p>
              <p>
                Modulation: Zwei LFOs und bis zu acht Routen. Effekte:
                Saturation, Chorus, Tape Delay und Space Reverb.
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
