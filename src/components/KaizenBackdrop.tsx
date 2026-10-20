"use client";
import { useEffect, useRef } from "react";
import { DISENOS, type Lienzo } from "./backdrops";

/*
  Fondo generativo del chat público, con el estilo del bot de imágenes de Instagram de Kaizen.
  Cada visita muestra uno de los diseños de backdrops.ts, distinto del de la visita anterior, con
  una semilla nueva. Para ver uno en particular: /c/<negocio>?fondo=<nombre> (por ejemplo ?fondo=red).

  Colores: salen de las variables de globals.css (--bg, --text, --accent), así sigue al tema.
  Va detrás de todo (position: fixed, z-index -1) y el chat le pone encima un velo (.chat-page .chat).
*/

const GRIS_NODO = "201, 201, 201";
const ULTIMO = "kaizen-fondo-ultimo";

export default function KaizenBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const semilla = Math.floor(Math.random() * 2 ** 31);
    const diseno = elegirDiseno();
    let cuadro = 0;

    function pintar() {
      cancelAnimationFrame(cuadro);
      const css = getComputedStyle(document.documentElement);
      const fondo = css.getPropertyValue("--bg").trim() || "#181615";
      const W = window.innerWidth, H = window.innerHeight;
      canvas!.width = W;
      canvas!.height = H;
      canvas!.style.opacity = "0";
      ctx!.setTransform(1, 0, 0, 1, 0, 0);
      ctx!.globalAlpha = 1;
      ctx!.fillStyle = fondo;
      ctx!.fillRect(0, 0, W, H);
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";

      const lienzo: Lienzo = {
        ctx: ctx!, W, H,
        U: Math.max(0.7, Math.min(W, H) / 1080),
        R: mulberry32(semilla),
        ruido: perlin(semilla),
        color: {
          fondo: rgb(fondo) ?? "24, 22, 21",
          trazo: rgb(css.getPropertyValue("--text").trim()) ?? "245, 242, 236",
          linea: GRIS_NODO,
          acento: rgb(css.getPropertyValue("--accent").trim()) ?? "232, 54, 74",
        },
      };
      // El diseño puede repartir su trabajo en varios cuadros para no trabar la página.
      const pasos = diseno.pintar(lienzo);
      const seguir = () => {
        if (pasos.next().done) canvas!.style.opacity = String(diseno.opacidad);
        else cuadro = requestAnimationFrame(seguir);
      };
      cuadro = requestAnimationFrame(seguir);
    }

    pintar();
    // Al girar el celular o cambiar el tamaño de la ventana se repinta con la misma semilla.
    let espera: ReturnType<typeof setTimeout>;
    let medida = `${window.innerWidth}x${window.innerHeight}`;
    const alCambiar = () => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        const nueva = `${window.innerWidth}x${window.innerHeight}`;
        if (nueva !== medida) { medida = nueva; pintar(); }
      }, 300);
    };
    window.addEventListener("resize", alCambiar);
    return () => {
      cancelAnimationFrame(cuadro);
      clearTimeout(espera);
      window.removeEventListener("resize", alCambiar);
    };
  }, []);

  return <canvas ref={ref} className="kaizen-backdrop" aria-hidden="true" />;
}

/** El diseño de esta visita: el pedido en ?fondo=, o uno al azar distinto del de la visita anterior. */
function elegirDiseno() {
  const pedido = new URLSearchParams(window.location.search).get("fondo");
  const elegido = DISENOS.find((d) => d.nombre === pedido);
  if (elegido) return elegido;
  let ultimo: string | null = null;
  try { ultimo = localStorage.getItem(ULTIMO); } catch {}
  const opciones = DISENOS.filter((d) => d.nombre !== ultimo);
  const diseno = opciones[Math.floor(Math.random() * opciones.length)];
  try { localStorage.setItem(ULTIMO, diseno.nombre); } catch {}
  return diseno;
}

/** "#rrggbb" → "r, g, b" para armar rgba(). */
function rgb(hex: string): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** Generador de números al azar con semilla: la misma semilla da el mismo fondo. */
function mulberry32(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruido de Perlin 3D con semilla, devuelto en 0..1 como el noise() de p5. */
function perlin(semilla: number) {
  const azar = mulberry32(semilla ^ 0x9e3779b9);
  const p = new Uint8Array(512);
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];

  const suave = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const mezcla = (a: number, b: number, t: number) => a + t * (b - a);
  const grad = (h: number, x: number, y: number, z: number) => {
    const g = h & 15;
    const u = g < 8 ? x : y;
    const v = g < 4 ? y : g === 12 || g === 14 ? x : z;
    return ((g & 1) ? -u : u) + ((g & 2) ? -v : v);
  };

  return (x: number, y: number, z: number) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = suave(x), v = suave(y), w = suave(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    const n = mezcla(
      mezcla(mezcla(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u),
        mezcla(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
      mezcla(mezcla(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u),
        mezcla(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v),
      w,
    );
    return (n + 1) / 2;
  };
}
