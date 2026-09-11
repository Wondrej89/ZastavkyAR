export function formatDatasetDate(meta, locale = 'cs-CZ') {
  const date = new Date(meta?.generatedAt);
  if (Number.isNaN(date.getTime())) return 'datum verze není k dispozici';
  return date.toLocaleString(locale, {
    day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

export function datasetReadyMessage(meta, locale = 'cs-CZ') {
  return `Zastávky jsou správně stažené. Poslední verze dat: ${formatDatasetDate(meta, locale)}.`;
}
