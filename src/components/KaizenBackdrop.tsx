"use client";
import { useEffect, useRef } from "react";

/*
  Fondo generativo del chat público: «Deriva Incremental», el mismo motor que usa el bot de
  imágenes de Instagram de Kaizen (kaizen-marketing, plantillas/fondo.js), con el carácter de la
  rama «bots» (red y nodos).

  - Nada se dibuja: se deposita. Miles de partículas recorren un campo de ruido y la imagen es la
    densidad que dejan.
  - El rojo no se coloca, se gana: un trazo es rojo solo donde el campo se tuerce más que el
    percentil de esta semilla. Es la regla de marca «el rojo es acento, nunca relleno».
  - Cada visita trae una semilla nueva, así que el fondo cambia pero siempre es de la misma familia.

  Colores: salen de las variables de globals.css (--bg, --text, --accent), así sigue al tema.
  Va detrás de todo (position: fixed, z-index -1) y el chat le pone encima un velo (.chat-page .chat).
*/

const P = {
  // Rama «bots» de fondo.js: pasos cortos y muchas partículas, textura de puntos que se conectan.
  octavas: 4,
  escalaRuido: 0.0019,
  largoPaso: 1.5,
  pasos: 170,
  // 5200 partículas en el lienzo de 1536×2048 de Instagram; acá se escala al área de la pantalla.
  particulasPorPixel: 5200 / (1536 * 2048),
  percentilAcento: 0.9,
  miradaAdelante: 16,
  // Más tenue que en Instagram: acá el fondo acompaña, no es la pieza.
  alfaTrazo: 0.075,
  alfaAcento: 0.16,
  mezclaGris: 0.28,
  grosor: 1,
};
const GRIS_NODO = "201, 201, 201";
// Partículas por cuadro: reparte el cálculo para no trabar la página mientras se pinta.
const POR_CUADRO = 250;

export default function KaizenBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const semilla = Math.floor(Math.random() * 2 ** 31);
    let cuadro = 0;

    function pintar() {
      cancelAnimationFrame(cuadro);
      const css = getComputedStyle(document.documentElement);
      const fondo = css.getPropertyValue("--bg").trim() || "#181615";
      const trazo = rgb(css.getPropertyValue("--text").trim()) ?? "245, 242, 236";
      const acento = rgb(css.getPropertyValue("--accent").trim()) ?? "232, 54, 74";

      const ancho = window.innerWidth;
      const alto = window.innerHeight;
      canvas!.width = ancho;
      canvas!.height = alto;
      canvas!.style.opacity = "0";

      const azar = mulberry32(semilla);
      const ruido = perlin(semilla);
      const angulo = (x: number, y: number) => {
        let v = 0, amplitud = 1, frecuencia = P.escalaRuido, total = 0;
        for (let o = 0; o < P.octavas; o++) {
          v += amplitud * ruido(x * frecuencia, y * frecuencia, o * 19.37);
          total += amplitud;
          amplitud *= 0.5;
          frecuencia *= 2.1;
        }
        return (v / total) * Math.PI * 2 * 2.2;
      };
      const torsion = (x: number, y: number, a: number) =>
        Math.abs(angulo(x + Math.cos(a) * P.miradaAdelante, y + Math.sin(a) * P.miradaAdelante) - a);

      // Umbral de acento por percentil de esta semilla: así la proporción de rojo es estable.
      const muestras: number[] = [];
      for (let i = 0; i < 2000; i++) {
        const x = azar() * ancho, y = azar() * alto;
        muestras.push(torsion(x, y, angulo(x, y)));
      }
      muestras.sort((a, b) => a - b);
      const umbral = muestras[Math.floor(muestras.length * P.percentilAcento)];

      ctx!.fillStyle = fondo;
      ctx!.fillRect(0, 0, ancho, alto);
      ctx!.lineWidth = P.grosor;
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";

      const total = Math.round(ancho * alto * P.particulasPorPixel);
      let hechas = 0;

      // Cada partícula es una polilínea; se corta en tramos cuando cambia entre color base y rojo.
      // Cada tramo es un trazo aparte, así las superposiciones acumulan tinta como en el original.
      function tramo(puntos: number[], color: string) {
        if (puntos.length < 4) return;
        ctx!.strokeStyle = color;
        ctx!.beginPath();
        ctx!.moveTo(puntos[0], puntos[1]);
        for (let i = 2; i < puntos.length; i += 2) ctx!.lineTo(puntos[i], puntos[i + 1]);
        ctx!.stroke();
      }

      function lote() {
        const fin = Math.min(total, hechas + POR_CUADRO);
        for (; hechas < fin; hechas++) {
          let x = azar() * ancho;
          let y = azar() * alto;
          const base = `rgba(${azar() < P.mezclaGris ? GRIS_NODO : trazo}, ${P.alfaTrazo})`;
          const rojo = `rgba(${acento}, ${P.alfaAcento})`;
          let puntos = [x, y];
          let esRojo = false;
          for (let paso = 0; paso < P.pasos; paso++) {
            const a = angulo(x, y);
            const nx = x + Math.cos(a) * P.largoPaso;
            const ny = y + Math.sin(a) * P.largoPaso;
            if (nx < 0 || nx > ancho || ny < 0 || ny > alto) break;
            const ahoraRojo = torsion(x, y, a) > umbral;
            if (ahoraRojo !== esRojo) {
              tramo(puntos, esRojo ? rojo : base);
              puntos = [x, y];
              esRojo = ahoraRojo;
            }
            puntos.push(nx, ny);
            x = nx;
            y = ny;
          }
          tramo(puntos, esRojo ? rojo : base);
        }
        if (hechas < total) cuadro = requestAnimationFrame(lote);
        else canvas!.style.opacity = "1";
      }
      cuadro = requestAnimationFrame(lote);
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
