import { describe, expect, it } from "vitest";
import { centsToMoneyInput, formatCurrency, moneyInputToCents } from "./money";

describe("money helpers", () => {
  it("parses pesos without floating point drift", () => {
    expect(moneyInputToCents("1234.56")).toBe(123456);
    expect(moneyInputToCents("1,234.5")).toBe(123450);
  });

  it("rejects malformed monetary input", () => {
    expect(moneyInputToCents("12.999")).toBeNull();
    expect(moneyInputToCents("abc")).toBeNull();
  });

  it("creates stable form and display values", () => {
    expect(centsToMoneyInput(4250)).toBe("42.50");
    expect(formatCurrency(4250)).toContain("42.50");
  });
});

