import { Landmark, CreditCard, Wallet, Banknote, type LucideIcon } from 'lucide-react';

export interface BancoMeta {
  nome: string;
  cor: string;
  icone: string;
}

export const BANCOS: BancoMeta[] = [
  { nome: 'Nubank', cor: '#8A05BE', icone: 'CreditCard' },
  { nome: 'Itaú', cor: '#EC7000', icone: 'Landmark' },
  { nome: 'Bradesco', cor: '#CC092F', icone: 'Landmark' },
  { nome: 'Santander', cor: '#EC0000', icone: 'Landmark' },
  { nome: 'Banco do Brasil', cor: '#F8C300', icone: 'Landmark' },
  { nome: 'Caixa', cor: '#0033A0', icone: 'Landmark' },
  { nome: 'Inter', cor: '#FF7A00', icone: 'Landmark' },
  { nome: 'C6 Bank', cor: '#1C1C1C', icone: 'Landmark' },
  { nome: 'PicPay', cor: '#21C25E', icone: 'Wallet' },
  { nome: 'Mercado Pago', cor: '#00AEEF', icone: 'Wallet' },
  { nome: 'PagBank', cor: '#FFC700', icone: 'Wallet' },
  { nome: 'Carteira / Dinheiro', cor: '#64748B', icone: 'Banknote' },
  { nome: 'Outro', cor: '#334155', icone: 'Landmark' },
];

export const BANCO_ICONS: Record<string, LucideIcon> = {
  Landmark, CreditCard, Wallet, Banknote,
};

export function bancoMeta(nome: string | null | undefined): BancoMeta {
  return BANCOS.find((b) => b.nome === nome) || BANCOS[BANCOS.length - 1];
}
