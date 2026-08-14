"use client";

import { Map as GoogleMap, useMap } from "@vis.gl/react-google-maps";
import { useRef, useEffect } from "react";
import { RoofSection } from "@/types/roofing";

interface RoofMapProps {
    center: { lat: number; lng: number };
    zoom: number;
    sections: RoofSection[];
    activeSectionId: string | null;
    onSelectSection: (id: string) => void;
    onUpdateSectionCoords: (id: string, coords: { lat: number; lng: number }[]) => void;
    onAddSection: () => void;
    onRemoveSection: (id: string) => void;
    hideControls?: boolean;
}

const SECTION_COLORS = ["#00589e", "#e65100", "#2e7d32", "#6a1b9a", "#c2185b"];

// ─── Subcomponente para Manejo de Polígonos y Recalibración ───────────────────
function RoofPolygons({
                          sections,
                          activeSectionId,
                          onSelectSection,
                          onUpdateSectionCoords,
                          center,
                          zoom,
                      }: {
    sections: RoofSection[];
    activeSectionId: string | null;
    onSelectSection: (id: string) => void;
    onUpdateSectionCoords: (id: string, coords: { lat: number; lng: number }[]) => void;
    center: { lat: number; lng: number };
    zoom: number; // 👈 Recibir zoom
}) {
    const map = useMap();
    const polygonRefs = useRef<Map<string, google.maps.Polygon>>(new Map());

    // Opcional: Si desde afuera cambia drásticamente la dirección/centro, mueve la cámara suavemente
    useEffect(() => {
        if (map && center) {
            map.panTo(center);
            if (zoom) {
                map.setZoom(zoom); // 👈 Forzar el nuevo zoom
            }
        }
    }, [map, center.lat, center.lng, zoom]);

    useEffect(() => {
        if (!map || typeof google === "undefined") return;

        // 1. Limpiar polígonos eliminados
        polygonRefs.current.forEach((polygon, id) => {
            if (!sections.some((s) => s.id === id)) {
                polygon.setMap(null);
                polygonRefs.current.delete(id);
            }
        });

        // 2. Crear o actualizar polígonos
        sections.forEach((section, index) => {
            const isActive = section.id === activeSectionId;
            const color = section.color || SECTION_COLORS[index % SECTION_COLORS.length];

            let polygon = polygonRefs.current.get(section.id);

            if (!polygon) {
                polygon = new google.maps.Polygon({
                    paths: section.coords,
                    map,
                    strokeColor: color,
                    strokeOpacity: 0.9,
                    strokeWeight: isActive ? 3 : 2,
                    fillColor: color,
                    fillOpacity: isActive ? 0.45 : 0.25,
                    editable: isActive,
                    draggable: isActive,
                });

                polygon.addListener("click", () => {
                    onSelectSection(section.id);
                });

                polygonRefs.current.set(section.id, polygon);
            } else {
                polygon.setPaths(section.coords);
                polygon.setOptions({
                    strokeColor: color,
                    fillColor: color,
                    strokeWeight: isActive ? 3 : 2,
                    fillOpacity: isActive ? 0.45 : 0.25,
                    editable: isActive,
                    draggable: isActive,
                });
            }

            if (isActive) {
                const path = polygon.getPath();
                const notifyChange = () => {
                    const newCoords: { lat: number; lng: number }[] = [];
                    for (let i = 0; i < path.getLength(); i++) {
                        const pt = path.getAt(i);
                        newCoords.push({ lat: pt.lat(), lng: pt.lng() });
                    }
                    onUpdateSectionCoords(section.id, newCoords);
                };

                google.maps.event.clearListeners(path, "set_at");
                google.maps.event.clearListeners(path, "insert_at");
                google.maps.event.clearListeners(path, "remove_at");

                path.addListener("set_at", notifyChange);
                path.addListener("insert_at", notifyChange);
                path.addListener("remove_at", notifyChange);
            }
        });
    }, [map, sections, activeSectionId, onSelectSection, onUpdateSectionCoords]);

    return null;
}

// ─── Componente Principal ──────────────────────────────────────────────────────
export const RoofMap = ({
                            center,
                            zoom,
                            sections,
                            activeSectionId,
                            onSelectSection,
                            onUpdateSectionCoords,
                            onAddSection,
                            onRemoveSection,
                            hideControls = false,
                        }: RoofMapProps) => {
    return (
        <div className="w-full h-[500px] min-h-[500px] relative rounded-xl overflow-hidden border border-gray-200">
            <GoogleMap
                defaultCenter={center}
                defaultZoom={zoom}
                mapTypeId="satellite"
                tilt={0}
                disableDefaultUI={true}
                zoomControl={true}
                gestureHandling="greedy"
                style={{ width: "100%", height: "100%" }}
            >
                <RoofPolygons
                    sections={sections}
                    activeSectionId={activeSectionId}
                    onSelectSection={onSelectSection}
                    onUpdateSectionCoords={onUpdateSectionCoords}
                    center={center}
                    zoom={zoom} // 👈 Pasa la prop zoom aquí
                />
            </GoogleMap>

            {/* Toolbar / Controles */}
            {!hideControls && (
                <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                    <div className="bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl shadow-lg border border-gray-200 pointer-events-auto flex items-center gap-2">
                        <span className="text-xs font-black text-gray-700 uppercase tracking-wider">
                            Sections ({sections.length}):
                        </span>
                        <div className="flex gap-1.5 overflow-x-auto max-w-xs sm:max-w-md py-0.5">
                            {sections.map((sec, idx) => {
                                const isActive = sec.id === activeSectionId;
                                const color = sec.color || SECTION_COLORS[idx % SECTION_COLORS.length];
                                return (
                                    <button
                                        key={sec.id}
                                        onClick={() => onSelectSection(sec.id)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                            isActive
                                                ? "bg-[#00589e] text-white shadow-sm"
                                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                        }`}
                                    >
                                        <span
                                            className="w-2.5 h-2.5 rounded-full border border-white"
                                            style={{ backgroundColor: color }}
                                        />
                                        {sec.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="pointer-events-auto flex gap-2">
                        <button
                            onClick={onAddSection}
                            className="bg-[#00589e] hover:bg-[#004277] text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                            + Add Roof Section
                        </button>

                        {sections.length > 1 && activeSectionId && (
                            <button
                                onClick={() => onRemoveSection(activeSectionId)}
                                className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg transition-all cursor-pointer"
                                title="Delete active section"
                            >
                                Delete Section
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};