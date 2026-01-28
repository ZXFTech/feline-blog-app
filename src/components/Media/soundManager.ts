// SoundManager.ts
export type SoundId = string;

export type ConcurrencyMode = "restart" | "ignore" | "overlap";

export type SoundDefinition = {
  id: SoundId;
  src: string;

  /**
   * 单个音效音量（0~1）。若不填，则使用 manager.globalVolume
   */
  volume?: number;

  /**
   * preload 策略
   * auto: 尽量预取（不保证）
   * metadata: 仅加载元信息
   * none: 不预加载
   */
  preload?: "auto" | "metadata" | "none";

  /**
   * 并发策略
   */
  concurrency?: ConcurrencyMode;

  /**
   * 触发冷却时间（ms）
   * - 用于防止连续触发过密，比如 200ms 内只响一次
   */
  cooldownMs?: number;

  /**
   * 是否走 iOS 解锁 hack（同一次用户手势里做一次静音 play/pause）
   * - 一般不需要；遇到 iOS 首次无声可打开
   */
  iosUnlockHack?: boolean;
};

type SoundRuntime = {
  def: SoundDefinition;
  base: HTMLAudioElement; // 基础实例（restart/ignore 模式通常复用这个）
  lastPlayedAt: number; // cooldown
};

export class SoundManager {
  private sounds = new Map<SoundId, SoundRuntime>();

  // 全局设置
  public muted = false;
  public globalVolume = 1;

  // 用于“是否已解锁”的状态提示（不是标准能力，仅用于你的 UI/流程）
  private unlocked = false;

  constructor(init?: { globalVolume?: number; muted?: boolean }) {
    if (typeof init?.globalVolume === "number")
      this.globalVolume = init.globalVolume;
    if (typeof init?.muted === "boolean") this.muted = init.muted;
  }

  /**
   * 注册音效并创建 Audio 实例（预创建减少延迟）
   */
  register(def: SoundDefinition) {
    const audio = new Audio(def.src);

    audio.preload = def.preload ?? "auto";
    audio.crossOrigin = "anonymous"; // 同域可不写；跨域资源需 CORS

    const runtime: SoundRuntime = {
      def: {
        concurrency: "restart",
        preload: "auto",
        ...def,
      },
      base: audio,
      lastPlayedAt: 0,
    };

    // 初始音量配置
    this.applyVolume(runtime.base, runtime.def);

    this.sounds.set(def.id, runtime);
  }

  /**
   * 批量注册
   */
  registerMany(defs: SoundDefinition[]) {
    defs.forEach((d) => this.register(d));
  }

  /**
   * 更新全局音量（0~1）
   */
  setGlobalVolume(v: number) {
    this.globalVolume = clamp01(v);
    // 同步更新所有 base 实例音量（overlap clone 会在 play 时应用）
    for (const rt of this.sounds.values()) {
      this.applyVolume(rt.base, rt.def);
    }
  }

  /**
   * 静音开关
   */
  setMuted(m: boolean) {
    this.muted = m;
    // muted 直接通过 volume=0 实现更稳定
    for (const rt of this.sounds.values()) {
      this.applyVolume(rt.base, rt.def);
    }
  }

  /**
   * 可选：在“第一次用户点击”里调用一次 unlock()，让后续 play 更稳（尤其 iOS）。
   * 注意：unlock() 也必须在用户手势回调内触发。
   */
  async unlock() {
    // unlock 只做一次即可
    if (this.unlocked) return;
    this.unlocked = true;

    // 有些平台需要一次“播放尝试”才算解锁媒体通道
    // 这里用一个极短的静音播放尝试；失败就忽略（不影响后续点击 play）
    const first = this.sounds.values().next().value as SoundRuntime | undefined;
    if (!first) return;

    try {
      const a = first.base;
      const originalVol = a.volume;
      a.volume = 0;
      a.pause();
      a.currentTime = 0;

      await a.play();
      a.pause();
      a.currentTime = 0;

      a.volume = originalVol;
    } catch {
      // 不抛出：unlock 失败不应阻断主流程
    }
  }

  /**
   * 播放指定音效
   * - 必须在用户手势回调中调用才最稳
   */
  async play(id: SoundId): Promise<void> {
    const rt = this.sounds.get(id);
    if (!rt) throw new Error(`Sound not registered: ${id}`);

    // 冷却时间：防止过密触发
    const now = Date.now();
    const cooldown = rt.def.cooldownMs ?? 0;
    if (cooldown > 0 && now - rt.lastPlayedAt < cooldown) {
      return;
    }
    rt.lastPlayedAt = now;

    // 如果全局静音，直接返回（不触发播放）
    if (this.muted) return;

    const mode = rt.def.concurrency ?? "restart";

    if (mode === "overlap") {
      // 叠加：clone 一个实例播放（互不干扰）
      const clone = rt.base.cloneNode(true) as HTMLAudioElement;
      this.applyVolume(clone, rt.def);
      await this.safePlay(clone, rt.def);
      // 播放完清理引用（让 GC 回收）
      clone.onended = () => {
        clone.src = "";
      };
      return;
    }

    // restart / ignore 复用 base
    const a = rt.base;

    // ignore：如果正在播就不打断
    if (mode === "ignore" && !a.paused) return;

    // restart：重启播放确保每次都听到
    a.pause();
    a.currentTime = 0;
    this.applyVolume(a, rt.def);

    await this.safePlay(a, rt.def);
  }

  /**
   * 停止指定音效（复位到开头）
   */
  stop(id: SoundId) {
    const rt = this.sounds.get(id);
    if (!rt) return;
    const a = rt.base;
    try {
      a.pause();
      a.currentTime = 0;
    } catch {}
  }

  /**
   * 停止全部音效（仅 stop base；overlap clone 由浏览器自行结束）
   */
  stopAll() {
    for (const rt of this.sounds.values()) {
      try {
        rt.base.pause();
        rt.base.currentTime = 0;
      } catch {}
    }
  }

  /**
   * 释放资源
   */
  destroy() {
    this.stopAll();
    for (const rt of this.sounds.values()) {
      try {
        rt.base.src = "";
      } catch {}
    }
    this.sounds.clear();
  }

  // ----------------- internal -----------------

  private applyVolume(audio: HTMLAudioElement, def: SoundDefinition) {
    const perSound = typeof def.volume === "number" ? def.volume : 1;
    const v = clamp01(this.globalVolume * perSound);

    // muted 优先：直接置 0 更简单稳
    audio.volume = this.muted ? 0 : v;
  }

  private async safePlay(audio: HTMLAudioElement, def: SoundDefinition) {
    try {
      // iOS hack：同一次调用里先做静音 play/pause 再真播（通常不需要）
      if (def.iosUnlockHack) {
        const originalVol = audio.volume;
        audio.volume = 0;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audio.volume = originalVol;
      }

      // 真正播放（play 返回 Promise，需要 await 捕获策略拦截）
      await audio.play();
    } catch (e: any) {
      // 不吞掉：上层可根据 e.name 做 UI 提示
      // 常见：NotAllowedError（非用户手势或策略限制）
      throw e;
    }
  }
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
