// pdfjs-dist (a partir da v4) usa Promise.withResolvers(), uma API de 2024
// ainda ausente em iOS/Safari mais antigos (< 17.4). O worker roda num
// escopo global separado do documento, então o polyfill do lado do app não
// alcança ele — precisa ser aplicado aqui também, antes de carregar o worker
// de verdade.
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

import('./pdf.worker.min.mjs');
