/** Customers see order IDs, so keep them short. */
export function makeOrderId(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(Math.random() * 90000 + 10000);
  return `AH-${year}-${seq}`;
}

export function shortTxHash(hash: string): string {
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function explorerUrl(hash: string): string {
  return `https://testnet.arcscan.app/tx/${hash}`;
}
