export interface Zone {
    id: string;
    name: string;
    description: string;
    coordinates: google.maps.LatLng[];
    color: string;
    createdAt: string;
    updatedAt: string;
  }
  
  export interface ZoneData {
    id: string;
    name: string;
    description: string;
    coordinates: { lat: number; lng: number }[];
    color: string;
    createdAt: string;
    updatedAt: string;
  }