import { describe, expect, it } from "vitest";
// The label encoders live in the frontend; they're pure functions, so they're tested here with the rest.
import { CODE128, code128Values, ean13Bits, isValidEan13, productSymbol, symbolModules } from "../../src/lib/barcode.js";
import { inStoreBarcode } from "../src/routes/products.js";

describe("barcode encoding", () => {
  it("has a well-formed Code 128 table", () => {
    expect(CODE128).toHaveLength(107);
    CODE128.slice(0, 106).forEach((p) => {
      expect(p).toHaveLength(6);
      expect([...p].reduce((s, d) => s + Number(d), 0)).toBe(11);
    });
    expect([...CODE128[106]].reduce((s, d) => s + Number(d), 0)).toBe(13);
    expect(new Set(CODE128).size).toBe(107);
  });

  it("encodes Code 128 B with the right checksum", () => {
    // Start B (104) + data + checksum + stop; checksum = (104 + Σ value × position) mod 103.
    const v = code128Values("WM-004");
    expect(v[0]).toBe(104);
    expect(v.slice(1, -2)).toEqual([55, 45, 13, 16, 16, 20]);
    expect(v.at(-2)).toBe((104 + 55 * 1 + 45 * 2 + 13 * 3 + 16 * 4 + 16 * 5 + 20 * 6) % 103);
    expect(v.at(-1)).toBe(106);
    expect(() => code128Values("café")).toThrow();
  });

  it("validates and encodes EAN-13", () => {
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("4006381333932")).toBe(false);
    expect(isValidEan13("036000291452")).toBe(true); // UPC-A
    const bits = ean13Bits("4006381333931");
    expect(bits).toHaveLength(95);
    expect(bits.slice(0, 3)).toBe("101");
    expect(bits.slice(45, 50)).toBe("01010");
    expect(bits.slice(-3)).toBe("101");
    // Leading digit 4 → parity LGLLGG: second digit (0) uses the G code.
    expect(bits.slice(3, 10)).toBe("0001101"); // 0, L
    expect(bits.slice(10, 17)).toBe("0100111"); // 0, G
  });

  it("chooses EAN-13 for retail barcodes and Code 128 otherwise", () => {
    expect(productSymbol({ barcode: "4006381333931", sku: "X" })).toMatchObject({ format: "EAN-13", text: "4006381333931" });
    expect(symbolModules(productSymbol({ barcode: "4006381333931", sku: "X" }))).toBe(95);
    expect(productSymbol({ barcode: null, sku: "HC-020" })).toMatchObject({ format: "Code 128", text: "HC-020" });
    // Not a valid EAN check digit → falls back to Code 128 of the code itself.
    expect(productSymbol({ barcode: "4006381333932", sku: "X" })).toMatchObject({ format: "Code 128", text: "4006381333932" });
    // In-store codes from the server are valid EAN-13s with the 200 prefix.
    expect(isValidEan13(inStoreBarcode(12))).toBe(true);
    expect(inStoreBarcode(12).startsWith("200000000012")).toBe(true);
  });
});
