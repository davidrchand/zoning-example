/**
 * Google Maps Zone Manager Component
 * 
 * This component provides a complete zone management interface using Google Maps.
 * Features include:
 * - Drawing zones directly on the map
 * - Editing existing zones (move points, change properties)
 * - Creating zones manually via coordinates or address
 * - Persistent storage in localStorage
 * - Mobile-responsive design
 * 
 * The component integrates with Google Maps JavaScript API and uses the Drawing library
 * for polygon creation and editing capabilities.
 */

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
import {
  MapPin,
  Edit,
  Trash2,
  Plus,
  Info,
  MapIcon,
  X,
  Save,
  Pencil,
  Trash,
  Menu,
  ChevronLeft
} from 'lucide-react';
import { Zone, ZoneData } from '@/types/zone';
import { saveZones, loadZones, deleteZone } from '@/utils/storage';

// ============================================================================
// CONSTANTS AND CONFIGURATION
// ============================================================================

/**
 * Available colors for zones - users can pick from these predefined options
 */
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

/**
 * LocalStorage key for tracking if user has seen the first-time drawing instructions
 */
const FIRST_TIME_DRAW_KEY = 'first-time-draw-shown';

/**
 * Default coordinates for a demo zone around UCF (University of Central Florida)
 * These coordinates form a polygon that roughly outlines the UCF campus
 */
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

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Interface for zone popover information (unused in current implementation but kept for future use)
 */
interface ZonePopoverInfo {
  zone: Zone;
  position: { x: number; y: number };
  visible: boolean;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function GoogleMapsZoneManager() {

  // ========================================================================
  // REFS - Direct references to DOM elements and Google Maps objects
  // ========================================================================

  /** Reference to the div element that contains the Google Map */
  const mapRef = useRef<HTMLDivElement>(null);

  /** Reference to the Google Maps instance once it's initialized */
  const mapInstanceRef = useRef<google.maps.Map | null>(null);

  /** Reference to the Google Maps Drawing Manager for creating polygons */
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);

  /** Reference to the Google Maps InfoWindow for showing zone details on hover */
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  /** 
   * Reference to the current zones array for use in callbacks
   * This ensures callbacks always have access to the latest zone data
   * without depending on stale closures
   */
  const zonesRef = useRef<Zone[]>([]);

  // ========================================================================
  // STATE - Component state management
  // ========================================================================

  /** Array of all zones currently displayed on the map */
  const [zones, setZones] = useState<Zone[]>([]);

  /** Whether the user is currently in drawing mode */
  const [isDrawing, setIsDrawing] = useState(false);

  /** Currently selected zone for editing */
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);

  /** Whether the edit zone modal is open */
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  /** Whether the manual zone creation modal is open */
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  /** Whether the first-time drawing instructions modal is open */
  const [isFirstTimeModalOpen, setIsFirstTimeModalOpen] = useState(false);

  /** ID of the zone currently being edited (has draggable points) */
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);

  /** Mobile sidebar visibility state */
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  /** Unused but kept for potential future popover functionality */
  const [zonePopover, setZonePopover] = useState<ZonePopoverInfo | null>(null);

  /** Form data for editing an existing zone */
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    color: '#FF0000',
  });

  /** Form data for manually creating a new zone */
  const [manualForm, setManualForm] = useState({
    name: '',
    description: '',
    color: '#FF0000',
    coordinates: '',
    centerAddress: '',
  });

  // ========================================================================
  // EFFECTS - Side effects and lifecycle management
  // ========================================================================

  /**
   * Keep the zones ref in sync with zones state
   * This ensures that callback functions always have access to the latest zone data
   */
  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  // ========================================================================
  // UTILITY FUNCTIONS
  // ========================================================================

  /**
   * Generates a unique zone name like "Zone 1", "Zone 2", etc.
   * Looks at existing zones to find the next available number
   */
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

  // ========================================================================
  // EVENT HANDLERS AND CALLBACKS
  // ========================================================================

  /**
   * Adds event listeners to a polygon for hover, click, and other interactions
   * This function is called whenever a new polygon is created or loaded
   * 
   * @param polygon - The Google Maps Polygon object
   * @param zone - The zone data associated with this polygon
   */
  const addPolygonListeners = useCallback((polygon: google.maps.Polygon, zone: Zone) => {

    // HOVER EVENT: Show info window when mouse enters polygon
    google.maps.event.addListener(polygon, 'mouseover', (event: google.maps.KmlMouseEvent) => {
      // Only show hover info if we're not currently editing any zone
      if (!editingZoneId && infoWindowRef.current) {

        // Get the most up-to-date zone data from the ref
        const currentZone = zonesRef.current.find(z => z.id === zone.id) || zone;

        // Calculate the center of the polygon to position the info window
        const bounds = new google.maps.LatLngBounds();
        const path = polygon.getPath();
        path.forEach((latLng: google.maps.LatLng) => {
          bounds.extend(latLng);
        });
        const center = bounds.getCenter();

        // Create HTML content for the info window with inline styles for reliability
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

        // Set content and position, then open the info window
        infoWindowRef.current.setContent(content);
        infoWindowRef.current.setPosition(center);
        infoWindowRef.current.open(mapInstanceRef.current);

        // Add click event listeners to the buttons inside the info window
        // We use setTimeout to ensure the DOM elements are rendered first
        setTimeout(() => {
          const editButton = document.getElementById(`edit-zone-${currentZone.id}`);
          const deleteButton = document.getElementById(`delete-zone-${currentZone.id}`);

          if (editButton) {
            editButton.addEventListener('click', () => {
              // Open edit modal with current zone data
              setSelectedZone(currentZone);
              setEditForm({
                name: currentZone.name,
                description: currentZone.description,
                color: currentZone.color,
              });
              setIsEditModalOpen(true);
              // Close info window
              if (infoWindowRef.current) {
                infoWindowRef.current.close();
              }
            });
          }

          if (deleteButton) {
            deleteButton.addEventListener('click', () => {
              // Show confirmation dialog and delete if confirmed
              if (confirm(`Are you sure you want to delete "${currentZone.name}"?`)) {
                handleDeleteZoneCallback(currentZone.id);
              }
              // Close info window
              if (infoWindowRef.current) {
                infoWindowRef.current.close();
              }
            });
          }
        }, 100);
      }
    });

    // MOUSE OUT EVENT: Hide info window when mouse leaves polygon
    google.maps.event.addListener(polygon, 'mouseout', () => {
      if (!editingZoneId && infoWindowRef.current) {
        infoWindowRef.current.close();
      }
    });

    // CLICK EVENT: Open edit modal when polygon is clicked (but not when editing)
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

  /**
   * Delete zone function that can be safely used in callbacks
   * This function handles both UI updates and persistent storage
   * 
   * @param zoneId - ID of the zone to delete
   */
  const handleDeleteZoneCallback = useCallback((zoneId: string) => {
    const zoneToDelete = zonesRef.current.find(z => z.id === zoneId);
    if (zoneToDelete) {
      // Remove the polygon from the map
      const polygon = (zoneToDelete as any).polygon;
      if (polygon) {
        polygon.setMap(null);
      }

      // Update state by filtering out the deleted zone
      const updatedZones = zonesRef.current.filter(z => z.id !== zoneId);
      setZones(updatedZones);

      // Remove from persistent storage
      deleteZone(zoneId);

      // Clear editing state if this zone was being edited
      if (editingZoneId === zoneId) {
        setEditingZoneId(null);
      }

      // Close any open modals
      setIsEditModalOpen(false);
      setSelectedZone(null);
    }
  }, [editingZoneId]);

  /**
   * Creates the default UCF demo zone on the map
   * This shows users what a zone looks like and provides a starting example
   * 
   * @param map - The Google Maps instance
   * @returns Array containing the default zone
   */
  const createDefaultZone = useCallback((map: google.maps.Map) => {
    // Convert coordinate objects to Google Maps LatLng objects
    const coordinates = DEFAULT_UCF_COORDINATES.map(coord => new google.maps.LatLng(coord.lat, coord.lng));

    // Create the polygon with red styling
    const polygon = new google.maps.Polygon({
      paths: coordinates,
      fillColor: '#FF0000',
      fillOpacity: 0.3,
      strokeWeight: 2,
      strokeColor: '#FF0000',
      clickable: true,
      editable: false, // Not editable by default
    });

    // Add polygon to the map
    polygon.setMap(map);

    // Create zone data object
    const defaultZone: Zone = {
      id: 'ucf-default',
      name: 'UCF',
      description: 'demo zone',
      coordinates,
      color: '#FF0000',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store reference to polygon in zone object for later manipulation
    (defaultZone as any).polygon = polygon;

    // Add event listeners for hover, click, etc.
    addPolygonListeners(polygon, defaultZone);

    // Save to localStorage for persistence
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

    // Center and zoom the map to show the UCF zone
    const bounds = new google.maps.LatLngBounds();
    coordinates.forEach(coord => bounds.extend(coord));
    map.fitBounds(bounds);

    return [defaultZone];
  }, [addPolygonListeners]);

  /**
   * Loads all saved zones from localStorage and displays them on the map
   * This is called when the component initializes
   * 
   * @param map - The Google Maps instance
   * @returns Array of loaded zones
   */
  const loadSavedZones = useCallback((map: google.maps.Map) => {
    const savedZones = loadZones();
    const loadedZones: Zone[] = [];

    // Process each saved zone
    savedZones.forEach((zoneData) => {
      // Convert saved coordinates back to Google Maps LatLng objects
      const coordinates = zoneData.coordinates.map(coord => new google.maps.LatLng(coord.lat, coord.lng));

      // Create polygon with the saved styling
      const polygon = new google.maps.Polygon({
        paths: coordinates,
        fillColor: zoneData.color,
        fillOpacity: 0.3,
        strokeWeight: 2,
        strokeColor: zoneData.color,
        clickable: true,
        editable: false,
      });

      // Add to map
      polygon.setMap(map);

      // Create zone object with Google Maps coordinates
      const zone: Zone = {
        ...zoneData,
        coordinates,
      };

      // Store polygon reference and add event listeners
      (zone as any).polygon = polygon;
      addPolygonListeners(polygon, zone);

      loadedZones.push(zone);
    });

    return loadedZones;
  }, [addPolygonListeners]);

  // ========================================================================
  // GOOGLE MAPS INITIALIZATION
  // ========================================================================

  /**
   * Initialize Google Maps - this effect only runs once when component mounts
   * Sets up the map, drawing manager, and loads existing zones
   */
  useEffect(() => {
    const initMap = async () => {
      // Create the Google Maps API loader
      const loader = new Loader({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
        version: 'weekly',
        libraries: ['drawing'], // Required for polygon drawing functionality
      });

      try {
        // Load the Google Maps API
        await loader.load();

        // Only initialize if we have a map container and haven't initialized yet
        if (mapRef.current && !mapInstanceRef.current) {

          // Create the map centered on UCF area
          const map = new google.maps.Map(mapRef.current, {
            center: { lat: 28.6024, lng: -81.2001 },
            zoom: 14,
            // turn off these controls:
            mapTypeControl: false,      // hides "Map/Satellite"
            fullscreenControl: false,   // hides fullscreen button

            // keep or tweak others as you like:
            zoomControl: true,
            streetViewControl: false,

            styles: [
              { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }
            ],
          });


          mapInstanceRef.current = map;

          // Initialize InfoWindow for displaying zone information on hover
          infoWindowRef.current = new google.maps.InfoWindow();

          // Initialize Drawing Manager for creating new polygons
          const drawingManager = new google.maps.drawing.DrawingManager({
            drawingMode: null, // Start with no drawing mode active
            drawingControl: false, // We'll control this with our own buttons
            polygonOptions: {
              fillColor: '#FF0000',
              fillOpacity: 0.3,
              strokeWeight: 2,
              strokeColor: '#FF0000',
              clickable: true,
              editable: true, // Allow dragging points while drawing
            },
          });

          drawingManager.setMap(map);
          drawingManagerRef.current = drawingManager;

          // Handle when user completes drawing a polygon
          google.maps.event.addListener(drawingManager, 'polygoncomplete', (polygon: google.maps.Polygon) => {
            // Get the coordinates of the drawn polygon
            const coordinates = polygon.getPath().getArray();
            const zoneName = generateZoneName();

            // Create new zone object
            const newZone: Zone = {
              id: Date.now().toString(), // Simple ID generation
              name: zoneName,
              description: '',
              coordinates,
              color: '#FF0000',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            // Make polygon non-editable after creation (user can enable edit mode later)
            polygon.setEditable(false);

            // Store reference to polygon for future manipulation
            (newZone as any).polygon = polygon;

            // Add event listeners for hover, click, etc.
            addPolygonListeners(polygon, newZone);

            // Add to zones state and save to localStorage
            setZones(prevZones => {
              const updatedZones = [...prevZones, newZone];

              // Convert to format suitable for localStorage
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

            // Open edit dialog so user can customize the new zone
            setSelectedZone(newZone);
            setEditForm({
              name: newZone.name,
              description: newZone.description,
              color: newZone.color,
            });
            setIsEditModalOpen(true);

            // Exit drawing mode
            setIsDrawing(false);
            drawingManager.setDrawingMode(null);
          });

          // Load existing zones or create default demo zone
          const savedZones = loadZones();
          if (savedZones.length === 0) {
            // No saved zones - create the UCF demo zone
            const defaultZones = createDefaultZone(map);
            setZones(defaultZones);
          } else {
            // Load saved zones from localStorage
            const loadedZones = loadSavedZones(map);
            setZones(loadedZones);
          }
        }
      } catch (error) {
        console.error('Error loading Google Maps:', error);
      }
    };

    initMap();
  }, []); // Empty dependency array - only run once on mount

  // ========================================================================
  // USER INTERACTION HANDLERS
  // ========================================================================

  /**
   * Starts drawing mode after checking if user needs to see instructions
   */
  const startDrawing = () => {
    const hasShownFirstTime = localStorage.getItem(FIRST_TIME_DRAW_KEY);
    if (!hasShownFirstTime) {
      // Show instructions modal for first-time users
      setIsFirstTimeModalOpen(true);
      return;
    }

    // Start drawing mode
    if (drawingManagerRef.current) {
      setIsDrawing(true);
      drawingManagerRef.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
    }
  };

  /**
   * User confirmed they understand drawing instructions - start drawing
   */
  const confirmFirstTimeAndDraw = () => {
    localStorage.setItem(FIRST_TIME_DRAW_KEY, 'true');
    setIsFirstTimeModalOpen(false);
    if (drawingManagerRef.current) {
      setIsDrawing(true);
      drawingManagerRef.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
    }
  };

  /**
   * Stops drawing mode and returns to normal map interaction
   */
  const stopDrawing = () => {
    if (drawingManagerRef.current) {
      setIsDrawing(false);
      drawingManagerRef.current.setDrawingMode(null);
    }
  };

  /**
   * Toggles edit mode for a specific zone (enables/disables draggable points)
   * 
   * @param zoneId - ID of zone to toggle edit mode for
   */
  const toggleZoneEditMode = (zoneId: string) => {
    const zone = zones.find(z => z.id === zoneId);
    if (zone) {
      const polygon = (zone as any).polygon;
      if (polygon) {
        if (editingZoneId === zoneId) {
          // Currently editing this zone - stop editing
          polygon.setEditable(false);
          setEditingZoneId(null);
          // Close any open info windows
          if (infoWindowRef.current) {
            infoWindowRef.current.close();
          }
        } else {
          // Start editing this zone
          // First, stop editing any other zone
          if (editingZoneId) {
            const currentEditingZone = zones.find(z => z.id === editingZoneId);
            if (currentEditingZone) {
              const currentPolygon = (currentEditingZone as any).polygon;
              if (currentPolygon) {
                currentPolygon.setEditable(false);
              }
            }
          }

          // Enable editing for this zone
          polygon.setEditable(true);
          setEditingZoneId(zoneId);

          // Close info window while editing (dragging points would interfere)
          if (infoWindowRef.current) {
            infoWindowRef.current.close();
          }
        }
      }
    }
  };

  /**
   * Saves changes to a zone (name, description, color)
   */
  const saveZone = () => {
    if (selectedZone) {
      // Create updated zone object
      const updatedZone: Zone = {
        ...selectedZone,
        name: editForm.name,
        description: editForm.description,
        color: editForm.color,
        updatedAt: new Date().toISOString(),
      };

      // Update polygon styling to match new color
      const polygon = (selectedZone as any).polygon;
      if (polygon) {
        polygon.setOptions({
          fillColor: editForm.color,
          strokeColor: editForm.color,
        });
      }

      // Update zones state
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

      // Close modal and reset selection
      setIsEditModalOpen(false);
      setSelectedZone(null);
    }
  };

  /**
   * Creates a new zone manually from coordinates or address
   */
  const createManualZone = async () => {
    if (!manualForm.name.trim()) return;

    try {
      let coordinates: google.maps.LatLng[] = [];

      if (manualForm.coordinates.trim()) {
        // OPTION 1: Parse coordinates from text input
        const coordPairs = manualForm.coordinates.split('\n').filter(line => line.trim());
        coordinates = coordPairs.map(pair => {
          const [lat, lng] = pair.split(',').map(s => parseFloat(s.trim()));
          if (isNaN(lat) || isNaN(lng)) {
            throw new Error(`Invalid coordinate pair: ${pair}`);
          }
          return new google.maps.LatLng(lat, lng);
        });
      } else if (manualForm.centerAddress.trim() && mapInstanceRef.current) {
        // OPTION 2: Create zone around an address using geocoding
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

        // Get location from geocoding result
        const location = result[0].geometry.location;
        const lat = location.lat();
        const lng = location.lng();

        // Create a simple rectangle around the location (roughly 500m radius)
        const offset = 0.005; // Approximately 500m in degrees
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

      // Validate minimum points for a polygon
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

      // Create polygon on map
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

      // Add to zones state and save
      const updatedZones = [...zones, newZone];
      setZones(updatedZones);

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

  /**
   * Deletes a zone from the map and storage
   */
  const handleDeleteZone = (zoneId: string) => {
    const zoneToDelete = zones.find(z => z.id === zoneId);
    if (zoneToDelete) {
      // Remove polygon from map
      const polygon = (zoneToDelete as any).polygon;
      if (polygon) {
        polygon.setMap(null);
      }

      // Update state and storage
      const updatedZones = zones.filter(z => z.id !== zoneId);
      setZones(updatedZones);
      deleteZone(zoneId);

      // Clear edit state if necessary
      if (editingZoneId === zoneId) {
        setEditingZoneId(null);
      }

      // Close modals
      setIsEditModalOpen(false);
      setSelectedZone(null);
    }
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div className="flex h-screen bg-gray-50 relative">

      {/* Mobile Menu Button */}
      <Button
        onClick={() => setIsSidebarOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 bg-white text-gray-900 shadow-lg hover:bg-gray-50 border border-gray-200"
        size="sm"
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Enhanced Sidebar - Mobile Responsive */}
      <div className={`
        w-80 bg-white border-r border-gray-200 flex flex-col shadow-lg
        lg:relative lg:translate-x-0 lg:shadow-lg
        fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>

        {/* Mobile Close Button */}
        <Button
          onClick={() => setIsSidebarOpen(false)}
          className="lg:hidden absolute top-4 right-4 bg-gray-100 text-gray-600 hover:bg-gray-200"
          size="sm"
        >
          <X className="h-4 w-4" />
        </Button>

        {/* Header */}
        <div className="p-4 lg:p-6 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <MapPin className="h-5 w-5 text-blue-600" />
            </div>
            <h1 className="text-lg lg:text-xl font-bold text-gray-900">Zone Manager Demo</h1>
          </div>
          <p className="text-sm text-gray-600">Example showcasing how to create zones on a map.</p>
          <a
            className='text-sm text-blue-500 hover:underline'
            href='https://github.com/davidrchand/zoning-example'
            target='_blank'
          >
            View Demo Code on Github
          </a>
        </div>

        {/* Controls */}
        <div className="p-4 lg:p-6 border-b border-gray-100">
          <div className="space-y-3">
            <Button
              onClick={isDrawing ? stopDrawing : startDrawing}
              className={`w-full h-11 font-medium transition-all ${isDrawing
                  ? 'bg-red-600 hover:bg-red-700 shadow-md'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg'
                }`}
            >
              {isDrawing ? <X className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {isDrawing ? 'Cancel Drawing' : 'Draw New Zone'}
            </Button>

            <Button
              onClick={() => {
                setIsManualModalOpen(true);
                setIsSidebarOpen(false); // Close sidebar on mobile
              }}
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
          <div className="p-4 lg:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Zones</h2>
              <span className="text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">
                {zones.length}
              </span>
            </div>

            {/* Empty State */}
            {zones.length === 0 ? (
              <div className="text-center py-8 lg:py-12">
                <div className="p-4 bg-gray-50 rounded-lg mb-4">
                  <MapPin className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 font-medium">No zones created yet</p>
                </div>
                <p className="text-xs text-gray-400">
                  Draw a zone on the map or create one manually to get started.
                </p>
              </div>
            ) : (
              /* Zone List */
              <div className="space-y-3">
                {zones.map((zone) => (
                  <div
                    key={zone.id}
                    className={`p-3 lg:p-4 border rounded-xl transition-all hover:shadow-md ${editingZoneId === zone.id
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-gray-900 truncate text-sm lg:text-base">
                            {zone.name}
                          </h3>
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

                      {/* Zone Action Buttons */}
                      <div className="flex flex-col gap-1.5 ml-3">
                        {/* Edit Properties Button */}
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
                            setIsSidebarOpen(false); // Close sidebar on mobile
                          }}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>

                        {/* Toggle Edit Mode Button */}
                        <Button
                          size="sm"
                          variant={editingZoneId === zone.id ? "default" : "outline"}
                          className={`h-8 w-8 p-0 ${editingZoneId === zone.id
                              ? 'bg-blue-600 text-white'
                              : 'hover:bg-blue-50 hover:text-blue-600'
                            }`}
                          onClick={() => toggleZoneEditMode(zone.id)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>

                        {/* Delete Button */}
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

      {/* Map Container */}
      <div className="flex-1 relative">
        {/* Map Element */}
        <div ref={mapRef} className="w-full h-full" />

        {/* Drawing Mode Indicator */}
        {isDrawing && (
          <div className="absolute top-4 left-4 lg:left-4 bg-white rounded-lg shadow-lg border border-gray-200 p-3 max-w-xs">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-gray-700">Drawing mode active</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Click on the map to start drawing a zone</p>
          </div>
        )}
      </div>

      {/* ====================================================================
          MODAL DIALOGS
          ==================================================================== */}

      {/* First Time Drawing Instructions Dialog */}
      <Dialog open={isFirstTimeModalOpen} onOpenChange={setIsFirstTimeModalOpen}>
        <DialogContent className="sm:max-w-[520px] mx-4">
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
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsFirstTimeModalOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmFirstTimeAndDraw}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
            >
              Got it, Start Drawing
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Zone Creation Dialog */}
      <Dialog open={isManualModalOpen} onOpenChange={setIsManualModalOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto mx-4">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-xl">Create Zone From Coordinates</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">

            {/* Zone Name Input */}
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="manual-name" className="font-medium sm:text-right">
                Name *
              </Label>
              <Input
                id="manual-name"
                value={manualForm.name}
                onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                className="sm:col-span-3 h-11"
                placeholder="Enter zone name"
              />
            </div>

            {/* Zone Description Input */}
            <div className="grid grid-cols-1 sm:grid-cols-4 items-start gap-4">
              <Label htmlFor="manual-description" className="font-medium sm:text-right sm:pt-2">
                Description
              </Label>
              <Textarea
                id="manual-description"
                value={manualForm.description}
                onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                className="sm:col-span-3"
                rows={3}
                placeholder="Optional description"
              />
            </div>

            {/* Zone Color Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="manual-color" className="font-medium sm:text-right">
                Color
              </Label>
              <Select
                value={manualForm.color}
                onValueChange={(value) => setManualForm({ ...manualForm, color: value })}
              >
                <SelectTrigger className="sm:col-span-3 h-11">
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

            {/* Creation Options */}
            <div className="space-y-6">

              {/* Option 1: Coordinates */}
              <div className="border rounded-lg p-4 lg:p-5 space-y-4 bg-gray-50">
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

              {/* Divider */}
              <div className="text-center">
                <div className="inline-flex items-center gap-3 text-gray-400">
                  <div className="h-px bg-gray-300 flex-1 w-16"></div>
                  <span className="font-medium text-sm">OR</span>
                  <div className="h-px bg-gray-300 flex-1 w-16"></div>
                </div>
              </div>

              {/* Option 2: Address */}
              <div className="border rounded-lg p-4 lg:p-5 space-y-4 bg-gray-50">
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

          {/* Dialog Actions */}
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6">
            <Button
              variant="outline"
              onClick={() => setIsManualModalOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={createManualZone}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
            >
              <Save className="h-4 w-4 mr-2" />
              Create Zone
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Zone Dialog */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[480px] mx-4">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-xl">
              {selectedZone?.name ? `Edit "${selectedZone.name}"` : 'New Zone'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">

            {/* Zone Name Input */}
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="font-medium sm:text-right">
                Name
              </Label>
              <Input
                id="name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="sm:col-span-3 h-11"
              />
            </div>

            {/* Zone Description Input */}
            <div className="grid grid-cols-1 sm:grid-cols-4 items-start gap-4">
              <Label htmlFor="description" className="font-medium sm:text-right sm:pt-2">
                Description
              </Label>
              <Textarea
                id="description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="sm:col-span-3"
                rows={3}
              />
            </div>

            {/* Zone Color Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="color" className="font-medium sm:text-right">
                Color
              </Label>
              <Select value={editForm.color} onValueChange={(value) => setEditForm({ ...editForm, color: value })}>
                <SelectTrigger className="sm:col-span-3 h-11">
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

            {/* Zone Metadata */}
            {selectedZone && (
              <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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

          {/* Dialog Actions */}
          <div className="flex flex-col sm:flex-row justify-between gap-3 pt-6">
            <div className="order-2 sm:order-1">
              {selectedZone && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteZone(selectedZone.id)}
                  className="hover:bg-red-600 w-full sm:w-auto"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Zone
                </Button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 order-1 sm:order-2">
              <Button
                variant="outline"
                onClick={() => setIsEditModalOpen(false)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                onClick={saveZone}
                className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
              >
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}