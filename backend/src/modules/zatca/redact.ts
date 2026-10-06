export function redactZatcaText(s: unknown, max = 1500) {
  return String(s || '')
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[redacted-pem]')
    .replace(/"binarySecurityToken"\s*:\s*"[^"]*"/gi, '"binarySecurityToken":"[redacted]"')
    .replace(/"secret"\s*:\s*"[^"]*"/gi, '"secret":"[redacted]"')
    .replace(/Authorization:\s*Basic\s+\S+/gi, 'Authorization:[redacted]')
    .replace(/\bOTP["']?\s*[:=]\s*["']?\d+/gi, 'OTP:[redacted]')
    .replace(/j1\.[A-Za-z0-9+/=]+/g, '[redacted-secret]')
    .slice(0, max);
}
