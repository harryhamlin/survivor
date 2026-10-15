// Addresses checked against the restaurants' websites; map coordinates from
// VisitCopenhagen / VisitDenmark, and Spiseliv for FAMO Metro (15 October 2026).
export const morgans = [
  {
    id: 1, name: 'Hos Fischer', shortName: 'Fischer',
    address: 'Victor Borges Plads 12, 2100 København Ø', area: 'Østerbro',
    detail: 'Italian trattoria serving antipasti, pasta, and wine.',
    lat: 55.70173299, lon: 12.58074338,
    websiteUrl: 'https://hosfischer.dk/restaurant-hosfischer/',
  },
  {
    id: 2, name: 'FAMO Metro',
    address: 'Øster Søgade 114, 2100 København Ø', area: 'Østerbro',
    detail: 'Italian osteria by the lakes with a changing seasonal menu.',
    lat: 55.6957008, lon: 12.5794936,
    websiteUrl: 'https://www.famo.dk/famo-metro',
  },
  {
    id: 3, name: 'Restaurant Palægade', shortName: 'Palægade',
    address: 'Palægade 8, 1261 København K', area: 'Indre By',
    detail: 'Danish smørrebrød at lunch and contemporary takes on classic cooking in the evening.',
    lat: 55.68233785, lon: 12.58638312,
    websiteUrl: 'https://formelbgroup.dk/palaegade/',
  },
  {
    id: 4, name: 'Restaurant Møntergade', shortName: 'Møntergade',
    address: 'Møntergade 19, 1116 København K', area: 'Indre By',
    detail: 'Danish lunch dishes and Danish-French brasserie cooking in the evening.',
    lat: 55.6822072, lon: 12.57984393,
    websiteUrl: 'https://montergade.dk/',
  },
  {
    id: 5, name: 'Fishmarket',
    address: 'Hovedvagtsgade 2, 1103 København K', area: 'Indre By',
    detail: 'Fish bistro near Kongens Nytorv serving seafood, shellfish, and oysters.',
    lat: 55.6807817, lon: 12.584168299,
    websiteUrl: 'https://www.fishmarket.dk/',
  },
  {
    id: 6, name: 'Søllerød Kro',
    address: 'Søllerødvej 35, 2840 Holte', area: 'Søllerød',
    detail: 'Historic inn north of Copenhagen serving French-inspired fine dining.',
    lat: 55.8133647, lon: 12.4952041,
    websiteUrl: 'https://www.soelleroed-kro.dk/',
  },
  {
    id: 7, name: 'NO.2',
    address: 'Nicolai Eigtveds Gade 32, 1402 København K', area: 'Christianshavn',
    detail: 'Harbourfront restaurant serving modern cooking focused on Danish produce.',
    lat: 55.67247472, lon: 12.58478058,
    websiteUrl: 'https://www.nummer2.dk/en/',
  },
].map((place) => ({
  ...place,
  priority: false,
  mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name}, ${place.address}`)}`,
}));
