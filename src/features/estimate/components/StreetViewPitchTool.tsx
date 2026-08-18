"use client";
// features/estimate/components/StreetViewPitchTool.tsx
//
// Herramienta de medición manual de pitch usando Street View Static API.
// NO usa IA/visión por computadora para "detectar" el ángulo — el usuario
// traza la línea sobre el filo del techo que ve en la foto, y calculamos el
// ángulo exacto de esa línea respecto a la horizontal. Es una asistencia
// visual, no una medición topográfica certificada (se aclara en la UI).

import { useEffect, useRef, useState, useCallback } from "react";
import { RoofPitch } from "@/types/roofing";

interface StreetViewPitchToolProps {
    location: { lat: number; lng: number };
    onConfirm: (degrees: number, matchedPitch: RoofPitch) => void;
    onClose: () => void;
}

const IMG_WIDTH = 640;
const IMG_HEIGHT = 400;

// ─── Helpers geográficos ────────────────────────────────────────────────────
function computeBearing(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const toDeg = (r: number) => (r * 180) / Math.PI;
    const lat1 = toRad(from.lat);
    const lat2 = toRad(to.lat);
    const dLng = toRad(to.lng - from.lng);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    const brng = toDeg(Math.atan2(y, x));
    return (brng + 360) % 360;
}

// ─── Mapeo de grado exacto → categoría de pricing existente ────────────────
// Basado en los mismos rangos que ya mostramos en el selector (rise/run):
// shallow 2/12–4/12 (9.5°–18.4°), medium 5/12–8/12 (22.6°–33.7°),
// steep 9/12–11/12 (36.9°–42.5°), high_steep 12/12+ (45°+).
// Los huecos entre rangos (ej. 18.4°–22.6°) se asignan a la categoría más
// cercana por punto medio del hueco.
function matchPitchCategory(degrees: number): RoofPitch {
    if (degrees < 4) return "shallow"; // prácticamente plano pero seleccionaron asphalt custom
    if (degrees < 20.5) return "shallow"; // hasta el punto medio del hueco shallow/medium
    if (degrees < 35.3) return "medium"; // hasta el punto medio del hueco medium/steep
    if (degrees < 43.8) return "steep"; // hasta el punto medio del hueco steep/high_steep
    return "high_steep";
}

export function StreetViewPitchTool({ location, onConfirm, onClose }: StreetViewPitchToolProps) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    const [status, setStatus] = useState<
        "loading" | "ok" | "no_coverage" | "request_denied" | "over_limit" | "error"
    >("loading");
    const [rawStatus, setRawStatus] = useState<string | null>(null);
    const [heading, setHeading] = useState(0);
    const [camPitch, setCamPitch] = useState(0); // ángulo de cámara (mirar arriba/abajo), no confundir con el pitch del techo

    const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // 1. Verificar cobertura + calcular heading inicial hacia la propiedad
    useEffect(() => {
        if (!apiKey) {
            setStatus("error");
            return;
        }

        const metadataUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${location.lat},${location.lng}&key=${apiKey}`;

        fetch(metadataUrl)
            .then((res) => res.json())
            .then((data) => {
                setRawStatus(data.status ?? null);
                console.log("[StreetViewPitchTool] metadata response:", data);

                if (data.status === "OK") {
                    const panoLocation = data.location as { lat: number; lng: number };
                    const initialHeading = computeBearing(panoLocation, location);
                    setHeading(Math.round(initialHeading));
                    setStatus("ok");
                    return;
                }

                if (data.status === "ZERO_RESULTS" || data.status === "NOT_FOUND") {
                    setStatus("no_coverage");
                    return;
                }

                if (data.status === "REQUEST_DENIED") {
                    setStatus("request_denied");
                    return;
                }

                if (data.status === "OVER_QUERY_LIMIT") {
                    setStatus("over_limit");
                    return;
                }

                setStatus("error");
            })
            .catch((err) => {
                console.error("[StreetViewPitchTool] metadata fetch failed:", err);
                setStatus("error");
            });
    }, [apiKey, location.lat, location.lng]);

    const imageUrl = `https://maps.googleapis.com/maps/api/streetview?size=${IMG_WIDTH}x${IMG_HEIGHT}&location=${location.lat},${location.lng}&heading=${heading}&pitch=${camPitch}&fov=90&source=outdoor&key=${apiKey}`;

    // ─── Dibujo de la línea de medición ─────────────────────────────────────
    const getRelativePoint = useCallback((clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return {
            x: ((clientX - rect.left) / rect.width) * IMG_WIDTH,
            y: ((clientY - rect.top) / rect.height) * IMG_HEIGHT,
        };
    }, []);

    const handlePointerDown = (e: React.PointerEvent) => {
        const pt = getRelativePoint(e.clientX, e.clientY);
        setPoints([pt, pt]);
        setIsDragging(true);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        const pt = getRelativePoint(e.clientX, e.clientY);
        setPoints((prev) => [prev[0], pt]);
    };

    const handlePointerUp = () => {
        setIsDragging(false);
    };

    const hasLine = points.length === 2;
    const measuredDegrees = hasLine
        ? (() => {
            const dx = points[1].x - points[0].x;
            const dy = points[1].y - points[0].y;
            if (dx === 0 && dy === 0) return 0;
            return Math.round((Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI * 10) / 10;
        })()
        : null;

    const matchedPitch = measuredDegrees !== null ? matchPitchCategory(measuredDegrees) : null;

    const rotate = (delta: number) => setHeading((h) => (h + delta + 360) % 360);
    const tilt = (delta: number) => setCamPitch((p) => Math.max(-20, Math.min(40, p + delta)));

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">
                        Measure Pitch from Street View
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer px-2"
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {status === "loading" && (
                        <div className="h-[300px] flex items-center justify-center text-sm text-gray-400 font-semibold">
                            Loading Street View…
                        </div>
                    )}

                    {status === "error" && (
                        <div className="h-[300px] flex items-center justify-center text-sm text-red-500 font-semibold text-center px-6">
                            Could not load Street View. Check the API key or your connection.
                            {rawStatus && (
                                <span className="block text-[11px] font-normal text-gray-400 mt-2">
                                    Status returned: {rawStatus}
                                </span>
                            )}
                        </div>
                    )}

                    {status === "request_denied" && (
                        <div className="h-[300px] flex items-center justify-center text-sm text-red-500 font-semibold text-center px-6 leading-snug">
                            Google devolvió REQUEST_DENIED. La Street View Static API es un producto aparte en
                            Google Cloud — hay que habilitarla en <strong>APIs & Services → Library →
                            &quot;Street View Static API&quot;</strong>, y revisar que la API key no tenga
                            restricciones de referrer/IP que bloqueen esta llamada.
                        </div>
                    )}

                    {status === "over_limit" && (
                        <div className="h-[300px] flex items-center justify-center text-sm text-amber-600 font-semibold text-center px-6">
                            Se superó la cuota de la Street View Static API para esta key. Revisá el uso/billing en
                            Google Cloud Console.
                        </div>
                    )}

                    {status === "no_coverage" && (
                        <div className="h-[300px] flex items-center justify-center text-sm text-amber-600 font-semibold text-center px-6">
                            No hay imagen de Street View disponible para esta dirección. Elegí una de las 4 categorías estándar a ojo.
                        </div>
                    )}

                    {status === "ok" && (
                        <>
                            <p className="text-xs text-gray-500 leading-snug">
                                Rotá/inclinná la cámara hasta ver bien el filo del techo, después trazá una línea
                                (click y arrastrá) siguiendo esa pendiente.
                            </p>

                            <div
                                ref={containerRef}
                                className="relative w-full rounded-xl overflow-hidden border border-gray-200 select-none touch-none"
                                style={{ aspectRatio: `${IMG_WIDTH} / ${IMG_HEIGHT}` }}
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerLeave={handlePointerUp}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={imageUrl}
                                    alt="Street View del techo"
                                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                                    draggable={false}
                                />

                                <svg
                                    className="absolute inset-0 w-full h-full pointer-events-none"
                                    viewBox={`0 0 ${IMG_WIDTH} ${IMG_HEIGHT}`}
                                >
                                    {hasLine && (
                                        <>
                                            {/* Línea de referencia horizontal, para comparar visualmente */}
                                            <line
                                                x1={points[0].x}
                                                y1={points[0].y}
                                                x2={points[0].x + Math.abs(points[1].x - points[0].x) * Math.sign(points[1].x - points[0].x || 1)}
                                                y2={points[0].y}
                                                stroke="#ffffff"
                                                strokeDasharray="4 4"
                                                strokeWidth={1.5}
                                                opacity={0.7}
                                            />
                                            {/* Línea trazada por el usuario */}
                                            <line
                                                x1={points[0].x}
                                                y1={points[0].y}
                                                x2={points[1].x}
                                                y2={points[1].y}
                                                stroke="#e65100"
                                                strokeWidth={3}
                                                strokeLinecap="round"
                                            />
                                            <circle cx={points[0].x} cy={points[0].y} r={5} fill="#e65100" stroke="#fff" strokeWidth={1.5} />
                                            <circle cx={points[1].x} cy={points[1].y} r={5} fill="#e65100" stroke="#fff" strokeWidth={1.5} />
                                        </>
                                    )}
                                </svg>
                            </div>

                            {/* Controles de cámara */}
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex gap-1.5">
                                    <button
                                        onClick={() => rotate(-30)}
                                        className="px-3 py-1.5 rounded-lg bg-gray-100 text-[#00589e]  hover:bg-gray-200 text-xs font-bold cursor-pointer"
                                    >
                                        ↺ Rotate
                                    </button>
                                    <button
                                        onClick={() => rotate(30)}
                                        className="px-3 py-1.5 rounded-lg bg-gray-100 text-[#00589e]  hover:bg-gray-200 text-xs font-bold cursor-pointer"
                                    >
                                        Rotate ↻
                                    </button>
                                </div>
                                <div className="flex gap-1.5">
                                    <button
                                        onClick={() => tilt(10)}
                                        className="px-3 py-1.5 rounded-lg bg-gray-100 text-[#00589e]  hover:bg-gray-200 text-xs font-bold cursor-pointer"
                                    >
                                        ↑ Look Up
                                    </button>
                                    <button
                                        onClick={() => tilt(-10)}
                                        className="px-3 py-1.5 rounded-lg bg-gray-100 text-[#00589e]  hover:bg-gray-200 text-xs font-bold cursor-pointer"
                                    >
                                        ↓ Look Down
                                    </button>
                                </div>
                                <button
                                    onClick={() => setPoints([])}
                                    disabled={!hasLine}
                                    className="px-3 py-1.5 rounded-lg bg-gray-100 text-[#00589e]  hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold cursor-pointer"
                                >
                                    Clear Line
                                </button>
                            </div>

                            {/* Resultado */}
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                        Measured Angle
                                    </p>
                                    <p className="text-2xl font-black text-[#00589e]">
                                        {measuredDegrees !== null ? `${measuredDegrees}°` : "—"}
                                    </p>
                                </div>
                                {matchedPitch && (
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                            Matches Category
                                        </p>
                                        <p className="text-sm font-black text-gray-800 capitalize">
                                            {matchedPitch.replace("_", " ")}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <p className="text-[10px] text-gray-400 italic leading-snug">
                                Estimación visual basada en la foto — no es una medición topográfica certificada.
                            </p>
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-gray-600 hover:bg-gray-200 cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            if (measuredDegrees !== null && matchedPitch) {
                                onConfirm(measuredDegrees, matchedPitch);
                            }
                        }}
                        disabled={measuredDegrees === null}
                        className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-[#00589e] hover:bg-[#004277] disabled:opacity-40 disabled:cursor-not-allowed text-white cursor-pointer"
                    >
                        Use This Pitch
                    </button>
                </div>
            </div>
        </div>
    );
}