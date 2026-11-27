/**
 * Builds a tiny IPv4 MMDB database in memory for tests, so the location lookup
 * runs against the real reader without shipping a database file.
 *
 * Format: https://maxmind.github.io/MaxMind-DB/ (search tree with 24-bit
 * records, a 16-byte separator, the data section, then the metadata marker and
 * metadata map).
 */

function sizeBytes(type: number, size: number): Buffer {
  const extended = type > 7;
  const head = extended ? 0 : type << 5;
  let ctrl: number;
  let extra: Buffer;
  if (size < 29) {
    ctrl = head | size;
    extra = Buffer.alloc(0);
  } else if (size < 29 + 256) {
    ctrl = head | 29;
    extra = Buffer.from([size - 29]);
  } else if (size < 285 + 65536) {
    ctrl = head | 30;
    extra = Buffer.alloc(2);
    extra.writeUInt16BE(size - 285);
  } else {
    ctrl = head | 31;
    extra = Buffer.alloc(3);
    extra.writeUIntBE(size - 65821, 0, 3);
  }
  return Buffer.concat([Buffer.from(extended ? [ctrl, type - 7] : [ctrl]), extra]);
}

export function encode(value: unknown): Buffer {
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([sizeBytes(2, bytes.length), bytes]);
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 0 && value <= 0xffffffff) {
      let n = value;
      const bytes: number[] = [];
      while (n > 0) {
        bytes.unshift(n & 0xff);
        n = Math.floor(n / 256);
      }
      return Buffer.concat([sizeBytes(6, bytes.length), Buffer.from(bytes)]);
    }
    const b = Buffer.alloc(8);
    b.writeDoubleBE(value);
    return Buffer.concat([sizeBytes(3, 8), b]);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([sizeBytes(11, value.length), ...value.map(encode)]);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return Buffer.concat([sizeBytes(7, entries.length), ...entries.flatMap(([k, v]) => [encode(k), encode(v)])]);
  }
  throw new Error(`cannot encode ${String(value)}`);
}

function prefixBits(cidr: string): string {
  const [addr, len] = cidr.split('/');
  const bits = addr.split('.').map((p) => parseInt(p, 10).toString(2).padStart(8, '0')).join('');
  return bits.slice(0, parseInt(len, 10));
}

/** `records` maps IPv4 CIDR prefixes to the record returned for any address inside them. */
export function buildMmdb(records: Record<string, unknown>): Buffer {
  type Ref = { node: number } | { data: number } | null;
  const nodes: [Ref, Ref][] = [[null, null]];
  const chunks: Buffer[] = [];
  let dataLength = 0;

  for (const [cidr, record] of Object.entries(records)) {
    const encoded = encode(record);
    const offset = dataLength;
    chunks.push(encoded);
    dataLength += encoded.length;

    const bits = prefixBits(cidr);
    let node = 0;
    for (let i = 0; i < bits.length; i++) {
      const side = bits[i] === '1' ? 1 : 0;
      if (i === bits.length - 1) {
        nodes[node][side] = { data: offset };
      } else {
        let next = nodes[node][side];
        if (!next || !('node' in next)) {
          nodes.push([null, null]);
          next = { node: nodes.length - 1 };
          nodes[node][side] = next;
        }
        node = next.node;
      }
    }
  }

  const nodeCount = nodes.length;
  const value = (ref: Ref) => (!ref ? nodeCount : 'node' in ref ? ref.node : nodeCount + 16 + ref.data);
  const tree = Buffer.alloc(nodeCount * 6);
  nodes.forEach(([l, r], i) => {
    tree.writeUIntBE(value(l), i * 6, 3);
    tree.writeUIntBE(value(r), i * 6 + 3, 3);
  });

  const metadata = encode({
    node_count: nodeCount,
    record_size: 24,
    ip_version: 4,
    database_type: 'Helios-Test-City',
    languages: ['en'],
    binary_format_major_version: 2,
    binary_format_minor_version: 0,
    build_epoch: 1700000000,
    description: { en: 'Test database' },
  });

  return Buffer.concat([
    tree,
    Buffer.alloc(16),
    ...chunks,
    Buffer.from('ABCDEF4D61784D696E642E636F6D', 'hex'),
    metadata,
  ]);
}

/** A record shaped like the DB-IP / GeoIP2 City format. */
export function cityRecord(code: string, country: string, region?: string, lat = 10.5, lon = 20.25) {
  return {
    country: { iso_code: code, names: { en: country } },
    ...(region ? { subdivisions: [{ names: { en: region } }] } : {}),
    city: { names: { en: 'Somewhere' } },
    location: { latitude: lat, longitude: lon },
  };
}
