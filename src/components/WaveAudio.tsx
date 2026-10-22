"use client";
import { useEffect, useId, useRef, useState } from "react";

const BARS = 36;
const W = 200;
const H = 40;

/** Reproductor de audio con forma de onda curva. */
export default function WaveAudio({ src }: { src: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const clip = useId();

  // Las ondas salen del audio real; si el navegador no puede decodificarlo, quedan barras parejas.
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const buf = await (await fetch(src)).arrayBuffer();
        const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(buf);
        if (cancel) return;
        setDuration(decoded.duration);
        setPeaks(toPeaks(decoded.getChannelData(0)));
      } catch {
        if (!cancel) setPeaks(Array(BARS).fill(0.35));
      }
    })();
    return () => { cancel = true; };
  }, [src]);

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }

  function seek(e: React.MouseEvent<SVGSVGElement>) {
    const a = audio.current;
    const total = duration || a?.duration;
    if (!a || !total || !Number.isFinite(total)) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * total;
    setTime(a.currentTime);
  }

  const total = duration || 0;
  const progress = total ? time / total : 0;
  const bars = peaks ?? Array(BARS).fill(0.15);

  return (
    <div className="wave-audio">
      <audio
        ref={audio} src={src} preload="none"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setTime(0); }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (!duration && Number.isFinite(d)) setDuration(d); }}
      />
      <button type="button" className="wave-play" onClick={toggle} aria-label={playing ? "Pausar audio" : "Reproducir audio"}>
        {playing ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
        )}
      </button>
      <svg className="wave-shape" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onClick={seek} role="presentation">
        <clipPath id={clip}><rect width={progress * W} height={H} /></clipPath>
        <path d={wavePath(bars)} className="wave-rest" />
        <path d={wavePath(bars)} clipPath={`url(#${clip})`} />
      </svg>
      <span className="wave-time">{clock(playing || time ? time : total)}</span>
    </div>
  );
}

/** Reduce las muestras a BARS alturas entre 0 y 1 (pico de cada tramo, normalizado al más alto). */
function toPeaks(data: Float32Array) {
  const step = Math.max(1, Math.floor(data.length / BARS));
  const peaks: number[] = [];
  for (let b = 0; b < BARS; b++) {
    let max = 0;
    for (let i = b * step; i < Math.min(data.length, (b + 1) * step); i++) max = Math.max(max, Math.abs(data[i]));
    peaks.push(max);
  }
  const top = Math.max(...peaks) || 1;
  return peaks.map((p) => p / top);
}

/** Contorno suave y simétrico (arriba y abajo de la línea media) que pasa por las alturas dadas. */
function wavePath(peaks: number[]) {
  const mid = H / 2;
  // Promedia cada altura con sus vecinas para que la onda quede redondeada y no en picos.
  const soft = peaks.map((p, i) => (peaks[Math.max(0, i - 1)] + 2 * p + peaks[Math.min(peaks.length - 1, i + 1)]) / 4);
  const pts = soft.map((p, i) => [(i / (soft.length - 1)) * W, Math.max(0.15, p) * (mid - 1)]);
  pts.unshift([0, 0.5]);
  pts.push([W, 0.5]);
  const curve = (sign: 1 | -1, list: number[][]) => {
    let d = "";
    for (let i = 0; i < list.length - 1; i++) {
      const [x0, h0] = list[Math.max(0, i - 1)], [x1, h1] = list[i], [x2, h2] = list[i + 1], [x3, h3] = list[Math.min(list.length - 1, i + 2)];
      const y = (h: number) => (mid - sign * h).toFixed(2);
      d += ` C${(x1 + (x2 - x0) / 6).toFixed(2)},${y(h1 + (h2 - h0) / 6)} ${(x2 - (x3 - x1) / 6).toFixed(2)},${y(h2 - (h3 - h1) / 6)} ${x2.toFixed(2)},${y(h2)}`;
    }
    return d;
  };
  const back = [...pts].reverse();
  return `M0,${mid - 0.5}${curve(1, pts)} L${W},${mid + 0.5}${curve(-1, back)} Z`;
}

function clock(s: number) {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
