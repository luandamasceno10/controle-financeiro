// Soma valores em ponto flutuante puro acumula erro de arredondamento binário
// (ex.: em JS, somar uma lista de ~100 valores com centavos pode dar
// 13869.210000000003 em vez de 13869.21) — pequeno demais pra afetar um valor
// isolado, mas some visivelmente numa fatura com muitos lançamentos. Soma em
// centavos inteiros e só converte de volta pra reais no final.
export function sumMoney(values: number[]): number {
  const cents = values.reduce((s, v) => s + Math.round(v * 100), 0);
  return cents / 100;
}
