const normalizeName = (name = '') => name.normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const names = (place) => [place.name, place.shortName].filter(Boolean).map(normalizeName);

const savedId = (place) => {
  if (!place.mapsUrl) return null;
  return new URL(place.mapsUrl).searchParams.get('cid');
};

function samePlace(a, b) {
  const id = savedId(a);
  const otherId = savedId(b);
  // Distinct saved venue IDs must not merge just because branches are nearby.
  if (id && otherId) return id === otherId;
  // Sources can spell the same venue differently or put its entrance a few
  // metres apart. Require both a matching name and a nearby location.
  const longitudeMetres = (a.lon - b.lon) * 111320 * Math.cos(a.lat * Math.PI / 180);
  const latitudeMetres = (a.lat - b.lat) * 111320;
  if (Math.hypot(latitudeMetres, longitudeMetres) > 100) return false;
  return names(a).some((name) => names(b).includes(name));
}

export default function addListMemberships(lists) {
  const entries = Object.entries(lists);
  return Object.fromEntries(entries.map(([key, list]) => [key, {
    ...list,
    places: list.places.map((place) => {
      const memberships = entries.filter(([, other]) => other.places.some((candidate) => samePlace(place, candidate)))
        .map(([key, list]) => ({ key, label: list.label }));
      return { ...place, memberships, shared: memberships.length > 1 };
    }),
  }]));
}
