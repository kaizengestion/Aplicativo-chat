"use client";
import { useEffect, useRef, useState } from "react";
import AutoGrowTextarea from "@/components/AutoGrowTextarea";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_RECORD_SECONDS = 120;
const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,application/pdf";
// Chrome/Firefox graban webm; Safari (iPhone) graba mp4.
const RECORD_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export type Outgoing = { content: string; file?: File; transcript?: string };

// Reconocimiento de voz del navegador (Chrome, Safari): pasa el audio a texto gratis mientras se graba.
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start(): void; stop(): void;
};
function newRecognition(): Recognition | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/** Zona de escritura del chat público: texto, clip para adjuntar fotos o PDF, y micrófono para mandar audios. */
export default function Composer({ disabled, onSend, onError, dropped }: {
  disabled: boolean; onSend: (m: Outgoing) => Promise<boolean>; onError: (msg: string) => void;
  /** Archivo que el cliente arrastró y soltó sobre el chat (queda listo para enviar, como con el clip). */
  dropped?: { file: File } | null;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const picker = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const discard = useRef(false);
  const speech = useRef<{ r: Recognition; text: string; interim: string; live: boolean; ended: Promise<void> } | null>(null);
  const [speechNote, setSpeechNote] = useState("");

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => {
    if (recording && seconds >= MAX_RECORD_SECONDS) recorder.current?.stop();
  }, [recording, seconds]);

  // Si se cierra la página grabando, soltar el micrófono.
  useEffect(() => () => { discard.current = true; recorder.current?.stop(); }, []);

  useEffect(() => { if (dropped) accept(dropped.file); }, [dropped]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) accept(f);
  }

  async function accept(f: File) {
    if (!ACCEPT.split(",").includes(f.type)) return onError("Solo se pueden mandar fotos o PDF.");
    onError("");
    setPreparing(true);
    const ready = f.type.startsWith("image/") && f.type !== "image/gif" ? await shrinkImage(f) : f;
    setPreparing(false);
    if (ready.size > MAX_BYTES) return onError("El archivo es muy grande (máximo 4 MB).");
    setFile(ready);
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const content = text.trim();
    if ((!content && !file) || disabled) return;
    const sent = { content, file: file ?? undefined };
    setText("");
    setFile(null);
    if (!(await onSend(sent))) {
      setText(content);
      setFile(sent.file ?? null);
    }
  }

  async function startRecording() {
    onError("");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return onError("Tu navegador no permite grabar audios. Puedes escribir tu mensaje.");
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return onError("No pudimos usar el micrófono. Revisa el permiso del navegador para este sitio.");
    }
    const mimeType = RECORD_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const transcript = await finishSpeech();
      setRecording(false);
      recorder.current = null;
      if (discard.current || !chunks.length) return;
      const type = (rec.mimeType || mimeType || "audio/webm").split(";")[0];
      const ext = type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm";
      const audio = new File(chunks, `audio-${Date.now()}.${ext}`, { type });
      if (audio.size > MAX_BYTES) return onError("El audio es muy largo. Prueba con uno más corto.");
      onSend({ content: "", file: audio, transcript });
    };
    discard.current = false;
    recorder.current = rec;
    setSeconds(0);
    setRecording(true);
    rec.start(1000);
    startSpeech();
  }

  function startSpeech() {
    setSpeechNote("");
    const r = newRecognition();
    if (!r) return setSpeechNote("Este navegador no pasa la voz a texto; el audio se envía igual.");
    let done!: () => void;
    const s = { r, text: "", interim: "", live: true, ended: new Promise<void>((res) => { done = res; }) };
    r.lang = speechLang();
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal) s.text += `${t} `;
        else interim += `${t} `;
      }
      s.interim = interim.trim();
    };
    // Algunos celulares cortan el reconocimiento en cada pausa: se reanuda mientras se siga grabando.
    r.onend = () => { if (s.live) { try { r.start(); return; } catch {} } done(); };
    // Brave y otros navegadores tienen el reconocimiento pero sin servicio ("network"): se avisa y el audio va igual.
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      s.live = false;
      setSpeechNote("Este navegador no pasa la voz a texto; el audio se envía igual.");
    };
    speech.current = s;
    try { r.start(); } catch { speech.current = null; }
  }

  /** Detiene el reconocimiento y espera (hasta 2 s) los últimos resultados. */
  async function finishSpeech() {
    const s = speech.current;
    speech.current = null;
    if (!s) return "";
    s.live = false;
    try { s.r.stop(); } catch {}
    await Promise.race([s.ended, new Promise((r) => setTimeout(r, 2000))]);
    return `${s.text}${s.interim}`.trim();
  }

  function stopRecording(send: boolean) {
    discard.current = !send;
    recorder.current?.stop();
  }

  if (recording) {
    return (
      <div className="chat-input recording">
        <span className="rec-dot" aria-hidden="true" />
        <span className="rec-time" aria-live="polite">
          Grabando {clock(seconds)}
          {speechNote && <span className="rec-heard">{speechNote}</span>}
        </span>
        <button type="button" className="icon-btn" onClick={() => stopRecording(false)} aria-label="Cancelar audio" title="Cancelar">
          <TrashIcon />
        </button>
        <button type="button" className="primary" onClick={() => stopRecording(true)}>Enviar audio</button>
      </div>
    );
  }

  return (
    <div className="composer">
      {file && (
        <div className="att-chip">
          {preview ? <img src={preview} alt="" /> : <span aria-hidden="true">📄</span>}
          <span className="att-chip-name">{file.name}</span>
          <button type="button" className="icon-btn small" onClick={() => setFile(null)} aria-label="Quitar archivo">✕</button>
        </div>
      )}
      <form className="chat-input" onSubmit={submit}>
        <AutoGrowTextarea
          value={text} onChange={(e) => setText(e.target.value)} rows={1}
          placeholder={file ? "Agrega un comentario (opcional)" : "Escribe tu mensaje"}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        />
        <input ref={picker} type="file" accept={ACCEPT} hidden onChange={pick} />
        <button type="button" className="icon-btn" onClick={() => picker.current?.click()} disabled={disabled || preparing}
          aria-label="Adjuntar foto o PDF" title="Adjuntar foto o PDF">
          <ClipIcon />
        </button>
        <button type="button" className="icon-btn" onClick={startRecording} disabled={disabled}
          aria-label="Grabar audio" title="Grabar audio">
          <MicIcon />
        </button>
        <button className="primary" disabled={disabled || preparing || (!text.trim() && !file)}>Enviar</button>
      </form>
    </div>
  );
}

/** Idioma para el reconocimiento: el del navegador, con una variante concreta para el español genérico. */
function speechLang() {
  const l = navigator.language || "es";
  return /^es(-419)?$/i.test(l) ? "es-MX" : l;
}

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Achica fotos grandes (las del celular pesan varios MB) a 1600 px de lado como JPEG. */
async function shrinkImage(f: File): Promise<File> {
  try {
    const img = await createImageBitmap(f);
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    if (scale === 1 && f.size < 1.5 * 1024 * 1024) return f;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return f;
    return new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return f;
  }
}

function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}
