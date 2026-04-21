const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE = BigInt(ALPHABET.length);

function encode(num) {
  let n = BigInt(num);
  if (n === 0n) return '0';
  let result = '';
  while (n > 0n) {
    result = ALPHABET[Number(n % BASE)] + result;
    n = n / BASE;
  }
  return result;
}

function decode(str) {
  let result = 0n;
  for (const char of str) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base62 character: ${char}`);
    result = result * BASE + BigInt(idx);
  }
  return Number(result);
}

module.exports = { encode, decode };
