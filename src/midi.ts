export type PortInfo = { id: string; name: string };
export class MidiController {
  private noteQueue: { channel: number; note: number; velocity: number; at: number; on: boolean }[] = [];
  private sounding = new Map<string, number>();
  private noteTimer: number | undefined;
  access: MIDIAccess | null = null;
  input = "all";
  output = "none";
  channel = 0;
  clockOut = false;
  onNote: (note: number, velocity: number, channel: number) => void = () => {};
  onOff: (note: number, channel: number) => void = () => {};
  onCC: (cc: number, value: number, channel: number) => void = () => {};
  onBend: (value: number, channel: number) => void = () => {};
  onClock: (status: number) => void = () => {};
  onPorts: () => void = () => {};
  get supported() {
    return "requestMIDIAccess" in navigator;
  }
  get inputs(): PortInfo[] {
    return Array.from(this.access?.inputs.values() || []).map((p) => ({
      id: p.id,
      name: p.name || "MIDI input",
    }));
  }
  get outputs(): PortInfo[] {
    return Array.from(this.access?.outputs.values() || []).map((p) => ({
      id: p.id,
      name: p.name || "MIDI output",
    }));
  }
  async connect() {
    if (!navigator.requestMIDIAccess)
      throw new Error(
        "Web MIDI ist hier nicht verfügbar. Bitte Chrome oder Edge über HTTPS verwenden.",
      );
    const access = await navigator.requestMIDIAccess({ sysex: false });
    this.access = access;
    access.onstatechange = () => {
      this.attach();
      this.onPorts();
    };
    this.attach();
    this.onPorts();
  }
  private attach() {
    for (const port of this.access?.inputs.values() || [])
      port.onmidimessage = ({ data }) => {
        if (!data) return;
        if (this.input !== "all" && this.input !== port.id) return;
        const [status, a, b] = data;
        if (status >= 0xf8) {
          this.onClock(status);
          return;
        }
        const channel = status & 15,
          cmd = status & 0xf0;
        if (this.channel && channel !== this.channel - 1) return;
        if (cmd === 0x90 && b > 0) this.onNote(a, b / 127, channel);
        if (cmd === 0x80 || (cmd === 0x90 && b === 0)) this.onOff(a, channel);
        if (cmd === 0xb0) this.onCC(a, b / 127, channel);
        if (cmd === 0xe0) this.onBend((((b << 7) | a) - 8192) / 8192, channel);
      };
  }
  send(data: number[], at?: number) {
    const port = this.access?.outputs.get(this.output);
    if (port?.state === "connected") port.send?.(data, at);
  }
  scheduleNote(channel: number, note: number, velocity: number, at: number, duration: number) {
    if (!this.access?.outputs.has(this.output)) return;
    this.noteQueue.push(
      { channel, note, velocity, at, on: true },
      { channel, note, velocity: 0, at: at + duration * 1000, on: false },
    );
    this.noteQueue.sort((a, b) => a.at - b.at || Number(a.on) - Number(b.on));
    if (this.noteTimer === undefined) this.noteTimer = window.setInterval(() => this.flushNotes(), 10);
    this.flushNotes();
  }
  private flushNotes() {
    const until = performance.now() + 20;
    while (this.noteQueue.length && this.noteQueue[0].at <= until) {
      const n = this.noteQueue.shift()!, key = `${n.channel}:${n.note}`;
      const held = this.sounding.get(key) ?? 0;
      if (n.on) {
        this.sounding.set(key, held + 1);
        this.send([0x90 + n.channel, n.note, Math.round(n.velocity * 127)], n.at);
      } else if (held <= 1) {
        this.sounding.delete(key);
        this.send([0x80 + n.channel, n.note, 0], n.at);
      } else this.sounding.set(key, held - 1);
    }
    if (!this.noteQueue.length && this.noteTimer !== undefined) {
      window.clearInterval(this.noteTimer);
      this.noteTimer = undefined;
    }
  }
  panic() {
    this.noteQueue = [];
    this.sounding.clear();
    if (this.noteTimer !== undefined) window.clearInterval(this.noteTimer);
    this.noteTimer = undefined;
    const port = this.access?.outputs.get(this.output) as
      (MIDIOutput & { clear?: () => void }) | undefined;
    port?.clear?.();
    for (let ch = 0; ch < 16; ch++) {
      this.send([0xb0 + ch, 123, 0]);
      this.send([0xb0 + ch, 120, 0]);
    }
  }
  dispose() {
    this.panic();
    for (const port of this.access?.inputs.values() || [])
      port.onmidimessage = null;
    if (this.access) this.access.onstatechange = null;
  }
}
