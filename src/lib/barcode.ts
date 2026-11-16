/**
 * Barcode encoders for printing labels. Each returns the symbol as a run of module widths
 * (bar, space, bar, …, starting with a bar) plus the text printed under it. No quiet zones are
 * included; the renderer adds them.
 */
export interface BarcodeSymbol {
  format: "EAN-13" | "Code 128";
  /** Alternating bar/space widths in modules, starting with a bar. */
  widths: number[];
  text: string;
}

// ---------- EAN-13 ----------

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = L.map((code) => [...code].map((b) => (b === "1" ? "0" : "1")).reverse().join(""));
const R = L.map((code) => [...code].map((b) => (b === "1" ? "0" : "1")).join(""));
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13CheckDigit(body12: string) {
  const sum = [...body12].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/** True for a 13-digit code with a correct check digit (12-digit UPC-A counts, as EAN-13 with a leading 0). */
export function isValidEan13(code: string) {
  const c = code.length === 12 ? "0" + code : code;
  return /^\d{13}$/.test(c) && ean13CheckDigit(c.slice(0, 12)) === Number(c[12]);
}

/** Bit string (1 = bar) of a valid EAN-13 / UPC-A, 95 modules. */
export function ean13Bits(code: string) {
  const c = code.length === 12 ? "0" + code : code;
  if (!isValidEan13(c)) throw new Error(`Not a valid EAN-13: ${code}`);
  const parity = PARITY[Number(c[0])];
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? L : G)[Number(c[i])];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[Number(c[i])];
  return bits + "101";
}

const bitsToWidths = (bits: string) => {
  const widths: number[] = [];
  let run = 1;
  for (let i = 1; i <= bits.length; i++) {
    if (bits[i] === bits[i - 1]) run++;
    else {
      widths.push(run);
      run = 1;
    }
  }
  return widths;
};

// ---------- Code 128 (set B: printable ASCII) ----------

/** Bar/space widths for symbol values 0–106 (106 = stop, which has a final 2-module bar). */
export const CODE128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
const START_B = 104;
const STOP = 106;

/** Symbol values (start, data, checksum, stop) for printable ASCII text. */
export function code128Values(text: string) {
  if (!text) throw new Error("Nothing to encode");
  const data = [...text].map((ch) => {
    const v = ch.charCodeAt(0) - 32;
    if (v < 0 || v > 95) throw new Error(`Can't encode "${ch}" in Code 128`);
    return v;
  });
  const checksum = data.reduce((s, v, i) => s + v * (i + 1), START_B) % 103;
  return [START_B, ...data, checksum, STOP];
}

// ---------- Choosing a symbology ----------

/**
 * The best symbol for a product: its EAN-13/UPC barcode when it has a valid one, otherwise Code 128
 * of the barcode or SKU. Checkout looks codes up by barcode, then SKU, so either scans.
 */
export function productSymbol(p: { barcode: string | null; sku: string }): BarcodeSymbol {
  const code = p.barcode ?? p.sku;
  if (/^\d{12,13}$/.test(code) && isValidEan13(code)) {
    return { format: "EAN-13", widths: bitsToWidths(ean13Bits(code)), text: code.length === 12 ? "0" + code : code };
  }
  const widths = code128Values(code).flatMap((v) => [...CODE128[v]].map(Number));
  return { format: "Code 128", widths, text: code };
}

/** Total width in modules. */
export const symbolModules = (s: BarcodeSymbol) => s.widths.reduce((a, b) => a + b, 0);
