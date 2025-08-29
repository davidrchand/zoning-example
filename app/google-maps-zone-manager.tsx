'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MapPin, Edit, Trash2, Plus, Info, MapIcon, X, Save, Pencil, Trash } from 'lucide-react';
import { Zone, ZoneData } from '@/types/zone';
import { saveZones, loadZones, deleteZone } from '@/utils/storage';

const ZONE_COLORS = [
  { name: 'Red', value: '#FF0000' },
  { name: 'Blue', value: '#0000FF' },
  { name: 'Green', value: '#00FF00' },
  { name: 'Yellow', value: '#FFFF00' },
  { name: 'Purple', value: '#800080' },
  { name: 'Orange', value: '#FFA500' },
  { name: 'Pink', value: '#FFC0CB' },
  { name: 'Cyan', value: '#00FFFF' },
];

const FIRST_TIME_DRAW_KEY = 'first-time-draw-shown';

// Default UCF zone coordinates
const DEFAULT_UCF_COORDINATES = [
  { lat: 28.60654404825726, lng: -81.2043835891338 },
  { lat: 28.60692081353198, lng: -81.20350382457691 },
  { lat: 28.607109195662655, lng: -81.19908354412037 },
  { lat: 28.605828190512828, lng: -81.19449160228687 },
  { lat: 28.60064749567666, lng: -81.19337580333668 },
  { lat: 28.597331716934768, lng: -81.19489929805714 },
  { lat: 28.595221621449, lng: -81.1984398139568 },
  { lat: 28.59544770513446, lng: -81.20367548595387 },
  { lat: 28.59716215725568, lng: -81.20715162883717 },
  { lat: 28.600346065568633, lng: -81.20783827434498 },
  { lat: 28.60396316979816, lng: -81.20751640926319 },
  { lat: 28.60533839029832, lng: -81.20620749126391 },
];

interface ZonePopoverInfo {
  zone: Zone;
  position: { x: number; y: number };
  visible: boolean;
}

export default function GoogleMapsZoneManager() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const zonesRef = useRef<Zone[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isFirstTimeModalOpen, setIsFirstTimeModalOpen] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zonePopover, setZonePopover] = useState<ZonePopoverInfo | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    color: '#FF0000',
  });
  const [manualForm, setManualForm] = useState({
    name: '',
    description: '',
    color: '#FF0000',
    coordinates: '',
    centerAddress: '',
  });

  // Update zones ref whenever zones state changes
  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  // Generate unique zone name
  const generateZoneName = () => {
    const existingNumbers = zonesRef.current
      .map(zone => {
        const match = zone.name.match(/^Zone (\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(num => num > 0);
    
    const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
    return `Zone ${nextNumber}`;
  };

  // Add polygon event listeners - no dependencies on zones state
  const addPolygonListeners = useCallback((polygon: google.maps.Polygon, zone: Zone) => {
    // Hover events - only show if not in edit mode for ANY zone
    google.maps.event.addListener(polygon, 'mouseover', (event: google.maps.KmlMouseEvent) => {
      if (!editingZoneId && infoWindowRef.current) {
        // Get the current zone data from ref to ensure we have the latest name
        const currentZone = zonesRef.current.find(z => z.id === zone.id) || zone;
        
        // Calculate the center of the polygon
        const bounds = new google.maps.LatLngBounds();
        const path = polygon.getPath();
        path.forEach((latLng: google.maps.LatLng) => {
          bounds.extend(latLng);
        });
        const center = bounds.getCenter();
        
        const content = `
          <div class="p-3 min-w-[220px]">
            <h3 class="font-semibold text-sm text-gray-900 mb-1">${currentZone.name}</h3>
            ${currentZone.description ? `<p class="text-xs text-gray-600 mt-1 mb-3">${currentZone.description}</p>` : '<div class="mb-3"></div>'}
            <div class="flex items-center gap-2 mb-3">
              <div style="width: 12px; height: 12px; background-color: ${currentZone.color}; border-radius: 2px; border: 1px solid rgba(0,0,0,0.2);"></div>
              <span class="text-xs text-gray-500">${new Date(currentZone.createdAt).toLocaleDateString()}</span>
            </div>
            <div class="flex gap-2">
              <button 
                id="edit-zone-${currentZone.id}" 
                class="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors cursor-pointer border-0"
                style="outline: none;"
              >
                Edit
              </button>
              <button 
                id="delete-zone-${currentZone.id}" 
                class="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors cursor-pointer border-0"
                style="outline: none;"
              >
                Delete
              </button>
            </div>
          </div>
        `;
        
        infoWindowRef.current.setContent(content);
        infoWindowRef.current.setPosition(center);
        infoWindowRef.current.open(mapInstanceRef.current);

        // Add button event listeners after InfoWindow opens
        setTimeout(() => {
          const editButton = document.getElementById(`edit-zone-${currentZone.id}`);
          const deleteButton = document.getElementById(`delete-zone-${currentZone.id}`);
          
          if (editButton) {
            editButton.addEventListener('click', () => {
              setSelectedZone(currentZone);
              setEditForm({
                name: currentZone.name,
                description: currentZone.description,
                color: currentZone.color,
              });
              setIsEditModalOpen(true);
              if (infoWindowRef.current) {
                infoWindowRef.current.close();
              }
            });
          }
          
          if (deleteButton) {
            deleteButton.addEventListener('click', () => {
              if (confirm(`Are you sure you want to delete "${currentZone.name}"?`)) {
                handleDeleteZoneCallback(currentZone.id);
              }
              if (infoWindowRef.current) {
                infoWindowRef.current.close();
              }
            });
          }
        }, 100);
      }
    });

    google.maps.event.addListener(polygon, 'mouseout', () => {
      if (!editingZoneId && infoWindowRef.current) {
        infoWindowRef.current.close();
      }
    });

    // Click event - only open edit modal if not in edit mode for any zone
    google.maps.event.addListener(polygon, 'click', () => {
      if (!editingZoneId) {
        const currentZone = zonesRef.current.find(z => z.id === zone.id) || zone;
        setSelectedZone(currentZone);
        setEditForm({
          name: currentZone.name,
          description: currentZone.description,
          color: currentZone.color,
        });
        setIsEditModalOpen(true);
      }
    });
  }, [editingZoneId]);

  // Delete zone function that can be used in callbacks
  const handleDeleteZoneCallback = useCallback((zoneId: string) => {
    const zoneToDelete = zonesRef.current.find(z => z.id === zoneId);
    if (zoneToDelete) {
      // Remove polygon from map
      const polygon = (zoneToDelete as any).polygon;
      if (polygon) {
        polygon.setMap(null);
      }

      const updatedZones = zonesRef.current.filter(z => z.id !== zoneId);
      setZones(updatedZones);
      deleteZone(zoneId);
      
      if (editingZoneId === zoneId) {
        setEditingZoneId(null);
      }
      
      setIsEditModalOpen(false);
      setSelectedZone(null);
    }
  }, [editingZoneId]);

  // Create default UCF zone
  const createDefaultZone = useCallback((map: google.maps.Map) => {
    const coordinates = DEFAULT_UCF_COORDINATES.map(coord => new google.maps.LatLng(coord.lat, coord.lng));
    
    const polygon = new google.maps.Polygon({
      paths: coordinates,
      fillColor: '#FF0000',
      fillOpacity: 0.3,
      strokeWeight: 2,
      strokeColor: '#FF0000',
      clickable: true,
      editable: false,
    });

    polygon.setMap(map);

    const defaultZone: Zone = {
      id: 'ucf-default',
      name: 'UCF',
      description: 'demo zone',
      coordinates,
      color: '#FF0000',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    (defaultZone as any).polygon = polygon;

    // Add event listeners
    addPolygonListeners(polygon, defaultZone);

    // Save to localStorage
    const zoneToSave: ZoneData = {
      id: defaultZone.id,
      name: defaultZone.name,
      description: defaultZone.description,
      color: defaultZone.color,
      coordinates: defaultZone.coordinates.map(coord => ({
        lat: coord.lat(),
        lng: coord.lng(),
      })),
      createdAt: defaultZone.createdAt,
      updatedAt: defaultZone.updatedAt,
    };
    
    saveZones([zoneToSave]);

    // Center map on UCF
    const bounds = new google.maps.LatLngBounds();
    coordinates.forEach(coord => bounds.extend(coord));
    map.fitBounds(bounds);

    return [defaultZone];
  }, [addPolygonListeners]);

  // Load zones from localStorage
  const loadSavedZones = useCallback((map: google.maps.Map) => {
    const savedZones = loadZones();
    const loadedZones: Zone[] = [];

    savedZones.forEach((zoneData) => {
      const coordinates = zoneData.coordinates.map(coord => new google.maps.LatLng(coord.lat, coord.lng));
      
      const polygon = new google.maps.Polygon({
        paths: coordinates,
        fillColor: zoneData.color,
        fillOpacity: 0.3,
        strokeWeight: 2,
        strokeColor: zoneData.color,
        clickable: true,
        editable: false,
      });

      polygon.setMap(map);

      const zone: Zone = {
        ...zoneData,
        coordinates,
      };

      (zone as any).polygon = polygon;
      
      // Add event listeners immediately
      addPolygonListeners(polygon, zone);
      
      loadedZones.push(zone);
    });

    return loadedZones;
  }, [addPolygonListeners]);

  // Initialize Google Maps - only run once
  useEffect(() => {
    const initMap = async () => {
      const loader = new Loader({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
        version: 'weekly',
        libraries: ['drawing'],
      });

      try {
        await loader.load();
        
        if (mapRef.current && !mapInstanceRef.current) {
          const map = new google.maps.Map(mapRef.current, {
            center: { lat: 28.6024, lng: -81.2001 }, // UCF area
            zoom: 14,
            mapTypeControl: true,
            streetViewControl: false,
            styles: [
              {
                featureType: 'poi',
                elementType: 'labels',
                stylers: [{ visibility: 'off' }]
              }
            ]
          });

          mapInstanceRef.current = map;

          // Initialize InfoWindow for hovers
          infoWindowRef.current = new google.maps.InfoWindow();

          // Initialize Drawing Manager with editable polygons
          const drawingManager = new google.maps.drawing.DrawingManager({
            drawingMode: null,
            drawingControl: false,
            polygonOptions: {
              fillColor: '#FF0000',
              fillOpacity: 0.3,
              strokeWeight: 2,
              strokeColor: '#FF0000',
              clickable: true,
              editable: true, // Allow drag handles when drawing
            },
          });

          drawingManager.setMap(map);
          drawingManagerRef.current = drawingManager;

          // Handle polygon completion
          google.maps.event.addListener(drawingManager, 'polygoncomplete', (polygon: google.maps.Polygon) => {
            const coordinates = polygon.getPath().getArray();
            const zoneName = generateZoneName();
            
            const newZone: Zone = {
              id: Date.now().toString(),
              name: zoneName,
              description: '',
              coordinates,
              color: '#FF0000',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            // Make polygon not editable after initial creation
            polygon.setEditable(false);

            // Store reference to polygon
            (newZone as any).polygon = polygon;

            // Add event listeners
            addPolygonListeners(polygon, newZone);

            // Add to zones state
            setZones(prevZones => {
              const updatedZones = [...prevZones, newZone];
              
              // Save to localStorage immediately
              const zonesToSave: ZoneData[] = updatedZones.map(zone => ({
                id: zone.id,
                name: zone.name,
                description: zone.description,
                color: zone.color,
                coordinates: zone.coordinates.map(coord => ({
                  lat: coord.lat(),
                  lng: coord.lng(),
                })),
                createdAt: zone.createdAt,
                updatedAt: zone.updatedAt,
              }));
              saveZones(zonesToSave);
              
              return updatedZones;
            });

            setSelectedZone(newZone);
            setEditForm({
              name: newZone.name,
              description: newZone.description,
              color: newZone.color,
            });
            setIsEditModalOpen(true);
            setIsDrawing(false);
            drawingManager.setDrawingMode(null);
          });

          // Load saved zones or create default
          const savedZones = loadZones();
          if (savedZones.length === 0) {
            const defaultZones = createDefaultZone(map);
            setZones(defaultZones);
          } else {
            const loadedZones = loadSavedZones(map);
            setZones(loadedZones);
          }
        }
      } catch (error) {
        console.error('Error loading Google Maps:', error);
      }
    };

    initMap();
  }, []); // Empty dependency array - only run once

  // Start drawing mode
  const startDrawing = () => {
    const hasShownFirstTime = localStorage.getItem(FIRST_TIME_DRAW_KEY);
    if (!hasShownFirstTime) {
      setIsFirstTimeModalOpen(true);
      return;
    }

    if (drawingManagerRef.current) {
      setIsDrawing(true);
      drawingManagerRef.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
    }
  };

  // Confirm first time and start drawing
  const confirmFirstTimeAndDraw = () => {
    localStorage.setItem(FIRST_TIME_DRAW_KEY, 'true');
    setIsFirstTimeModalOpen(false);
    if (drawingManagerRef.current) {
      setIsDrawing(true);
      drawingManagerRef.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
    }
  };

  // Stop drawing mode
  const stopDrawing = () => {
    if (drawingManagerRef.current) {
      setIsDrawing(false);
      drawingManagerRef.current.setDrawingMode(null);
    }
  };

  // Toggle zone edit mode
  const toggleZoneEditMode = (zoneId: string) => {
    const zone = zones.find(z => z.id === zoneId);
    if (zone) {
      const polygon = (zone as any).polygon;
      if (polygon) {
        if (editingZoneId === zoneId) {
          // Stop editing
          polygon.setEditable(false);
          setEditingZoneId(null);
          // Close info window
          if (infoWindowRef.current) {
            infoWindowRef.current.close();
          }
        } else {
          // Start editing
          // Stop editing any other zone first
          if (editingZoneId) {
            const currentEditingZone = zones.find(z => z.id === editingZoneId);
            if (currentEditingZone) {
              const currentPolygon = (currentEditingZone as any).polygon;
              if (currentPolygon) {
                currentPolygon.setEditable(false);
              }
            }
          }
          
          polygon.setEditable(true);
          setEditingZoneId(zoneId);
          
          // Close info window while editing
          if (infoWindowRef.current) {
            infoWindowRef.current.close();
          }
        }
      }
    }
  };

  // Save zone
  const saveZone = () => {
    if (selectedZone) {
      const updatedZone: Zone = {
        ...selectedZone,
        name: editForm.name,
        description: editForm.description,
        color: editForm.color,
        updatedAt: new Date().toISOString(),
      };

      // Update polygon color
      const polygon = (selectedZone as any).polygon;
      if (polygon) {
        polygon.setOptions({
          fillColor: editForm.color,
          strokeColor: editForm.color,
        });
      }

      const updatedZones = zones.map(zone => zone.id === selectedZone.id ? updatedZone : zone);
      setZones(updatedZones);
      
      // Save to localStorage
      const zonesToSave: ZoneData[] = updatedZones.map(zone => ({
        id: zone.id,
        name: zone.name,
        description: zone.description,
        color: zone.color,
        coordinates: zone.coordinates.map(coord => ({
          lat: coord.lat(),
          lng: coord.lng(),
        })),
        createdAt: zone.createdAt,
        updatedAt: zone.updatedAt,
      }));

      saveZones(zonesToSave);
      setIsEditModalOpen(false);
      setSelectedZone(null);
    }
  };

  // Create manual zone
  const createManualZone = async () => {
    if (!manualForm.name.trim()) return;

    try {
      let coordinates: google.maps.LatLng[] = [];

      if (manualForm.coordinates.trim()) {
        // Parse coordinates from text input
        const coordPairs = manualForm.coordinates.split('\n').filter(line => line.trim());
        coordinates = coordPairs.map(pair => {
          const [lat, lng] = pair.split(',').map(s => parseFloat(s.trim()));
          if (isNaN(lat) || isNaN(lng)) {
            throw new Error(`Invalid coordinate pair: ${pair}`);
          }
          return new google.maps.LatLng(lat, lng);
        });
      } else if (manualForm.centerAddress.trim() && mapInstanceRef.current) {
        // Create a simple rectangular zone around the address
        const geocoder = new google.maps.Geocoder();
        const result = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
          geocoder.geocode({ address: manualForm.centerAddress }, (results, status) => {
            if (status === 'OK' && results) {
              resolve(results);
            } else {
              reject(new Error('Geocoding failed'));
            }
          });
        });

        const location = result[0].geometry.location;
        const lat = location.lat();
        const lng = location.lng();
        
        // Create a simple rectangle around the location (roughly 500m radius)
        const offset = 0.005; // Approximately 500m
        coordinates = [
          new google.maps.LatLng(lat - offset, lng - offset),
          new google.maps.LatLng(lat - offset, lng + offset),
          new google.maps.LatLng(lat + offset, lng + offset),
          new google.maps.LatLng(lat + offset, lng - offset),
        ];

        // Center map on the new zone
        mapInstanceRef.current.setCenter(location);
      } else {
        alert('Please provide either coordinates or an address');
        return;
      }

      if (coordinates.length < 3) {
        alert('A zone needs at least 3 coordinate points');
        return;
      }

      // Create new zone
      const newZone: Zone = {
        id: Date.now().toString(),
        name: manualForm.name,
        description: manualForm.description,
        coordinates,
        color: manualForm.color,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Create polygon
      const polygon = new google.maps.Polygon({
        paths: coordinates,
        fillColor: manualForm.color,
        fillOpacity: 0.3,
        strokeWeight: 2,
        strokeColor: manualForm.color,
        clickable: true,
        editable: false,
      });

      polygon.setMap(mapInstanceRef.current);
      (newZone as any).polygon = polygon;

      // Add event listeners
      addPolygonListeners(polygon, newZone);

      // Add to zones
      const updatedZones = [...zones, newZone];
      setZones(updatedZones);

      // Save to localStorage
      const zonesToSave: ZoneData[] = updatedZones.map(zone => ({
        id: zone.id,
        name: zone.name,
        description: zone.description,
        color: zone.color,
        coordinates: zone.coordinates.map(coord => ({
          lat: coord.lat(),
          lng: coord.lng(),
        })),
        createdAt: zone.createdAt,
        updatedAt: zone.updatedAt,
      }));
      saveZones(zonesToSave);

      // Reset form and close modal
      setManualForm({
        name: '',
        description: '',
        color: '#FF0000',
        coordinates: '',
        centerAddress: '',
      });
      setIsManualModalOpen(false);

    } catch (error) {
      console.error('Error creating manual zone:', error);
      alert('Error creating zone. Please check your input format.');
    }
  };

  // Delete zone
  const handleDeleteZone = (zoneId: string) => {
    const zoneToDelete = zones.find(z => z.id === zoneId);
    if (zoneToDelete) {
      // Remove polygon from map
      const polygon = (zoneToDelete as any).polygon;
      if (polygon) {
        polygon.setMap(null);
      }

      const updatedZones = zones.filter(z => z.id !== zoneId);
      setZones(updatedZones);
      deleteZone(zoneId);
      
      if (editingZoneId === zoneId) {
        setEditingZoneId(null);
      }
      
      setIsEditModalOpen(false);
      setSelectedZone(null);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Enhanced Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-lg">
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <MapPin className="h-5 w-5 text-blue-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Zone Manager Demo</h1>
          </div>
          <p className="text-sm text-gray-600">Example showcasing how to create zones on a map.</p>
          <a className='text-sm text-blue-500 hover:underline' href='https://github.com/davidrchand/zoning-example' target='_blank'>View Demo Code on Github</a>
        </div>

        {/* Controls */}
        <div className="p-6 border-b border-gray-100">
          <div className="space-y-3">
            <Button 
              onClick={isDrawing ? stopDrawing : startDrawing}
              className={`w-full h-11 font-medium transition-all ${
                isDrawing 
                  ? 'bg-red-600 hover:bg-red-700 shadow-md' 
                  : 'bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg'
              }`}
            >
              {isDrawing ? <X className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {isDrawing ? 'Cancel Drawing' : 'Draw New Zone'}
            </Button>
            
            <Button 
              onClick={() => setIsManualModalOpen(true)}
              variant="outline"
              className="w-full h-11 font-medium border-gray-300 hover:bg-gray-50 hover:border-gray-400"
            >
              <MapIcon className="h-4 w-4 mr-2" />
              Create From Coordinates
            </Button>
          </div>
        </div>

        {/* Zone List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Zones</h2>
              <span className="text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">
                {zones.length}
              </span>
            </div>
            
            {zones.length === 0 ? (
              <div className="text-center py-12">
                <div className="p-4 bg-gray-50 rounded-lg mb-4">
                  <MapPin className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 font-medium">No zones created yet</p>
                </div>
                <p className="text-xs text-gray-400">
                  Draw a zone on the map or create one manually to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {zones.map((zone) => (
                  <div 
                    key={zone.id} 
                    className={`p-4 border rounded-xl transition-all hover:shadow-md ${
                      editingZoneId === zone.id 
                        ? 'border-blue-300 bg-blue-50' 
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-gray-900 truncate">{zone.name}</h3>
                          {editingZoneId === zone.id && (
                            <span className="text-xs bg-blue-200 text-blue-700 px-2 py-1 rounded-full font-medium">
                              Editing
                            </span>
                          )}
                        </div>
                        
                        {zone.description && (
                          <p className="text-sm text-gray-600 mb-3 line-clamp-2">{zone.description}</p>
                        )}
                        
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-sm border border-gray-300 shadow-sm"
                              style={{ backgroundColor: zone.color }}
                            />
                            <span className="text-xs text-gray-500 font-medium">
                              {new Date(zone.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2 ml-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 hover:bg-gray-50"
                          onClick={() => {
                            setSelectedZone(zone);
                            setEditForm({
                              name: zone.name,
                              description: zone.description,
                              color: zone.color,
                            });
                            setIsEditModalOpen(true);
                          }}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        
                        <Button
                          size="sm"
                          variant={editingZoneId === zone.id ? "default" : "outline"}
                          className={`h-8 w-8 p-0 ${
                            editingZoneId === zone.id 
                              ? 'bg-blue-600 text-white' 
                              : 'hover:bg-blue-50 hover:text-blue-600'
                          }`}
                          onClick={() => toggleZoneEditMode(zone.id)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                          onClick={() => handleDeleteZone(zone.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="w-full h-full" />
        {isDrawing && (
          <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg border border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-gray-700">Drawing mode active</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Click on the map to start drawing a zone</p>
          </div>
        )}
      </div>

      {/* Dialogs remain the same but with enhanced styling */}
      {/* First Time Drawing Instructions Dialog */}
      <Dialog open={isFirstTimeModalOpen} onOpenChange={setIsFirstTimeModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader className="pb-4">
            <DialogTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Info className="h-5 w-5 text-blue-600" />
              </div>
              How to Draw a Zone
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <p className="text-gray-600">
              Here&apos;s how to draw a zone on the map:
            </p>
            <ol className="list-decimal list-inside space-y-3 text-gray-700">
              <li className="flex items-start gap-2">
                <span className="font-medium text-blue-600 min-w-[20px]">1.</span>
                <span>Click on the map where you want to start your zone</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-blue-600 min-w-[20px]">2.</span>
                <span>Continue clicking to add more points around your desired area</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-blue-600 min-w-[20px]">3.</span>
                <span>Double-click to finish drawing the zone</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-blue-600 min-w-[20px]">4.</span>
                <span>A dialog will appear to let you name and customize your zone</span>
              </li>
            </ol>
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-700">
                <strong>Tip:</strong> You need at least 3 points to create a zone. The zone will automatically close between your last and first points. You can drag the points to adjust the shape while drawing.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setIsFirstTimeModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmFirstTimeAndDraw} className="bg-blue-600 hover:bg-blue-700">
              Got it, Start Drawing
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Zone Creation Dialog */}
      <Dialog open={isManualModalOpen} onOpenChange={setIsManualModalOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-xl">Create Zone From Coordinates</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="manual-name" className="text-right font-medium">
                Name *
              </Label>
              <Input
                id="manual-name"
                value={manualForm.name}
                onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                className="col-span-3 h-11"
                placeholder="Enter zone name"
              />
            </div>
            
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="manual-description" className="text-right font-medium pt-2">
                Description
              </Label>
              <Textarea
                id="manual-description"
                value={manualForm.description}
                onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                className="col-span-3"
                rows={3}
                placeholder="Optional description"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="manual-color" className="text-right font-medium">
                Color
              </Label>
              <Select 
                value={manualForm.color} 
                onValueChange={(value) => setManualForm({ ...manualForm, color: value })}
              >
                <SelectTrigger className="col-span-3 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ZONE_COLORS.map((color) => (
                    <SelectItem key={color.value} value={color.value}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded border border-gray-300"
                          style={{ backgroundColor: color.value }}
                        />
                        {color.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-6">
              <div className="border rounded-lg p-5 space-y-4 bg-gray-50">
                <h4 className="font-semibold text-gray-900">Option 1: Coordinates</h4>
                <Label htmlFor="manual-coordinates" className="text-sm text-gray-600">
                  Enter coordinates (one per line: latitude,longitude)
                </Label>
                <Textarea
                  id="manual-coordinates"
                  value={manualForm.coordinates}
                  onChange={(e) => setManualForm({ ...manualForm, coordinates: e.target.value })}
                  rows={5}
                  placeholder="40.7128,-74.0060&#10;40.7138,-74.0050&#10;40.7118,-74.0040&#10;40.7108,-74.0070"
                  className="font-mono text-sm bg-white"
                />
              </div>

              <div className="text-center">
                <div className="inline-flex items-center gap-3 text-gray-400">
                  <div className="h-px bg-gray-300 flex-1 w-16"></div>
                  <span className="font-medium text-sm">OR</span>
                  <div className="h-px bg-gray-300 flex-1 w-16"></div>
                </div>
              </div>

              <div className="border rounded-lg p-5 space-y-4 bg-gray-50">
                <h4 className="font-semibold text-gray-900">Option 2: Address-Based Zone</h4>
                <Label htmlFor="manual-address" className="text-sm text-gray-600">
                  Enter an address to create a rectangular zone around it
                </Label>
                <Input
                  id="manual-address"
                  value={manualForm.centerAddress}
                  onChange={(e) => setManualForm({ ...manualForm, centerAddress: e.target.value })}
                  placeholder="Enter address (e.g., Times Square, New York, NY)"
                  className="bg-white h-11"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-6">
            <Button variant="outline" onClick={() => setIsManualModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createManualZone} className="bg-blue-600 hover:bg-blue-700">
              <Save className="h-4 w-4 mr-2" />
              Create Zone
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Zone Dialog */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-xl">
              {selectedZone?.name ? `Edit "${selectedZone.name}"` : 'New Zone'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right font-medium">
                Name
              </Label>
              <Input
                id="name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="col-span-3 h-11"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="description" className="text-right font-medium pt-2">
                Description
              </Label>
              <Textarea
                id="description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="col-span-3"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="color" className="text-right font-medium">
                Color
              </Label>
              <Select value={editForm.color} onValueChange={(value) => setEditForm({ ...editForm, color: value })}>
                <SelectTrigger className="col-span-3 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ZONE_COLORS.map((color) => (
                    <SelectItem key={color.value} value={color.value}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded border border-gray-300"
                          style={{ backgroundColor: color.value }}
                        />
                        {color.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedZone && (
              <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="font-medium">Created:</span><br />
                    {new Date(selectedZone.createdAt).toLocaleDateString()}
                  </div>
                  <div>
                    <span className="font-medium">Updated:</span><br />
                    {new Date(selectedZone.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-between pt-6">
            <div>
              {selectedZone && (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => handleDeleteZone(selectedZone.id)}
                  className="hover:bg-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Zone
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveZone} className="bg-blue-600 hover:bg-blue-700">
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}