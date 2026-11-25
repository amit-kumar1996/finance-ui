export const formatMoney = (amount: string): string => {
  const negative = amount.startsWith("-");
  const [whole = "0", fraction = "00"] = (negative ? amount.slice(1) : amount).split(".");
  const tail = whole.slice(-3);
  const head = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}₹${head ? `${head},` : ""}${tail}.${fraction.padEnd(2, "0").slice(0, 2)}`;
};

export const amountInPaise = (value: string): bigint => {
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const paise =
    BigInt(whole || "0") * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2) || "0");
  return negative ? -paise : paise;
};

export const sumMoney = (values: string[]): string => {
  const total = values.reduce((sum, value) => sum + amountInPaise(value), 0n);
  const negative = total < 0n;
  const absolute = negative ? -total : total;
  return `${negative ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
};

export const monthLabel = (month: string): string => {
  const [year = "", number = "1"] = month.split("-");
  return new Intl.DateTimeFormat("en-IN", { month: "short" }).format(
    new Date(Date.UTC(Number(year), Number(number) - 1, 1)),
  );
};
