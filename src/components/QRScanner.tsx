import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, X, Type, Check } from "lucide-react";

interface QRScannerProps {
  onComplete: (qrs: string[]) => void;
  onCancel?: () => void;
}

export function QRScanner({ onComplete, onCancel }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [captured, setCaptured] = useState<string[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualText, setManualText] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (mode !== "camera") return;
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          tick();
        }
      } catch (e: any) {
        setError(e?.message ?? "Não foi possível acessar a câmera. Use a entrada manual.");
      }
    }

    function tick() {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c || v.readyState !== v.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
      if (code?.data) {
        registerQR(code.data);
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function registerQR(data: string) {
    const m = data.match(/^QRBU:(\d+):(\d+)/);
    if (!m) return; // não é BU
    const totalMatch = parseInt(m[2], 10);
    setTotal(totalMatch);
    setCaptured((prev) => {
      if (prev.includes(data)) return prev;
      // beep
      try {
        const ctx = new AudioContext();
        const o = ctx.createOscillator();
        o.frequency.value = 880;
        o.connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.08);
      } catch {}
      const next = [...prev, data];
      if (next.length >= totalMatch) {
        setTimeout(() => onComplete(next), 200);
      }
      return next;
    });
  }

  function submitManual() {
    const trimmed = manualText.trim();
    if (!trimmed) return;
    registerQR(trimmed);
    setManualText("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-mono-label">
          {captured.length} / {total ?? "?"} QR Codes
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setMode("camera")}
            className={`flex items-center gap-1 rounded-sm px-2 py-1 text-[10px] font-bold uppercase ${mode === "camera" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}
          >
            <Camera className="size-3" /> Câmera
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`flex items-center gap-1 rounded-sm px-2 py-1 text-[10px] font-bold uppercase ${mode === "manual" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}
          >
            <Type className="size-3" /> Manual
          </button>
        </div>
      </div>

      {mode === "camera" ? (
        <div className="relative aspect-square w-full overflow-hidden rounded-sm border border-border bg-black">
          <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="pointer-events-none absolute inset-8 rounded-sm border-2 border-accent/80" />
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-xs text-white">
              {error}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Cole o conteúdo do QR Code aqui (começa com QRBU:1:N ...)"
            rows={6}
            className="w-full rounded-sm border border-border bg-background p-3 font-mono text-xs"
          />
          <button
            onClick={submitManual}
            className="w-full rounded-sm bg-primary px-3 py-2 text-xs font-bold uppercase text-primary-foreground"
          >
            Adicionar QR
          </button>
        </div>
      )}

      {captured.length > 0 && (
        <ul className="space-y-1">
          {captured.map((q, i) => (
            <li key={i} className="flex items-center gap-2 rounded-sm border border-border bg-card p-2 text-[11px]">
              <Check className="size-3 text-success" />
              <span className="font-mono text-muted-foreground truncate">QR {i + 1}: {q.slice(0, 30)}…</span>
            </li>
          ))}
        </ul>
      )}

      {onCancel && (
        <button onClick={onCancel} className="flex items-center justify-center gap-1 text-[11px] font-bold uppercase text-muted-foreground">
          <X className="size-3" /> Cancelar
        </button>
      )}
    </div>
  );
}
