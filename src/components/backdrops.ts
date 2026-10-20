/*
  Diseños del fondo del chat público. Cada visita muestra uno (ver KaizenBackdrop.tsx).

  Salen del bot de imágenes de Instagram de Kaizen (kaizen-marketing): «Deriva Incremental»
  (plantillas/fondo.js) y los seis motivos de plantillas/motivos.js (curvas de nivel, plano, red,
  ondas, rayas, medios tonos). Se suman «columnas» y «cuadrados», hechos con las mismas reglas:
  - Una sola paleta: tinta de fondo, trazos papel y gris nodo, y el rojo solo como acento.
  - El rojo no rellena: unas pocas curvas, cruces, un camino, una barra.
  - Todo el azar sale de la semilla: la misma semilla da el mismo dibujo.

  Un diseño es una función generadora: puede hacer `yield` para repartir el trabajo pesado en
  varios cuadros y no trabar la página. Los que son baratos dibujan todo de una.
*/

export type Lienzo = {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  /** Unidad de medida: 1 en una pantalla de 1080 de alto, nunca menos de 0,7. */
  U: number;
  /** Número al azar 0..1 con semilla. */
  R: () => number;
  /** Ruido de Perlin 3D con semilla, en 0..1. */
  ruido: (x: number, y: number, z: number) => number;
  /** Colores como "r, g, b" para armar rgba(). */
  color: { fondo: string; trazo: string; linea: string; acento: string };
};

export type Diseno = {
  nombre: string;
  /** Opacidad final del lienzo: cuánto se nota el diseño sobre el fondo liso. */
  opacidad: number;
  pintar: (l: Lienzo) => Generator<void, void, void>;
};

const rgba = (c: string, a: number) => `rgba(${c}, ${a})`;
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Ruido fractal centrado en 0, de -0,5 a 0,5 aprox. */
function fbm(l: Lienzo, x: number, y: number, octavas: number, z = 0) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < octavas; i++) {
    s += a * (l.ruido(x * f, y * f, z + i * 7.1) - 0.5);
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return s / n;
}

/** Una esquina al azar del lienzo, un poco hacia afuera. */
function esquina(l: Lienzo, afuera: number) {
  const der = l.R() < 0.5, abajo = l.R() < 0.6;
  return { x: der ? l.W + afuera : -afuera, y: abajo ? l.H + afuera : -afuera };
}

/** Capa aparte: se dibuja ahí, se enmascara con un degradé y se pega en el lienzo. */
function capa(l: Lienzo) {
  const c = document.createElement("canvas");
  c.width = l.W;
  c.height = l.H;
  const ctx = c.getContext("2d")!;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return { c, ctx };
}
function pegarConRadial(l: Lienzo, k: { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D }, cx: number, cy: number, r: number, paradas: [number, number][]) {
  k.ctx.globalCompositeOperation = "destination-in";
  const g = k.ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  paradas.forEach(([o, a]) => g.addColorStop(o, `rgba(0,0,0,${a})`));
  k.ctx.fillStyle = g;
  k.ctx.fillRect(0, 0, l.W, l.H);
  l.ctx.drawImage(k.c, 0, 0);
}

// ---------- Deriva Incremental: partículas que recorren un campo de ruido (rama «bots») ----------
function* deriva(l: Lienzo) {
  const { ctx, W, H, R, ruido, color } = l;
  const P = {
    octavas: 4, escalaRuido: 0.0019, largoPaso: 1.5, pasos: 170, particulasPorPixel: 5200 / (1536 * 2048),
    percentilAcento: 0.9, miradaAdelante: 16, alfaTrazo: 0.075, alfaAcento: 0.16, mezclaGris: 0.28,
  };
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

  // El rojo se gana: solo donde el campo se tuerce más que el percentil de esta semilla.
  const muestras: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const x = R() * W, y = R() * H;
    muestras.push(torsion(x, y, angulo(x, y)));
  }
  muestras.sort((a, b) => a - b);
  const umbral = muestras[Math.floor(muestras.length * P.percentilAcento)];
  ctx.lineWidth = 1;

  // Cada tramo es un trazo aparte, así las superposiciones acumulan tinta como en el original.
  const tramo = (puntos: number[], c: string) => {
    if (puntos.length < 4) return;
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.moveTo(puntos[0], puntos[1]);
    for (let i = 2; i < puntos.length; i += 2) ctx.lineTo(puntos[i], puntos[i + 1]);
    ctx.stroke();
  };
  const rojo = rgba(color.acento, P.alfaAcento);
  const total = Math.round(W * H * P.particulasPorPixel);
  for (let n = 0; n < total; n++) {
    let x = R() * W, y = R() * H;
    const base = rgba(R() < P.mezclaGris ? color.linea : color.trazo, P.alfaTrazo);
    let puntos = [x, y], esRojo = false;
    for (let paso = 0; paso < P.pasos; paso++) {
      const a = angulo(x, y);
      const nx = x + Math.cos(a) * P.largoPaso, ny = y + Math.sin(a) * P.largoPaso;
      if (nx < 0 || nx > W || ny < 0 || ny > H) break;
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
    if (n % 250 === 249) yield;
  }
}

// ---------- Curvas de nivel: un cerro en una esquina, con tres curvas rojas cerca de la cima ----------
function* topografico(l: Lienzo) {
  const { W, H, U, color } = l;
  const cel = Math.max(4, Math.round(5 * U)), nx = Math.ceil(W / cel) + 1, ny = Math.ceil(H / cel) + 1;
  const cima = esquina(l, -0.12 * Math.min(W, H));
  const ancho = 0.42 * Math.max(W, H);
  const f = new Float32Array(nx * ny);
  let mn = Infinity, mx = -Infinity;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = i * cel, y = j * cel, d2 = (x - cima.x) ** 2 + (y - cima.y) ** 2;
      const v = fbm(l, x / (430 * U), y / (430 * U), 4) * 1.8 + 1.25 * Math.exp(-d2 / (2 * ancho * ancho));
      f[j * nx + i] = v;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  yield;
  // Marching squares: cada celda aporta el tramo de curva que la cruza.
  const curva = (ctx: CanvasRenderingContext2D, nivel: number) => {
    ctx.beginPath();
    const linea = (p: number[], q: number[]) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = f[j * nx + i], b = f[j * nx + i + 1], c = f[(j + 1) * nx + i + 1], d = f[(j + 1) * nx + i];
        const k = (a > nivel ? 8 : 0) | (b > nivel ? 4 : 0) | (c > nivel ? 2 : 0) | (d > nivel ? 1 : 0);
        if (k === 0 || k === 15) continue;
        const x = i * cel, y = j * cel, t = (p: number, q: number) => (nivel - p) / (q - p);
        const T = [x + cel * t(a, b), y], Rt = [x + cel, y + cel * t(b, c)], B = [x + cel * t(d, c), y + cel], L = [x, y + cel * t(a, d)];
        if (k === 5) { linea(T, Rt); linea(L, B); continue; }
        if (k === 10) { linea(T, L); linea(B, Rt); continue; }
        const tramos: Record<number, number[][]> = { 1: [L, B], 2: [B, Rt], 3: [L, Rt], 4: [T, Rt], 6: [T, B], 7: [T, L], 8: [T, L], 9: [T, B], 11: [T, Rt], 12: [L, Rt], 13: [B, Rt], 14: [L, B] };
        linea(tramos[k][0], tramos[k][1]);
      }
    }
    ctx.stroke();
  };
  const N = 30, rojas = new Set([20, 23, 26]);
  const k1 = capa(l);
  for (let n = 1; n < N; n++) {
    if (rojas.has(n)) continue;
    k1.ctx.strokeStyle = rgba(color.trazo, n % 5 === 0 ? 0.6 : 0.34);
    k1.ctx.lineWidth = (n % 5 === 0 ? 2 : 1.3) * U;
    curva(k1.ctx, mn + ((mx - mn) * n) / N);
  }
  pegarConRadial(l, k1, cima.x, cima.y, 1.4 * Math.max(W, H), [[0, 1], [0.4, 0.8], [0.8, 0.3], [1, 0.12]]);
  l.ctx.strokeStyle = rgba(color.acento, 0.9);
  l.ctx.lineWidth = 2.6 * U;
  rojas.forEach((n) => curva(l.ctx, mn + ((mx - mn) * n) / N));
}

// ---------- Plano técnico: grilla con cruces, y unas cruces y cotas rojas ----------
function* plano(l: Lienzo) {
  const { ctx, W, H, U, R, color } = l;
  const fina = 24 * U, mayor = 120 * U;
  const ox = R() * mayor, oy = R() * mayor;
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(color.trazo, 0.12);
  ctx.beginPath();
  for (let x = ox % fina; x <= W; x += fina) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); }
  for (let y = oy % fina; y <= H; y += fina) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
  ctx.stroke();
  const columnas: number[] = [], filas: number[] = [];
  for (let x = ox; x <= W; x += mayor) columnas.push(Math.round(x) + 0.5);
  for (let y = oy; y <= H; y += mayor) filas.push(Math.round(y) + 0.5);
  ctx.lineWidth = 1.6 * U;
  ctx.strokeStyle = rgba(color.trazo, 0.36);
  ctx.beginPath();
  columnas.forEach((x) => { ctx.moveTo(x, 0); ctx.lineTo(x, H); });
  filas.forEach((y) => { ctx.moveTo(0, y); ctx.lineTo(W, y); });
  ctx.stroke();
  ctx.lineWidth = 2 * U;
  ctx.strokeStyle = rgba(color.linea, 0.6);
  ctx.beginPath();
  columnas.forEach((x) => filas.forEach((y) => {
    ctx.moveTo(x - 6 * U, y); ctx.lineTo(x + 7 * U, y); ctx.moveTo(x, y - 6 * U); ctx.lineTo(x, y + 7 * U);
  }));
  ctx.stroke();

  // Acentos rojos en cruces de la grilla mayor: cruces con círculo y una cota.
  ctx.strokeStyle = rgba(color.acento, 0.95);
  ctx.fillStyle = rgba(color.acento, 0.95);
  const cruz = (x: number, y: number, r: number) => {
    ctx.lineWidth = 2.4 * U;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    const largo = 20 * U, e = 6 * U;
    ctx.beginPath();
    ctx.moveTo(x - r - largo, y); ctx.lineTo(x - r + e, y); ctx.moveTo(x + r - e, y); ctx.lineTo(x + r + largo, y);
    ctx.moveTo(x, y - r - largo); ctx.lineTo(x, y - r + e); ctx.moveTo(x, y + r - e); ctx.lineTo(x, y + r + largo);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 3 * U, 0, Math.PI * 2); ctx.fill();
  };
  const elegir = <T,>(lista: T[]) => lista[Math.floor(R() * lista.length)];
  if (columnas.length > 3 && filas.length > 1) {
    for (let i = 0; i < 3; i++) cruz(elegir(columnas), elegir(filas), (13 + R() * 6) * U);
    const i0 = Math.floor(R() * (columnas.length - 2)), y = elegir(filas), t = 10 * U;
    const xa = columnas[i0], xb = columnas[i0 + 2];
    ctx.lineWidth = 2.4 * U;
    ctx.beginPath();
    ctx.moveTo(xa, y); ctx.lineTo(xb, y);
    ctx.moveTo(xa, y - t); ctx.lineTo(xa, y + t); ctx.moveTo(xb, y - t); ctx.lineTo(xb, y + t);
    ctx.stroke();
  }
  yield;
}

// ---------- Red: nodos conectados, con un camino rojo de cinco nodos ----------
function* red(l: Lienzo) {
  const { ctx, W, H, U, R, color } = l;
  const separacion = 60 * U, cupo = Math.round((150 * W * H) / (1080 * 1350 * U * U));
  const nodos: [number, number][] = [];
  for (let intentos = 0; nodos.length < cupo && intentos < 20000; intentos++) {
    const x = R() * W, y = R() * H;
    if (nodos.some((n) => Math.hypot(n[0] - x, n[1] - y) < separacion)) continue;
    nodos.push([x, y]);
  }
  yield;
  const vecinos = nodos.map(() => new Set<number>());
  ctx.strokeStyle = rgba(color.trazo, 0.32);
  ctx.lineWidth = 1.3 * U;
  ctx.beginPath();
  nodos.forEach((n, i) => {
    nodos.map((m, j) => [Math.hypot(n[0] - m[0], n[1] - m[1]), j] as const)
      .filter((e) => e[1] !== i).sort((a, b) => a[0] - b[0]).slice(0, 3)
      .forEach(([d, j]) => {
        if (d > 260 * U || vecinos[i].has(j)) return;
        vecinos[i].add(j);
        vecinos[j].add(i);
        ctx.moveTo(n[0], n[1]);
        ctx.lineTo(nodos[j][0], nodos[j][1]);
      });
  });
  ctx.stroke();
  nodos.forEach((n, i) => {
    const grande = vecinos[i].size >= 5;
    ctx.fillStyle = rgba(color.trazo, grande ? 0.8 : 0.55);
    ctx.beginPath(); ctx.arc(n[0], n[1], (grande ? 5 : 3.5) * U, 0, Math.PI * 2); ctx.fill();
    if (grande) {
      ctx.strokeStyle = rgba(color.trazo, 0.35);
      ctx.beginPath(); ctx.arc(n[0], n[1], 11 * U, 0, Math.PI * 2); ctx.stroke();
    }
  });
  if (nodos.length < 6) return;
  // El camino rojo: arranca en el nodo más cercano a una esquina y sigue por vecinos.
  const e = esquina(l, 0);
  let actual = nodos.reduce((mejor, n, i) => (Math.hypot(n[0] - e.x, n[1] - e.y) < Math.hypot(nodos[mejor][0] - e.x, nodos[mejor][1] - e.y) ? i : mejor), 0);
  const camino = [actual];
  while (camino.length < 5) {
    const siguiente = [...vecinos[actual]].filter((j) => !camino.includes(j))
      .sort((a, b) => Math.hypot(nodos[b][0] - e.x, nodos[b][1] - e.y) - Math.hypot(nodos[a][0] - e.x, nodos[a][1] - e.y))[0];
    if (siguiente === undefined) break;
    camino.push(siguiente);
    actual = siguiente;
  }
  ctx.strokeStyle = rgba(color.acento, 0.95);
  ctx.lineWidth = 3.6 * U;
  ctx.beginPath();
  camino.forEach((i, k) => (k ? ctx.lineTo(nodos[i][0], nodos[i][1]) : ctx.moveTo(nodos[i][0], nodos[i][1])));
  ctx.stroke();
  camino.forEach((i, k) => {
    const punta = k === 0 || k === camino.length - 1;
    ctx.fillStyle = rgba(color.acento, 1);
    ctx.beginPath(); ctx.arc(nodos[i][0], nodos[i][1], (punta ? 8 : 6) * U, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(color.acento, 0.5);
    ctx.lineWidth = 1.8 * U;
    ctx.beginPath(); ctx.arc(nodos[i][0], nodos[i][1], 15 * U, 0, Math.PI * 2); ctx.stroke();
  });
}

// ---------- Ondas: anillos desde una esquina, dos de ellos rojos ----------
function* ondas(l: Lienzo) {
  const { W, H, U, R, color } = l;
  const centro = esquina(l, (40 + R() * 90) * U), tope = Math.hypot(W, H) * 1.05;
  const primera = 6 + Math.floor(R() * 5);
  const rojos = new Set([primera, primera + 8 + Math.floor(R() * 5)]);
  const paso = (k: number) => (26 + 16 * Math.sin(k * 0.55) + k * 0.9) * 0.7 * U;
  const k1 = capa(l);
  const rojosR: number[] = [];
  for (let r = 90 * U, k = 0; r < tope; r += paso(k), k++) {
    if (rojos.has(k)) { rojosR.push(r); continue; }
    k1.ctx.setLineDash(k % 7 === 3 ? [14 * U, 11 * U] : []);
    k1.ctx.strokeStyle = rgba(color.trazo, 0.5 * (1 - (r / tope) * 0.5));
    k1.ctx.lineWidth = (k % 4 === 0 ? 2.2 : 1.4) * U;
    k1.ctx.beginPath(); k1.ctx.arc(centro.x, centro.y, r, 0, Math.PI * 2); k1.ctx.stroke();
  }
  pegarConRadial(l, k1, centro.x, centro.y, tope, [[0, 1], [0.4, 0.9], [0.75, 0.45], [1, 0.1]]);
  l.ctx.strokeStyle = rgba(color.acento, 0.9);
  l.ctx.lineWidth = 3.4 * U;
  rojosR.forEach((r) => { l.ctx.beginPath(); l.ctx.arc(centro.x, centro.y, r, 0, Math.PI * 2); l.ctx.stroke(); });
  yield;
}

// ---------- Rayas diagonales: espesores al azar, tres rojas ----------
function* rayas(l: Lienzo) {
  const { W, H, U, R, color } = l;
  const ang = ((26 + R() * 8) * Math.PI) / 180 * (R() < 0.5 ? 1 : -1);
  const dir = [Math.cos(ang), -Math.sin(ang)], nrm = [Math.sin(ang), Math.cos(ang)];
  const proy = [[0, 0], [W, 0], [0, H], [W, H]].map((p) => p[0] * nrm[0] + p[1] * nrm[1]);
  const t0 = Math.min(...proy) - 50 * U, t1 = Math.max(...proy) + 50 * U, L = 2 * Math.hypot(W, H);
  const foco = esquina(l, 0);
  const k1 = capa(l);
  k1.ctx.lineCap = "butt";
  const cuantas = Math.round((t1 - t0) / (36 * U));
  const rojas = new Set<number>();
  while (rojas.size < Math.min(3, cuantas)) rojas.add(Math.floor(R() * cuantas));
  const tramosRojos: number[] = [];
  for (let t = t0, k = 0; t < t1; k++) {
    const sep = (22 + 70 * (0.5 + 0.5 * Math.sin(k * 0.7 + 1)) * (0.4 + 0.6 * R())) * 0.6 * U;
    const sorteo = R(), w = (sorteo < 0.12 ? 8 : sorteo < 0.35 ? 4.5 : sorteo < 0.7 ? 2.4 : 1.4) * U;
    if (rojas.has(k)) tramosRojos.push(t);
    else {
      k1.ctx.strokeStyle = R() < 0.25 ? rgba(color.linea, 0.6) : rgba(color.trazo, 0.35 + 0.4 * R());
      k1.ctx.lineWidth = w;
      k1.ctx.beginPath();
      k1.ctx.moveTo(nrm[0] * t - dir[0] * L, nrm[1] * t - dir[1] * L);
      k1.ctx.lineTo(nrm[0] * t + dir[0] * L, nrm[1] * t + dir[1] * L);
      k1.ctx.stroke();
    }
    t += sep;
  }
  const alcance = 1.2 * Math.hypot(W, H);
  pegarConRadial(l, k1, foco.x, foco.y, alcance, [[0, 1], [0.4, 0.75], [0.8, 0.2], [1, 0.05]]);
  // Las rojas se apagan con la misma máscara, así el rojo se enciende solo en una esquina.
  const k2 = capa(l);
  k2.ctx.lineCap = "butt";
  k2.ctx.strokeStyle = rgba(color.acento, 0.95);
  k2.ctx.lineWidth = 5 * U;
  tramosRojos.forEach((t) => {
    k2.ctx.beginPath();
    k2.ctx.moveTo(nrm[0] * t - dir[0] * L, nrm[1] * t - dir[1] * L);
    k2.ctx.lineTo(nrm[0] * t + dir[0] * L, nrm[1] * t + dir[1] * L);
    k2.ctx.stroke();
  });
  pegarConRadial(l, k2, foco.x, foco.y, alcance * 0.6, [[0, 1], [0.6, 0.6], [1, 0]]);
  yield;
}

// ---------- Medios tonos: trama de puntos que crece hacia una esquina, con un racimo rojo ----------
function* medios(l: Lienzo) {
  const { ctx, W, H, U, color } = l;
  const s = 24 * U, ang = Math.PI / 4, ca = Math.cos(ang), sa = Math.sin(ang);
  const foco = esquina(l, -0.08 * Math.min(W, H));
  const alcance = Math.hypot(W, H);
  const radioRojo = 130 * U;
  const vano = Math.ceil(Math.hypot(W, H) / s) + 2;
  for (let i = -vano; i < vano; i++) {
    for (let j = -vano; j < vano; j++) {
      const x = W / 2 + (i * ca - j * sa) * s, y = H / 2 + (i * sa + j * ca) * s;
      if (x < -s || x > W + s || y < -s || y > H + s) continue;
      const d = Math.hypot(x - foco.x, y - foco.y);
      if (d < radioRojo) {
        const q = 1 - d / radioRojo;
        ctx.fillStyle = rgba(color.acento, 0.95);
        ctx.beginPath(); ctx.arc(x, y, s * 0.5 * (0.25 + 0.5 * Math.pow(q, 0.7)), 0, Math.PI * 2); ctx.fill();
        continue;
      }
      const cerca = 1 - sstep(0, 0.85, d / alcance);
      const v = Math.min(1, Math.max(0, (0.08 + 0.92 * cerca) * (0.55 + 1.6 * (fbm(l, x / (280 * U), y / (280 * U), 3) + 0.25))));
      const r = s * 0.5 * 0.85 * Math.pow(v, 0.8);
      if (r < 1.2 * U) continue;
      ctx.fillStyle = (i + j) % 9 === 0 ? rgba(color.linea, 0.5) : rgba(color.trazo, 0.22 + 0.4 * v);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  yield;
}

// ---------- Columnas: barras que van creciendo (la mejora continua), dos con el salto marcado en rojo ----------
function* columnas(l: Lienzo) {
  const { ctx, W, H, U, R, color } = l;
  const alReves = R() < 0.5;
  const barras: { x: number; w: number; h: number }[] = [];
  for (let x = -R() * 20 * U; x < W; ) {
    const w = (10 + R() * 34) * U;
    const t = (alReves ? W - x : x) / W;
    // Tendencia que sube de un lado al otro, con ruido: cada barra un poco más que la anterior.
    const h = H * Math.min(0.96, Math.max(0.06, 0.12 + 0.62 * t + fbm(l, x / (300 * U), 3.3, 3) * 0.7 + (R() - 0.5) * 0.08));
    barras.push({ x, w, h });
    x += w + (4 + R() * 14) * U;
  }
  // Las líneas de nivel del fondo, como un gráfico.
  ctx.strokeStyle = rgba(color.linea, 0.2);
  ctx.lineWidth = 1;
  ctx.setLineDash([4 * U, 8 * U]);
  ctx.beginPath();
  for (let y = H - 80 * U; y > 0; y -= 80 * U) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
  ctx.stroke();
  ctx.setLineDash([]);
  barras.forEach((b) => {
    const top = H - b.h;
    const g = ctx.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, rgba(color.trazo, 0.12));
    g.addColorStop(1, rgba(color.trazo, 0.02));
    ctx.fillStyle = g;
    ctx.fillRect(b.x, top, b.w, b.h);
    ctx.strokeStyle = rgba(color.trazo, 0.28);
    ctx.lineWidth = 1.2 * U;
    ctx.strokeRect(b.x + 0.5, top + 0.5, b.w, b.h + 2);
    ctx.strokeStyle = rgba(color.trazo, 0.7);
    ctx.lineWidth = 2.4 * U;
    ctx.beginPath(); ctx.moveTo(b.x, top); ctx.lineTo(b.x + b.w, top); ctx.stroke();
  });
  // El rojo marca dónde hubo un salto: las dos barras que más crecieron respecto de la vecina.
  const saltos = barras.map((b, i) => {
    const vecina = barras[alReves ? i + 1 : i - 1];
    return { b, salto: vecina ? b.h - vecina.h : 0 };
  }).sort((a, b) => b.salto - a.salto).slice(0, 2);
  saltos.forEach(({ b }) => {
    const top = H - b.h;
    ctx.fillStyle = rgba(color.acento, 0.3);
    ctx.fillRect(b.x, top, b.w, b.h);
    ctx.strokeStyle = rgba(color.acento, 0.95);
    ctx.lineWidth = 3 * U;
    ctx.beginPath(); ctx.moveTo(b.x, top); ctx.lineTo(b.x + b.w, top); ctx.stroke();
    ctx.fillStyle = rgba(color.acento, 1);
    ctx.beginPath(); ctx.arc(b.x + b.w / 2, top - 12 * U, 4 * U, 0, Math.PI * 2); ctx.fill();
  });
  yield;
}

// ---------- Cuadrados: una cuadrícula que se subdivide (construcción por capas), tres en rojo ----------
function* cuadrados(l: Lienzo) {
  const { ctx, W, H, U, R, color } = l;
  const lado = Math.max(W, H) / (5 + Math.floor(R() * 3));
  const minimo = 14 * U;
  const hojas: { x: number; y: number; s: number }[] = [];
  const partir = (x: number, y: number, s: number, nivel: number) => {
    if (x > W || y > H) return;
    // Se subdivide más donde el ruido es alto: zonas de detalle fino y zonas que respiran.
    const ganas = 0.7 + fbm(l, x / (500 * U), y / (500 * U), 2, 5) * 2.4 - nivel * 0.12;
    if (s / 2 >= minimo && R() < ganas) {
      const m = s / 2;
      partir(x, y, m, nivel + 1); partir(x + m, y, m, nivel + 1);
      partir(x, y + m, m, nivel + 1); partir(x + m, y + m, m, nivel + 1);
    } else hojas.push({ x, y, s });
  };
  for (let y = 0; y < H; y += lado) for (let x = 0; x < W; x += lado) partir(x, y, lado, 0);
  const inset = 2.5 * U;
  hojas.forEach((h) => {
    const relleno = R();
    if (relleno < 0.12) {
      ctx.fillStyle = rgba(color.trazo, 0.07);
      ctx.fillRect(h.x + inset, h.y + inset, h.s - 2 * inset, h.s - 2 * inset);
    }
    ctx.strokeStyle = relleno > 0.75 ? rgba(color.linea, 0.45) : rgba(color.trazo, 0.28);
    ctx.lineWidth = (h.s > 120 * U ? 1.6 : 1.1) * U;
    ctx.strokeRect(h.x + inset, h.y + inset, h.s - 2 * inset, h.s - 2 * inset);
    if (h.s < 40 * U && R() < 0.35) {
      ctx.fillStyle = rgba(color.trazo, 0.5);
      ctx.beginPath(); ctx.arc(h.x + h.s / 2, h.y + h.s / 2, 1.8 * U, 0, Math.PI * 2); ctx.fill();
    }
  });
  const medianas = hojas.filter((h) => h.s >= 28 * U && h.s <= 160 * U);
  for (let i = 0; i < 3 && medianas.length; i++) {
    const h = medianas.splice(Math.floor(R() * medianas.length), 1)[0];
    ctx.strokeStyle = rgba(color.acento, 0.95);
    ctx.lineWidth = 2.6 * U;
    ctx.strokeRect(h.x + inset, h.y + inset, h.s - 2 * inset, h.s - 2 * inset);
    if (i === 0) {
      ctx.fillStyle = rgba(color.acento, 0.25);
      ctx.fillRect(h.x + inset, h.y + inset, h.s - 2 * inset, h.s - 2 * inset);
    }
  }
  yield;
}

export const DISENOS: Diseno[] = [
  { nombre: "deriva", opacidad: 1, pintar: deriva },
  { nombre: "topografico", opacidad: 0.55, pintar: topografico },
  { nombre: "plano", opacidad: 0.6, pintar: plano },
  { nombre: "red", opacidad: 0.55, pintar: red },
  { nombre: "ondas", opacidad: 0.55, pintar: ondas },
  { nombre: "rayas", opacidad: 0.45, pintar: rayas },
  { nombre: "medios", opacidad: 0.5, pintar: medios },
  { nombre: "columnas", opacidad: 0.8, pintar: columnas },
  { nombre: "cuadrados", opacidad: 0.75, pintar: cuadrados },
];
