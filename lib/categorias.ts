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

// Rótulo para <select>: subcategorias mostram "Pai › Nome" para não ficarem
// indistinguíveis de categorias de nível principal na mesma lista.
export function categoriaSelectLabel(cat: Categoria, all: Categoria[]): string {
  if (!cat.parent_id) return cat.nome;
  const parent = all.find((c) => c.id === cat.parent_id);
  return parent ? `${parent.nome} › ${cat.nome}` : cat.nome;
}

// Ordena categorias para exibição em lista/select: cada categoria principal
// seguida imediatamente das suas subcategorias, ambos em ordem natural.
export function sortCategoriasForSelect<T extends Categoria>(cats: T[]): T[] {
  const parents = sortCategoriasNatural(cats.filter((c) => !c.parent_id));
  const parentIds = new Set(parents.map((p) => p.id));
  const result: T[] = [];
  parents.forEach((p) => {
    result.push(p);
    result.push(...sortCategoriasNatural(cats.filter((c) => c.parent_id === p.id)));
  });
  const orfas = cats.filter((c) => c.parent_id && !parentIds.has(c.parent_id));
  result.push(...sortCategoriasNatural(orfas));
  return result;
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
  { nome: 'Moradia', cor: '#2563EB', icone: 'Home' },
  { nome: 'Alimentação', cor: '#16A34A', icone: 'Apple' },
  { nome: 'Transporte', cor: '#0891B2', icone: 'Car' },
  { nome: 'Saúde & Bem-estar', cor: '#DC2626', icone: 'HeartPulse' },
  { nome: 'Educação', cor: '#7C3AED', icone: 'GraduationCap' },
  { nome: 'Assinaturas & Lazer', cor: '#DB2777', icone: 'Clapperboard' },
  { nome: 'Doações e Presentes', cor: '#EA580C', icone: 'Gift' },
  { nome: 'Família & Dependentes', cor: '#0D9488', icone: 'Users' },
  { nome: 'Investimentos & Futuro', cor: '#059669', icone: 'PiggyBank' },
  { nome: 'Dívidas & Empréstimos', cor: '#B91C1C', icone: 'Landmark' },
  { nome: 'Diversos', cor: '#64748B', icone: 'CircleEllipsis' },
];

export const DEFAULT_CATEGORIAS_ENTRADA = [
  { nome: 'Salário', cor: '#059669', icone: 'Briefcase' },
  { nome: 'Investimentos', cor: '#16A34A', icone: 'TrendingUp' },
  { nome: 'Outras Receitas', cor: '#64748B', icone: 'CircleEllipsis' },
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
