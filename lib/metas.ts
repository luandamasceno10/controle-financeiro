export interface MetaProgresso {
  valorAtual: number;
  pct: number;
  restante: number;
  diasRestantes: number | null;
  ritmoNecessarioMensal: number | null;
  ritmoAtualMensal: number;
  noPrazo: boolean | null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function computeProgresso(
  valorAlvo: number,
  dataAlvo: string | null,
  createdAt: string,
  contribuicoes: { valor: number; data: string }[]
): MetaProgresso {
  const valorAtual = contribuicoes.reduce((s, c) => s + Number(c.valor), 0);
  const pct = valorAlvo > 0 ? Math.min(100, Math.round((valorAtual / valorAlvo) * 100)) : 0;
  const restante = Math.max(0, valorAlvo - valorAtual);

  const hoje = todayISO();
  const diasRestantes = dataAlvo
    ? Math.max(0, Math.round((new Date(dataAlvo + 'T00:00:00').getTime() - new Date(hoje + 'T00:00:00').getTime()) / 86400000))
    : null;

  const ritmoNecessarioMensal = dataAlvo && diasRestantes !== null
    ? restante / Math.max(1, diasRestantes / 30.44)
    : null;

  const diasDesdeInicio = Math.max(1, Math.round((new Date(hoje + 'T00:00:00').getTime() - new Date(createdAt.slice(0, 10) + 'T00:00:00').getTime()) / 86400000));
  const ritmoAtualMensal = (valorAtual / diasDesdeInicio) * 30.44;

  let noPrazo: boolean | null = null;
  if (dataAlvo && diasRestantes !== null) {
    if (restante <= 0) noPrazo = true;
    else if (diasRestantes <= 0) noPrazo = false;
    else {
      const totalDias = Math.max(1, Math.round((new Date(dataAlvo + 'T00:00:00').getTime() - new Date(createdAt.slice(0, 10) + 'T00:00:00').getTime()) / 86400000));
      const decorridos = totalDias - diasRestantes;
      const esperadoAteAgora = valorAlvo * (decorridos / totalDias);
      noPrazo = valorAtual >= esperadoAteAgora;
    }
  }

  return { valorAtual, pct, restante, diasRestantes, ritmoNecessarioMensal, ritmoAtualMensal, noPrazo };
}
