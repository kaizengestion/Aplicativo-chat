"use client";
import { useEffect, useRef } from "react";
import type { Message } from "@/lib/db";

/** perspective "contact": el cliente ve sus mensajes a la derecha. "agent": el equipo ve los suyos y los del bot a la derecha. */
export default function MessageList({ messages, perspective, botName, typing }: {
  messages: Message[]; perspective: "contact" | "agent"; botName: string; typing?: boolean;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [messages.length, typing]);

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
            {m.content}
          </div>
        );
      })}
      {typing && <div className="typing">{botName} está escribiendo…</div>}
      <div ref={end} />
    </div>
  );
}
