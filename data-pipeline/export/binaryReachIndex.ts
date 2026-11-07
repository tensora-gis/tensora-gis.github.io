/**
 * Binary Reach Index Generator
 *
 * Implements Section 4.2 of the Global River Digital Twin Plan.
 * Creates an index mapping reach_id to byte offset and spatial coordinates
 * for high-speed client-side lazy-loading without downloading gigabytes of raw data.
 */

export interface ReachIndexEntry {
  reachId: string;
  byteOffset: number;
  byteLength: number;
  lat: number;
  lng: number;
  dischargeM3s: number;
  widthM: number;
}

export function buildReachIndexBuffer(entries: ReachIndexEntry[]): ArrayBuffer {
  // Serializes entries into a binary buffer:
  // Header: [Magic 'RIV1' 4B, Count 4B]
  // Per entry: [ReachId 32B UTF-8, Offset 4B, Length 4B, Lat 4B float, Lng 4B float, Q 4B float, W 4B float] = 56 bytes
  const headerSize = 8;
  const entrySize = 56;
  const totalBytes = headerSize + entries.length * entrySize;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  // Write Magic 'RIV1'
  view.setUint8(0, 0x52); // 'R'
  view.setUint8(1, 0x49); // 'I'
  view.setUint8(2, 0x56); // 'V'
  view.setUint8(3, 0x31); // '1'
  view.setUint32(4, entries.length, true);

  const encoder = new TextEncoder();

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const offset = headerSize + i * entrySize;

    // ReachId (first 32 bytes)
    const idBytes = encoder.encode(e.reachId);
    const idSlice = new Uint8Array(buffer, offset, 32);
    idSlice.set(idBytes.subarray(0, 31));

    view.setUint32(offset + 32, e.byteOffset, true);
    view.setUint32(offset + 36, e.byteLength, true);
    view.setFloat32(offset + 40, e.lat, true);
    view.setFloat32(offset + 44, e.lng, true);
    view.setFloat32(offset + 48, e.dischargeM3s, true);
    view.setFloat32(offset + 52, e.widthM, true);
  }

  return buffer;
}
