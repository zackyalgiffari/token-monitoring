export type Theme = 'dark' | 'light';

export function getTheme(): Theme {
  return (localStorage.getItem('tm-theme') as Theme) || 'dark';
}

export function setTheme(t: Theme) {
  localStorage.setItem('tm-theme', t);
  document.documentElement.setAttribute('data-theme', t);
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
