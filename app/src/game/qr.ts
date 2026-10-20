import QRCode from 'qrcode'

/** QR code as an SVG data URL (no canvas needed). */
export async function qrDataUrl(text: string): Promise<string> {
  const svg = await QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#0A0A0B', light: '#FFFFFF' } })
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
