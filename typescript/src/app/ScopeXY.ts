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

export interface ScopeXYRecord {
  segment: ScopeXYSegment | null;
  xIndex: number;
  yIndex: number;
  scaleX: number;
  scaleY: number;
  clearGeneration: number;
}

/** Faithful data-side counterpart of legacy ScopePlot2d. */
export class ScopeXYTrajectory {
  private width = 0;
  private height = 0;
  private cursor: { x: number; y: number } | null = null;
  private scaleX = 5;
  private scaleY = 0.1;
  private scaleBrightness = 5;
  private scaleRed = 5;
  private scaleGreen = 5;
  private scaleBlue = 5;
  private clearGeneration = 0;

  public get generation(): number {
    return this.clearGeneration;
  }

  public get currentCursor(): { x: number; y: number } | null {
    return this.cursor === null ? null : { ...this.cursor };
  }

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
  ): ScopeXYRecord | null {
    if (this.width <= 0 || this.height <= 0 || channels.length === 0) return null;
    const xIndex = this.channelIndex(channels.length, settings.x, 0);
    const yIndex = this.channelIndex(channels.length, settings.y, Math.min(1, channels.length - 1));
    const xChannel = channels[xIndex] as ScopeXYChannel;
    const yChannel = channels[yIndex] as ScopeXYChannel;
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
    let segment: ScopeXYSegment | null = null;
    if (this.cursor !== null) {
      segment = {
        fromX: this.cursor.x,
        fromY: this.cursor.y,
        toX: point.x,
        toY: point.y,
        color,
        alpha,
        time
      };
    }
    this.cursor = point;
    return {
      segment,
      xIndex,
      yIndex,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
      clearGeneration: this.clearGeneration
    };
  }

  private channelIndex(
    channelCount: number,
    index: number,
    fallback: number
  ): number {
    return Number.isInteger(index) && index >= 0 && index < channelCount
      ? index
      : Math.min(fallback, channelCount - 1);
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
    if (settings.brightness < 0 || settings.brightness >= channels.length) return 1;
    const value = Math.abs(this.finiteValue((channels[settings.brightness] as ScopeXYChannel).read()));
    while (value > this.scaleBrightness) this.scaleBrightness *= 2;
    return Math.max(0, Math.min(1, value / this.scaleBrightness));
  }
}

/**
 * Browser-side equivalent of ScopePlot2d.imageCanvas.  Simulation records
 * each segment once into this private surface; presenting it is O(1) per
 * frame and the legacy fade is composited onto the same surface.
 */
export class ScopeXYRaster {
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private clearGeneration = -1;
  private readonly fadeClock = new ScopeXYFadeClock();

  public sync(
    width: number,
    height: number,
    clearGeneration: number,
    whiteBackground: boolean
  ): void {
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));
    if (this.canvas === null) {
      this.canvas = document.createElement("canvas");
      this.context = this.canvas.getContext("2d");
    }
    if (this.context === null || this.canvas === null) return;
    if (nextWidth !== this.width || nextHeight !== this.height) {
      this.width = nextWidth;
      this.height = nextHeight;
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
      this.clearGeneration = clearGeneration;
      this.clear(whiteBackground);
      return;
    }
    if (this.clearGeneration !== clearGeneration) {
      this.clearGeneration = clearGeneration;
      this.clear(whiteBackground);
    }
  }

  public draw(segment: ScopeXYSegment, whiteBackground: boolean): void {
    if (this.context === null) return;
    this.context.save();
    this.context.globalAlpha = segment.alpha;
    this.context.strokeStyle = whiteBackground && segment.color === "#ffffff"
      ? "#000000"
      : segment.color;
    this.context.beginPath();
    this.context.moveTo(segment.fromX, segment.fromY);
    this.context.lineTo(segment.toX, segment.toY);
    this.context.stroke();
    this.context.restore();
  }

  public drawTo(
    destination: CanvasRenderingContext2D,
    x: number,
    y: number,
    settings: Pick<ScopeXYSettings, "trailPersistence">,
    simulationTime: number,
    maxTimeStep: number,
    whiteBackground: boolean
  ): void {
    if (this.canvas === null || this.context === null) return;
    const fadeAlpha = this.fadeClock.tick(
      settings.trailPersistence,
      simulationTime,
      maxTimeStep
    );
    if (fadeAlpha > 0) {
      this.context.save();
      this.context.globalAlpha = fadeAlpha;
      this.context.fillStyle = whiteBackground ? "#ffffff" : "#000000";
      this.context.fillRect(0, 0, this.width, this.height);
      this.context.restore();
    }
    destination.drawImage(this.canvas, x, y);
  }

  private clear(whiteBackground: boolean): void {
    if (this.context === null) return;
    this.context.save();
    this.context.globalAlpha = 1;
    // ScopePlot2d.clearView has the printable #eee backing fill; the normal
    // dark UI uses #111, then fades toward black while running.
    this.context.fillStyle = whiteBackground ? "#eeeeee" : "#111111";
    this.context.fillRect(0, 0, this.width, this.height);
    this.context.restore();
    this.fadeClock.reset();
  }

}

/** Exact ScopePlot2d draw-frame cadence and simulation-time fade contract. */
export class ScopeXYFadeClock {
  private alphaCounter = 0;
  private lastTrailSimTime = -1;

  public reset(): void {
    this.alphaCounter = 0;
    this.lastTrailSimTime = -1;
  }

  public tick(
    persistence: number,
    simulationTime: number,
    maxTimeStep: number
  ): number {
    this.alphaCounter += 1;
    if (this.alphaCounter <= 2) return 0;
    this.alphaCounter = 0;
    if (persistence <= 0) return 0.01;
    if (this.lastTrailSimTime < 0 || simulationTime < this.lastTrailSimTime) {
      this.lastTrailSimTime = simulationTime;
    }
    const elapsed = simulationTime - this.lastTrailSimTime;
    const timeConstant = persistence * maxTimeStep;
    const alpha = 1 - Math.exp(-elapsed / Math.max(Number.EPSILON, timeConstant));
    if (alpha >= 3 / 255) {
      this.lastTrailSimTime = simulationTime;
      return alpha;
    }
    return 0;
  }
}
