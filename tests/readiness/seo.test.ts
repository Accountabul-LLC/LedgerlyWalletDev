import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const pages = {
  '/': 'index.tsx',
  '/wallets': 'wallets.tsx',
  '/security': 'security.tsx',
  '/security-center': 'security-center.tsx',
  '/security/audit': 'security_.audit.tsx',
  '/privacy': 'privacy.tsx',
  '/terms': 'terms.tsx',
  '/risk': 'risk.tsx',
  '/contact': 'contact.tsx',
};

describe('production SEO configuration', () => {
  it('uses matching custom-domain canonicals and sitemap URLs for public pages', () => {
    const sitemap = read('public/sitemap.xml');
    for (const [path, file] of Object.entries(pages)) {
      const source = read(`src/routes/${file}`);
      expect(source).toContain("rel: 'canonical'");
      expect(source).toContain(`https://ledgerlywallet.com${path}`);
      expect(source).not.toContain('xrpl-asset-explorer.lovable.app');
      expect(sitemap).toContain(`<loc>https://ledgerlywallet.com${path}</loc>`);
    }
    expect(read('public/robots.txt')).toContain('Sitemap: https://ledgerlywallet.com/sitemap.xml');
  });

  it('publishes Ledgerly icons and preview images without Lovable branding', () => {
    const root = read('src/routes/__root.tsx');
    const manifest = JSON.parse(read('public/site.webmanifest'));
    const preview = 'https://ledgerlywallet.com/og-image.png';

    expect(root).toContain(`content: '${preview}'`);
    expect(root).toContain("property: 'og:image'");
    expect(root).toContain("property: 'og:site_name', content: 'Ledgerly'");
    expect(root).toContain("name: 'twitter:image'");
    expect(root).toContain("name: 'theme-color', content: '#f5f5ef'");
    expect(root).toContain("rel: 'apple-touch-icon', href: '/apple-touch-icon.png'");
    expect(root).toContain("rel: 'manifest', href: '/site.webmanifest'");
    expect(root).toContain("href: '/favicon.ico'");
    expect(root).toContain("href: '/favicon.png'");
    expect(root).toContain("href: '/ledgerly-favicon.svg'");
    expect(root.toLowerCase()).not.toContain('lovable');
    expect(root).not.toContain('lovable.dev');
    expect(root).not.toContain('lovable-uploads');

    expect(manifest.name).toBe('Ledgerly');
    expect(manifest.short_name).toBe('Ledgerly');
    expect(manifest.theme_color).toBe('#f5f5ef');
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual([
      '/icon-192.png',
      '/icon-512.png',
    ]);
    expect(JSON.stringify(manifest).toLowerCase()).not.toContain('lovable');
  });

  it('excludes account and wallet screens without blocking crawler access', () => {
    const config = JSON.parse(read('vercel.json'));
    for (const source of ['/wallet/:path*', '/auth', '/reset-password', '/balances']) {
      expect(config.headers).toContainEqual({
        source,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
      });
    }
    const sitemap = read('public/sitemap.xml');
    for (const path of ['/wallet', '/auth', '/reset-password', '/balances']) {
      expect(sitemap).not.toContain(`<loc>https://ledgerlywallet.com${path}</loc>`);
    }
    expect(read('public/robots.txt')).not.toContain('Disallow:');
  });
});
