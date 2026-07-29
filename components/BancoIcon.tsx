import { bancoMeta } from '@/lib/bancos';

export function BancoIcon({ nome, size = 32 }: { nome: string | null | undefined; size?: number }) {
  const meta = bancoMeta(nome);
  return (
    <div
      className="rounded-lg flex items-center justify-center shrink-0"
      style={{ width: size, height: size, backgroundColor: meta.cor + '20' }}
    >
      {meta.logo ? (
        <svg viewBox={meta.logo.viewBox} width={size * 0.55} height={size * 0.55} fill={meta.cor}>
          <path d={meta.logo.path} />
        </svg>
      ) : (
        <span className="font-bold" style={{ color: meta.cor, fontSize: size * 0.34 }}>{meta.sigla}</span>
      )}
    </div>
  );
}
