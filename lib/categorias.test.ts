import { describe, it, expect } from 'vitest';
import { sortCategoriasNatural, sortCategoriasForSelect, categoriaSelectLabel } from './categorias';
import type { Categoria } from './supabase';

function cat(id: number, nome: string, parent_id: number | null = null): Categoria {
  return { id, user_id: 'u', nome, tipo: 'saida', cor: '#000', icone: 'Home', emoji: null, ativa: true, ordem: 0, parent_id, created_at: '' } as Categoria;
}

describe('sortCategoriasNatural', () => {
  it('ordena por nome em ordem natural (números como número, não string)', () => {
    const cats = [cat(1, 'Presente 10'), cat(2, 'Presente 2'), cat(3, 'Alimentação')];
    expect(sortCategoriasNatural(cats).map((c) => c.nome)).toEqual(['Alimentação', 'Presente 2', 'Presente 10']);
  });

  it('não modifica o array original', () => {
    const cats = [cat(1, 'B'), cat(2, 'A')];
    sortCategoriasNatural(cats);
    expect(cats.map((c) => c.nome)).toEqual(['B', 'A']);
  });
});

describe('sortCategoriasForSelect', () => {
  it('agrupa cada subcategoria logo após sua categoria-pai', () => {
    const cats = [
      cat(1, 'Família'), cat(2, 'Arthur', 1), cat(3, 'Alimentação'), cat(4, 'Mãe', 1),
    ];
    const ordered = sortCategoriasForSelect(cats).map((c) => c.nome);
    expect(ordered).toEqual(['Alimentação', 'Família', 'Arthur', 'Mãe']);
  });

  it('categoria órfã (pai inexistente/inativo) ainda aparece, ao final', () => {
    const cats = [cat(1, 'Moradia'), cat(2, 'Órfã', 999)];
    const ordered = sortCategoriasForSelect(cats).map((c) => c.nome);
    expect(ordered).toEqual(['Moradia', 'Órfã']);
  });
});

describe('categoriaSelectLabel', () => {
  it('categoria principal mostra só o próprio nome', () => {
    const all = [cat(1, 'Família')];
    expect(categoriaSelectLabel(all[0], all)).toBe('Família');
  });

  it('subcategoria mostra "Pai › Nome"', () => {
    const all = [cat(1, 'Família'), cat(2, 'Arthur', 1)];
    expect(categoriaSelectLabel(all[1], all)).toBe('Família › Arthur');
  });
});
