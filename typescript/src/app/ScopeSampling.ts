/**
 * The legacy ScopePlot keeps a power-of-two ring of extrema.  A simulation
 * tick may run much faster than a screen pixel, so retaining one last value
 * per animation frame loses spikes and makes the time base frame-rate
 * dependent.  This small UI-layer counterpart deliberately has no simulator
 * dependencies; NativeCircuitApp supplies the simulation time and timestep.
 */
export interface ScopeSampleBucket {
  minimum: number;
  maximum: number;
}

export class ScopeSampler {
  private buckets: Array<ScopeSampleBucket | undefined> = [];
  private cursor = 0;
  private count = 0;
  private lastUpdateTime = 0;
  private speed = 64;

  public reset(pixelWidth: number, speed: number, time: number): void {
    let capacity = 1;
    while (capacity <= Math.max(1, Math.ceil(pixelWidth))) capacity *= 2;
    this.buckets = new Array<ScopeSampleBucket | undefined>(capacity);
    this.cursor = 0;
    this.count = 0;
    this.speed = Math.max(1, Math.floor(speed));
    this.lastUpdateTime = time;
  }

  /** Resize like ScopePlot.reset(..., full=false): retain newest history. */
  public resize(pixelWidth: number): void {
    let capacity = 1;
    while (capacity <= Math.max(1, Math.ceil(pixelWidth))) capacity *= 2;
    if (capacity === this.buckets.length) return;
    const retained = this.ordered().slice(-capacity);
    this.buckets = new Array<ScopeSampleBucket | undefined>(capacity);
    retained.forEach((bucket, index) => { this.buckets[index] = bucket; });
    this.count = retained.length;
    this.cursor = retained.length === 0 ? 0 : retained.length - 1;
  }

  public get capacity(): number {
    return this.buckets.length;
  }

  public get sampleCount(): number {
    return this.count;
  }

  public clear(time: number): void {
    this.buckets.fill(undefined);
    this.cursor = 0;
    this.count = 0;
    this.lastUpdateTime = time;
  }

  /** Mirrors ScopePlot.timeStep(): update extrema, then advance one bucket. */
  public record(time: number, maxTimeStep: number, value: number): void {
    if (!Number.isFinite(value)) return;
    if (this.buckets.length === 0) this.reset(1, this.speed, time);
    const current = this.buckets[this.cursor];
    if (current === undefined) {
      this.buckets[this.cursor] = this.initialBucket(value);
      this.count = Math.max(this.count, 1);
    } else {
      current.minimum = Math.min(current.minimum, value);
      current.maximum = Math.max(current.maximum, value);
    }
    const bucketDuration = Math.max(Number.EPSILON, maxTimeStep * this.speed);
    if (time - this.lastUpdateTime < bucketDuration) return;
    this.cursor = (this.cursor + 1) & (this.buckets.length - 1);
    this.buckets[this.cursor] = this.initialBucket(value);
    this.count = Math.min(this.buckets.length, this.count + 1);
    this.lastUpdateTime += bucketDuration;
  }

  /** Oldest-to-newest buckets, matching Scope.displayStartIndex() order. */
  public visible(pixelWidth: number): Array<ScopeSampleBucket | undefined> {
    const width = Math.max(1, Math.min(Math.ceil(pixelWidth), this.buckets.length));
    // ScopePlot.startIndex(w) is ptr + scopePointCount - w.  `ptr` is the
    // current write bucket, so it sits just beyond the untriggered display
    // window until the ring wraps.
    const start = (this.cursor + this.buckets.length - width) &
      (this.buckets.length - 1);
    return Array.from(
      { length: width },
      (_unused, index) => this.buckets[(start + index) & (this.buckets.length - 1)]
    );
  }

  public values(): number[] {
    return this.ordered().flatMap((bucket) => [bucket.minimum, bucket.maximum]);
  }

  public latest(): ScopeSampleBucket | null {
    return this.buckets[this.cursor] ?? null;
  }

  private ordered(): ScopeSampleBucket[] {
    if (this.count === 0 || this.buckets.length === 0) return [];
    const start = (this.cursor + this.buckets.length - this.count + 1) &
      (this.buckets.length - 1);
    return Array.from({ length: this.count }, (_unused, index) =>
      this.buckets[(start + index) & (this.buckets.length - 1)]
    ).filter((bucket): bucket is ScopeSampleBucket => bucket !== undefined);
  }

  private initialBucket(value: number): ScopeSampleBucket {
    return { minimum: Math.min(0, value), maximum: Math.max(0, value) };
  }
}


