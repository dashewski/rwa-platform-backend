import { lookup } from 'node:dns/promises';

/**
 * SSRF helpers shared by subscription validation (WebhookService) and
 * delivery (DeliveryService): a webhook destination must never be a private,
 * link-local or metadata address — neither when the endpoint is created nor
 * right before a request is sent.
 */

const isPrivateIpv4 = (address: string): boolean => {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true; // malformed — treat as unsafe
  }
  const [a, b, c] = parts;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 (CGNAT)
    (a === 169 && b === 254) || // 169.254.0.0/16 (link-local, cloud metadata)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 0 && c === 0) || // 192.0.0.0/24 (IETF protocol assignments)
    (a === 192 && b === 0 && c === 2) || // 192.0.2.0/24 (TEST-NET-1)
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 (benchmarking)
    (a === 198 && b === 51 && c === 100) || // 198.51.100.0/24 (TEST-NET-2)
    (a === 203 && b === 0 && c === 113) || // 203.0.113.0/24 (TEST-NET-3)
    a >= 224 // multicast / reserved
  );
};

export const isPrivateAddress = (address: string): boolean => {
  if (!address.includes(':')) {
    return isPrivateIpv4(address);
  }
  const lower = address.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('::ffff:')) return isPrivateIpv4(lower.slice(7)); // IPv4-mapped
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 (unique local)
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb'))
    return true; // fe80::/10
  if (/^fe[c-f]/.test(lower)) return true; // fec0::/10 (deprecated site-local)
  if (lower.startsWith('ff')) return true; // ff00::/8 (multicast)
  if (lower.startsWith('2001:db8')) return true; // 2001:db8::/32 (documentation)
  return false;
};

/**
 * Comma-separated allowlist of hostnames exempt from the private-address
 * blocklist (`SSRF_ALLOWED_HOSTS`). Dev/test only: on the local stand the
 * webhooks service delivers to the e2e receiver running on the Docker host
 * (reached as host.docker.internal). Empty — i.e. no exemptions — by
 * default; production behaviour is unchanged.
 */
export const isAllowedHost = (hostname: string): boolean => {
  const allowed = (process.env.SSRF_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(hostname.toLowerCase());
};

/** Hostnames in URLs may arrive IPv6-bracketed: `[::1]`. */
export const normalizeHostname = (hostname: string): string => hostname.replace(/^\[|\]$/g, '');

/** All A/AAAA records of a hostname; an empty array when resolution fails. */
export const resolveHostnameAddresses = async (hostname: string): Promise<string[]> => {
  const resolved = await lookup(hostname, { all: true, verbatim: true }).catch(() => []);
  return resolved.map((record) => record.address);
};
