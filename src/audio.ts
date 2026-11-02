// 音樂與音效：全部用 Web Audio 即時合成，不用載入音檔。
// 音樂是輕柔的生成式配樂，每個主題有自己的音階、和弦、樂器與環境聲；
// 音效用木頭敲擊、撥弦、鐘聲，跟木製桌遊的質感搭配。

type Lead = 'harp' | 'zheng' | 'bell' | 'glass';
type Ambience = 'wind' | 'waves' | 'none';

interface MusicStyle {
  bpm: number;
  /** 主音（MIDI 音高） */
  root: number;
  /** 旋律音階（相對主音的半音數） */
  scale: number[];
  /** 和弦進行（相對主音的半音數） */
  chords: number[][];
  /** 每個和弦幾小節 */
  bars: number;
  lead: Lead;
  pad: OscillatorType;
  padCutoff: number;
  /** 每個八分音符出現旋律的機率 */
  density: number;
  reverb: number;
  ambience: Ambience;
}

const STYLES: Record<string, MusicStyle> = {
  // 浮島：F 大調五聲音階，豎琴般的撥弦、溫暖的和弦、微風
  floating: {
    bpm: 72,
    root: 53,
    scale: [0, 2, 4, 7, 9],
    chords: [
      [0, 4, 7, 11],
      [-3, 0, 4, 7],
      [-7, -3, 0, 4],
      [-5, -1, 2, 7],
    ],
    bars: 2,
    lead: 'harp',
    pad: 'triangle',
    padCutoff: 1400,
    density: 0.42,
    reverb: 0.35,
    ambience: 'wind',
  },
  // 台灣街景：D 宮調五聲音階，像古箏的撥弦帶一點滑音，節奏慢、留白多
  taiwan: {
    bpm: 66,
    root: 50,
    scale: [0, 2, 4, 7, 9],
    chords: [
      [0, 7, 14, 16],
      [-3, 4, 9, 12],
      [-5, 2, 7, 11],
      [-8, -1, 4, 7],
    ],
    bars: 2,
    lead: 'zheng',
    pad: 'sine',
    padCutoff: 1100,
    density: 0.36,
    reverb: 0.3,
    ambience: 'none',
  },
  // 海底：E♭ 利地亞調，慢、深，鐘聲般的音色加長延遲，背景有海浪起伏
  ocean: {
    bpm: 56,
    root: 51,
    scale: [0, 2, 4, 6, 7, 9, 11],
    chords: [
      [0, 4, 7, 11, 14],
      [-3, 0, 4, 7, 10],
      [-7, -3, 0, 4, 9],
      [-5, -1, 2, 6, 9],
    ],
    bars: 2,
    lead: 'bell',
    pad: 'sine',
    padCutoff: 900,
    density: 0.28,
    reverb: 0.5,
    ambience: 'waves',
  },
  // 太空：A 大調高音區，玻璃般慢慢浮出來的音、很長的殘響、低音持續音
  space: {
    bpm: 50,
    root: 45,
    scale: [0, 2, 4, 7, 9, 11],
    chords: [
      [0, 7, 11, 14, 16],
      [-3, 4, 7, 11, 14],
      [-7, 0, 4, 9, 11],
      [-5, 2, 7, 9, 14],
    ],
    bars: 4,
    lead: 'glass',
    pad: 'sawtooth',
    padCutoff: 700,
    density: 0.22,
    reverb: 0.6,
    ambience: 'none',
  },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Song {
  readonly out: GainNode;
  private timer = 0;
  private next = 0;
  private step = 0;
  private last = 7; // 上一個旋律音（音階索引）
  private nodes: AudioScheduledSourceNode[] = [];

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
    this.startAmbience();
    this.timer = window.setInterval(() => this.schedule(), 60);
    this.schedule();
  }

  stop() {
    const ctx = this.a.ctx!;
    clearInterval(this.timer);
    this.out.gain.cancelScheduledValues(ctx.currentTime);
    this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
    const nodes = this.nodes;
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

  private keep<T extends AudioScheduledSourceNode>(n: T): T {
    this.nodes.push(n);
    n.onended = () => {
      const i = this.nodes.indexOf(n);
      if (i >= 0) this.nodes.splice(i, 1);
    };
    return n;
  }

  /** 往前排約 0.4 秒內要出現的音 */
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

  private playStep(step: number, t: number, eighth: number) {
    const s = this.style;
    const stepsPerChord = s.bars * 8;
    const chordIdx = Math.floor(step / stepsPerChord) % s.chords.length;
    const chord = s.chords[chordIdx];
    const inChord = step % stepsPerChord;
    const chordDur = stepsPerChord * eighth;

    // 換和弦：鋪底和弦 + 低音
    if (inChord === 0) {
      this.pad(chord, t, chordDur);
      this.bass(s.root + chord[0] - 12, t, chordDur);
    }

    // 旋律：兩小節一句，句尾留白
    const phrasePos = step % 32;
    const resting = phrasePos >= 26;
    if (resting) return;
    const onBeat = step % 2 === 0;
    const p = s.density * (onBeat ? 1.25 : 0.6);
    if (Math.random() > p) return;

    const scaleLen = s.scale.length;
    // 隨機小步移動，偶爾跳遠一點；拍點上偏好和弦音
    const move = Math.random() < 0.8 ? Math.round((Math.random() - 0.5) * 4) : Math.round((Math.random() - 0.5) * 8);
    let idx = Math.max(scaleLen, Math.min(scaleLen * 3 - 1, this.last + move));
    if (onBeat) {
      for (let k = 0; k < 3; k++) {
        const semi = s.scale[idx % scaleLen] + 12 * Math.floor(idx / scaleLen);
        if (chord.some((c) => (((semi - c) % 12) + 12) % 12 === 0)) break;
        idx += move >= 0 ? 1 : -1;
      }
      idx = Math.max(scaleLen, Math.min(scaleLen * 3 - 1, idx));
    }
    this.last = idx;
    const midi = s.root + 12 + s.scale[idx % scaleLen] + 12 * Math.floor(idx / scaleLen);
    const vel = (onBeat ? 0.9 : 0.6) * (0.75 + Math.random() * 0.25);
    this.a.voice(s.lead, mtof(midi), t + (Math.random() - 0.5) * 0.015, vel, this.out, this.keep.bind(this));
  }

  private pad(chord: number[], t: number, dur: number) {
    const ctx = this.a.ctx!;
    const s = this.style;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = s.padCutoff;
    filter.Q.value = 0.3;
    const g = ctx.createGain();
    const level = (s.pad === 'sawtooth' ? 0.022 : 0.05) / Math.sqrt(chord.length);
    const fade = Math.min(2.5, dur * 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + fade);
    g.gain.setValueAtTime(level, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + fade);
    filter.connect(g).connect(this.out);
    for (const c of chord) {
      for (const det of [-7, 7]) {
        const o = this.keep(ctx.createOscillator());
        o.type = s.pad;
        o.frequency.value = mtof(s.root + c);
        o.detune.value = det;
        o.connect(filter);
        o.start(t);
        o.stop(t + dur + fade + 0.1);
      }
    }
  }

  private bass(midi: number, t: number, dur: number) {
    const ctx = this.a.ctx!;
    const o = this.keep(ctx.createOscillator());
    o.type = 'sine';
    o.frequency.value = mtof(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.4);
    g.gain.setTargetAtTime(0.05, t + 0.4, dur * 0.3);
    g.gain.setTargetAtTime(0, t + dur - 0.2, 0.4);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 2);
  }

  private startAmbience() {
    const ctx = this.a.ctx!;
    const kind = this.style.ambience;
    if (kind === 'none') return;
    const src = this.keep(ctx.createBufferSource());
    src.buffer = this.a.noise();
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = kind === 'wind' ? 500 : 700;
    const g = ctx.createGain();
    g.gain.value = kind === 'wind' ? 0.012 : 0.02;
    // 慢慢起伏：風一陣一陣、海浪一波一波
    const lfo = this.keep(ctx.createOscillator());
    lfo.frequency.value = kind === 'wind' ? 0.07 : 0.11;
    const depth = ctx.createGain();
    depth.gain.value = kind === 'wind' ? 0.01 : 0.018;
    lfo.connect(depth).connect(g.gain);
    const lfo2 = this.keep(ctx.createOscillator());
    lfo2.frequency.value = 0.05;
    const depth2 = ctx.createGain();
    depth2.gain.value = 250;
    lfo2.connect(depth2).connect(f.frequency);
    src.connect(f).connect(g).connect(this.out);
    src.start();
    lfo.start();
    lfo2.start();
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
      const master = ctx.createGain();
      master.gain.value = 2.2;
      master.connect(comp);

      // 殘響：用衰減的雜訊做脈衝響應
      const conv = ctx.createConvolver();
      conv.buffer = this.impulse(3.2);
      this.reverbIn = ctx.createGain();
      this.reverbIn.connect(conv).connect(master);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.55 : 0;
      this.musicBus.connect(master);
      const musicSend = ctx.createGain();
      musicSend.gain.value = 0.5;
      this.musicBus.connect(musicSend).connect(this.reverbIn);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.sfxOn ? 1.1 : 0;
      this.sfxBus.connect(master);
      const sfxSend = ctx.createGain();
      sfxSend.gain.value = 0.18;
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

  // ── 樂器 ──

  /** 單一個旋律音 */
  voice(kind: Lead, f: number, t: number, vel: number, out: AudioNode, keep: <T extends AudioScheduledSourceNode>(n: T) => T = (n) => n) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.connect(out);
    const osc = (type: OscillatorType, freq: number) => {
      const o = keep(ctx.createOscillator());
      o.type = type;
      o.frequency.value = freq;
      return o;
    };
    if (kind === 'harp') {
      // 豎琴：三角波 + 柔和泛音，亮度隨時間變暗
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(5000, t);
      lp.frequency.exponentialRampToValueAtTime(900, t + 0.6);
      lp.connect(g);
      const a = osc('triangle', f);
      const b = osc('sine', f * 2);
      const bg = ctx.createGain();
      bg.gain.value = 0.25;
      a.connect(lp);
      b.connect(bg).connect(lp);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.11 * vel, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 2.2);
      [a, b].forEach((o) => (o.start(t), o.stop(t + 2.3)));
    } else if (kind === 'zheng') {
      // 古箏：鋸齒波撥弦，起音稍微往下滑，尾音輕輕揉弦
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 1.2;
      lp.frequency.setValueAtTime(3200, t);
      lp.frequency.exponentialRampToValueAtTime(700, t + 0.5);
      lp.connect(g);
      const a = osc('sawtooth', f);
      a.frequency.setValueAtTime(f * 1.025, t);
      a.frequency.exponentialRampToValueAtTime(f, t + 0.07);
      const vib = osc('sine', 5.5);
      const vg = ctx.createGain();
      vg.gain.setValueAtTime(0, t);
      vg.gain.linearRampToValueAtTime(f * 0.006, t + 0.6);
      vib.connect(vg).connect(a.frequency);
      a.connect(lp);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07 * vel, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 1.9);
      [a, vib].forEach((o) => (o.start(t), o.stop(t + 2)));
    } else if (kind === 'bell') {
      // 鐘聲：FM 合成，泛音快速消失，留下圓潤的基音
      const c = osc('sine', f);
      const m = osc('sine', f * 3.5);
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 1.6, t);
      mg.gain.exponentialRampToValueAtTime(1, t + 1.2);
      m.connect(mg).connect(c.frequency);
      c.connect(g);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08 * vel, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 3.2);
      [c, m].forEach((o) => (o.start(t), o.stop(t + 3.3)));
    } else {
      // 玻璃：慢慢浮出來的正弦波加八度泛音，輕微顫音
      const a = osc('sine', f);
      const b = osc('sine', f * 2.002);
      const bg = ctx.createGain();
      bg.gain.value = 0.3;
      const vib = osc('sine', 4);
      const vg = ctx.createGain();
      vg.gain.value = f * 0.003;
      vib.connect(vg).connect(a.frequency);
      a.connect(g);
      b.connect(bg).connect(g);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07 * vel, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 3.8);
      [a, b, vib].forEach((o) => (o.start(t), o.stop(t + 3.9)));
    }
  }

  // ── 音效 ──

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
    f.Q.value = type === 'bandpass' ? 1.5 : 0.7;
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

  /** 依目前主題的音階取音（給提示音用，跟音樂合調） */
  private note(degree: number, octave = 1): number {
    const s = this.song?.style ?? STYLES[this.wantTheme ?? 'floating'] ?? STYLES.floating;
    const n = s.scale.length;
    const d = ((degree % n) + n) % n;
    return mtof(s.root + 12 * (octave + Math.floor(degree / n)) + s.scale[d]);
  }

  private lead(): Lead {
    return (this.song?.style ?? STYLES[this.wantTheme ?? 'floating'] ?? STYLES.floating).lead;
  }

  /** 按鈕 */
  tap() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.knock(t, 900, 700, 0.06, 0.12);
    this.burst(t, 0.03, 'bandpass', 3000, 0.05);
  }

  /** 選一張牌：木片輕敲 */
  select() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.knock(t, 620, 420, 0.1, 0.22);
    this.burst(t, 0.04, 'bandpass', 1800, 0.12);
  }

  /** 點格子預覽 */
  preview() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.knock(t, 480, 360, 0.09, 0.16);
    this.burst(t, 0.05, 'bandpass', 1200, 0.06);
  }

  /** 旋轉地塊：輕輕刷過去的聲音 */
  rotate() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.burst(t, 0.14, 'bandpass', 900, 0.1, 2600);
    this.knock(t + 0.08, 760, 600, 0.05, 0.08);
  }

  /** 取消 */
  cancel() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.knock(t, 420, 260, 0.1, 0.12);
  }

  /** 放下地塊：木頭「咚」一聲，接合的邊越多，後面的撥弦越多；完美接合多一段亮音 */
  place(matches: number, perfect: boolean) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.knock(t, 170, 80, 0.22, 0.45);
    this.burst(t, 0.09, 'lowpass', 900, 0.25);
    const kind = this.lead();
    for (let i = 0; i < Math.min(matches, 6); i++) {
      this.voice(kind, this.note(i, 1), t + 0.08 + i * 0.07, 0.7, this.sfxBus!);
    }
    if (perfect) {
      const t2 = t + 0.1 + Math.min(matches, 6) * 0.07;
      [0, 2, 4, 7].forEach((d, i) => this.voice('bell', this.note(d, 2), t2 + i * 0.06, 0.5, this.sfxBus!));
    }
  }

  /** 到達新的車站：和弦鐘聲 */
  station() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.25;
    [0, 2, 4].forEach((d) => this.voice('bell', this.note(d, 1), t, 0.6, this.sfxBus!));
    this.voice('bell', this.note(0, 2), t + 0.18, 0.5, this.sfxBus!);
  }

  /** 時代前進（新的交通工具出現） */
  era() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.2;
    const kind = this.lead();
    [0, 1, 2, 4].forEach((d, i) => this.voice(kind, this.note(d, 1), t + i * 0.11, 0.7, this.sfxBus!));
  }

  /** 發牌：牌從桌上滑過來 */
  dealSlide() {
    const ctx = this.ready();
    if (!ctx) return;
    this.burst(ctx.currentTime, 0.28, 'bandpass', 2400, 0.05, 900);
  }

  /** 翻牌甩到桌上的「啪」 */
  dealSlap() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.burst(t, 0.05, 'lowpass', 3000, 0.3);
    this.knock(t, 240, 120, 0.07, 0.18);
  }

  /** 結束：慢慢往下的幾個音 */
  gameOver() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.1;
    [4, 2, 1, 0].forEach((d, i) => this.voice('bell', this.note(d, 1), t + i * 0.32, 0.6, this.sfxBus!));
  }
}

export const audio = new AudioEngine();

// 第一次觸控／點擊／按鍵時啟動音訊
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown']) {
  window.addEventListener(ev, () => audio.unlock(), { capture: true, passive: true });
}
