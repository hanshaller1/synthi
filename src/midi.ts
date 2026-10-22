export type PortInfo = { id: string; name: string };
export class MidiController {
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
  panic() {
    const port = this.access?.outputs.get(this.output) as
      (MIDIOutput & { clear?: () => void }) | undefined;
    port?.clear?.();
    for (let ch = 0; ch < 16; ch++) this.send([0xb0 + ch, 123, 0]);
  }
  dispose() {
    for (const port of this.access?.inputs.values() || [])
      port.onmidimessage = null;
    if (this.access) this.access.onstatechange = null;
  }
}
