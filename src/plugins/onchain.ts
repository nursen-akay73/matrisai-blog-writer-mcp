/**
 * On-chain proof stub — Quantex / blockchain entegrasyonu için yer tutucu.
 * Implementasyon bilinçli olarak boş bırakılmıştır.
 */

/** Gelecekte blog kanıtının zincire yazılması için sözleşme. */
export interface OnChainProofPayload {
  postId: string;
  contentHash: string;
  publishedAt: string;
  /** TODO: network id (örn. ethereum, polygon) */
  network?: string;
}

/**
 * Onaylanan blog için on-chain proof üretir.
 * TODO: Web3 provider + smart contract entegrasyonu eklenecek.
 */
export async function submitOnChainProof(
  _payload: OnChainProofPayload
): Promise<{ txHash: string } | null> {
  // TODO: blockchain entegrasyonu — şu an stub, hiçbir şey göndermez
  return null;
}
