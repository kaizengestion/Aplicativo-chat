"use client";
import { useEffect, useRef } from "react";
import type { Message } from "@/lib/db";

/** perspective "contact": el cliente ve sus mensajes a la derecha. "agent": el equipo ve los suyos y los del bot a la derecha. */
export default function MessageList({ messages, perspective, botName, typing, fileUrl }: {
  messages: Message[]; perspective: "contact" | "agent"; botName: string; typing?: boolean;
  /** Dirección para ver o escuchar un adjunto (cambia entre el chat público y el tablero). */
  fileUrl: (attachmentId: string) => string;
}) {
  const end = useRef<HTMLDivElement>(null);
  // Con llaves: en navegadores nuevos scrollIntoView devuelve una promesa y React la trataría como función de limpieza.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typing]);

  return (
    <div className="chat-body">
      {messages.map((m) => {
        if (m.sender === "system") {
          return perspective === "agent" ? <div key={m.id} className="sys">{m.content}</div> : null;
        }
        const mine = perspective === "contact" ? m.sender === "contact" : m.sender !== "contact";
        const who = m.sender === "bot" ? botName : m.sender === "agent" ? (m.agent_name ?? "Equipo") : perspective === "agent" ? "Cliente" : null;
        return (
          <div key={m.id} className={`bubble ${mine ? "me" : "them"} ${m.sender === "agent" && !mine ? "agent" : ""}`}>
            {who && !(perspective === "contact" && mine) && <span className="who">{who}</span>}
            {m.attachment && <Attachment a={m.attachment} url={fileUrl(m.attachment.id)} />}
            {m.attachment?.kind === "audio"
              ? <span className="transcript">{m.content || "Audio sin transcripción"}</span>
              : m.content}
          </div>
        );
      })}
      {typing && <div className="typing">{botName} está escribiendo…</div>}
      <div ref={end} />
    </div>
  );
}

function Attachment({ a, url }: { a: NonNullable<Message["attachment"]>; url: string }) {
  if (a.kind === "image") {
    return <a href={url} target="_blank" rel="noreferrer" className="att-image"><img src={url} alt={a.name} loading="lazy" /></a>;
  }
  if (a.kind === "audio") return <audio className="att-audio" controls preload="metadata" src={url} />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="att-file">
      <span aria-hidden="true">📄</span> {a.name}
    </a>
  );
}
