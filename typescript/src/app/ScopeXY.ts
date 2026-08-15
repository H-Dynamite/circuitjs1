/**
 * Runtime state for a legacy ScopePlot2d trace.
 *
 * This deliberately does not share ScopeSampler's time-domain buckets: an XY
 * scope samples every solver tick and keeps a continuous cursor/trail instead
 * of reducing values to one min/max pair per horizontal pixel.
 */
export interface ScopeXYChannel {
  read: () => number;
  manualScale: number | null;
  manualPosition: number | null;
}

export interface ScopeXYSettings {
  xy: boolean;
  x: number;
  y: number;
  brightness: number;
  red: number;
  green: number;
  blue: number;
  trailPersistence: number;
  manual: boolean;
  manualDivisions: number;
}

export interface ScopeXYSegment {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  alpha: number;
  time: number;
}

export interface ScopeXYFrame {
  segments: readonly ScopeXYSegment[];
  cursor: { x: number; y: number } | null;
  scaleX: number;
  scaleY: number;
  clearGeneration: number;
}

/** Faithful data-side counterpart of legacy ScopePlot2d. */
export class ScopeXYTrajectory {
  private width = 0;
  private height = 0;
  private cursor: { x: number; y: number } | null = null;
  private segments: ScopeXYSegment[] = [];
  private scaleX = 5;
  private scaleY = 0.1;
  private scaleBrightness = 5;
  private scaleRed = 5;
  private scaleGreen = 5;
  private scaleBlue = 5;
  private clearGeneration = 0;

  /** Resize has legacy allocImage semantics: a backing image resize clears it. */
  public resize(width: number, height: number): void {
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));
    if (nextWidth === this.width && nextHeight === this.height) return;
    this.width = nextWidth;
    this.height = nextHeight;
    this.clear();
  }

  public clear(): void {
    this.segments = [];
    this.cursor = null;
    this.clearGeneration += 1;
  }

  public reset(): void {
    this.scaleX = 5;
    this.scaleY = 0.1;
    this.scaleBrightness = 5;
    this.scaleRed = 5;
    this.scaleGreen = 5;
    this.scaleBlue = 5;
    this.clear();
  }

  /**
   * Adds exactly one solver-tick point.  Invalid channel indexes fall back to
   * the legacy defaults, and index zero remains a valid axis/modulator.
   */
  public record(
    channels: readonly ScopeXYChannel[],
    settings: ScopeXYSettings,
    time: number
  ): void {
    if (this.width <= 0 || this.height <= 0 || channels.length === 0) return;
    const xChannel = this.channelAt(channels, settings.x, 0);
    const yChannel = this.channelAt(channels, settings.y, Math.min(1, channels.length - 1));
    const xValue = this.finiteValue(xChannel.read());
    const yValue = this.finiteValue(yChannel.read());
    let scaled = false;
    if (!settings.manual) {
      while (xValue > this.scaleX || xValue < -this.scaleX) {
        this.scaleX *= 2;
        scaled = true;
      }
      while (yValue > this.scaleY || yValue < -this.scaleY) {
        this.scaleY *= 2;
        scaled = true;
      }
      if (scaled) this.clear();
    }
    const point = settings.manual
      ? this.manualPoint(xValue, yValue, xChannel, yChannel, settings)
      : {
        x: Math.trunc(this.width * (1 + xValue / this.scaleX) * 0.499),
        y: Math.trunc(this.height * (1 - yValue / this.scaleY) * 0.499)
      };
    const color = this.computeColor(channels, settings);
    const alpha = this.computeAlpha(channels, settings);
    // ScopePlot2d's first point establishes draw_ox/draw_oy and emits no
    // segment.  This is observable on a one-tick simulation and important
    // after reset/resize/autoscale clears.
    if (this.cursor !== null) {
      this.segments.push({
        fromX: this.cursor.x,
        fromY: this.cursor.y,
        toX: point.x,
        toY: point.y,
        color,
        alpha,
        time
      });
      // The legacy backing canvas fades rather than growing a data array.
      // Keep enough real history to reproduce a dense fixed-step capture
      // while imposing an equivalent long-running memory ceiling.
      if (this.segments.length > 8192) this.segments.splice(0, this.segments.length - 8192);
    }
    this.cursor = point;
  }

  public frame(time: number, maxTimeStep: number): ScopeXYFrame {
    const persistence = Math.max(0, this.currentTrailPersistence);
    const segments = persistence <= 0
      ? this.segments
      : this.segments.map((segment) => ({
        ...segment,
        alpha: segment.alpha * Math.exp(
          -Math.max(0, time - segment.time) /
          Math.max(Number.EPSILON, persistence * maxTimeStep)
        )
      })).filter((segment) => segment.alpha >= 1 / 255);
    return {
      segments,
      cursor: this.cursor === null ? null : { ...this.cursor },
      scaleX: this.scaleX,
      scaleY: this.scaleY,
      clearGeneration: this.clearGeneration
    };
  }

  private currentTrailPersistence = 0;

  private channelAt(
    channels: readonly ScopeXYChannel[],
    index: number,
    fallback: number
  ): ScopeXYChannel {
    const normalized = Number.isInteger(index) && index >= 0 && index < channels.length
      ? index
      : Math.min(fallback, channels.length - 1);
    return channels[normalized] as ScopeXYChannel;
  }

  private finiteValue(read: number): number {
    return Number.isFinite(read) ? read : 0;
  }

  private manualPoint(
    xValue: number,
    yValue: number,
    xChannel: ScopeXYChannel,
    yChannel: ScopeXYChannel,
    settings: ScopeXYSettings
  ): { x: number; y: number } {
    const gridPx = (Math.min(this.width, this.height) / 2) /
      (Math.max(1, settings.manualDivisions) / 2 + 0.05);
    const xScale = Math.max(Number.EPSILON, xChannel.manualScale ?? this.scaleX);
    const yScale = Math.max(Number.EPSILON, yChannel.manualScale ?? this.scaleY);
    const xPosition = xChannel.manualPosition ?? 0;
    const yPosition = yChannel.manualPosition ?? 0;
    return {
      x: Math.trunc(this.width * 0.499 + (xValue / xScale) * gridPx +
        gridPx * settings.manualDivisions * xPosition / 200),
      y: Math.trunc(this.height * 0.499 - (yValue / yScale) * gridPx -
        gridPx * settings.manualDivisions * yPosition / 200)
    };
  }

  private computeColor(
    channels: readonly ScopeXYChannel[],
    settings: ScopeXYSettings
  ): string {
    if (settings.red < 0 && settings.green < 0 && settings.blue < 0) {
      return "#ffffff";
    }
    const component = (index: number, scale: "scaleRed" | "scaleGreen" | "scaleBlue") => {
      if (index < 0 || index >= channels.length) return 0;
      const value = this.finiteValue((channels[index] as ScopeXYChannel).read());
      while (value > this[scale]) this[scale] *= 2;
      return Math.trunc(Math.max(0, Math.min(255, value / this[scale] * 255)));
    };
    return `rgb(${component(settings.red, "scaleRed")},${component(settings.green, "scaleGreen")},${component(settings.blue, "scaleBlue")})`;
  }

  private computeAlpha(
    channels: readonly ScopeXYChannel[],
    settings: ScopeXYSettings
  ): number {
    this.currentTrailPersistence = settings.trailPersistence;
    if (settings.brightness < 0 || settings.brightness >= channels.length) return 1;
    const value = Math.abs(this.finiteValue((channels[settings.brightness] as ScopeXYChannel).read()));
    while (value > this.scaleBrightness) this.scaleBrightness *= 2;
    return Math.max(0, Math.min(1, value / this.scaleBrightness));
  }
}


