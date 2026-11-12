export function parseMicrosoftDate(value: string, order: "ISO" | "DMY" | "MDY") {
  const input = value.trim();
  if (!input) return null;
  // ISO timestamps retain their calendar date, without timezone/day shifting.
  let date = input;
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s?(?:AM|PM))?(?:Z|[+-]\d{2}:?\d{2})?)?$/i.exec(input);
  if (iso) date = iso[1];
  else {
    const numeric = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:[ ,]+\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:AM|PM))?)?$/.exec(input);
    if (!numeric) throw new Error("Unsupported date. Use ISO YYYY-MM-DD or select day-first/month-first for numeric dates (optional time).");
    const first = Number(numeric[1]), second = Number(numeric[2]);
    let day: number, month: number;
    if (order === "DMY" || (order === "ISO" && first > 12)) { day = first; month = second; }
    else if (order === "MDY" || (order === "ISO" && second > 12)) { month = first; day = second; }
    else throw new Error("Ambiguous date. Choose DD/MM/YYYY or MM/DD/YYYY in the date-format selector.");
    date = `${numeric[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("Invalid calendar date.");
  return date;
}
