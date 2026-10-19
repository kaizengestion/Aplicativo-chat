export default function StatusBadge({ status, needsHuman }: { status: string; needsHuman?: boolean }) {
  return (
    <span className="row" style={{ gap: "0.375rem", display: "inline-flex" }}>
      {needsHuman && status !== "closed" && <span className="badge warn">Necesita persona</span>}
      <span className={`badge ${status}`}>{status === "bot" ? "Bot" : status === "human" ? "Humano" : "Cerrada"}</span>
    </span>
  );
}
