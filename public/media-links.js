// Construir apenas URLs de reprodução de plataformas conhecidas.
// A origem permanece HTTPS e o identificador é validado antes de gerar o iframe.
export function embeddedMediaLink(input) {
  let url;
  try { url = new URL(String(input ?? '').trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(host)) {
    const match = url.pathname.match(/^\/(p|reel|tv)\/([a-zA-Z0-9_-]{5,40})\/?$/);
    if (!match) return null;
    const [, type, code] = match;
    return {
      provider: 'Instagram',
      embedUrl: 'https://www.instagram.com/' + type + '/' + code + '/embed/',
      originalUrl: 'https://www.instagram.com/' + type + '/' + code + '/',
      format: type === 'reel' ? 'vertical' : 'instagram'
    };
  }
  let id = null;
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
    const watch = url.pathname === '/watch' ? url.searchParams.get('v') : null;
    const short = url.pathname.match(/^\/(?:shorts|live|embed)\/([a-zA-Z0-9_-]{11})\/?$/);
    id = watch || short?.[1] || null;
  } else if (host === 'youtu.be') {
    const short = url.pathname.match(/^\/([a-zA-Z0-9_-]{11})\/?$/);
    id = short?.[1] || null;
  }
  if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return {
      provider: 'YouTube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0',
      originalUrl: 'https://www.youtube.com/watch?v=' + id,
      format: 'landscape'
    };
  }
  return null;
}
