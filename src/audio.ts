// 音樂與音效：全部用 Web Audio 即時合成，不用載入音檔。
// 每個主題有自己的曲風、節奏和樂器，音色都偏溫暖、中低音，不用高頻的叮叮聲。
//   浮島：3/4 拍的尼龍吉他分解和弦，像在雲上慢慢晃
//   台灣街景：Lo-fi，電鋼琴和弦 + 輕刷鼓 + 低音，加上像竹笛的旋律
//   海底：緩慢起伏的和聲 + 溫柔的撥弦旋律帶回聲，背景有海浪
//   太空：低音持續音 + 柔和的脈衝琶音帶回聲，慢慢變化

type Arrangement = 'floating' | 'taiwan' | 'ocean' | 'space';

interface MusicStyle {
  arrangement: Arrangement;
  bpm: number;
  /** 一小節幾個八分音符 */
  stepsPerBar: number;
  /** 主音（MIDI 音高，約在 C3 附近） */
  root: number;
  /** 旋律／提示音用的音階（相對主音的半音數） */
  scale: number[];
  /** 和弦進行（相對主音的半音數） */
  chords: number[][];
  /** 每個和弦幾小節 */
  bars: number;
}

const STYLES: Record<string, MusicStyle> = {
  floating: {
    arrangement: 'floating',
    bpm: 84,
    stepsPerBar: 6,
    root: 53, // F3
    scale: [0, 2, 4, 7, 9],
    chords: [
      [0, 4, 7, 11, 12],
      [-3, 0, 4, 7, 9],
      [-7, -3, 0, 4, 5],
      [-5, -1, 2, 7, 7],
    ],
    bars: 2,
  },
  taiwan: {
    arrangement: 'taiwan',
    bpm: 76,
    stepsPerBar: 8,
    root: 50, // D3
    scale: [0, 2, 4, 7, 9],
    chords: [
      [0, 4, 9, 14],
      [-3, 0, 4, 7],
      [-7, -3, 0, 4],
      [-5, 0, 2, 5],
    ],
    bars: 1,
  },
  ocean: {
    arrangement: 'ocean',
    bpm: 54,
    stepsPerBar: 8,
    root: 51, // E♭3
    scale: [0, 2, 4, 7, 9],
    chords: [
      [0, 4, 7, 11],
      [-3, 0, 3, 7],
      [-7, -3, 0, 4],
      [-5, -2, 2, 5],
    ],
    bars: 4,
  },
  space: {
    arrangement: 'space',
    bpm: 64,
    stepsPerBar: 8,
    root: 45, // A2
    scale: [0, 3, 5, 7, 10],
    chords: [
      [0, 3, 7, 10, 14],
      [-4, 0, 3, 7, 12],
      [3, 7, 10, 14, 15],
      [-2, 2, 5, 9, 14],
    ],
    bars: 4,
  },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

type Keep = <T extends AudioScheduledSourceNode>(n: T) => T;

class Song {
  readonly out: GainNode;
  private timer = 0;
  private next = 0;
  private step = 0;
  private melodyIdx = 5;
  private melodyBusyUntil = 0;
  private nodes: AudioScheduledSourceNode[] = [];
  private echo: GainNode | null = null;
  private keepFn: Keep = (n) => {
    this.nodes.push(n);
    n.onended = () => {
      const i = this.nodes.indexOf(n);
      if (i >= 0) this.nodes.splice(i, 1);
    };
    return n;
  };

  constructor(
    private a: AudioEngine,
    readonly style: MusicStyle,
  ) {
    const ctx = a.ctx!;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(a.musicBus!);
    this.out.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
    this.next = ctx.currentTime + 0.3;
    this.setup();
    this.timer = window.setInterval(() => this.schedule(), 60);
    this.schedule();
  }

  stop() {
    const ctx = this.a.ctx!;
    clearInterval(this.timer);
    this.out.gain.cancelScheduledValues(ctx.currentTime);
    this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
    const nodes = [...this.nodes];
    setTimeout(() => {
      nodes.forEach((n) => {
        try {
          n.stop();
        } catch {
          /* 已經停了 */
        }
      });
      this.out.disconnect();
    }, 3000);
  }

  /** 各主題一直存在的背景：環境聲、持續音、回聲 */
  private setup() {
    const ctx = this.a.ctx!;
    const s = this.style;
    if (s.arrangement === 'floating') this.a.ambience('wind', this.out, this.keepFn);
    if (s.arrangement === 'ocean') this.a.ambience('waves', this.out, this.keepFn);
    if (s.arrangement === 'space') {
      // 低音持續音：正弦 + 很暗的鋸齒波
      const g = ctx.createGain();
      g.gain.value = 0.05;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      lp.connect(g).connect(this.out);
      for (const [type, m, det] of [
        ['sine', s.root - 12, 0],
        ['sawtooth', s.root - 12, 5],
        ['sawtooth', s.root - 5, -5],
      ] as [OscillatorType, number, number][]) {
        const o = this.keepFn(ctx.createOscillator());
        o.type = type;
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(lp);
        o.start();
      }
    }
    if (s.arrangement === 'space' || s.arrangement === 'ocean') {
      // 回聲（附點八分音符）：太空的琶音、海底的撥弦，像在水裡迴盪
      const delay = ctx.createDelay(2);
      delay.delayTime.value = (60 / s.bpm) * 0.75;
      const fb = ctx.createGain();
      fb.gain.value = s.arrangement === 'ocean' ? 0.42 : 0.38;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = s.arrangement === 'ocean' ? 700 : 900;
      this.echo = ctx.createGain();
      this.echo.connect(delay);
      delay.connect(tone).connect(fb).connect(delay);
      tone.connect(this.out);
    }
  }

  private schedule() {
    const ctx = this.a.ctx!;
    if (ctx.state !== 'running') return;
    // 分頁切走回來時不要一口氣補一堆音
    if (this.next < ctx.currentTime - 0.2) this.next = ctx.currentTime + 0.05;
    const eighth = 60 / this.style.bpm / 2;
    while (this.next < ctx.currentTime + 0.4) {
      this.playStep(this.step, this.next, eighth);
      this.step++;
      this.next += eighth;
    }
  }

  private playStep(step: number, t: number, e: number) {
    const s = this.style;
    const barLen = s.stepsPerBar;
    const bar = Math.floor(step / barLen);
    const inBar = step % barLen;
    const chord = s.chords[Math.floor(bar / s.bars) % s.chords.length];
    const chordStart = bar % s.bars === 0 && inBar === 0;
    const chordDur = s.bars * barLen * e;
    const n = (semi: number) => mtof(s.root + semi);
    const a = this.a;
    const out = this.out;
    const k = this.keepFn;

    switch (s.arrangement) {
      case 'floating': {
        // 3/4 拍分解和弦：低音 → 五度 → 三度 → 五度 → 八度 → 五度
        if (chordStart) a.pad(chord.slice(0, 4).map(n), t, chordDur, 'triangle', 900, 0.035, out, k);
        if (inBar === 0) a.bass(n(chord[0] - 12), t, barLen * e, 0.12, out, k);
        const pattern = [0, 2, 1, 2, 3, 2];
        const tone = chord[pattern[inBar]];
        a.nylon(n(tone), t + rnd(-0.01, 0.01), inBar === 0 ? 0.8 : 0.55, out, k);
        // 偶爾在中音區加一句簡單旋律
        if (bar % 4 >= 2 && (inBar === 0 || inBar === 3) && Math.random() < 0.55) {
          a.nylon(n(this.melody(12, 2)), t + 0.02, 0.7, out, k);
        }
        break;
      }
      case 'taiwan': {
        // Lo-fi：後半拍稍微晃（swing）
        const tt = inBar % 2 === 1 ? t + e * 0.2 : t;
        if (inBar === 0 || inBar === 5) a.kick(tt, inBar === 0 ? 1 : 0.7, out, k);
        if (inBar === 2 || inBar === 6) a.brush(tt, 1, out, k);
        if (inBar === 4 && Math.random() < 0.3) a.brush(tt, 0.4, out, k);
        if (inBar === 0) a.epiano(chord.map(n), tt, e * 3, 0.9, out, k);
        if (inBar === 3) a.epiano(chord.map(n), tt, e * 4.5, 0.6, out, k);
        if (inBar === 0) a.bass(n(chord[0] - 12), tt, e * 2.5, 0.16, out, k);
        if (inBar === 3) a.bass(n(chord[0] - 12 + 7), tt, e * 1.5, 0.12, out, k);
        if (inBar === 4) a.bass(n(chord[0] - 12), tt, e * 3, 0.14, out, k);
        // 竹笛旋律：兩小節一句，再休息兩小節
        if (bar % 4 < 2 && t >= this.melodyBusyUntil && Math.random() < 0.5) {
          const len = [1, 2, 2, 3, 4][Math.floor(Math.random() * 5)] * e;
          a.flute(n(this.melody(12, 2)), tt, len, 0.8, out, k);
          this.melodyBusyUntil = t + len - 0.01;
        }
        break;
      }
      case 'ocean': {
        // 緩慢起伏的和聲 + 溫柔的撥弦旋律，帶回聲，像在水裡迴盪
        if (chordStart) {
          a.pad(chord.map(n), t, chordDur, 'sawtooth', 520, 0.025, out, k, true);
          a.bass(n(chord[0] - 12), t, chordDur, 0.13, out, k);
        }
        // 兩小節一句，再休息一小節；拍點上才彈，音少、慢
        const phrase = bar % 3;
        if (phrase < 2 && inBar % 2 === 0 && t >= this.melodyBusyUntil && Math.random() < (inBar === 0 ? 0.9 : 0.45)) {
          const echo = this.echo ?? out;
          a.harp(n(this.melody(12, 2)), t + rnd(0, 0.02), inBar === 0 ? 0.9 : 0.7, out, k, echo);
          this.melodyBusyUntil = t + e * (Math.random() < 0.4 ? 3.5 : 1.5);
        }
        if (phrase === 2 && inBar === 0) a.harp(n(chord[1] + 12), t, 0.5, out, k, this.echo ?? out);
        break;
      }
      case 'space': {
        // 柔和的脈衝琶音，上上下下，濾波器慢慢開合
        if (chordStart) a.pad(chord.map((c) => n(c + 12)), t, chordDur, 'sawtooth', 600, 0.02, out, k);
        const up = [0, 1, 2, 3, 4, 3, 2, 1];
        const tone = chord[up[inBar]];
        const cutoff = 500 + 400 * (1 + Math.sin((step / 64) * Math.PI * 2));
        a.pulse(n(tone + 12), t, inBar === 0 ? 0.8 : 0.55, cutoff, this.echo ?? out, k, out);
        break;
      }
    }
  }

  /** 旋律：在音階上小步移動 */
  private melody(base: number, octaves: number): number {
    const sc = this.style.scale;
    const len = sc.length;
    const move = Math.random() < 0.8 ? Math.round(rnd(-2, 2)) : Math.round(rnd(-4, 4));
    this.melodyIdx = Math.max(0, Math.min(len * octaves - 1, this.melodyIdx + move));
    return base + sc[this.melodyIdx % len] + 12 * Math.floor(this.melodyIdx / len);
  }
}

class AudioEngine {
  ctx: AudioContext | null = null;
  musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private reverbIn: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private song: Song | null = null;
  private wantTheme: string | null = null;
  private musicOn = true;
  private sfxOn = true;

  /** 第一次觸控／點擊時才能啟動音訊（瀏覽器規定） */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 3;
      comp.connect(ctx.destination);
      // 整體再收掉一點高頻，聽起來更柔
      const soft = ctx.createBiquadFilter();
      soft.type = 'lowpass';
      soft.frequency.value = 5000;
      soft.connect(comp);
      const master = ctx.createGain();
      master.gain.value = 2.2;
      master.connect(soft);

      // 殘響：用衰減的雜訊做脈衝響應（偏暗）
      const conv = ctx.createConvolver();
      conv.buffer = this.impulse(3);
      const dark = ctx.createBiquadFilter();
      dark.type = 'lowpass';
      dark.frequency.value = 2500;
      this.reverbIn = ctx.createGain();
      this.reverbIn.connect(conv).connect(dark).connect(master);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.55 : 0;
      this.musicBus.connect(master);
      const musicSend = ctx.createGain();
      musicSend.gain.value = 0.45;
      this.musicBus.connect(musicSend).connect(this.reverbIn);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.sfxOn ? 1.1 : 0;
      this.sfxBus.connect(master);
      const sfxSend = ctx.createGain();
      sfxSend.gain.value = 0.15;
      this.sfxBus.connect(sfxSend).connect(this.reverbIn);

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) void this.ctx?.suspend();
        else void this.ctx?.resume();
      });
    }
    if (this.ctx.state !== 'running' && !document.hidden) void this.ctx.resume();
    if (this.wantTheme && !this.song && this.musicOn) this.startSong(this.wantTheme);
  }

  setEnabled(music: boolean, sfx: boolean) {
    this.musicOn = music;
    this.sfxOn = sfx;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.musicBus!.gain.setTargetAtTime(music ? 0.55 : 0, now, 0.3);
    this.sfxBus!.gain.setTargetAtTime(sfx ? 1.1 : 0, now, 0.05);
    if (music && this.wantTheme && !this.song) this.startSong(this.wantTheme);
    if (!music && this.song) {
      this.song.stop();
      this.song = null;
    }
  }

  /** 切換背景音樂（null = 停止） */
  music(theme: string | null) {
    if (theme === this.wantTheme) return;
    this.wantTheme = theme;
    if (this.song) {
      this.song.stop();
      this.song = null;
    }
    if (theme && this.ctx && this.musicOn) this.startSong(theme);
  }

  private startSong(theme: string) {
    this.song = new Song(this, STYLES[theme] ?? STYLES.floating);
  }

  noise(): AudioBuffer {
    if (!this.noiseBuf) {
      const ctx = this.ctx!;
      const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = b;
    }
    return this.noiseBuf;
  }

  private impulse(sec: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return b;
  }

  // ── 樂器（音色都偏暖，高頻用低通濾波器收掉） ──

  private osc(type: OscillatorType, f: number, keep: Keep): OscillatorNode {
    const o = keep(this.ctx!.createOscillator());
    o.type = type;
    o.frequency.value = f;
    return o;
  }

  private lowpass(freq: number, q = 0.5): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  /** 尼龍弦吉他：撥弦，亮度很快收掉 */
  nylon(f: number, t: number, vel: number, out: AudioNode, keep: Keep = (n) => n) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const lp = this.lowpass(Math.min(2200, f * 6), 0.7);
    lp.frequency.setValueAtTime(Math.min(2200, f * 6), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.8), t + 0.5);
    lp.connect(g).connect(out);
    const a = this.osc('triangle', f, keep);
    const b = this.osc('sawtooth', f * 1.002, keep);
    const bg = ctx.createGain();
    bg.gain.value = 0.25;
    a.connect(lp);
    b.connect(bg).connect(lp);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.1 * vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.6);
    for (const o of [a, b]) {
      o.start(t);
      o.stop(t + 1.7);
    }
  }

  /** 電鋼琴：柔和的和弦，輕微顫音 */
  epiano(fs: number[], t: number, dur: number, vel: number, out: AudioNode, keep: Keep) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const lp = this.lowpass(1400);
    const trem = ctx.createGain();
    trem.gain.value = 1;
    const lfo = this.osc('sine', 4.5, keep);
    const depth = ctx.createGain();
    depth.gain.value = 0.12;
    lfo.connect(depth).connect(trem.gain);
    lp.connect(trem).connect(g).connect(out);
    const level = (0.07 * vel) / Math.sqrt(fs.length);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.012);
    g.gain.exponentialRampToValueAtTime(level * 0.45, t + 0.8);
    g.gain.setValueAtTime(level * 0.45, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur + 0.5);
    const end = t + dur + 0.6;
    lfo.start(t);
    lfo.stop(end);
    for (const f of fs) {
      const o = this.osc('sine', f, keep);
      const h = this.osc('sine', f * 2, keep);
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.18, t);
      hg.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
      o.connect(lp);
      h.connect(hg).connect(lp);
      for (const x of [o, h]) {
        x.start(t);
        x.stop(end);
      }
    }
  }

  /** 竹笛：氣音 + 起音往上滑 + 慢慢出現的顫音 */
  flute(f: number, t: number, dur: number, vel: number, out: AudioNode, keep: Keep) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const lp = this.lowpass(1800);
    lp.connect(g).connect(out);
    const a = this.osc('sine', f, keep);
    const b = this.osc('triangle', f, keep);
    const bg = ctx.createGain();
    bg.gain.value = 0.35;
    a.frequency.setValueAtTime(f * 0.96, t);
    a.frequency.exponentialRampToValueAtTime(f, t + 0.1);
    b.frequency.setValueAtTime(f * 0.96, t);
    b.frequency.exponentialRampToValueAtTime(f, t + 0.1);
    const vib = this.osc('sine', 5.2, keep);
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * 0.01, t + Math.max(0.3, dur * 0.7));
    vib.connect(vg);
    vg.connect(a.frequency);
    vg.connect(b.frequency);
    a.connect(lp);
    b.connect(bg).connect(lp);
    // 氣音
    const air = keep(ctx.createBufferSource());
    air.buffer = this.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    bp.Q.value = 3;
    const ag = ctx.createGain();
    ag.gain.value = 0.25;
    air.connect(bp).connect(ag).connect(lp);
    const level = 0.075 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.08);
    g.gain.setValueAtTime(level * 0.9, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur + 0.35);
    const end = t + dur + 0.4;
    for (const o of [a, b, vib]) {
      o.start(t);
      o.stop(end);
    }
    air.start(t, Math.random());
    air.stop(end);
  }

  /** 溫柔的撥弦（豎琴般），可另外送進回聲 */
  harp(f: number, t: number, vel: number, out: AudioNode, keep: Keep, send?: AudioNode) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const lp = this.lowpass(Math.min(1600, f * 4), 0.5);
    lp.frequency.setValueAtTime(Math.min(1600, f * 4), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), t + 0.8);
    lp.connect(g);
    g.connect(out);
    if (send && send !== out) {
      const sg = ctx.createGain();
      sg.gain.value = 0.6;
      g.connect(sg).connect(send);
    }
    const a = this.osc('triangle', f, keep);
    const b = this.osc('sine', f, keep);
    b.detune.value = 4;
    a.connect(lp);
    b.connect(lp);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.085 * vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 2.6);
    for (const o of [a, b]) {
      o.start(t);
      o.stop(t + 2.7);
    }
  }

  /** 柔和的脈衝波短音（太空的琶音） */
  pulse(f: number, t: number, vel: number, cutoff: number, send: AudioNode, keep: Keep, dry: AudioNode) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const lp = this.lowpass(cutoff, 2);
    lp.connect(g);
    g.connect(dry);
    if (send !== dry) g.connect(send);
    const o = this.osc('square', f, keep);
    o.connect(lp);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035 * vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.45);
    o.start(t);
    o.stop(t + 0.5);
  }

  /** 鋪底和弦；sweep = 濾波器慢慢開合（像水波） */
  pad(fs: number[], t: number, dur: number, type: OscillatorType, cutoff: number, level: number, out: AudioNode, keep: Keep, sweep = false) {
    const ctx = this.ctx!;
    const lp = this.lowpass(cutoff, 0.4);
    const g = ctx.createGain();
    const lv = level / Math.sqrt(fs.length);
    const fade = Math.min(2.5, dur * 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lv, t + fade);
    g.gain.setValueAtTime(lv, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + fade);
    lp.connect(g).connect(out);
    const end = t + dur + fade + 0.1;
    if (sweep) {
      const lfo = this.osc('sine', 1 / 7, keep);
      const d = ctx.createGain();
      d.gain.value = cutoff * 0.45;
      lfo.connect(d).connect(lp.frequency);
      lfo.start(t);
      lfo.stop(end);
    }
    for (const f of fs) {
      for (const det of [-7, 7]) {
        const o = this.osc(type, f, keep);
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(end);
      }
    }
  }

  /** 低音：正弦波 */
  bass(f: number, t: number, dur: number, level: number, out: AudioNode, keep: Keep) {
    const ctx = this.ctx!;
    const o = this.osc('sine', f, keep);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.03);
    g.gain.setTargetAtTime(level * 0.6, t + 0.05, dur * 0.4);
    g.gain.setTargetAtTime(0, t + dur, 0.12);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.8);
  }

  /** 軟軟的大鼓 */
  kick(t: number, vel: number, out: AudioNode, keep: Keep) {
    const ctx = this.ctx!;
    const o = this.osc('sine', 100, keep);
    o.frequency.setValueAtTime(100, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.35);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.4);
  }

  /** 刷子小鼓（收掉高頻，很輕） */
  brush(t: number, vel: number, out: AudioNode, keep: Keep) {
    const ctx = this.ctx!;
    const src = keep(ctx.createBufferSource());
    src.buffer = this.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06 * vel, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.22);
    src.connect(bp).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + 0.25);
  }

  /** 環境聲：風一陣一陣、海浪一波一波 */
  ambience(kind: 'wind' | 'waves', out: AudioNode, keep: Keep) {
    const ctx = this.ctx!;
    const src = keep(ctx.createBufferSource());
    src.buffer = this.noise();
    src.loop = true;
    const f = this.lowpass(kind === 'wind' ? 450 : 600);
    const g = ctx.createGain();
    g.gain.value = kind === 'wind' ? 0.012 : 0.022;
    const lfo = this.osc('sine', kind === 'wind' ? 0.07 : 0.11, keep);
    const depth = ctx.createGain();
    depth.gain.value = kind === 'wind' ? 0.01 : 0.02;
    lfo.connect(depth).connect(g.gain);
    const lfo2 = this.osc('sine', 0.05, keep);
    const depth2 = ctx.createGain();
    depth2.gain.value = 200;
    lfo2.connect(depth2).connect(f.frequency);
    src.connect(f).connect(g).connect(out);
    src.start();
    lfo.start();
    lfo2.start();
  }

  // ── 音效（都是木頭聲、撥弦，不用高頻的叮聲） ──

  private ready(): AudioContext | null {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  /** 濾波雜訊短音 */
  private burst(t: number, dur: number, type: BiquadFilterType, freq: number, gain: number, toFreq?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    f.Q.value = type === 'bandpass' ? 1.2 : 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.01, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** 音高往下掉的正弦短音（木頭敲擊的「咚」） */
  private knock(t: number, from: number, to: number, dur: number, gain: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(this.sfxBus!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** 依目前主題的音階取音（中低音區，跟音樂合調） */
  private note(degree: number): number {
    const s = this.song?.style ?? STYLES[this.wantTheme ?? 'floating'] ?? STYLES.floating;
    const n = s.scale.length;
    const d = ((degree % n) + n) % n;
    const root = s.root < 48 ? s.root + 12 : s.root;
    return mtof(root + 12 * Math.floor(degree / n) + s.scale[d]);
  }

  /** 按鈕 */
  tap() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.knock(t, 520, 400, 0.06, 0.14);
    this.burst(t, 0.03, 'bandpass', 1400, 0.05);
  }

  /** 選一張牌：木片輕敲 */
  select() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.knock(t, 420, 300, 0.1, 0.22);
    this.burst(t, 0.04, 'bandpass', 1100, 0.1);
  }

  /** 點格子預覽 */
  preview() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.knock(t, 340, 250, 0.1, 0.2);
    this.burst(t, 0.05, 'bandpass', 900, 0.06);
  }

  /** 旋轉地塊：輕輕刷過去的聲音 */
  rotate() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.burst(t, 0.14, 'bandpass', 500, 0.12, 1300);
    this.knock(t + 0.08, 380, 300, 0.06, 0.1);
  }

  /** 取消 */
  cancel() {
    const ctx = this.ready();
    if (!ctx) return;
    this.knock(ctx.currentTime, 300, 190, 0.12, 0.14);
  }

  /** 放下地塊：木頭「咚」一聲，接合的邊越多，後面的撥弦越多；完美接合多一個溫暖的和弦 */
  place(matches: number, perfect: boolean) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.knock(t, 150, 70, 0.25, 0.5);
    this.burst(t, 0.09, 'lowpass', 700, 0.25);
    const m = Math.min(matches, 6);
    for (let i = 0; i < m; i++) this.nylon(this.note(i), t + 0.08 + i * 0.07, 0.8, this.sfxBus!);
    if (perfect) {
      const t2 = t + 0.12 + m * 0.07;
      [0, 2, 4].forEach((d, i) => this.nylon(this.note(d), t2 + i * 0.03, 0.8, this.sfxBus!));
    }
  }

  /** 到達新的車站：溫暖的掃弦和弦 */
  station() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.3;
    [0, 2, 4, 5].forEach((d, i) => this.nylon(this.note(d), t + i * 0.035, 0.9, this.sfxBus!));
  }

  /** 時代前進（新的交通工具出現） */
  era() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.2;
    [0, 1, 2, 4].forEach((d, i) => this.nylon(this.note(d), t + i * 0.12, 0.8, this.sfxBus!));
  }

  /** 發牌：牌從桌上滑過來 */
  dealSlide() {
    const ctx = this.ready();
    if (!ctx) return;
    this.burst(ctx.currentTime, 0.28, 'bandpass', 1200, 0.06, 600);
  }

  /** 翻牌甩到桌上的「啪」 */
  dealSlap() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.burst(t, 0.05, 'lowpass', 1600, 0.3);
    this.knock(t, 200, 100, 0.08, 0.2);
  }

  /** 結束：慢慢往下的幾個音 */
  gameOver() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.1;
    [4, 2, 1, 0].forEach((d, i) => this.nylon(this.note(d), t + i * 0.35, 0.8, this.sfxBus!));
  }
}

export const audio = new AudioEngine();

// 第一次觸控／點擊／按鍵時啟動音訊
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown']) {
  window.addEventListener(ev, () => audio.unlock(), { capture: true, passive: true });
}
