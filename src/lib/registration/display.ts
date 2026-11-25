export function formatEvent(date: Date | string, timezone: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long", timeStyle: "short", timeZone: timezone,
  }).format(new Date(date));
}

export function formatBudget(min: number, max: number) {
  const format = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
  return min === max ? `$ ${format.format(min)} COP` : `$ ${format.format(min)} a $ ${format.format(max)} COP`;
}
