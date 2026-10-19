/**
 * Lo que se muestra a los costados del chat público cuando se abre en una pantalla de PC.
 * Para cambiar un flyer o un trabajo, editá esta lista. Las imágenes van en /public/promos/
 * y se ponen como image: "/promos/archivo.jpg" (si no hay imagen, se muestra solo el texto).
 */
export type Promo = { title: string; text: string; image?: string };

export const FLYERS: Promo[] = [
  {
    title: "Kaizen Gestión",
    text: "Mejora continua para tu negocio. Escribinos por este chat y te ayudamos.",
  },
  {
    title: "¿Querés un chat como este?",
    text: "Atendé a tus clientes al instante desde el enlace de tu WhatsApp, con un asistente que conoce tu negocio.",
  },
];

export const WORKS: Promo[] = [
  {
    title: "Chat de ayuda con IA",
    text: "Este mismo chat: responde a los clientes que llegan desde WhatsApp y deja todo en un tablero.",
  },
];
