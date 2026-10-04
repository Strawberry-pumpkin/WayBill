"use client";
import { useCallback, useEffect, useRef } from "react";

/** Finger/stylus signature capture. Reports a PNG blob (or null when cleared). */
export default function SignaturePad({ onChange, label }: { onChange: (blob: Blob | null) => void; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const setup = useCallback(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#121212";
  }, []);

  useEffect(() => {
    setup();
  }, [setup]);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pos(e);
    const ctx = ref.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y); // a tap leaves a dot
    ctx.stroke();
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const { x, y } = pos(e);
    const ctx = ref.current!.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    // White background so the PNG is legible when viewed on any theme.
    const c = ref.current!;
    const out = document.createElement("canvas");
    out.width = c.width;
    out.height = c.height;
    const octx = out.getContext("2d")!;
    octx.fillStyle = "#fff";
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(c, 0, 0);
    out.toBlob((b) => onChange(dirty.current ? b : null), "image/png");
  }
  function clear() {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    onChange(null);
  }

  return (
    <div className="stack">
      <div className="row-between">
        <span className="t-label t-secondary">{label}</span>
        <button type="button" className="btn btn-ghost" style={{ height: 44, padding: "0 12px" }} onClick={clear}>Clear</button>
      </div>
      <canvas ref={ref} className="sigpad" role="img" aria-label="Signature area: sign with your finger" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
    </div>
  );
}
