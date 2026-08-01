import {
  Home, Apple, Car, HeartPulse, GraduationCap, Clapperboard, Gift, Users,
  PiggyBank, Landmark, CircleEllipsis, Briefcase, TrendingUp, DollarSign,
  ShoppingBag, Coffee, Plane, Book, Smartphone, Dumbbell, Music, Film, Baby,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from './supabase';
import type { Categoria } from './supabase';

export function sortCategoriasNatural<T extends { nome: string }>(cats: T[]): T[] {
  return [...cats].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' }));
}

export const ICONS: Record<string, LucideIcon> = {
  Home, Apple, Car, HeartPulse, GraduationCap, Clapperboard, Gift, Users,
  PiggyBank, Landmark, CircleEllipsis, Briefcase, TrendingUp, DollarSign,
  ShoppingBag, Coffee, Plane, Book, Smartphone, Dumbbell, Music, Film, Baby,
};

export const ICON_NAMES = Object.keys(ICONS);

export const COLOR_SWATCHES = [
  '#2563EB', '#16A34A', '#0891B2', '#DC2626', '#7C3AED', '#DB2777',
  '#EA580C', '#0D9488', '#059669', '#B91C1C', '#64748B', '#0F172A',
];

export const DEFAULT_CATEGORIAS_SAIDA = [
  { nome: 'Moradia', cor: '#2563EB', icone: 'Home', emoji: '🏠' },
  { nome: 'Alimentação', cor: '#16A34A', icone: 'Apple', emoji: '🍎' },
  { nome: 'Transporte', cor: '#0891B2', icone: 'Car', emoji: '🚗' },
  { nome: 'Saúde & Bem-estar', cor: '#DC2626', icone: 'HeartPulse', emoji: '🩺' },
  { nome: 'Educação', cor: '#7C3AED', icone: 'GraduationCap', emoji: '🎓' },
  { nome: 'Assinaturas & Lazer', cor: '#DB2777', icone: 'Clapperboard', emoji: '🎬' },
  { nome: 'Doações e Presentes', cor: '#EA580C', icone: 'Gift', emoji: '🎁' },
  { nome: 'Família & Dependentes', cor: '#0D9488', icone: 'Users', emoji: '👥' },
  { nome: 'Investimentos & Futuro', cor: '#059669', icone: 'PiggyBank', emoji: '💰' },
  { nome: 'Dívidas & Empréstimos', cor: '#B91C1C', icone: 'Landmark', emoji: '🏦' },
  { nome: 'Diversos', cor: '#64748B', icone: 'CircleEllipsis', emoji: '✳️' },
];

export const DEFAULT_CATEGORIAS_ENTRADA = [
  { nome: 'Salário', cor: '#059669', icone: 'Briefcase', emoji: '💼' },
  { nome: 'Investimentos', cor: '#16A34A', icone: 'TrendingUp', emoji: '📈' },
  { nome: 'Outras Receitas', cor: '#64748B', icone: 'CircleEllipsis', emoji: '✳️' },
];

export async function ensureDefaultCategorias(userId: string) {
  const { count } = await supabase
    .from('categorias')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (count && count > 0) return;

  const rows = [
    ...DEFAULT_CATEGORIAS_SAIDA.map((c, i) => ({ ...c, tipo: 'saida', ordem: i, user_id: userId })),
    ...DEFAULT_CATEGORIAS_ENTRADA.map((c, i) => ({ ...c, tipo: 'entrada', ordem: i, user_id: userId })),
  ];
  await supabase.from('categorias').insert(rows);
}
