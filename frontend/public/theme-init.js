/* eslint-disable no-undef, no-empty */
(function() {
  try {
    const stored = localStorage.getItem('pier-theme');
    const theme = (stored === 'light' || stored === 'dark') ? stored : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]') || document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#000000');
    if (!document.querySelector('meta[name="theme-color"]')) document.head.appendChild(meta);
  } catch {}
})();
