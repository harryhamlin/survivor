import addListMemberships from '../utils/listMemberships.js';
import { roasters } from './coffee.js';
import { food, foodListUrl } from './food.js';
import { eater, eaterListUrl } from './eater.js';
import { museums, museumsListUrl } from './museums.js';
import { pastries, pastriesListUrl } from './pastries.js';
import { party, partyListUrl } from './party.js';
import { sauna, saunaListUrl } from './sauna.js';

export const lists = addListMemberships({
  food: { label: 'Food', sectionTitle: 'Food & Drink', sourceUrl: foodListUrl, places: food, description: 'Restaurants, bars, and other food stops from the shared Copenhagen food list.' },
  keld: {
    label: 'Keld’s recommendations',
    mapTitle: 'Keld’s Recommendations Map',
    sourceUrl: foodListUrl,
    places: food.filter((place) => /recommended by keld/i.test(place.note)).map((place, index) => ({ ...place, id: index + 1 })),
    description: 'The five restaurants marked as recommended by Keld in the shared Food list.',
  },
  eater: { label: 'Eater', sourceUrl: eaterListUrl, sourceLabel: 'Original Eater guide', places: eater, description: '38 places from Eater’s Copenhagen guide, July 2024 edition.' },
  museums: { label: 'Museums', sourceUrl: museumsListUrl, places: museums, description: 'Museums, art, gardens, and cultural stops in Copenhagen and nearby, from the shared museum list.' },
  pastries: { label: 'Pastries', sourceUrl: pastriesListUrl, places: pastries, description: 'Saved pastry stops, bakeries, and more from the shared pastry list.' },
  party: { label: 'Party', sourceUrl: partyListUrl, places: party, description: 'Bars and music venues from the shared party list.' },
  sauna: { label: 'Sauna', sourceUrl: saunaListUrl, places: sauna, description: 'Saunas and bathing spots from the shared sauna list.' },
  coffee: { label: 'Coffee', places: roasters, description: 'Single-origin, light roasts, pour-over, and experimental processing. One representative location per roaster.' },
});

