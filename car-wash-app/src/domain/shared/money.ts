export type Money = { readonly amountCents: number; readonly currency: string };

export function formatMoney(m: Money, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: m.currency.toUpperCase() })
    .format(m.amountCents / 100);
}
