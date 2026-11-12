// Shared contract for the download, Microsoft validation, and preview headings.
export const MICROSOFT_COLUMNS = ["Product name", "Assigned licenses", "Purchased quantity", "Available licenses", "Subscription status", "Renewal or expiration date", "Billing profile"] as const;

export function licenseCsvTemplate() {
  const example = ['EXAMPLE ONLY - Fictional "Office, Demo" product', "2", "5", "3", "Active", "2099-12-31", "EXAMPLE ONLY - Fictional billing profile"];
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  // UTF-8 BOM and CRLF support Excel; header spelling and order stay exact.
  return "\uFEFF" + MICROSOFT_COLUMNS.join(",") + "\r\n" + example.map(quote).join(",") + "\r\n";
}
