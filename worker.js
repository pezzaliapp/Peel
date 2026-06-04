/* Peel — worker di separazione
 * ============================================================
 *  PUNTO D'INTEGRAZIONE DEL MOTORE REALE
 * ============================================================
 * Di default l'app gira in "modalità anteprima" (segnaposto EQ in app.js,
 * sul thread principale) così l'interfaccia è subito provabile.
 *
 * Per la separazione AI VERA con Open-Unmix:
 *   1. Procurati il modulo WASM MIT (umx.cpp) e i pesi UMX-L in /models/.
 *      Riferimenti nel README.
 *   2. Carica qui sotto il glue JS generato da Emscripten.
 *   3. Implementa runRealSeparation() passando il PCM al modulo.
 *   4. In app.js metti USE_REAL_ENGINE = true.
 *
 * Il modello gira QUI, in un worker, perché è pesante e bloccherebbe la UI.
 */

// import Module from './models/umx.js';  // <-- glue Emscripten (TODO)

self.onmessage = async (e) => {
  const { type, payload } = e.data;
  if (type !== 'separate') return;

  try {
    const stems = await runRealSeparation(payload);
    // stems: { vocals:[L,R], drums:[L,R], bass:[L,R], other:[L,R] }
    self.postMessage({ type: 'done', stems }, transferOf(stems));
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};

async function runRealSeparation(payload) {
  // payload = { channels: [Float32Array,...], sampleRate, length }
  //
  // TODO — collega umx.cpp:
  //   const model = await Module();
  //   model.loadWeights('/models/umxl-ggml.bin');
  //   const out = model.separate(payload.channels, payload.sampleRate, (p) =>
  //       self.postMessage({ type: 'progress', value: p }));
  //   return out;
  throw new Error(
    'Motore reale non ancora collegato. Vedi README → "Collegare Open-Unmix". ' +
    "Per ora usa la modalità anteprima (USE_REAL_ENGINE = false)."
  );
}

function transferOf(stems) {
  const t = [];
  for (const k in stems) for (const ch of stems[k]) t.push(ch.buffer);
  return t;
}
