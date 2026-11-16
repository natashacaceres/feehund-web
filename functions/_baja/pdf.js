// PDF de una hoja A4 con la carta: Helvetica (viene con todos los lectores de PDF, no hay que incrustar fuentes),
// texto partido a lo ancho y, si la hay, la firma dibujada (JPEG). Si no cabe, baja la letra hasta 8,5 pt;
// la carta nunca pasa de una página.

const A4 = [595.28, 841.89], MARGEN = 64, ANCHO = A4[0] - 2 * MARGEN;
// Anchos de Helvetica (1/1000 de em) para 32–126; las letras con tilde miden lo que su letra base
const W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const WB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const ESPECIAL = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97 };
const ANCHO_ESP = { '€': 556, '·': 278, '«': 556, '»': 556, '¿': 611, '¡': 333, 'º': 365, 'ª': 370, '’': 222, '‘': 222, '“': 333, '”': 333, '–': 556, '—': 1000, '…': 1000, 'ß': 611, 'Æ': 1000, 'æ': 889, 'Ø': 778, 'ø': 611 };

function ancho(texto, pt, negrita) {
  let w = 0; const T = negrita ? WB : W;
  for (const ch of texto) {
    const c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) w += T[c - 32];
    else if (ANCHO_ESP[ch]) w += ANCHO_ESP[ch];
    else { const base = ch.normalize('NFD')[0].charCodeAt(0); w += base >= 32 && base <= 126 ? T[base - 32] : 556; }
  }
  return (w * pt) / 1000;
}
// Cadena PDF en WinAnsi, con escapes octales para que el archivo sea ASCII
function cadena(texto) {
  let s = '(';
  for (const ch of texto) {
    let c = ESPECIAL[ch] ?? ch.charCodeAt(0);
    if (c > 255) c = 63; // «?» para lo que WinAnsi no tiene
    if (ch === '(' || ch === ')' || ch === '\\') s += '\\' + ch;
    else if (c < 32 || c > 126) s += '\\' + c.toString(8).padStart(3, '0');
    else s += ch;
  }
  return s + ')';
}
function partir(texto, pt, negrita) {
  const out = []; let linea = '';
  for (const palabra of texto.split(' ')) {
    const prueba = linea ? linea + ' ' + palabra : palabra;
    if (ancho(prueba, pt, negrita) <= ANCHO || !linea) linea = prueba; else { out.push(linea); linea = palabra; }
  }
  out.push(linea);
  return out;
}
function tamanoJpeg(b) { // ancho y alto del marcador SOF
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1], largo = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { alto: (b[i + 5] << 8) | b[i + 6], ancho: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + largo;
  }
  return null;
}

/**
 * lineas: string[] ('' = separación). negrita: textos que van en negrita (el asunto).
 * firma: JPEG (Uint8Array) que se dibuja encima de la línea `firmaAntesDe` (el nombre, al final).
 * Devuelve Uint8Array con el PDF.
 */
export function cartaPdf({ lineas, negrita = [], firma = null, titulo = 'Carta' }) {
  const img = firma ? tamanoJpeg(firma) : null;
  const ALTO_FIRMA = img ? 46 : 0;
  let pt = 10.5, bloques;
  for (; pt >= 8.5; pt -= 0.5) {
    bloques = lineas.map((l) => (l === '' ? { blanco: true } : { trozos: partir(l, pt, negrita.includes(l)), negrita: negrita.includes(l) }));
    const alto = bloques.reduce((a, b) => a + (b.blanco ? pt * 0.75 : b.trozos.length * pt * 1.38), 0) + ALTO_FIRMA;
    if (alto <= A4[1] - 2 * MARGEN) break;
  }
  pt = Math.max(pt, 8.5);
  const ultimoNombre = lineas.length - 2; // el nombre va justo antes de la línea de la firma electrónica
  let y = A4[1] - MARGEN - pt, ops = 'BT\n';
  const contenido = [];
  bloques.forEach((b, i) => {
    if (b.blanco) { y -= pt * 0.75; return; }
    if (i === ultimoNombre && img) {
      ops += 'ET\n'; contenido.push(ops); ops = '';
      const h = ALTO_FIRMA - 6, w = Math.min(200, (img.ancho / img.alto) * h);
      contenido.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${MARGEN} ${(y - h + pt + 2).toFixed(2)} cm /Firma Do Q\n`);
      y -= ALTO_FIRMA; ops = 'BT\n';
    }
    const gris = i === lineas.length - 1;
    for (const t of b.trozos) {
      ops += `/${b.negrita ? 'F2' : 'F1'} ${gris ? (pt - 1.5).toFixed(1) : pt.toFixed(1)} Tf ${gris ? '0.35 g' : '0 g'} 1 0 0 1 ${MARGEN} ${y.toFixed(2)} Tm ${cadena(t)} Tj\n`;
      y -= pt * 1.38;
    }
  });
  ops += 'ET\n'; contenido.push(ops);
  const flujo = contenido.join('');

  // Objetos del PDF
  const objs = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >>${img ? ' /XObject << /Firma 8 0 R >>' : ''} >> >>`);
  objs.push({ dicc: '', datos: new TextEncoder().encode(flujo) });
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  objs.push(`<< /Title ${cadena(titulo)} /Producer (Feehund) >>`);
  if (img) objs.push({ dicc: `/Type /XObject /Subtype /Image /Width ${img.ancho} /Height ${img.alto} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, datos: firma });

  const te = new TextEncoder(), partes = [te.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')], pos = [];
  let n = partes[0].length;
  const poner = (x) => { const b = typeof x === 'string' ? te.encode(x) : x; partes.push(b); n += b.length; };
  objs.forEach((o, i) => {
    pos.push(n);
    if (typeof o === 'string') poner(`${i + 1} 0 obj\n${o}\nendobj\n`);
    else { poner(`${i + 1} 0 obj\n<< ${o.dicc} /Length ${o.datos.length} >>\nstream\n`); poner(o.datos); poner('\nendstream\nendobj\n'); }
  });
  const xref = n;
  poner(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map((p) => String(p).padStart(10, '0') + ' 00000 n \n').join('')}`);
  poner(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(n); let k = 0; for (const p of partes) { out.set(p, k); k += p.length; }
  return out;
}
