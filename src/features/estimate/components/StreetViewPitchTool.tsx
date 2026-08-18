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
    const [fov, setFov] = useState(90); // campo de visión — más chico = más zoom

    // ─── Medición en dos pasos ──────────────────────────────────────────────
    // Paso 1: el usuario traza una línea sobre algo que SABE que está a nivel
    // (una canaleta, el borde de una ventana, la base de la pared). Esto es
    // la referencia horizontal real — no asumimos que el horizonte de la
    // foto está nivelado, porque Street View puede tener roll de cámara.
    // Paso 2: traza la línea siguiendo la pendiente del techo.
    // El ángulo medido es el que hay ENTRE las dos líneas, no contra el
    // borde crudo de la imagen.
    type Phase = "reference" | "slope";
    const [phase, setPhase] = useState<Phase>("reference");
    const [refLine, setRefLine] = useState<{ x: number; y: number }[] | null>(null);
    const [slopeLine, setSlopeLine] = useState<{ x: number; y: number }[] | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

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
        if (phase === "reference") {
            setRefLine([pt, pt]);
        } else {
            setSlopeLine([pt, pt]);
        }
        setIsDragging(true);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        const pt = getRelativePoint(e.clientX, e.clientY);
        if (phase === "reference") {
            setRefLine((prev) => (prev ? [prev[0], pt] : null));
        } else {
            setSlopeLine((prev) => (prev ? [prev[0], pt] : null));
        }
    };

    const handlePointerUp = () => {
        if (!isDragging) return;
        setIsDragging(false);
        // Al terminar de trazar la referencia, pasamos automáticamente al
        // paso 2 (línea del techo).
        if (phase === "reference" && refLine) {
            setPhase("slope");
        }
    };

    // Ángulo de una línea respecto a la horizontal de la imagen, normalizado
    // a [-90, 90] (dirección "hacia la derecha") para poder restar dos
    // ángulos sin importar en qué sentido se trazó cada línea.
    const lineAngle = (line: { x: number; y: number }[]) => {
        let dx = line[1].x - line[0].x;
        let dy = line[1].y - line[0].y;
        if (dx < 0) {
            dx = -dx;
            dy = -dy;
        }
        return (Math.atan2(dy, dx) * 180) / Math.PI;
    };

    const hasRefLine = !!refLine && (refLine[0].x !== refLine[1].x || refLine[0].y !== refLine[1].y);
    const hasSlopeLine = !!slopeLine && (slopeLine[0].x !== slopeLine[1].x || slopeLine[0].y !== slopeLine[1].y);

    const measuredDegrees =
        hasRefLine && hasSlopeLine
            ? Math.round(Math.abs(lineAngle(slopeLine!) - lineAngle(refLine!)) * 10) / 10
            : null;

    const matchedPitch = measuredDegrees !== null ? matchPitchCategory(measuredDegrees) : null;

    const clearReference = () => {
        setRefLine(null);
        setSlopeLine(null);
        setPhase("reference");
    };

    const clearSlope = () => {
        setSlopeLine(null);
        setPhase("slope");
    };

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

    const imageUrl = `https://maps.googleapis.com/maps/api/streetview?size=${IMG_WIDTH}x${IMG_HEIGHT}&location=${location.lat},${location.lng}&heading=${heading}&pitch=${camPitch}&fov=${fov}&source=outdoor&key=${apiKey}`;

    // El paso de rotación/inclinación es proporcional al fov actual — con
    // zoom cerrado (fov chico) un salto fijo de 30°/10° te saca el techo de
    // cuadro, así que escalamos el paso con el nivel de zoom actual.
    const rotateStep = Math.max(4, Math.round(fov * 0.35));
    const tiltStep = Math.max(2, Math.round(fov * 0.12));

    const rotate = (sign: 1 | -1) => setHeading((h) => (h + sign * rotateStep + 360) % 360);
    const tilt = (sign: 1 | -1) => setCamPitch((p) => Math.max(-20, Math.min(40, p + sign * tiltStep)));
    const zoom = (delta: number) => setFov((f) => Math.max(30, Math.min(120, f + delta)));
    const resetView = () => {
        setCamPitch(0);
        setFov(90);
    };

    // Ícono de flecha reutilizable para el D-pad
    const Chevron = ({ direction }: { direction: "up" | "down" | "left" | "right" }) => {
        const rotation = { up: 0, right: 90, down: 180, left: 270 }[direction];
        return (
            <svg width="16" height="16" viewBox="0 0 24 24" style={{ transform: `rotate(${rotation}deg)` }}>
                <path d="M12 5l7 12H5z" fill="currentColor" />
            </svg>
        );
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                    <h3 className="text-base font-black text-gray-800 uppercase tracking-wider">
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
                        <div className="h-[300px] flex items-center justify-center text-base text-red-500 font-semibold text-center px-6">
                            Could not load Street View. Check the API key or your connection.
                            {rawStatus && (
                                <span className="block text-sm font-normal text-gray-400 mt-2">
                                    Status returned: {rawStatus}
                                </span>
                            )}
                        </div>
                    )}

                    {status === "request_denied" && (
                        <div className="h-[300px] flex items-center justify-center text-base text-red-500 font-semibold text-center px-6 leading-snug">
                            Google returned REQUEST_DENIED. Street View Static API is a separate product in
                            Google Cloud — you need to enable it under <strong>APIs & Services → Library →
                            &quot;Street View Static API&quot;</strong>, and check that the API key doesn&apos;t
                            have referrer/IP restrictions blocking this call.
                        </div>
                    )}

                    {status === "over_limit" && (
                        <div className="h-[300px] flex items-center justify-center text-base text-amber-600 font-semibold text-center px-6">
                            The Street View Static API quota was exceeded for this key. Check usage/billing in
                            Google Cloud Console.
                        </div>
                    )}

                    {status === "no_coverage" && (
                        <div className="h-[300px] flex items-center justify-center text-base text-amber-600 font-semibold text-center px-6">
                            No Street View imagery is available for this address. Pick one of the 4 standard categories by eye.
                        </div>
                    )}

                    {status === "ok" && (
                        <>
                            <p className="text-sm text-gray-600 leading-snug">
                                {phase === "reference" ? (
                                    <>
                                        <strong className="text-[#2563eb]">Step 1 of 2:</strong> draw a line over
                                        something you know is truly level (a gutter, a window edge, the base of a
                                        wall) — this is your real horizontal reference.
                                    </>
                                ) : (
                                    <>
                                        <strong className="text-[#e65100]">Step 2 of 2:</strong> now draw a line
                                        following the slope of the roof.
                                    </>
                                )}
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
                                    {hasRefLine && (
                                        <>
                                            <line
                                                x1={refLine![0].x}
                                                y1={refLine![0].y}
                                                x2={refLine![1].x}
                                                y2={refLine![1].y}
                                                stroke="#2563eb"
                                                strokeWidth={3.5}
                                                strokeLinecap="round"
                                            />
                                            <circle cx={refLine![0].x} cy={refLine![0].y} r={5} fill="#2563eb" stroke="#fff" strokeWidth={1.5} />
                                            <circle cx={refLine![1].x} cy={refLine![1].y} r={5} fill="#2563eb" stroke="#fff" strokeWidth={1.5} />
                                        </>
                                    )}

                                    {hasSlopeLine && (
                                        <>
                                            <line
                                                x1={slopeLine![0].x}
                                                y1={slopeLine![0].y}
                                                x2={slopeLine![1].x}
                                                y2={slopeLine![1].y}
                                                stroke="#e65100"
                                                strokeWidth={3.5}
                                                strokeLinecap="round"
                                            />
                                            <circle cx={slopeLine![0].x} cy={slopeLine![0].y} r={5} fill="#e65100" stroke="#fff" strokeWidth={1.5} />
                                            <circle cx={slopeLine![1].x} cy={slopeLine![1].y} r={5} fill="#e65100" stroke="#fff" strokeWidth={1.5} />
                                        </>
                                    )}
                                </svg>

                                {/* ── D-pad + Zoom, estilo controles nativos de Street View ──
                                    stopPropagation en pointerdown/up/move para que un click acá
                                    NO se registre como un punto de la línea de medición. */}
                                <div
                                    className="absolute bottom-3 right-3 flex items-end gap-2.5 pointer-events-none"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onPointerMove={(e) => e.stopPropagation()}
                                    onPointerUp={(e) => e.stopPropagation()}
                                >
                                    {/* Cruz direccional */}
                                    <div
                                        className="grid pointer-events-auto"
                                        style={{ gridTemplateColumns: "repeat(3, 32px)", gridTemplateRows: "repeat(3, 32px)", gap: "4px" }}
                                    >
                                        <div />
                                        <button
                                            type="button"
                                            onClick={() => tilt(1)}
                                            title="Look up"
                                            className="rounded-full bg-white hover:bg-gray-50 shadow-lg flex items-center justify-center text-gray-700 cursor-pointer"
                                        >
                                            <Chevron direction="up" />
                                        </button>
                                        <div />

                                        <button
                                            type="button"
                                            onClick={() => rotate(-1)}
                                            title="Rotate left"
                                            className="rounded-full bg-white hover:bg-gray-50 shadow-lg flex items-center justify-center text-gray-700 cursor-pointer"
                                        >
                                            <Chevron direction="left" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={resetView}
                                            title="Reset view"
                                            className="rounded-full bg-white hover:bg-gray-50 shadow-lg flex items-center justify-center text-gray-400 cursor-pointer"
                                        >
                                            <div className="w-2 h-2 rounded-full bg-current" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => rotate(1)}
                                            title="Rotate right"
                                            className="rounded-full bg-white hover:bg-gray-50 shadow-lg flex items-center justify-center text-gray-700 cursor-pointer"
                                        >
                                            <Chevron direction="right" />
                                        </button>

                                        <div />
                                        <button
                                            type="button"
                                            onClick={() => tilt(-1)}
                                            title="Look down"
                                            className="rounded-full bg-white hover:bg-gray-50 shadow-lg flex items-center justify-center text-gray-700 cursor-pointer"
                                        >
                                            <Chevron direction="down" />
                                        </button>
                                        <div />
                                    </div>

                                    {/* Zoom +/- */}
                                    <div className="flex flex-col gap-2.5 pointer-events-auto">
                                        <button
                                            type="button"
                                            onClick={() => zoom(-15)}
                                            title="Zoom in"
                                            className="w-8 h-8 rounded-full bg-white hover:bg-gray-50 shadow-lg flex items-center justify-center text-gray-700 font-black text-base cursor-pointer"
                                        >
                                            +
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => zoom(15)}
                                            title="Zoom out"
                                            className="w-8 h-8 rounded-full bg-white hover:bg-gray-50 shadow-lg flex items-center justify-center text-gray-700 font-black text-base cursor-pointer"
                                        >
                                            −
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Result */}
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
                                <div>
                                    <p className="text-xs font-black text-gray-400 uppercase tracking-wider">
                                        Measured Angle
                                    </p>
                                    <p className="text-3xl font-black text-[#00589e]">
                                        {measuredDegrees !== null ? `${measuredDegrees}°` : "—"}
                                    </p>
                                </div>
                                {matchedPitch && (
                                    <div className="text-right">
                                        <p className="text-xs font-black text-gray-400 uppercase tracking-wider">
                                            Matches Category
                                        </p>
                                        <p className="text-base font-black text-gray-800 capitalize">
                                            {matchedPitch.replace("_", " ")}
                                        </p>
                                    </div>
                                )}
                                {!hasRefLine && (
                                    <span className="text-sm font-bold text-[#2563eb] bg-blue-100 rounded-full px-3 py-1">
                                        Reference line needed
                                    </span>
                                )}
                                {hasRefLine && !hasSlopeLine && (
                                    <span className="text-sm font-bold text-[#e65100] bg-orange-100 rounded-full px-3 py-1">
                                        Roof line needed
                                    </span>
                                )}
                                <div className="flex gap-1.5 ml-auto">
                                    <button
                                        onClick={clearReference}
                                        disabled={!hasRefLine}
                                        className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold text-[#2563eb] cursor-pointer whitespace-nowrap"
                                    >
                                        Redo Reference
                                    </button>
                                    <button
                                        onClick={clearSlope}
                                        disabled={!hasSlopeLine}
                                        className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold text-[#e65100] cursor-pointer whitespace-nowrap"
                                    >
                                        Redo Roof Line
                                    </button>
                                </div>
                            </div>

                            <p className="text-xs text-gray-400 italic leading-snug">
                                Visual estimate based on the photo — not a certified topographic measurement.
                            </p>
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wider text-gray-600 hover:bg-gray-200 cursor-pointer"
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
                        className="px-5 py-2 rounded-xl text-sm font-black uppercase tracking-wider bg-[#00589e] hover:bg-[#004277] disabled:opacity-40 disabled:cursor-not-allowed text-white cursor-pointer"
                    >
                        Use This Pitch
                    </button>
                </div>
            </div>
        </div>
    );
}