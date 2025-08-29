import { ZoneData } from '@/types/zone';

const STORAGE_KEY = 'map-zones';

export const saveZones = (zones: ZoneData[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(zones));
  } catch (error) {
    console.error('Error saving zones:', error);
  }
};

export const loadZones = (): ZoneData[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading zones:', error);
    return [];
  }
};

export const deleteZone = (zoneId: string): ZoneData[] => {
  const zones = loadZones();
  const updatedZones = zones.filter(zone => zone.id !== zoneId);
  saveZones(updatedZones);
  return updatedZones;
};