// The colours of the lines. Brno gives every tram line a colour of its own and the timetable
// carries them, so the map and the panel both draw a line in the colour people know it by.
// Both halves of the app ask here, which is why this is not inside map/ or ui/.

import type { TransitData } from "./logic/timetable/loadData";
import type { Kind } from "./logic/timetable/lines";

// the colour of a kind of vehicle, for the few lines the timetable gives no colour of their own
export const KIND_COLORS = { tram: "#ff5a5f", trolleybus: "#4dabf7", bus: "#ffd43b" };

// The colour a line is drawn in. Brno gives every tram line a colour of its own - 4 is orange,
// 12 azure - and the timetable carries them, so the map uses those rather than inventing its
// own: the line on the screen is the colour people know it by. Trolleybuses are green, city
// buses blue, night buses yellow; two lines of one kind can look alike, which is what
// legColors() below is for.
export function lineColor(data: TransitData, kind: Kind, line: string) {
  return data.lineColors[`${kind}|${line}`] ?? KIND_COLORS[kind];
}

// Two night buses are both yellow, tram 6 and bus 68 are both blue, and a journey from one to
// the other would be one colour from end to end with the change in the middle invisible. A leg
// whose colour is near one of the legs before it is drawn lighter - as little as is needed for
// the eye to tell them apart. The shares are how much white is mixed in.
const SHADES = [0, 0.35, 0.55, 0.75];
const APART = 110; // how far apart two colours must be, as points in red, green and blue (0-255)

// The colour of each leg of a journey, in order, told the colour of the line of each.
export function legColors(colors: string[]): string[] {
  const drawn: string[] = [];
  for (const color of colors) {
    const shades = SHADES.map((share) => lighten(color, share));
    const apart = (shade: string) => drawn.every((other) => distance(shade, other) >= APART);
    drawn.push(shades.find(apart) ?? shades[shades.length - 1]);
  }
  return drawn;
}

// How far apart two colours are, as points in red, green and blue.
function distance(one: string, other: string) {
  const [a, b] = [channels(one), channels(other)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// The red, green and blue of "#5bc8f5" or of "rgb(91, 200, 245)", 0 - 255.
function channels(color: string): number[] {
  if (color.startsWith("#")) return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return (color.match(/\d+/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number);
}

// A hex colour mixed with white by the given share.
function lighten(color: string, share: number) {
  if (share === 0) return color;
  const value = parseInt(color.slice(1), 16);
  const part = (shift: number) => {
    const channel = (value >> shift) & 0xff;
    return Math.round(channel + (255 - channel) * share);
  };
  return `rgb(${part(16)}, ${part(8)}, ${part(0)})`;
}

// The colour to write on a line's colour so that it reads: white on a dark one, near black on a
// light one (the azure of 12, the yellow of the night buses). By how light the colour looks to
// the eye, not by its numbers.
export function inkOn(color: string): string {
  // "#5bc8f5", or "rgb(91, 200, 245)" for a lighter shade (lighten, above)
  const [r, g, b] = channels(color).map((channel) => channel / 255);
  const light = 0.299 * r + 0.587 * g + 0.114 * b;
  return light > 0.62 ? "#101016" : "#ffffff";
}
