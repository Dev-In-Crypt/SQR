const FAVICON_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#0f7a66"/>
  <path d="M17 22h30l-5 20H22l-5-20zm9 7a3 3 0 100 6 3 3 0 000-6zm12 0a3 3 0 100 6 3 3 0 000-6z" fill="#fff"/>
</svg>`;

export function GET() {
  return new Response(FAVICON_SVG, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400"
    }
  });
}
