// node --test pruebas/te-damos-de-baja/   (fechas, carta, validación y PDF; sin red)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calcularEnvio, carta, esHabil, restarHabiles, sumarMeses, validarDatos, dniValido, total } from '../../assets/te-damos-de-baja/carta.js';
import { cartaPdf } from '../../functions/_baja/pdf.js';

const DATOS = JSON.parse(fs.readFileSync(new URL('../../data/te-damos-de-baja.json', import.meta.url)));
const E = DATOS.empresas;

test('31 empresas, cada una con su correo de la ficha y una regla completa', () => {
  assert.equal(Object.keys(E).length, 31);
  for (const [slug, e] of Object.entries(E)) {
    assert.match(e.correo, /^[^@\s]+@[^@\s]+\.[a-z]+$/i, slug);
    assert.ok(e.opciones.length > 0 && ['fecha', 'renovacion'].includes(e.cuenta) && ['si', 'no', 'copia'].includes(e.dni), slug);
  }
});

test('precio: sale de data/te-damos-de-baja.json (3,99 € y 2,99 € por cada baja más)', () => {
  assert.deepEqual(DATOS.precio, { primera: 399, extra: 299 });
  assert.deepEqual([1, 2, 3, 5].map((n) => total(n, DATOS.precio)), [399, 698, 997, 1595]);
});

test('días hábiles: fines de semana, festivos nacionales y Viernes Santo', () => {
  assert.equal(esHabil('2026-12-08'), false); // Inmaculada
  assert.equal(esHabil('2027-03-26'), false); // Viernes Santo 2027
  assert.equal(esHabil('2026-11-21'), false); // sábado
  assert.equal(restarHabiles('2026-12-09', 2), '2026-12-04'); // salta el 8 (festivo), el 7 es lunes hábil… 9→7→4
  assert.equal(sumarMeses('2027-03-31', -1), '2027-02-28');
});

test('fecha de envío: telecos 2 días hábiles + 1 de margen; seguros un mes + 2 días', () => {
  const hoy = '2026-11-16';
  assert.deepEqual(calcularEnvio(E.orange, { cuando: 'fin', fecha: '2026-12-15' }, hoy), { ok: true, envio: '2026-12-10', objetivo: '2026-12-15', programada: true, tarde: false });
  assert.deepEqual(calcularEnvio(E.dkv, { cuando: 'ren', fecha: '2027-03-01' }, hoy), { ok: true, envio: '2027-01-30', objetivo: '2027-03-01', programada: true, tarde: false });
  // Ya no da tiempo: se envía hoy y se avisa
  assert.deepEqual(calcularEnvio(E.zoom, { cuando: 'ren', fecha: '2026-12-01' }, hoy), { ok: true, envio: hoy, objetivo: '2026-12-01', programada: false, tarde: true });
  assert.equal(calcularEnvio(E.dkv, { cuando: 'ya' }, hoy).error, 'cuando'); // un seguro solo se puede parar en la renovación
  assert.equal(calcularEnvio(E.orange, { cuando: 'fin', fecha: hoy }, hoy).error, 'fecha');
});

test('carta: seguro con oposición a la prórroga; telecos con el plazo legal; inglés para Zoom', () => {
  const d = { nombre: 'Ana Prueba Ejemplo', correo: 'ana.prueba@example.com', dni: '12345678Z', dato: 'POLIZA-1' };
  const s = carta(E.dkv, { datos: d, eleccion: { cuando: 'ren', fecha: '2027-03-01' }, fecha: '2026-11-16' }).cuerpo.join('\n');
  assert.match(s, /artículo 22 de la Ley 50\/1980/); assert.match(s, /1 de marzo de 2027/); assert.match(s, /Número de póliza: POLIZA-1/);
  const t = carta(E.jazztel, { datos: d, eleccion: { cuando: 'ya' }, fecha: '2026-11-16' }).cuerpo.join('\n');
  assert.match(t, /dos días hábiles/); assert.match(t, /Motivo de la baja: decisión personal/);
  assert.equal(carta(E.zoom, { datos: d, eleccion: { cuando: 'ya' } }).idioma, 'en');
});

test('validación: DNI con letra correcta, nombre y apellido, correo', () => {
  assert.equal(dniValido('12345678Z'), true); assert.equal(dniValido('12345678A'), false); assert.equal(dniValido('X1234567L'), true);
  assert.deepEqual(validarDatos(E.orange, { nombre: 'Ana', correo: 'no', dni: '1' }).errores, ['nombre', 'correo', 'dni']);
  assert.deepEqual(validarDatos(E.dkv, { nombre: 'Ana Prueba', correo: 'a@example.com', dni: '12345678Z' }).errores, ['dato']); // la póliza es obligatoria
});

test('PDF: siempre una página, aunque el texto sea largo', () => {
  const lineas = Array.from({ length: 70 }, (_, i) => `Línea ${i} con acentos (áéíóú ñ ç l·l €) y un texto bastante largo para que haga falta partirlo en dos líneas en A4.`);
  const pdf = Buffer.from(cartaPdf({ lineas, titulo: 'Prueba' })).toString('latin1');
  assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length, 1);
  assert.match(pdf, /\/Helvetica \/Encoding \/WinAnsiEncoding/);
  assert.match(pdf, /startxref\n\d+\n%%EOF\n$/);
});
