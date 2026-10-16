// src/features/estimate/components/QuoteForm.tsx
"use client";

import { useState } from "react";
import { RoofSection, RoofMaterial, RoofPitch } from "@/types/roofing";
import { useRoofCalculator } from "@/hooks/useRoofCalculator";
import { LeadForm } from "@/features/estimate/components/LeadForm";
import { ConfirmationScreen } from "@/features/estimate/components/ConfirmationScreen";
import { StreetViewPitchTool, StreetViewMeasurementState } from "@/features/estimate/components/StreetViewPitchTool";

export interface QuoteFormProps {
    sections: RoofSection[];
    onUpdateSections: (sections: RoofSection[]) => void;
    address: string;
    location: { lat: number; lng: number };
}

type Step = "quote" | "lead" | "confirmation";

// Paleta VCM
// VCM_YELLOW      = #FDB913
// VCM_YELLOW_DARK = #E0A10A
// VCM_BLACK       = #0A0A0A
// VCM_BG          = #EFEFEF
// VCM_CHIP        = #E4E4E4

// Color de respaldo si una sección no trae color propio (mismo que SECTION_COLORS[0]).
const FALLBACK_SECTION_COLOR = "#FDB913";

// ─── Metadata de Pitch — incluye el ratio rise/run REAL de cada categoría ──────
const ASPHALT_PITCHES: {
    value: RoofPitch;
    label: string;
    range: string;
    degrees: string;
    riseOverRun: number;
}[] = [
    { value: "shallow", label: "Shallow", range: "2/12 - 4/12", degrees: "~9°–18°", riseOverRun: 3 / 12 },
    { value: "medium", label: "Medium", range: "5/12 - 8/12", degrees: "~23°–34°", riseOverRun: 6.5 / 12 },
    { value: "steep", label: "Steep", range: "9/12 - 11/12", degrees: "~37°–43°", riseOverRun: 10 / 12 },
    { value: "high_steep", label: "High Steep", range: "12/12+", degrees: "45°+", riseOverRun: 1 },
];

// ─── Ícono de corte transversal de techo — ángulo real, no decorativo ──────────
function RoofPitchIcon({ riseOverRun, active }: { riseOverRun: number; active: boolean }) {
    const halfWidth = 22;
    const roofBaseY = 40;
    const peakY = roofBaseY - halfWidth * riseOverRun;
    const leftX = 8;
    const midX = 8 + halfWidth;
    const rightX = 8 + halfWidth * 2;
    const wallBottomY = 50;

    return (
        <svg width="64" height="60" viewBox="0 0 64 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="4" y1={wallBottomY} x2="60" y2={wallBottomY} stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
            <line x1={leftX} y1={roofBaseY} x2={leftX} y2={wallBottomY} stroke="currentColor" strokeWidth="2" opacity="0.35" />
            <line x1={rightX} y1={roofBaseY} x2={rightX} y2={wallBottomY} stroke="currentColor" strokeWidth="2" opacity="0.35" />
            <path
                d={`M ${leftX} ${roofBaseY} L ${midX} ${peakY} L ${rightX} ${roofBaseY}`}
                stroke="currentColor"
                strokeWidth="2.75"
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="currentColor"
                fillOpacity={active ? 0.15 : 0.05}
            />
        </svg>
    );
}

// ─── Ícono "Custom" — cámara/mira, distinto de los otros 4 para no confundir ───
function CustomPitchIcon({ active }: { active: boolean }) {
    return (
        <svg width="64" height="60" viewBox="0 0 64 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="32" cy="30" r="18" stroke="currentColor" strokeWidth="2" opacity={active ? 0.9 : 0.4} />
            <line x1="32" y1="6" x2="32" y2="14" stroke="currentColor" strokeWidth="2" opacity={active ? 0.9 : 0.4} />
            <line x1="32" y1="46" x2="32" y2="54" stroke="currentColor" strokeWidth="2" opacity={active ? 0.9 : 0.4} />
            <line x1="8" y1="30" x2="16" y2="30" stroke="currentColor" strokeWidth="2" opacity={active ? 0.9 : 0.4} />
            <line x1="48" y1="30" x2="56" y2="30" stroke="currentColor" strokeWidth="2" opacity={active ? 0.9 : 0.4} />
            <circle cx="32" cy="30" r="4" fill="currentColor" fillOpacity={active ? 0.8 : 0.35} />
        </svg>
    );
}

export const QuoteForm = ({ sections, onUpdateSections, address, location }: QuoteFormProps) => {
    const { calculateQuote } = useRoofCalculator();
    const [step, setStep] = useState<Step>("quote");
    const [activeTabId, setActiveTabId] = useState<string>(sections[0]?.id || "");
    const [showStreetViewTool, setShowStreetViewTool] = useState(false);
    // Guarda el estado de la herramienta (cámara + líneas dibujadas) por
    // sección — así reabrir "Custom" para la misma sección vuelve exactamente
    // a donde quedó, en vez de reiniciar todo desde cero.
    const [streetViewDrafts, setStreetViewDrafts] = useState<Record<string, StreetViewMeasurementState>>({});

    // ── Reordenar secciones con drag & drop nativo ──────────────────────────
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const handleDragStart = (index: number) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault(); // necesario para permitir el drop
        if (index !== dragOverIndex) setDragOverIndex(index);
    };

    const handleDrop = (targetIndex: number) => {
        if (draggedIndex === null || draggedIndex === targetIndex) {
            setDraggedIndex(null);
            setDragOverIndex(null);
            return;
        }
        const reordered = [...sections];
        const [moved] = reordered.splice(draggedIndex, 1);
        reordered.splice(targetIndex, 0, moved);
        onUpdateSections(reordered);
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const currentActiveId = sections.some((s) => s.id === activeTabId)
        ? activeTabId
        : sections[0]?.id || "";

    const activeSection = sections.find((s) => s.id === currentActiveId) || sections[0];

    const updateActiveSection = (updates: Partial<RoofSection>) => {
        if (!activeSection) return;
        const updated = sections.map((sec) =>
            sec.id === activeSection.id ? { ...sec, ...updates } : sec
        );
        onUpdateSections(updated);
    };

    const result = calculateQuote({ address, sections });
    const totalSqFt = sections.reduce((sum, s) => sum + s.areaSqFt, 0);

    const isTPO = activeSection?.material === "flat_tpo";
    const hasCustomPitch = activeSection?.pitchDegrees !== undefined;

    const quoteSummary = {
        address,
        sqft: totalSqFt,
        sectionsCount: sections.length,
        ...result,
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white p-5 sm:p-8 rounded-3xl">
            {/* ── Controles de Edición por Sección (Izquierda - 7 columnas) ── */}
            <div className="lg:col-span-7 space-y-7 text-[#0A0A0A]">
                <div>
                    <label className="inline-block text-[10px] font-semibold text-[#0A0A0A] uppercase tracking-wider border border-[#0A0A0A] rounded-full px-3 py-1 mb-3">
                        Roof sections ({sections.length})
                    </label>
                    <div className="flex flex-wrap gap-2 border-b border-[#E4E4E4] pb-4">
                        {sections.map((sec, idx) => {
                            const isActive = sec.id === currentActiveId;
                            const isDragging = draggedIndex === idx;
                            const isDragOver = dragOverIndex === idx && draggedIndex !== null && draggedIndex !== idx;
                            return (
                                <button
                                    key={sec.id}
                                    type="button"
                                    draggable
                                    onDragStart={() => handleDragStart(idx)}
                                    onDragOver={(e) => handleDragOver(e, idx)}
                                    onDrop={() => handleDrop(idx)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => setActiveTabId(sec.id)}
                                    className={`pl-2.5 pr-3.5 py-2 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-grab active:cursor-grabbing select-none ${
                                        isActive
                                            ? "bg-[#0A0A0A] text-white"
                                            : "bg-[#E4E4E4] text-[#0A0A0A] hover:bg-[#d6d6d6]"
                                    } ${isDragging ? "opacity-40" : ""} ${
                                        isDragOver ? "ring-2 ring-offset-2 ring-[#FDB913]" : ""
                                    }`}
                                >
                                    <span
                                        className={`text-sm leading-none ${isActive ? "text-white/50" : "text-gray-400"}`}
                                        title="Drag to reorder"
                                    >
                                        ⠿
                                    </span>
                                    <span
                                        className="w-2.5 h-2.5 rounded-full ring-1 ring-white"
                                        style={{ backgroundColor: sec.color || FALLBACK_SECTION_COLOR }}
                                    />
                                    <span>{sec.name}</span>
                                    <span className={`text-[10px] ${isActive ? "text-white/60" : "text-gray-500"}`}>
                                        {sec.areaSqFt.toLocaleString()} sq ft
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {activeSection && (
                    <div className="space-y-7 animate-in fade-in duration-200">
                        <div className="flex flex-wrap items-end justify-between gap-4 bg-[#EFEFEF] p-5 rounded-2xl">
                            <div className="min-w-0">
                                <p className="text-xs text-gray-500 font-medium mb-1">Section name</p>
                                <input
                                    type="text"
                                    value={activeSection.name}
                                    onChange={(e) => updateActiveSection({ name: e.target.value })}
                                    className="text-xl font-bold tracking-tight text-[#0A0A0A] bg-transparent border-b-2 border-[#0A0A0A]/15 focus:border-[#FDB913] focus:outline-none py-0.5 max-w-full"
                                    placeholder="Section name"
                                />
                            </div>

                            <div className="text-right">
                                <p className="text-xs text-gray-500 font-medium mb-1">Section area</p>
                                <p className="text-2xl font-bold tracking-tight text-[#0A0A0A]">
                                    {activeSection.areaSqFt.toLocaleString()}{" "}
                                    <span className="text-sm font-medium text-gray-500">sq ft</span>
                                </p>
                            </div>
                        </div>

                        {/* Material */}
                        <div>
                            <label className="block text-sm font-semibold text-[#0A0A0A] mb-2.5">
                                Material for {activeSection.name}
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { value: "asphalt_shingle", label: "Asphalt shingles" },
                                    { value: "flat_tpo", label: "Flat roof (TPO)" },
                                ].map((m) => {
                                    const isSelected = activeSection.material === m.value;
                                    return (
                                        <button
                                            key={m.value}
                                            type="button"
                                            onClick={() =>
                                                updateActiveSection({
                                                    material: m.value as RoofMaterial,
                                                    pitch: m.value === "flat_tpo" ? "shallow" : activeSection.pitch,
                                                })
                                            }
                                            className={`py-3.5 px-3 rounded-2xl border-2 transition-colors flex flex-col items-center gap-1 cursor-pointer text-sm ${
                                                isSelected
                                                    ? "border-[#FDB913] bg-[#FDB913] text-[#0A0A0A] font-bold"
                                                    : "border-[#E4E4E4] bg-white text-gray-600 hover:border-[#0A0A0A]/30 font-semibold"
                                            }`}
                                        >
                                            {m.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Pitch / Inclinación (Si es Asphalt) ─────────────────────────── */}
                        {!isTPO && (
                            <div>
                                <div className="flex items-center justify-between mb-2.5">
                                    <label className="block text-sm font-semibold text-[#0A0A0A]">
                                        Roof pitch
                                    </label>
                                    {hasCustomPitch && (
                                        <span className="text-[11px] font-semibold text-[#FDB913] bg-[#0A0A0A] rounded-full px-3 py-1">
                                            Measured: {activeSection.pitchDegrees}°
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                    {ASPHALT_PITCHES.map((p) => {
                                        const isSelected = activeSection.pitch === p.value && !hasCustomPitch;
                                        return (
                                            <button
                                                key={p.value}
                                                type="button"
                                                onClick={() => updateActiveSection({ pitch: p.value, pitchDegrees: undefined })}
                                                className={`flex flex-col items-center justify-center py-4 px-2 rounded-2xl border-2 transition-colors cursor-pointer ${
                                                    isSelected
                                                        ? "border-[#FDB913] bg-[#FDB913] text-[#0A0A0A]"
                                                        : "border-[#E4E4E4] bg-white text-gray-400 hover:border-[#0A0A0A]/30"
                                                }`}
                                            >
                                                <RoofPitchIcon riseOverRun={p.riseOverRun} active={isSelected} />
                                                <span
                                                    className={`text-[13px] leading-tight text-center mt-1 font-bold ${
                                                        isSelected ? "text-[#0A0A0A]" : "text-gray-700"
                                                    }`}
                                                >
                                                    {p.label}
                                                </span>
                                                <span
                                                    className={`text-[11px] mt-0.5 font-medium ${
                                                        isSelected ? "text-[#0A0A0A]/80" : "text-gray-500"
                                                    }`}
                                                >
                                                    {p.range}
                                                </span>
                                                <span
                                                    className={`text-[10px] mt-0.5 ${
                                                        isSelected ? "text-[#0A0A0A]/60" : "text-gray-400"
                                                    }`}
                                                >
                                                    {p.degrees}
                                                </span>
                                            </button>
                                        );
                                    })}

                                    {/* ── Custom (Street View) ── */}
                                    <button
                                        type="button"
                                        onClick={() => setShowStreetViewTool(true)}
                                        className={`flex flex-col items-center justify-center py-4 px-2 rounded-2xl border-2 transition-colors cursor-pointer ${
                                            hasCustomPitch
                                                ? "border-[#0A0A0A] bg-[#0A0A0A] text-[#FDB913]"
                                                : "border-dashed border-gray-300 bg-white text-gray-400 hover:border-[#0A0A0A]/40"
                                        }`}
                                    >
                                        <CustomPitchIcon active={hasCustomPitch} />
                                        <span
                                            className={`text-[13px] leading-tight text-center mt-1 font-bold ${
                                                hasCustomPitch ? "text-white" : "text-gray-700"
                                            }`}
                                        >
                                            Custom
                                        </span>
                                        <span
                                            className={`text-[11px] mt-0.5 font-medium ${
                                                hasCustomPitch ? "text-[#FDB913]" : "text-gray-500"
                                            }`}
                                        >
                                            {hasCustomPitch ? `${activeSection.pitchDegrees}°` : "Street View"}
                                        </span>
                                        <span className={`text-[10px] mt-0.5 ${hasCustomPitch ? "text-white/50" : "text-gray-400"}`}>
                                            {hasCustomPitch ? "measure again" : "measure it"}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Capas a remover */}
                        {!isTPO && (
                            <div>
                                <label className="block text-sm font-semibold text-[#0A0A0A] mb-2.5">
                                    Existing layers to remove
                                </label>
                                <div className="flex gap-2">
                                    {[1, 2, 3].map((n) => {
                                        const isSelected = activeSection.layersToRemove === n;
                                        return (
                                            <button
                                                key={n}
                                                type="button"
                                                onClick={() => updateActiveSection({ layersToRemove: n })}
                                                className={`flex-1 py-2.5 rounded-full border-2 text-sm transition-colors cursor-pointer ${
                                                    isSelected
                                                        ? "border-[#FDB913] bg-[#FDB913] text-[#0A0A0A] font-bold"
                                                        : "border-[#E4E4E4] bg-white text-gray-600 font-semibold hover:border-[#0A0A0A]/30"
                                                }`}
                                            >
                                                {n} {n === 1 ? "layer" : "layers"}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Resumen Global Consolidado (Derecha - 5 columnas) ── */}
            <div className="lg:col-span-5 bg-[#0A0A0A] text-white p-6 sm:p-7 rounded-3xl flex flex-col justify-between">
                <div>
                    <div className="flex items-center justify-between gap-3 mb-5">
                        <h3 className="text-xl font-bold tracking-tight">Estimate breakdown</h3>
                        <span className="text-xs font-semibold text-[#0A0A0A] bg-[#FDB913] rounded-full px-3 py-1 whitespace-nowrap">
                            {totalSqFt.toLocaleString()} sq ft
                        </span>
                    </div>

                    <div className="space-y-2 mb-6 max-h-56 overflow-y-auto pr-1">
                        {sections.map((sec) => (
                            <div
                                key={sec.id}
                                className="bg-white/5 p-3 rounded-2xl text-xs flex items-center justify-between gap-3"
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <span
                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: sec.color || FALLBACK_SECTION_COLOR }}
                                    />
                                    <div className="min-w-0">
                                        <p className="font-semibold text-white truncate">{sec.name}</p>
                                        <p className="text-[10px] text-white/50 capitalize">
                                            {sec.material === "flat_tpo"
                                                ? "Flat TPO"
                                                : `Asphalt (${sec.pitch} pitch${
                                                    sec.pitchDegrees !== undefined ? `, ${sec.pitchDegrees}°` : ""
                                                })`}
                                        </p>
                                    </div>
                                </div>
                                <span className="font-semibold text-white/80 whitespace-nowrap">
                                    {sec.areaSqFt.toLocaleString()} sq ft
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-2.5 border-t border-white/10 pt-4 text-sm">
                        <div className="flex justify-between text-white/60">
                            <span>Materials</span>
                            <span className="font-semibold text-white tabular-nums">
                                ${result.materialCost.toLocaleString()}
                            </span>
                        </div>
                        <div className="flex justify-between text-white/60">
                            <span>Labor & installation</span>
                            <span className="font-semibold text-white tabular-nums">
                                ${result.laborCost.toLocaleString()}
                            </span>
                        </div>
                        {result.removalCost > 0 && (
                            <div className="flex justify-between text-white/60">
                                <span>Tear-off & removal</span>
                                <span className="font-semibold text-white tabular-nums">
                                    ${result.removalCost.toLocaleString()}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-6 pt-5 border-t border-white/10">
                    <p className="text-sm text-white/60 mb-1">Total estimate</p>
                    <p className="text-4xl sm:text-5xl font-bold text-[#FDB913] tracking-tight tabular-nums">
                        ${result.total.toLocaleString()}
                    </p>

                    <p className="text-[11px] text-white/40 mt-4 leading-snug">
                        Multi-section estimate for {address || "the selected property"}.
                    </p>
                </div>
            </div>

            {showStreetViewTool && activeSection && (
                <StreetViewPitchTool
                    location={location}
                    initialState={streetViewDrafts[activeSection.id]}
                    onStateChange={(state) =>
                        setStreetViewDrafts((prev) => ({ ...prev, [activeSection.id]: state }))
                    }
                    onClose={() => setShowStreetViewTool(false)}
                    onConfirm={(degrees, matchedPitch) => {
                        updateActiveSection({ pitch: matchedPitch, pitchDegrees: degrees });
                        setShowStreetViewTool(false);
                    }}
                />
            )}
        </div>
    );
};