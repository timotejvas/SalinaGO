// The sign that something is live, as Maps shows it: a dot and two arcs going out of it, which
// light up in turn. Drawn in the colour of the text around it; the styles are in styles/page.css.

export default function LiveWaves() {
  return (
    <svg className="live-waves" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <circle cx="4" cy="12" r="1.8" fill="currentColor" />
      <path d="M4 7.5a4.5 4.5 0 0 1 4.5 4.5" className="wave one" />
      <path d="M4 3.5a8.5 8.5 0 0 1 8.5 8.5" className="wave two" />
    </svg>
  );
}

// "In 7 min", "Now": the first word of a line of the panel.
export const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
