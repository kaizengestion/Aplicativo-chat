/**
 * Flyers que se muestran a los costados del chat público cuando se abre en una pantalla de PC.
 * Para cambiar uno, editá esta lista. style elige el diseño: "red" (fondo rojo), "paper" (fondo claro)
 * o "dark" (fondo oscuro con franja roja). art agrega un dibujo: "logo" o "chat".
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

export const LEFT_FLYERS: Flyer[] = [
  {
    kicker: "Kaizen Gestión",
    title: "Mejora continua para tu negocio",
    text: "Escribinos y te ayudamos a que tu negocio crezca.",
    cta: "Consultanos acá",
    style: "red",
    art: "logo",
  },
  {
    kicker: "Atención al instante",
    title: "Respuestas las 24 horas",
    text: "Tus clientes nunca se quedan esperando.",
    style: "paper",
  },
];

export const RIGHT_FLYERS: Flyer[] = [
  {
    kicker: "Trabajo realizado",
    title: "Chat de ayuda con IA",
    text: "Este mismo chat: atiende a los clientes que llegan desde WhatsApp y deja todo en un tablero.",
    style: "dark",
    art: "chat",
  },
  {
    kicker: "¿Lo querés para tu negocio?",
    title: "Un chat como este, con tu marca",
    cta: "Pedilo por este chat",
    style: "red",
  },
];
