/**
 * North Carolina geographic lookup library for city-to-county filtering.
 */

export interface CityInfo {
  county: string;
  county_fips: string;
  region: string | null;
}

export interface NcGeoData {
  cities: Record<string, CityInfo>;
  counties: string[];
  regions?: Record<string, string[]>;
  attribution: string;
  lastUpdated: string;
}

let geoData: NcGeoData | null = null;
let loadPromise: Promise<NcGeoData> | null = null;

export async function loadNcGeo(): Promise<NcGeoData> {
  if (geoData) return geoData;
  if (loadPromise) return loadPromise;

  loadPromise = fetch(`${import.meta.env.BASE_URL}nc_geo.json`)
    .then((res) => {
      if (!res.ok) throw new Error('Failed to load nc_geo.json');
      return res.json();
    })
    .then((data: NcGeoData) => {
      geoData = data;
      return data;
    })
    .catch(async () => {
      const data: NcGeoData = {
        cities: {},
        counties: [],
        attribution: 'NC geographic lookup not configured',
        lastUpdated: new Date().toISOString().split('T')[0],
      };
      geoData = data;
      return data;
    });

  return loadPromise;
}

export function normalizeCity(city: string): string {
  if (!city) return '';
  return city
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^FT\.?\s+/i, 'FORT ')
    .replace(/^ST\.?\s+/i, 'SAINT ')
    .replace(/,?\s*(NC|NORTH\s+CAROLINA)$/i, '')
    .replace(/\s+NC\s+USA$/i, '')
    .trim();
}

export function getCitiesInCounty(county: string): string[] {
  if (!geoData) return [];
  const countyLower = county.toLowerCase();
  return Object.entries(geoData.cities)
    .filter(([_, info]) => info.county.toLowerCase() === countyLower)
    .map(([city]) => city);
}

export function getAllCounties(): string[] {
  return geoData?.counties || [];
}

export function getAttribution(): string {
  return geoData?.attribution || 'City data from NC lookup source';
}
