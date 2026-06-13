import { THEMES } from '../themes.js';

/**
 * Header theme switcher — one swatch per theme. Clicking a swatch sets the
 * active theme; App persists it and applies the matching CSS variables. The
 * active swatch gets a ring and the rest sit dimmed until hovered.
 */
export default function ThemeSwitcher({ theme, setTheme, className = '' }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`} role="group" aria-label="Theme">
      {Object.entries(THEMES).map(([id, t]) => {
        const active = id === theme;
        return (
          <button
            key={id}
            type="button"
            title={t.label}
            aria-label={`${t.label} theme`}
            aria-pressed={active}
            onClick={() => setTheme(id)}
            style={{ background: t.dot }}
            className={`h-4 w-4 rounded-full border transition
              ${active
                ? 'scale-110 border-[var(--fg-strong)]'
                : 'border-[var(--line)] opacity-60 hover:opacity-100'}`}
          />
        );
      })}
    </div>
  );
}
