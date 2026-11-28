import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MapPin,
    Layers,
    Compass,
    ZoomIn,
    ZoomOut,
    Filter,
    Store as StoreIcon,
    ChevronRight,
    X,
    Satellite,
    Road
} from 'lucide-react';
import { getMediaUrl } from './TicketsTypesAndComponents';
import type { Ticket } from './TicketsTypesAndComponents';

interface TicketsMapViewProps {
    tickets: Ticket[];
    onSelectTicket: (ticket: Ticket) => void;
    stores?: any[];
    statuses?: any[];
    priorities?: any[];
    loading?: boolean;
}

// Map Tile Layer Options
type MapTileType = 'streets' | 'satellite';

const TILE_LAYERS: Record<string, { url: string; attribution: string; name: string }> = {
    streets_light: {
        name: 'Streets',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom'
    },
    streets_dark: {
        name: 'Streets',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
    },
    satellite: {
        name: 'Satellite',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP'
    }
};

// Known Area Centroids for fallback coordinate positioning
const AREA_CENTROIDS: Record<string, { lat: number; lng: number }> = {
    'Capital': { lat: 29.3759, lng: 47.9774 },
    'As Asimah': { lat: 29.3759, lng: 47.9774 },
    'Kuwait City': { lat: 29.3759, lng: 47.9774 },
    'Hawally': { lat: 29.3333, lng: 48.0167 },
    'Hawalli': { lat: 29.3333, lng: 48.0167 },
    'Salmiya': { lat: 29.3333, lng: 48.0500 },
    'Farwaniya': { lat: 29.2778, lng: 47.9583 },
    'Riggai': { lat: 29.3100, lng: 47.9300 },
    'Rai': { lat: 29.2900, lng: 47.9400 },
    'Mahaboula': { lat: 29.1411, lng: 48.1211 },
    'Mahboula': { lat: 29.1411, lng: 48.1211 },
    'Eqaila': { lat: 29.1800, lng: 48.1000 },
    'Ahmadi': { lat: 29.0769, lng: 48.0839 },
    'Fahaheel': { lat: 29.0833, lng: 48.1333 },
    'Jahra': { lat: 29.3375, lng: 47.6581 },
    'Mubarak Al-Kabeer': { lat: 29.2144, lng: 48.0583 },
    'Default': { lat: 29.3375, lng: 47.9774 }
};

// Priority Color Mapper
const getPriorityColor = (level: number, name?: string): { color: string; bg: string; border: string; glow: string } => {
    const pName = (name || '').toLowerCase();
    if (level >= 3 || pName.includes('critical') || pName.includes('urgent') || pName.includes('p1')) {
        return {
            color: '#EF4444', // Red
            bg: 'rgba(239, 68, 68, 0.15)',
            border: '#DC2626',
            glow: 'rgba(239, 68, 68, 0.6)'
        };
    }
    if (level === 2 || pName.includes('high') || pName.includes('p2')) {
        return {
            color: '#F97316', // Orange
            bg: 'rgba(249, 115, 22, 0.15)',
            border: '#EA580C',
            glow: 'rgba(249, 115, 22, 0.5)'
        };
    }
    if (level === 1 || pName.includes('medium') || pName.includes('normal') || pName.includes('p3')) {
        return {
            color: '#F59E0B', // Amber
            bg: 'rgba(245, 158, 11, 0.15)',
            border: '#D97706',
            glow: 'rgba(245, 158, 11, 0.4)'
        };
    }
    return {
        color: '#3B82F6', // Blue / Low
        bg: 'rgba(59, 130, 246, 0.15)',
        border: '#2563EB',
        glow: 'rgba(59, 130, 246, 0.4)'
    };
};

export const TicketsMapView: React.FC<TicketsMapViewProps> = ({
    tickets,
    onSelectTicket,
    stores = [],
    loading = false
}) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const markersGroupRef = useRef<L.LayerGroup | null>(null);

    const [tileType, setTileType] = useState<MapTileType>('satellite');
    const [isDarkMode, setIsDarkMode] = useState<boolean>(() =>
        typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
    );
    const [selectedAreaFilter, setSelectedAreaFilter] = useState<string | null>(null);
    const [activeStoreDrawer, setActiveStoreDrawer] = useState<{ storeName: string; tickets: Ticket[] } | null>(null);

    // Listen to dark mode changes on document.documentElement
    useEffect(() => {
        if (typeof document === 'undefined') return;

        const observer = new MutationObserver(() => {
            setIsDarkMode(document.documentElement.classList.contains('dark'));
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });

        return () => observer.disconnect();
    }, []);

    // Store coordinate resolver with deterministic jitter offset if missing
    const storeCoordinateMap = useMemo(() => {
        const storeMap = new Map<string, { lat: number; lng: number; areaName: string; storeName: string; storeId: string }>();

        // Extract store coordinates from tickets
        tickets.forEach(ticket => {
            const st = ticket.store;
            if (!st || !st.store_id) return;
            const storeId = String(st.store_id);

            let areaName = 'Unknown Area';
            if (st.area) {
                areaName = typeof st.area === 'string' ? st.area : st.area.area_name || 'Unknown Area';
            }

            let lat: number | null = null;
            let lng: number | null = null;

            if (st.latitude !== undefined && st.latitude !== null && st.longitude !== undefined && st.longitude !== null) {
                const parsedLat = parseFloat(String(st.latitude));
                const parsedLng = parseFloat(String(st.longitude));
                if (!isNaN(parsedLat) && !isNaN(parsedLng) && parsedLat !== 0 && parsedLng !== 0) {
                    lat = parsedLat;
                    lng = parsedLng;
                }
            }

            if (!storeMap.has(storeId)) {
                storeMap.set(storeId, {
                    storeId,
                    storeName: st.store_name || storeId,
                    areaName,
                    lat: lat || 0,
                    lng: lng || 0
                });
            }
        });

        // Add additional stores from stores array
        stores.forEach(st => {
            if (!st || !st.store_id) return;
            const storeId = String(st.store_id);
            let areaName = 'Unknown Area';
            if (st.area) {
                areaName = typeof st.area === 'string' ? st.area : st.area.area_name || 'Unknown Area';
            }
            let lat: number | null = null;
            let lng: number | null = null;
            if (st.latitude && st.longitude) {
                const parsedLat = parseFloat(String(st.latitude));
                const parsedLng = parseFloat(String(st.longitude));
                if (!isNaN(parsedLat) && !isNaN(parsedLng) && parsedLat !== 0 && parsedLng !== 0) {
                    lat = parsedLat;
                    lng = parsedLng;
                }
            }
            if (!storeMap.has(storeId)) {
                storeMap.set(storeId, {
                    storeId,
                    storeName: st.store_name || storeId,
                    areaName,
                    lat: lat || 0,
                    lng: lng || 0
                });
            }
        });

        // Apply fallback coordinates with unique jitter for missing coords
        const areaCounts = new Map<string, number>();

        storeMap.forEach((entry) => {
            if (entry.lat === 0 || entry.lng === 0) {
                const areaKey = Object.keys(AREA_CENTROIDS).find(
                    k => entry.areaName.toLowerCase().includes(k.toLowerCase())
                ) || 'Default';

                const baseCentroid = AREA_CENTROIDS[areaKey] || AREA_CENTROIDS['Default'];
                const count = (areaCounts.get(areaKey) || 0) + 1;
                areaCounts.set(areaKey, count);

                const angle = count * 1.25;
                const distance = 0.008 * Math.sqrt(count);
                entry.lat = baseCentroid.lat + distance * Math.cos(angle);
                entry.lng = baseCentroid.lng + distance * Math.sin(angle);
            }
        });

        return storeMap;
    }, [tickets, stores]);

    // Group tickets by Store
    const storeTicketsGrouped = useMemo(() => {
        const map = new Map<string, { storeId: string; storeName: string; areaName: string; lat: number; lng: number; tickets: Ticket[]; highestPriorityLevel: number; highestPriorityName: string }>();

        tickets.forEach(ticket => {
            if (!ticket.store || !ticket.store.store_id) return;
            const storeId = String(ticket.store.store_id);
            const resolvedCoord = storeCoordinateMap.get(storeId);

            if (!resolvedCoord) return;

            const existing = map.get(storeId);
            const priorityLevel = ticket.priority?.level ?? 0;
            const priorityName = ticket.priority?.priority_name ?? 'Normal';

            if (!existing) {
                map.set(storeId, {
                    storeId,
                    storeName: resolvedCoord.storeName,
                    areaName: resolvedCoord.areaName,
                    lat: resolvedCoord.lat,
                    lng: resolvedCoord.lng,
                    tickets: [ticket],
                    highestPriorityLevel: priorityLevel,
                    highestPriorityName: priorityName
                });
            } else {
                existing.tickets.push(ticket);
                if (priorityLevel > existing.highestPriorityLevel) {
                    existing.highestPriorityLevel = priorityLevel;
                    existing.highestPriorityName = priorityName;
                }
            }
        });

        return Array.from(map.values());
    }, [tickets, storeCoordinateMap]);

    // Filter store markers by selected Area filter
    const filteredStoreGroups = useMemo(() => {
        if (!selectedAreaFilter) return storeTicketsGrouped;
        return storeTicketsGrouped.filter(g =>
            g.areaName.toLowerCase().includes(selectedAreaFilter.toLowerCase()) ||
            selectedAreaFilter.toLowerCase().includes(g.areaName.toLowerCase())
        );
    }, [storeTicketsGrouped, selectedAreaFilter]);

    // Calculate Area ticket totals for legend pills
    const areaSummaryPills = useMemo(() => {
        const areaCounts = new Map<string, number>();
        storeTicketsGrouped.forEach(group => {
            const name = group.areaName || 'Other';
            areaCounts.set(name, (areaCounts.get(name) || 0) + group.tickets.length);
        });

        return Array.from(areaCounts.entries()).map(([areaName, count]) => ({
            areaName,
            count
        })).sort((a, b) => b.count - a.count);
    }, [storeTicketsGrouped]);

    // Determine current active tile configuration key
    const activeTileKey = useMemo(() => {
        if (tileType === 'satellite') return 'satellite';
        return isDarkMode ? 'streets_dark' : 'streets_light';
    }, [tileType, isDarkMode]);

    // 1. Initialize Map
    useEffect(() => {
        if (!mapContainerRef.current) return;

        if (!mapInstanceRef.current) {
            const map = L.map(mapContainerRef.current, {
                center: [29.3375, 47.9774],
                zoom: 10,
                zoomControl: false,
                attributionControl: false
            });

            const tileConfig = TILE_LAYERS[activeTileKey];
            const tileLayer = L.tileLayer(tileConfig.url, {
                maxZoom: 19,
                subdomains: 'abcd',
                attribution: tileConfig.attribution
            }).addTo(map);

            tileLayerRef.current = tileLayer;

            markersGroupRef.current = L.layerGroup().addTo(map);

            mapInstanceRef.current = map;
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    // 2. Tile Layer Update (Syncs with Header theme toggle & manual satellite toggle)
    useEffect(() => {
        if (!mapInstanceRef.current) return;
        const map = mapInstanceRef.current;

        if (tileLayerRef.current) {
            map.removeLayer(tileLayerRef.current);
        }

        const tileConfig = TILE_LAYERS[activeTileKey];
        tileLayerRef.current = L.tileLayer(tileConfig.url, {
            maxZoom: 19,
            subdomains: 'abcd',
            attribution: tileConfig.attribution
        }).addTo(map);
    }, [activeTileKey]);

    // 3. Draw Store Pins / Location Markers
    useEffect(() => {
        if (!mapInstanceRef.current || !markersGroupRef.current) return;
        const markersGroup = markersGroupRef.current;
        markersGroup.clearLayers();

        const bounds = L.latLngBounds([]);

        filteredStoreGroups.forEach(group => {
            const priorityInfo = getPriorityColor(group.highestPriorityLevel, group.highestPriorityName);
            const ticketCount = group.tickets.length;
            const isCritical = group.highestPriorityLevel >= 3 || (group.highestPriorityName || '').toLowerCase().includes('critical');

            bounds.extend([group.lat, group.lng]);

            // Custom Leaflet DivIcon: direct location pin icon with priority color (no outer circle container)
            const markerHtml = `
                <div class="relative group cursor-pointer flex items-center justify-center transition-transform duration-200 hover:scale-110 drop-shadow-md">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" style="color: ${priorityInfo.border}" viewBox="0 0 24 24" fill="${priorityInfo.color}" stroke="${priorityInfo.border}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                        <circle cx="12" cy="10" r="3" fill="#ffffff" stroke="none"/>
                    </svg>
                    <span class="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[9px] font-black text-white shadow-md leading-none"
                          style="background-color: ${priorityInfo.border}">
                        ${ticketCount}
                    </span>
                </div>
            `;

            const icon = L.divIcon({
                html: markerHtml,
                className: 'custom-store-pin-marker',
                iconSize: [36, 36],
                iconAnchor: [18, 36],
                popupAnchor: [0, -36]
            });

            const marker = L.marker([group.lat, group.lng], { icon });

            // Top Priority ticket snippet
            const topTicket = group.tickets[0];
            const assignedWorkers = topTicket ? (topTicket.allocations || []).map((a: any) => a.worker).filter(Boolean) : [];
            const creatorName = topTicket?.created_by?.full_name || 'System';
            const creatorInitials = creatorName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?';
            const createdDateStr = topTicket?.created_date ? new Date(topTicket.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
            const ageStr = topTicket?.age_days !== undefined && topTicket.age_days !== null ? `(${Number(topTicket.age_days).toFixed(1)}d)` : '';
            const creatorImgUrl = topTicket?.created_by?.profile_image ? getMediaUrl(topTicket.created_by.profile_image) : null;

            const assignedWorkersStackHtml = assignedWorkers.length === 0
                ? `<span class="text-[9px] text-outline italic">Unassigned</span>`
                : `<div class="flex items-center -space-x-2 overflow-hidden shrink-0" title="Assigned: ${assignedWorkers.map((w: any) => w.full_name || 'Worker').join(', ')}">
                    ${assignedWorkers.slice(0, 3).map((w: any, idx: number) => {
                    const initials = (w.full_name || 'W').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?';
                    const imgUrl = w.profile_image ? getMediaUrl(w.profile_image) : null;
                    return `
                            <div class="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center font-bold text-[8px] bg-primary/10 text-primary border border-primary/25 shadow-xs shrink-0" style="z-index: ${10 - idx}">
                                ${imgUrl ? `<img src="${imgUrl}" alt="${w.full_name || ''}" class="w-full h-full object-cover" />` : `<span>${initials}</span>`}
                            </div>
                        `;
                }).join('')}
                    ${assignedWorkers.length > 3 ? `<div class="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[8px] bg-surface-container-high text-on-surface border border-outline-variant shrink-0" style="z-index: 0">+${assignedWorkers.length - 3}</div>` : ''}
                </div>`;

            // Hover Popup Card Content (Kanban Card layout)
            const popupCardHtml = `
                <div class="p-3 bg-surface text-on-surface border border-outline-variant rounded-xl shadow-2xl max-w-[300px] w-[290px] font-sans text-xs space-y-2 relative overflow-hidden">
                    <!-- Store Header & Priority -->
                    <div class="flex items-center justify-between gap-1.5 pb-1.5 border-b border-outline-variant/50">
                        <div class="flex items-center gap-1.5 min-w-0">
                            <span class="font-bold text-on-surface text-xs truncate">${group.storeName}</span>
                            ${ticketCount > 1 ? `<span class="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-primary/10 text-primary shrink-0">${ticketCount} tickets</span>` : ''}
                        </div>
                        <span class="text-[9px] font-bold px-2 py-0.5 rounded-full text-white shrink-0 shadow-2xs" style="background-color: ${priorityInfo.border}">
                            ${group.highestPriorityName}
                        </span>
                    </div>

                    ${topTicket ? `
                        <!-- WO Number & Status & Age -->
                        <div class="flex items-center justify-between gap-2 text-[11px]">
                            <div class="flex items-center gap-1 min-w-0">
                                <span class=" text-xs font-bold text-primary truncate">${topTicket.work_order_no}</span>
                                ${ageStr ? `<span class="text-[10px] text-outline shrink-0">${ageStr}</span>` : ''}
                            </div>
                            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant shrink-0">
                                ${topTicket.status?.status_name || ''}
                            </span>
                        </div>

                        <!-- Ticket Title -->
                        <h4 class="text-xs font-bold text-on-surface line-clamp-2 leading-snug">
                            ${topTicket.title}
                        </h4>

                        <!-- Description preview -->
                        ${topTicket.description ? `
                            <p class="text-[11px] text-on-surface-variant line-clamp-2 leading-normal bg-surface-container-low p-1.5 rounded border border-outline-variant/30">
                                ${topTicket.description}
                            </p>
                        ` : ''}

                        <!-- Store & Department Tags -->
                        <div class="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] text-on-surface-variant border-t border-outline-variant/40">
                            ${topTicket.department?.department_name ? `<span class="font-medium bg-surface-container px-1.5 py-0.5 rounded">🏢 ${topTicket.department.department_name}</span>` : ''}
                            ${group.areaName ? `<span class="font-medium bg-surface-container px-1.5 py-0.5 rounded">📍 ${group.areaName}</span>` : ''}
                        </div>

                        <!-- Card Footer (Creator + Assigned Workers) -->
                        <div class="flex items-center justify-between pt-2 text-[10px] text-on-surface-variant border-t border-outline-variant/30 mt-1">
                            <!-- Creator -->
                            <div class="flex items-center gap-1.5 min-w-0" title="Created by ${creatorName}">
                                <div class="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center font-bold text-[9px] bg-primary/10 text-primary border border-primary/25 shadow-xs shrink-0">
                                    ${creatorImgUrl ? `<img src="${creatorImgUrl}" alt="${creatorName}" class="w-full h-full object-cover" />` : `<span>${creatorInitials}</span>`}
                                </div>
                                <div class="flex flex-col min-w-0 leading-tight">
                                    <span class="font-semibold text-on-surface truncate max-w-[80px]">${creatorName.split(' ')[0]}</span>
                                    <span class="text-[8px] text-outline">${createdDateStr}</span>
                                </div>
                            </div>

                            <!-- Assigned Workers Avatar Stack -->
                            ${assignedWorkersStackHtml}
                        </div>
                    ` : ''}

                    <!-- Action Prompt -->
                    <div class="text-[10px] text-primary font-bold text-right flex items-center justify-end gap-1 pt-1.5 border-t border-outline-variant/30">
                        <span>${ticketCount > 1 ? `Click to view all ${ticketCount} tickets` : 'Click to view ticket details'}</span>
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                    </div>
                </div>
            `;

            marker.bindTooltip(popupCardHtml, {
                direction: 'top',
                sticky: false,
                opacity: 0.98,
                className: 'leaflet-hover-card-tooltip'
            });

            marker.on('click', () => {
                if (group.tickets.length === 1) {
                    onSelectTicket(group.tickets[0]);
                } else {
                    setActiveStoreDrawer({
                        storeName: group.storeName,
                        tickets: group.tickets
                    });
                }
            });

            markersGroup.addLayer(marker);
        });

        // Auto-fit bounds if markers exist
        if (bounds.isValid() && filteredStoreGroups.length > 0) {
            mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
        }
    }, [filteredStoreGroups, onSelectTicket]);

    // Zoom Helpers
    const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
    const handleZoomOut = () => mapInstanceRef.current?.zoomOut();
    const handleResetView = () => {
        if (!mapInstanceRef.current) return;
        if (filteredStoreGroups.length > 0) {
            const bounds = L.latLngBounds(filteredStoreGroups.map(g => [g.lat, g.lng]));
            if (bounds.isValid()) {
                mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
                return;
            }
        }
        mapInstanceRef.current.setView([29.3375, 47.9774], 10);
    };

    return (
        <div className="relative w-full h-[clamp(340px,calc(100dvh-235px),800px)] rounded overflow-hidden border border-outline-variant bg-surface-container-lowest shadow-sm flex flex-col">
            {/* Custom Leaflet Tooltip Overrides */}
            <style>{`
                .leaflet-hover-card-tooltip {
                    background: transparent !important;
                    border: none !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                }
                .leaflet-hover-card-tooltip::before {
                    display: none !important;
                }
                .leaflet-control-attribution {
                    display: none !important;
                }
            `}</style>

            {/* Map Canvas Container */}
            <div ref={mapContainerRef} className="w-full h-full z-0 bg-surface-container" />

            {/* Top Toolbar Controls (Floating Overlay) */}
            <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                {/* Left: User Area Filter Pills */}
                <div className="flex items-center gap-0.5 overflow-x-auto max-w-full scrollbar-none pointer-events-auto bg-surface-container border border-outline-variant rounded p-0.5 shrink-0">
                    <button
                        onClick={() => setSelectedAreaFilter(null)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-colors shrink-0 cursor-pointer ${selectedAreaFilter === null
                            ? 'bg-primary text-on-primary shadow-xs'
                            : 'text-on-surface-variant hover:text-on-surface'
                            }`}
                    >
                        All ({tickets.length})
                    </button>

                    {areaSummaryPills.map(({ areaName, count }) => {
                        const isSelected = selectedAreaFilter === areaName;

                        return (
                            <button
                                key={areaName}
                                onClick={() =>
                                    setSelectedAreaFilter(isSelected ? null : areaName)
                                }
                                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors shrink-0 cursor-pointer flex items-center gap-1 ${isSelected
                                    ? 'bg-primary text-on-primary shadow-xs'
                                    : 'text-on-surface-variant hover:text-on-surface'
                                    }`}
                            >
                                <span>{areaName}</span>

                                <span
                                    className={`px-1 rounded-full text-[9px] ${isSelected
                                        ? 'bg-on-primary/20 text-on-primary'
                                        : 'bg-surface-container-high text-outline'
                                        }`}
                                >
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>


                {/* Right: Map Type Switcher (Streets vs Satellite) */}
                <div className="flex items-center bg-surface-container border border-outline-variant rounded p-0.5 shrink-0 pointer-events-auto">
                    {(['streets', 'satellite'] as MapTileType[]).map((type) => (
                        <button
                            key={type}
                            onClick={() => setTileType(type)}
                            className={`p-1.5 rounded text-xs font-medium flex items-center transition-colors cursor-pointer ${tileType === type
                                ? 'bg-primary text-on-primary shadow-xs'
                                : 'text-on-surface-variant hover:text-on-surface'
                                }`}
                            title={type === 'satellite' ? 'Satellite View' : 'Street View'}
                        >
                            {type === 'satellite' ? (
                                <Satellite className="w-3.5 h-3.5" />
                            ) : (
                                <Road className="w-3.5 h-3.5" />
                            )}
                        </button>
                    ))}
                </div>

            </div>

            {/* Floating Navigation Controls (Bottom Right) */}
            <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5 pointer-events-auto shadow-lg">
                <button
                    onClick={handleZoomIn}
                    className="w-8 h-8 rounded-lg bg-surface/90 dark:bg-dark-surface/90 border border-outline-variant text-on-surface hover:bg-surface-container-high flex items-center justify-center transition-colors"
                    title="Zoom In"
                >
                    <ZoomIn className="w-4 h-4" />
                </button>
                <button
                    onClick={handleZoomOut}
                    className="w-8 h-8 rounded-lg bg-surface/90 dark:bg-dark-surface/90 border border-outline-variant text-on-surface hover:bg-surface-container-high flex items-center justify-center transition-colors"
                    title="Zoom Out"
                >
                    <ZoomOut className="w-4 h-4" />
                </button>
                <button
                    onClick={handleResetView}
                    className="w-8 h-8 rounded-lg bg-surface/90 dark:bg-dark-surface/90 border border-outline-variant text-on-surface hover:bg-surface-container-high flex items-center justify-center transition-colors"
                    title="Reset View to Kuwait"
                >
                    <Compass className="w-4 h-4 text-primary" />
                </button>
            </div>

            {/* Store Tickets List Modal / Drawer Overlay when clicking a store marker */}
            <AnimatePresence>
                {activeStoreDrawer && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end"
                        onClick={() => setActiveStoreDrawer(null)}
                    >
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="w-full max-w-md h-full bg-surface dark:bg-dark-surface border-l border-outline-variant flex flex-col shadow-2xl overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Drawer Header */}
                            <div className="p-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-low">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                        <StoreIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-on-surface text-base">{activeStoreDrawer.storeName}</h3>
                                        <p className="text-xs text-outline">{activeStoreDrawer.tickets.length} Tickets at this location</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setActiveStoreDrawer(null)}
                                    className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Ticket Items List */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
                                {activeStoreDrawer.tickets.map(ticket => {
                                    const priorityInfo = getPriorityColor(ticket.priority?.level ?? 0, ticket.priority?.priority_name);
                                    const assignedWorkers = (ticket.allocations || []).map((a: any) => a.worker).filter(Boolean);
                                    return (
                                        <div
                                            key={ticket.ticket_id}
                                            onClick={() => {
                                                setActiveStoreDrawer(null);
                                                onSelectTicket(ticket);
                                            }}
                                            className="p-3 bg-surface-container border border-outline-variant hover:border-primary/50 rounded-xl cursor-pointer transition-all shadow-2xs hover:shadow-md space-y-2 group"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className=" text-xs font-bold text-primary group-hover:underline">
                                                    {ticket.work_order_no}
                                                </span>
                                                <span
                                                    className="text-[10px] font-bold px-2 py-0.5 rounded text-white"
                                                    style={{ backgroundColor: priorityInfo.border }}
                                                >
                                                    {ticket.priority?.priority_name || 'Normal'}
                                                </span>
                                            </div>

                                            <h4 className="text-xs font-bold text-on-surface leading-snug line-clamp-2">
                                                {ticket.title}
                                            </h4>

                                            <div className="flex items-center justify-between text-[11px] text-outline pt-2 border-t border-outline-variant/40">
                                                <div className="flex items-center gap-2">
                                                    <span className="bg-surface-container-high px-2 py-0.5 rounded text-[10px] font-medium text-on-surface-variant">
                                                        {ticket.status?.status_name}
                                                    </span>
                                                    {assignedWorkers.length > 0 ? (
                                                        <div className="flex items-center -space-x-2 overflow-hidden">
                                                            {assignedWorkers.slice(0, 3).map((w: any, idx: number) => (
                                                                <div
                                                                    key={w.user_id}
                                                                    className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center font-bold text-[8px] bg-primary/10 text-primary border border-primary/25 shadow-xs shrink-0"
                                                                    title={`Assigned to ${w.full_name}`}
                                                                    style={{ zIndex: 10 - idx }}
                                                                >
                                                                    {w.profile_image ? (
                                                                        <img src={getMediaUrl(w.profile_image)} alt={w.full_name} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <span>{w.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'}</span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                            {assignedWorkers.length > 3 && (
                                                                <div className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[8px] bg-surface-container-high text-on-surface border border-outline-variant shrink-0" style={{ zIndex: 0 }}>
                                                                    +{assignedWorkers.length - 3}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-outline/60 italic">Unassigned</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 text-primary font-semibold text-xs">
                                                    <span>View Details</span>
                                                    <ChevronRight className="w-3.5 h-3.5" />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default TicketsMapView;
