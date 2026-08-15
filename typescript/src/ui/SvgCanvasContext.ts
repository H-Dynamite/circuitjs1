type Matrix = [number, number, number, number, number, number];
type Paint = string | SvgLinearGradient;
type SvgState = {
  fillStyle: Paint; strokeStyle: Paint; lineWidth: number;
  lineCap: CanvasLineCap; lineJoin: CanvasLineJoin; lineDash: number[];
  globalAlpha: number; font: string; textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline; transform: Matrix;
};

const xml = (value: string): string => value.replace(/&/g, "&amp;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const number = (value: number): string => Number.isInteger(value)
  ? String(value) : String(Number(value.toFixed(4)));

class SvgLinearGradient {
  public readonly stops: Array<{ offset: number; color: string }> = [];
  public constructor(public readonly id: string, public readonly x1: number,
    public readonly y1: number, public readonly x2: number, public readonly y2: number) {}
  public addColorStop(offset: number, color: string): void { this.stops.push({ offset, color }); }
}

/** Canvas2D-compatible recorder used to replay the production renderer as SVG. */
export class SvgCanvasContext {
  private readonly children: string[] = [];
  private readonly gradients: SvgLinearGradient[] = [];
  private readonly stack: SvgState[] = [];
  private path: string[] = [];
  private pathTransform: Matrix = [1, 0, 0, 1, 0, 0];
  private state: SvgState = {
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, lineCap: "butt",
    lineJoin: "miter", lineDash: [], globalAlpha: 1, font: "10px sans-serif",
    textAlign: "start", textBaseline: "alphabetic", transform: [1, 0, 0, 1, 0, 0]
  };
  public constructor(private readonly width: number, private readonly height: number,
    private readonly measurementContext: CanvasRenderingContext2D) {}

  public get fillStyle(): string | CanvasGradient | CanvasPattern { return this.state.fillStyle as unknown as string; }
  public set fillStyle(value: string | CanvasGradient | CanvasPattern) { this.state.fillStyle = value as unknown as Paint; }
  public get strokeStyle(): string | CanvasGradient | CanvasPattern { return this.state.strokeStyle as unknown as string; }
  public set strokeStyle(value: string | CanvasGradient | CanvasPattern) { this.state.strokeStyle = value as unknown as Paint; }
  public get lineWidth(): number { return this.state.lineWidth; }
  public set lineWidth(value: number) { this.state.lineWidth = value; }
  public get lineCap(): CanvasLineCap { return this.state.lineCap; }
  public set lineCap(value: CanvasLineCap) { this.state.lineCap = value; }
  public get lineJoin(): CanvasLineJoin { return this.state.lineJoin; }
  public set lineJoin(value: CanvasLineJoin) { this.state.lineJoin = value; }
  public get globalAlpha(): number { return this.state.globalAlpha; }
  public set globalAlpha(value: number) { this.state.globalAlpha = value; }
  public get font(): string { return this.state.font; }
  public set font(value: string) { this.state.font = value; }
  public get textAlign(): CanvasTextAlign { return this.state.textAlign; }
  public set textAlign(value: CanvasTextAlign) { this.state.textAlign = value; }
  public get textBaseline(): CanvasTextBaseline { return this.state.textBaseline; }
  public set textBaseline(value: CanvasTextBaseline) { this.state.textBaseline = value; }

  public save(): void { this.stack.push({ ...this.state, lineDash: [...this.state.lineDash], transform: [...this.state.transform] }); }
  public restore(): void { const saved = this.stack.pop(); if (saved) this.state = saved; }
  public translate(x: number, y: number): void {
    const [a,b,c,d,e,f] = this.state.transform;
    this.state.transform = [a,b,c,d,a*x+c*y+e,b*x+d*y+f];
  }
  public rotate(angle: number): void {
    const [a,b,c,d,e,f] = this.state.transform, co = Math.cos(angle), si = Math.sin(angle);
    this.state.transform = [a*co+c*si,b*co+d*si,c*co-a*si,d*co-b*si,e,f];
  }
  public setLineDash(segments: number[]): void { this.state.lineDash = [...segments]; }
  public beginPath(): void { this.path=[]; this.pathTransform=[...this.state.transform]; }
  public closePath(): void { this.path.push("Z"); }
  public moveTo(x:number,y:number):void { this.path.push(`M${number(x)} ${number(y)}`); }
  public lineTo(x:number,y:number):void { this.path.push(`L${number(x)} ${number(y)}`); }
  public quadraticCurveTo(a:number,b:number,x:number,y:number):void { this.path.push(`Q${number(a)} ${number(b)} ${number(x)} ${number(y)}`); }
  public bezierCurveTo(a:number,b:number,c:number,d:number,x:number,y:number):void { this.path.push(`C${number(a)} ${number(b)} ${number(c)} ${number(d)} ${number(x)} ${number(y)}`); }
  public rect(x:number,y:number,w:number,h:number):void { this.path.push(`M${number(x)} ${number(y)}h${number(w)}v${number(h)}h${number(-w)}Z`); }
  public arc(cx:number,cy:number,r:number,start:number,end:number,ccw=false):void {
    const tau=Math.PI*2; let sweep=end-start;
    if(!ccw&&sweep<0)sweep=((sweep%tau)+tau)%tau;
    if(ccw&&sweep>0)sweep=-(((-sweep%tau)+tau)%tau);
    if(Math.abs(end-start)>=tau)sweep=ccw?-tau:tau;
    const sx=cx+Math.cos(start)*r, sy=cy+Math.sin(start)*r;
    this.path.push(`${this.path.length===0?"M":"L"}${number(sx)} ${number(sy)}`);
    const dir=ccw?0:1;
    if(Math.abs(sweep)>=tau-1e-9){const mid=start+sweep/2,mx=cx+Math.cos(mid)*r,my=cy+Math.sin(mid)*r;
      this.path.push(`A${number(r)} ${number(r)} 0 1 ${dir} ${number(mx)} ${number(my)}`);
      this.path.push(`A${number(r)} ${number(r)} 0 1 ${dir} ${number(sx)} ${number(sy)}`);
    } else {const ex=cx+Math.cos(end)*r,ey=cy+Math.sin(end)*r;
      this.path.push(`A${number(r)} ${number(r)} 0 ${Math.abs(sweep)>Math.PI?1:0} ${dir} ${number(ex)} ${number(ey)}`);}
  }
  public stroke():void { this.emitPath("none",this.state.strokeStyle); }
  public fill():void { this.emitPath(this.state.fillStyle,"none"); }
  public clearRect():void {}
  public fillRect(x:number,y:number,w:number,h:number):void { this.children.push(`<rect x="${number(x)}" y="${number(y)}" width="${number(w)}" height="${number(h)}" ${this.paint(this.state.fillStyle,"fill")} ${this.commonStyle()}/>`); }
  public strokeRect(x:number,y:number,w:number,h:number):void { this.children.push(`<rect x="${number(x)}" y="${number(y)}" width="${number(w)}" height="${number(h)}" fill="none" ${this.paint(this.state.strokeStyle,"stroke")} ${this.strokeAttributes()} ${this.commonStyle()}/>`); }
  public fillText(text:string,x:number,y:number):void {
    const anchor=this.state.textAlign==="center"?"middle":this.state.textAlign==="right"||this.state.textAlign==="end"?"end":"start";
    const baseline=this.state.textBaseline==="middle"?"middle":this.state.textBaseline==="top"||this.state.textBaseline==="hanging"?"text-before-edge":this.state.textBaseline==="bottom"||this.state.textBaseline==="ideographic"?"text-after-edge":"alphabetic";
    this.children.push(`<text x="${number(x)}" y="${number(y)}" text-anchor="${anchor}" dominant-baseline="${baseline}" ${this.paint(this.state.fillStyle,"fill")} style="font:${xml(this.state.font)}" ${this.commonStyle()}>${xml(text)}</text>`);
  }
  public measureText(text:string):TextMetrics { const old=this.measurementContext.font; try { this.measurementContext.font=this.state.font; return this.measurementContext.measureText(text); } finally { this.measurementContext.font=old; } }
  public createLinearGradient(x1:number,y1:number,x2:number,y2:number):CanvasGradient { const g=new SvgLinearGradient(`gradient-${this.gradients.length+1}`,x1,y1,x2,y2); this.gradients.push(g); return g as unknown as CanvasGradient; }
  public serialize():string { const defs=this.gradients.map(g=>`<linearGradient id="${g.id}" x1="${number(g.x1)}" y1="${number(g.y1)}" x2="${number(g.x2)}" y2="${number(g.y2)}" gradientUnits="userSpaceOnUse">${g.stops.map(s=>`<stop offset="${number(s.offset*100)}%" stop-color="${xml(s.color)}"/>`).join("")}</linearGradient>`).join(""); return `<svg xmlns="http://www.w3.org/2000/svg" width="${number(this.width)}" height="${number(this.height)}" viewBox="0 0 ${number(this.width)} ${number(this.height)}"><defs>${defs}</defs>${this.children.join("")}</svg>`; }
  private emitPath(fill:Paint,stroke:Paint):void { if(!this.path.length)return; this.children.push(`<path d="${this.path.join(" ")}" ${this.paint(fill,"fill")} ${this.paint(stroke,"stroke")} ${stroke==="none"?"":this.strokeAttributes()} ${this.commonStyle(this.pathTransform)}/>`); }
  private paint(value:Paint,attribute:"fill"|"stroke"):string { return `${attribute}="${value instanceof SvgLinearGradient?`url(#${value.id})`:xml(value)}"`; }
  private strokeAttributes():string { const dash=this.state.lineDash.length?` stroke-dasharray="${this.state.lineDash.map(number).join(" ")}"`:""; return `stroke-width="${number(this.state.lineWidth)}" stroke-linecap="${this.state.lineCap}" stroke-linejoin="${this.state.lineJoin}"${dash}`; }
  private commonStyle(transform=this.state.transform):string { const [a,b,c,d,e,f]=transform; const matrix=a===1&&b===0&&c===0&&d===1&&e===0&&f===0?"":` transform="matrix(${[a,b,c,d,e,f].map(number).join(" ")})"`; const opacity=this.state.globalAlpha===1?"":` opacity="${number(this.state.globalAlpha)}"`; return `${matrix}${opacity}`; }
}
