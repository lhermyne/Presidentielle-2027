export const percent = value => Number.isFinite(value) ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value)} %` : 'Indisponible';
export const integer = value => new Intl.NumberFormat('fr-FR').format(value);
export function dateLabel(value, compact = false) {
  if (!value) return 'Indisponible';
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.valueOf())) return 'Indisponible';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: compact ? 'short' : 'long', ...(compact ? {} : { year: 'numeric' }), timeZone: 'Europe/Paris' }).format(date);
}
export const shortName = name => name.split(' ').slice(1).join(' ') || name;
export function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
