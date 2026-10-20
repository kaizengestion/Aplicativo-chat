/**
 * Flyers que se muestran a los costados del chat público cuando se abre en una pantalla de PC.
 * Izquierda: ASSISTANT_FLYER. Derecha: un flyer que va rotando entre las SOLUTIONS.
 * style elige el diseño: "red" (fondo rojo), "paper" (fondo claro) o "dark" (fondo oscuro con franja roja).
 * art agrega un dibujo: "logo" o "chat".
 * Si tenés el flyer como imagen, ponela en /public/promos/ y usá image: "/promos/archivo.jpg" (reemplaza el diseño).
 */
export type Flyer = {
  kicker: string;
  title: string;
  text?: string;
  cta?: string;
  style: "red" | "paper" | "dark";
  art?: "logo" | "chat";
  image?: string;
};

export const ASSISTANT_FLYER: Flyer = {
  kicker: "Kaizen Gestión",
  title: "¿Querés tener un asistente virtual como este?",
  text: "Atiende a tus clientes al instante desde el enlace de tu WhatsApp, con tu marca.",
  cta: "Pedilo por este chat",
  style: "red",
  art: "logo",
};

/** Soluciones que van rotando en el flyer de la derecha (una cada pocos segundos). Sumá o cambiá las que quieras. */
export const SOLUTIONS_KICKER = "Soluciones Kaizen";
export const SOLUTIONS: { title: string; text: string }[] = [
  { title: "Asistente con IA en WhatsApp", text: "Tus clientes tocan el enlace y un asistente que conoce tu negocio les responde al instante." },
  { title: "Tablero de conversaciones", text: "Todas las charlas y contactos en un solo lugar, para dar seguimiento a cada cliente." },
  { title: "Preguntale a tus datos", text: "Consultá en lenguaje natural qué preguntan tus clientes y cuántos te escribieron." },
  { title: "Una persona cuando hace falta", text: "Si el cliente lo necesita, alguien de tu equipo toma la conversación." },
];
