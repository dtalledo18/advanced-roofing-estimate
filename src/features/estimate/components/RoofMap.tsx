"use client";

import { Map as GoogleMap, useMap } from "@vis.gl/react-google-maps";
import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { RoofSection } from "@/types/roofing";

interface RoofMapProps {
    center: { lat: number; lng: number };
    zoom: number;
    sections: RoofSection[];
    activeSectionId: string | null;
    onSelectSection: (id: string) => void;
    onUpdateSectionCoords: (id: string, coords: { lat: number; lng: number }[]) => void;
    // ── Dibujo manual punto-por-punto ────────────────────────────────────────
    isDrawingMode: boolean;
    onStartAddSection: () => void; // activa el modo dibujo
    onSectionDrawn: (coords: { lat: number; lng: number }[]) => void; // el usuario terminó el polígono
    onCancelDrawing: () => void;
    onRemoveSection: (id: string) => void;
    hideControls?: boolean;
}

// Paleta VCM
// VCM_YELLOW      = #FDB913
// VCM_YELLOW_DARK = #E0A10A
// VCM_BLACK       = #0A0A0A
// VCM_CHIP        = #E4E4E4

// Mismos colores que en page.tsx: la sección principal en amarillo VCM y el
// resto en colores que contrastan con el satélite sin confundirse con el amarillo.
const SECTION_COLORS = ["#FDB913", "#6a1b9a", "#2e7d32", "#c2185b", "#0288d1"];

// Color del polígono de preview mientras se dibuja una sección nueva.
const DRAWING_COLOR = "#FDB913";
const DRAWING_VERTEX_STROKE = "#0A0A0A";

// ─── Subcomponente: Manejo de Polígonos existentes y Recalibración ────────────
function RoofPolygons({
                          sections,
                          activeSectionId,
                          onSelectSection,
                          onUpdateSectionCoords,
                          center,
                          zoom,
                          isDrawingMode,
                      }: {
    sections: RoofSection[];
    activeSectionId: string | null;
    onSelectSection: (id: string) => void;
    onUpdateSectionCoords: (id: string, coords: { lat: number; lng: number }[]) => void;
    center: { lat: number; lng: number };
    zoom: number;
    isDrawingMode: boolean;
}) {
    const map = useMap();
    const polygonRefs = useRef<Map<string, google.maps.Polygon>>(new Map());

    useEffect(() => {
        if (map && center) {
            map.panTo(center);
            if (zoom) {
                map.setZoom(zoom);
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
            // Mientras se está dibujando una sección nueva, ninguna existente
            // queda editable — evita que un click para agregar un punto
            // termine moviendo un vértice de otra sección por error.
            const isActive = section.id === activeSectionId && !isDrawingMode;
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
                    if (!isDrawingMode) onSelectSection(section.id);
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
    }, [map, sections, activeSectionId, onSelectSection, onUpdateSectionCoords, isDrawingMode]);

    return null;
}

// ─── Subcomponente: Dibujo manual punto-por-punto ──────────────────────────────
// NO usa google.maps.drawing.DrawingManager — Google la sacó de la Maps JS API
// (v3.65+), por eso los tipos aparecen vacíos/sin métodos. En su lugar: un
// listener de click plano sobre el mapa que va acumulando vértices, con un
// Polygon + Markers de preview manuales, y botones "Finish" / "Undo" / "Cancel"
// en el toolbar del padre (controlados vía ref imperativo).
export interface DrawingControllerHandle {
    finish: () => void;
    undoLastPoint: () => void;
}

const DrawingController = forwardRef<
    DrawingControllerHandle,
    {
        isDrawingMode: boolean;
        onSectionDrawn: (coords: { lat: number; lng: number }[]) => void;
        onPointsChange: (count: number) => void;
    }
>(function DrawingController({ isDrawingMode, onSectionDrawn, onPointsChange }, ref) {
    const map = useMap();
    const [points, setPoints] = useState<{ lat: number; lng: number }[]>([]);

    const previewPolygonRef = useRef<google.maps.Polygon | null>(null);
    const vertexMarkersRef = useRef<google.maps.Marker[]>([]);
    const onSectionDrawnRef = useRef(onSectionDrawn);
    const onPointsChangeRef = useRef(onPointsChange);
    const pointsRef = useRef<{ lat: number; lng: number }[]>([]);

    useEffect(() => {
        onSectionDrawnRef.current = onSectionDrawn;
    }, [onSectionDrawn]);

    useEffect(() => {
        onPointsChangeRef.current = onPointsChange;
    }, [onPointsChange]);

    // Mantener una copia "de lectura" del último valor de points en un ref.
    // finish() la lee de acá — NUNCA metemos un side effect dentro del
    // updater de setPoints, porque React (Strict Mode) puede invocar ese
    // updater dos veces para verificar pureza, y eso duplicaba la sección.
    useEffect(() => {
        pointsRef.current = points;
        onPointsChangeRef.current(points.length);
    }, [points]);

    // Exponer acciones imperativas al padre (botones del toolbar)
    useImperativeHandle(
        ref,
        () => ({
            finish: () => {
                if (pointsRef.current.length >= 3) {
                    onSectionDrawnRef.current(pointsRef.current);
                }
            },
            undoLastPoint: () => {
                setPoints((prev) => prev.slice(0, -1));
            },
        }),
        []
    );

    // Reiniciar puntos cada vez que se activa/desactiva el modo dibujo
    useEffect(() => {
        setPoints([]);
    }, [isDrawingMode]);

    // Click en el mapa → agrega un vértice
    useEffect(() => {
        if (!map || !isDrawingMode) return;

        const listener = map.addListener("click", (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            const pt = { lat: e.latLng.lat(), lng: e.latLng.lng() };
            setPoints((prev) => [...prev, pt]);
        });

        return () => {
            google.maps.event.removeListener(listener);
        };
    }, [map, isDrawingMode]);

    // Dibujar/actualizar el polígono de preview + marcadores de vértice
    useEffect(() => {
        if (!map || typeof google === "undefined") return;

        if (!isDrawingMode || points.length === 0) {
            previewPolygonRef.current?.setMap(null);
            previewPolygonRef.current = null;
            vertexMarkersRef.current.forEach((m) => m.setMap(null));
            vertexMarkersRef.current = [];
            return;
        }

        if (!previewPolygonRef.current) {
            previewPolygonRef.current = new google.maps.Polygon({
                map,
                paths: points,
                strokeColor: DRAWING_COLOR,
                strokeWeight: 2,
                fillColor: DRAWING_COLOR,
                fillOpacity: 0.25,
                clickable: false,
            });
        } else {
            previewPolygonRef.current.setPath(points);
        }

        vertexMarkersRef.current.forEach((m) => m.setMap(null));
        vertexMarkersRef.current = points.map(
            (p) =>
                new google.maps.Marker({
                    position: p,
                    map,
                    clickable: false,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 5,
                        fillColor: DRAWING_COLOR,
                        fillOpacity: 1,
                        strokeColor: DRAWING_VERTEX_STROKE,
                        strokeWeight: 2,
                    },
                })
        );
    }, [map, points, isDrawingMode]);

    // Limpieza al desmontar
    useEffect(() => {
        return () => {
            previewPolygonRef.current?.setMap(null);
            vertexMarkersRef.current.forEach((m) => m.setMap(null));
        };
    }, []);

    return null;
});

// ─── Componente Principal ──────────────────────────────────────────────────────
export const RoofMap = ({
                            center,
                            zoom,
                            sections,
                            activeSectionId,
                            onSelectSection,
                            onUpdateSectionCoords,
                            isDrawingMode,
                            onStartAddSection,
                            onSectionDrawn,
                            onCancelDrawing,
                            onRemoveSection,
                            hideControls = false,
                        }: RoofMapProps) => {
    const drawingRef = useRef<DrawingControllerHandle>(null);
    const [drawnPointCount, setDrawnPointCount] = useState(0);

    return (
        <div className="w-full h-[500px] min-h-[500px] relative rounded-2xl overflow-hidden">
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
                    zoom={zoom}
                    isDrawingMode={isDrawingMode}
                />
                <DrawingController
                    ref={drawingRef}
                    isDrawingMode={isDrawingMode}
                    onSectionDrawn={onSectionDrawn}
                    onPointsChange={setDrawnPointCount}
                />
            </GoogleMap>

            {/* Toolbar / Controles */}
            {!hideControls && (
                <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                    {isDrawingMode ? (
                        <div className="bg-[#0A0A0A]/90 backdrop-blur-md pl-2 pr-4 py-2 rounded-full pointer-events-auto flex items-center gap-2.5">
                            <span className="w-6 h-6 rounded-full bg-[#FDB913] text-[#0A0A0A] text-xs font-bold flex items-center justify-center tabular-nums">
                                {drawnPointCount}
                            </span>
                            <span className="text-sm font-medium text-white">
                                Click each corner of the roof
                                {drawnPointCount < 3 && (
                                    <span className="text-white/60">
                                        {" "}
                                        · {3 - drawnPointCount} more to close the shape
                                    </span>
                                )}
                            </span>
                        </div>
                    ) : (
                        <div className="bg-white/95 backdrop-blur-md p-1.5 rounded-full pointer-events-auto flex items-center gap-1.5 max-w-full">
                            <span className="text-xs font-semibold text-gray-500 pl-2.5 pr-1 shrink-0">
                                Sections ({sections.length})
                            </span>
                            <div className="flex gap-1 overflow-x-auto max-w-xs sm:max-w-md">
                                {sections.map((sec, idx) => {
                                    const isActive = sec.id === activeSectionId;
                                    const color = sec.color || SECTION_COLORS[idx % SECTION_COLORS.length];
                                    return (
                                        <button
                                            key={sec.id}
                                            onClick={() => onSelectSection(sec.id)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                                                isActive
                                                    ? "bg-[#0A0A0A] text-white"
                                                    : "bg-[#E4E4E4] text-[#0A0A0A] hover:bg-[#d6d6d6]"
                                            }`}
                                        >
                                            <span
                                                className="w-2.5 h-2.5 rounded-full ring-1 ring-white"
                                                style={{ backgroundColor: color }}
                                            />
                                            {sec.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="pointer-events-auto flex gap-2">
                        {isDrawingMode ? (
                            <>
                                <button
                                    onClick={() => drawingRef.current?.undoLastPoint()}
                                    disabled={drawnPointCount === 0}
                                    className="bg-white hover:bg-[#E4E4E4] disabled:opacity-40 disabled:cursor-not-allowed text-[#0A0A0A] px-4 py-2 rounded-full text-sm font-semibold transition-colors cursor-pointer"
                                >
                                    Undo point
                                </button>
                                <button
                                    onClick={() => drawingRef.current?.finish()}
                                    disabled={drawnPointCount < 3}
                                    className="bg-[#FDB913] hover:bg-[#E0A10A] disabled:opacity-40 disabled:cursor-not-allowed text-[#0A0A0A] px-4 py-2 rounded-full text-sm font-semibold transition-colors cursor-pointer"
                                >
                                    Finish shape
                                </button>
                                <button
                                    onClick={onCancelDrawing}
                                    className="bg-[#0A0A0A] hover:bg-[#2a2a2a] text-white px-4 py-2 rounded-full text-sm font-semibold transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={onStartAddSection}
                                    className="bg-[#FDB913] hover:bg-[#E0A10A] text-[#0A0A0A] pl-2 pr-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                    <span className="w-5 h-5 rounded-full bg-[#0A0A0A] text-[#FDB913] flex items-center justify-center">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                            <line x1="12" y1="5" x2="12" y2="19" />
                                            <line x1="5" y1="12" x2="19" y2="12" />
                                        </svg>
                                    </span>
                                    Add roof section
                                </button>

                                {sections.length > 1 && activeSectionId && (
                                    <button
                                        onClick={() => onRemoveSection(activeSectionId)}
                                        className="bg-white hover:bg-red-50 text-red-600 px-4 py-2 rounded-full text-sm font-semibold transition-colors cursor-pointer"
                                        title="Delete active section"
                                    >
                                        Delete section
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};