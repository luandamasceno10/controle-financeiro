export function sortByDataHora(
  a: { data: string; hora?: string | null },
  b: { data: string; hora?: string | null }
) {
  const da = `${a.data}T${a.hora || '00:00'}`;
  const db = `${b.data}T${b.hora || '00:00'}`;
  return db.localeCompare(da);
}
