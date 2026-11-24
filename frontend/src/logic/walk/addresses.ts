// The addresses of Brno and round it (public/addresses.json, built by scripts/build-walk.mjs
// from OpenStreetMap), and finding one by what is typed: "Hybešova 17" finds the house,
// "Hybešova" the street. A number is found by either of its parts, as Czech houses have two -
// 255/17 is house 255, number 17 in its street - and people know them by either.
// No React and no map here, only data in, data out.

// ---------- settings ----------
// the middle of Brno (náměstí Svobody): of two streets of the same name - there is a Hybešova
// in Brno and in Kuřim - the one nearer to it comes first
const CENTRE = { lon: 16.6085, lat: 49.1951 };
// ------------------------------

// An address you can start or end a journey at: a house, or a street as a whole.
export type Address = {
  id: string; // "address:..." - never the id of a station
  name: string; // "Hybešova 255/17", or "Hybešova" for the street
  area: string; // the part of the town, "Staré Brno"; empty when it is not known
  street: boolean; // the street as a whole, not one house of it
  lon: number;
  lat: number;
};

type AddressFile = {
  west: number;
  south: number;
  streets: string[];
  cities: string[];
  places: [number, string, number, number, number][]; // street, number, city, x, y
};

// One street in one part of the town, with its houses.
type Street = {
  name: string;
  area: string;
  key: string; // the name as it is compared with what is typed
  far: number; // how far it is from the centre, in degrees squared: only to sort by
  houses: { number: string; parts: string[]; lon: number; lat: number }[];
};

export type AddressBook = Street[];

// The streets and their houses, from addresses.json.
export function readAddresses(file: AddressFile): AddressBook {
  const streets = new Map<string, Street>();
  for (const [street, number, city, x, y] of file.places) {
    const [name, area] = [file.streets[street], file.cities[city]];
    const id = `${name}|${area}`;
    let found = streets.get(id);
    if (!found) {
      found = { name, area, key: plain(name), far: 0, houses: [] };
      streets.set(id, found);
    }
    found.houses.push({
      number,
      parts: plain(number).split("/"),
      lon: (file.west + x) / 1e5,
      lat: (file.south + y) / 1e5,
    });
  }
  // One street is often written in a few ways: with the part of the town ("Veveří"), with the
  // town ("Brno"), or with neither. Streets of the same name near each other are one street,
  // named as most of its houses are; the Hybešova in Kuřim, far off, stays another one.
  const byName = new Map<string, Street[]>();
  for (const street of streets.values()) {
    byName.set(street.name, [...(byName.get(street.name) ?? []), street]);
  }
  const merged: Street[] = [];
  for (const named of byName.values()) {
    const groups: Street[][] = [];
    for (const street of named.sort((a, b) => b.houses.length - a.houses.length)) {
      const near = groups.find((group) => closeBy(group[0], street));
      if (near) near.push(street);
      else groups.push([street]);
    }
    for (const group of groups) {
      const area = group.find((street) => street.area)?.area ?? "";
      const houses = new Map<string, Street["houses"][number]>();
      for (const street of group) {
        for (const house of street.houses)
          if (!houses.has(house.number)) houses.set(house.number, house);
      }
      merged.push({ ...group[0], area, houses: [...houses.values()] });
    }
  }
  for (const street of merged) {
    const [house] = street.houses;
    street.far = (house.lon - CENTRE.lon) ** 2 + (house.lat - CENTRE.lat) ** 2;
  }
  return merged;
}

// Whether two streets of one name are near enough to be the same street: their first houses
// within about a kilometre and a half.
function closeBy(one: Street, other: Street): boolean {
  const [a, b] = [one.houses[0], other.houses[0]];
  return Math.abs(a.lon - b.lon) < 0.02 && Math.abs(a.lat - b.lat) < 0.0135;
}

// The addresses that match what was typed, the best first. A street matches when its name
// begins with the text, or one of its later words does ("náměstí" finds "Moravské náměstí");
// a number after it must begin one of the numbers of the house. Without a number, each street
// is one address, at the house in its middle. Of equally good ones, the nearer to the centre
// of Brno first.
export function searchAddresses(book: AddressBook, text: string, limit = 6): Address[] {
  const typed = plain(text.split(",")[0]);
  const match = typed.match(/^(.*?)\s*(\d+[a-z]?(?:\/\d*[a-z]?)?)?$/);
  const [wanted, number] = [match?.[1].trim() ?? "", match?.[2]];
  if (wanted.length < 2) return [];
  const found: { address: Address; rank: number; far: number }[] = [];
  for (const street of book) {
    const at = street.key.indexOf(wanted);
    if (at < 0 || (at > 0 && street.key[at - 1] !== " ")) continue;
    const rank = (at === 0 ? 0 : 1) + (street.key === wanted ? 0 : 2);
    if (number === undefined) {
      found.push({ address: middleOf(street), rank, far: street.far });
      continue;
    }
    for (const house of street.houses) {
      const exact = house.parts.includes(number) || plain(house.number) === number;
      if (!exact && !house.parts.some((part) => part.startsWith(number))) continue;
      found.push({
        address: houseOf(street, house),
        rank: rank + (exact ? 0 : 4),
        far: street.far,
      });
    }
  }
  found.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.far - b.far ||
      a.address.name.localeCompare(b.address.name, "cs", { numeric: true }),
  );
  return found.slice(0, limit).map((item) => item.address);
}

function houseOf(street: Street, house: Street["houses"][number]): Address {
  return {
    id: `address:${street.name}|${street.area}|${house.number}`,
    name: `${street.name} ${house.number}`,
    area: street.area,
    street: false,
    lon: house.lon,
    lat: house.lat,
  };
}

// A street as one place: the house nearest to the middle of all of its houses.
function middleOf(street: Street): Address {
  const lon = street.houses.reduce((sum, house) => sum + house.lon, 0) / street.houses.length;
  const lat = street.houses.reduce((sum, house) => sum + house.lat, 0) / street.houses.length;
  const near = (house: Street["houses"][number]) => (house.lon - lon) ** 2 + (house.lat - lat) ** 2;
  const middle = street.houses.reduce((best, house) => (near(house) < near(best) ? house : best));
  return {
    id: `address:${street.name}|${street.area}`,
    name: street.name,
    area: street.area,
    street: true,
    lon: middle.lon,
    lat: middle.lat,
  };
}

// Without accents and in lower case, to compare what people type with what we have.
function plain(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}
