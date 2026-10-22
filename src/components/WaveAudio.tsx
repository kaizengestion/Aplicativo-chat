"use client";
import { useEffect, useRef, useState } from "react";

const BARS = 36;

/** Reproductor de audio con forma de ondas (como los audios de WhatsApp). */
export default function WaveAudio({ src }: { src: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

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

  function seek(e: React.MouseEvent<HTMLDivElement>) {
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
      <div className="wave-bars" onClick={seek} role="presentation">
        {bars.map((p, i) => (
          <span key={i} className={(i + 0.5) / bars.length <= progress ? "on" : ""} style={{ height: `${Math.max(12, p * 100)}%` }} />
        ))}
      </div>
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

function clock(s: number) {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
