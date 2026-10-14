// Address coordinates geocoded from OpenStreetMap via Photon.
// Roaster descriptions and visiting notes supplied for this private shortlist.
const websites = [
  "https://www.aprilcoffeeroasters.com/shops/april-store",
  "https://coffeecollective.dk/pages/coffee-shop/bernikow",
  "https://lacabra.com/pages/montergade",
  "https://www.prologcoffee.com/",
  "https://norange.dk/",
  "https://www.saftig.coffee/",
  "https://pontescoffee.com/",
  "https://nomaprojects.com/pages/contact",
  "https://www.andersenmaillard.dk/",
  "https://theartisan.dk/",
  "https://impactroasters.dk/",
  "https://www.kontracoffee.com/kaffehuset",
  "https://roast.com/locations/",
  "https://yellowbirdcoffee.live/"
];

export const roasters = [
  { id: 1, name: 'April Coffee Store & Showroom', shortName: 'April', address: 'Pilestræde 39, 1112 Copenhagen', area: 'Indre By', detail: "Coffee roaster’s store and showroom focused on very light roasts, competition-style filter brewing, and rare single-origin microlots.", lat: 55.681052, lon: 12.579515 },
  { id: 2, name: 'Coffee Collective Bernikow', shortName: 'Collective', address: 'Kristen Bernikows Gade 2, 1105 Copenhagen', area: 'Indre By', detail: "Specialty coffee bar from Coffee Collective, serving filter and espresso from single-origin beans, including washed Ethiopian and Kenyan coffees.", lat: 55.680064, lon: 12.582401 },
  { id: 3, name: 'La Cabra', address: 'Møntergade 3A, 1116 Copenhagen', area: 'Indre By', detail: "Coffee bar from the Danish roaster La Cabra, focused on delicate Nordic light roasts and clean, tea-like single-origin coffees.", lat: 55.681581, lon: 12.578989 },
  { id: 4, name: 'Prolog Coffee Bar', shortName: 'Prolog', address: 'Høkerboderne 16, 1712 Copenhagen', area: 'Kødbyen', detail: "Specialty coffee bar in Kødbyen, serving its own roasted coffee as filter or espresso, with pastries and beans to take home.", lat: 55.66829, lon: 12.557492 },
  { id: 5, name: 'norange coffee roasters', shortName: 'norange', address: 'Blegdamsvej 4D, 2200 Copenhagen', area: 'Nørrebro', detail: "Nørrebro coffee bar and roaster focused on very light roasting and expressive single-origin coffees.", lat: 55.690928, lon: 12.561685 },
  { id: 6, name: 'Saftig Kaffe', shortName: 'Saftig', address: 'Prinsesse Charlottes Gade 41, 2200 Copenhagen', area: 'Nørrebro', detail: "Micro-roaster and brew bar in Nørrebro, serving light-roasted coffees with juicy flavours and experimental processing.", note: 'Typically open Friday–Sunday.', lat: 55.694021, lon: 12.551068 },
  { id: 7, name: 'Pontes Coffee', shortName: 'Pontes', address: 'Toftegårds Plads 2, 2500 Valby', area: 'Valby', detail: "Valby micro-roastery and coffee bar, roasting on site with a focus on naturally processed and honey-processed specialty coffees.", note: 'Closed Monday–Tuesday.', lat: 55.661964, lon: 12.517867 },
  { id: 8, name: 'Noma Projects Shop / Noma Kaffe', shortName: 'Noma', address: 'Refshalevej 96, 1432 Copenhagen', area: 'Refshaleøen', detail: "Noma’s coffee and flavour shop on Refshaleøen, serving coffee sourced and roasted by its own team, with a focus on filter brewing.", note: 'Coffee service ends at 16:30.', lat: 55.683153, lon: 12.610426 },
  { id: 9, name: 'Andersen & Maillard', shortName: 'A&M', address: 'Nørrebrogade 62, 2200 Copenhagen', area: 'Nørrebro', detail: "Specialty coffee roaster and bakery combining its own coffee with croissants, bread, and other pastries.", lat: 55.690417, lon: 12.555033 },
  { id: 10, name: 'The Artisan Copenhagen', shortName: 'Artisan', address: 'Sortedam Dossering 45A, 2200 Copenhagen', area: 'Lakes / Nørrebro', detail: "Small-batch coffee roaster and café by the lakes, serving filter coffee and single-origin beans, including experimental lots.", lat: 55.69195, lon: 12.568756 },
  { id: 11, name: 'Impact Roasters', shortName: 'Impact', address: 'Tapperitorvet 36, 1799 Copenhagen', area: 'Carlsberg Byen', detail: "Specialty coffee roaster and café in Carlsberg Byen, focused on Ethiopian single-origin coffees.", lat: 55.664018, lon: 12.536066 },
  { id: 12, name: 'Kontra Coffee', shortName: 'Kontra', address: 'Dag Hammarskjölds Allé 36, 2100 Copenhagen', area: 'Østerbro', detail: "Established specialty coffee roaster and café on Østerbro, serving espresso and filter coffee.", lat: 55.69577, lon: 12.580835 },
  { id: 13, name: 'ROAST Coffee', shortName: 'ROAST', address: 'Vestmannagade 4, 2300 Copenhagen', area: 'Islands Brygge', detail: "Coffee bar and on-site roastery in Islands Brygge, focused on clean, bright, light-roasted single-origin beans.", lat: 55.66831, lon: 12.57949 },
  { id: 14, name: 'Yellow Bird Coffee', shortName: 'Yellow Bird', address: 'Amager Strandvej 108, 2300 Copenhagen', area: 'Amager Strand', detail: "Coffee roaster’s café by Amager Strand, serving specialty coffee from small-batch roasted, fruity single-origin beans.", lat: 55.661075, lon: 12.631956 },
].map((place) => ({
  ...place,
  priority: place.id <= 8,
  websiteUrl: websites[place.id - 1],
  mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ', ' + place.address + ', Denmark')}`,
}));
