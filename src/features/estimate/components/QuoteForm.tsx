// src/features/estimate/components/QuoteForm.tsx
"use client";

import { useState } from "react";
import { RoofSection, RoofMaterial, RoofPitch } from "@/types/roofing";
import { useRoofCalculator } from "@/hooks/useRoofCalculator";
import { LeadForm } from "@/features/estimate/components/LeadForm";
import { ConfirmationScreen } from "@/features/estimate/components/ConfirmationScreen";

export interface QuoteFormProps {
    sections: RoofSection[];
    onUpdateSections: (sections: RoofSection[]) => void;
    address: string;
}

type Step = "quote" | "lead" | "confirmation";

// ─── Metadata de Pitch — incluye el ratio rise/run REAL de cada categoría ──────
// (usamos el punto medio de cada rango) para que el ícono dibuje el ángulo
// verdadero en vez de un triángulo genérico. Esto es lo que hace que las 4
// opciones se vean realmente distintas entre sí, no solo texto distinto.
const ASPHALT_PITCHES: {
    value: RoofPitch;
    label: string;
    range: string;
    degrees: string;
    riseOverRun: number; // pulgadas de subida por 12" de recorrido, normalizado a 0–1
}[] = [
    { value: "shallow", label: "Shallow", range: "2/12 - 4/12", degrees: "~9°–18°", riseOverRun: 3 / 12 },
    { value: "medium", label: "Medium", range: "5/12 - 8/12", degrees: "~23°–34°", riseOverRun: 6.5 / 12 },
    { value: "steep", label: "Steep", range: "9/12 - 11/12", degrees: "~37°–43°", riseOverRun: 10 / 12 },
    { value: "high_steep", label: "High Steep", range: "12/12+", degrees: "45°+", riseOverRun: 1 },
];

// ─── Ícono de corte transversal de techo — ángulo real, no decorativo ──────────
function RoofPitchIcon({ riseOverRun, active }: { riseOverRun: number; active: boolean }) {
    const halfWidth = 22;
    const roofBaseY = 40; // altura de donde arrancan las dos aguas del techo
    const peakY = roofBaseY - halfWidth * riseOverRun;
    const leftX = 8;
    const midX = 8 + halfWidth;
    const rightX = 8 + halfWidth * 2;
    const wallBottomY = 50;

    return (
        <svg width="64" height="60" viewBox="0 0 64 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Piso */}
            <line x1="4" y1={wallBottomY} x2="60" y2={wallBottomY} stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
            {/* Paredes */}
            <line x1={leftX} y1={roofBaseY} x2={leftX} y2={wallBottomY} stroke="currentColor" strokeWidth="2" opacity="0.35" />
            <line x1={rightX} y1={roofBaseY} x2={rightX} y2={wallBottomY} stroke="currentColor" strokeWidth="2" opacity="0.35" />
            {/* Techo — el ángulo acá SÍ representa la pendiente real */}
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

export const QuoteForm = ({ sections, onUpdateSections, address }: QuoteFormProps) => {
    const { calculateQuote } = useRoofCalculator();
    const [step, setStep] = useState<Step>("quote");
    const [activeTabId, setActiveTabId] = useState<string>(sections[0]?.id || "");

    // Asegurar que activeTabId apunta a una sección válida
    const currentActiveId = sections.some((s) => s.id === activeTabId)
        ? activeTabId
        : sections[0]?.id || "";

    const activeSection = sections.find((s) => s.id === currentActiveId) || sections[0];

    // Función para actualizar la sección actualmente seleccionada
    const updateActiveSection = (updates: Partial<RoofSection>) => {
        if (!activeSection) return;
        const updated = sections.map((sec) =>
            sec.id === activeSection.id ? { ...sec, ...updates } : sec
        );
        onUpdateSections(updated);
    };

    // Cálculo global consolidado
    const result = calculateQuote({ address, sections });
    const totalSqFt = sections.reduce((sum, s) => sum + s.areaSqFt, 0);

    const isTPO = activeSection?.material === "flat_tpo";

    const quoteSummary = {
        address,
        sqft: totalSqFt,
        sectionsCount: sections.length,
        ...result,
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white p-5 sm:p-8 rounded-2xl border border-gray-200 shadow-sm">
            {/* ── Controles de Edición por Sección (Izquierda - 7 columnas) ── */}
            <div className="lg:col-span-7 space-y-6 text-black">
                {/* Pestañas / Tabs para seleccionar qué sección editar */}
                <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-2">
                        Configure Roof Section ({sections.length})
                    </label>
                    <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
                        {sections.map((sec) => {
                            const isActive = sec.id === currentActiveId;
                            return (
                                <button
                                    key={sec.id}
                                    type="button"
                                    onClick={() => setActiveTabId(sec.id)}
                                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                                        isActive
                                            ? "bg-[#00589e] text-white shadow-md scale-[1.02]"
                                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    }`}
                                >
                  <span
                      className="w-2.5 h-2.5 rounded-full border border-white"
                      style={{ backgroundColor: sec.color || "#00589e" }}
                  />
                                    <span>{sec.name}</span>
                                    <span className="text-[10px] opacity-80">
                    ({sec.areaSqFt.toLocaleString()} sq ft)
                  </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {activeSection && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                        {/* Nombre de la sección & Área */}
                        <div className="flex flex-wrap items-center justify-between gap-4 bg-blue-50/40 border border-blue-100 p-4 rounded-xl">
                            <div>
                                <p className="text-xs text-[#00589e] font-bold uppercase tracking-wider">
                                    Active Section
                                </p>
                                <input
                                    type="text"
                                    value={activeSection.name}
                                    onChange={(e) => updateActiveSection({ name: e.target.value })}
                                    className="text-lg font-black text-gray-900 bg-transparent border-b border-blue-200 focus:border-[#00589e] focus:outline-none py-0.5"
                                    placeholder="Section Name"
                                />
                            </div>

                            <div className="text-right">
                                <p className="text-xs text-gray-400 font-bold uppercase">Section Area</p>
                                <p className="text-2xl font-black text-gray-900">
                                    {activeSection.areaSqFt.toLocaleString()}{" "}
                                    <span className="text-sm font-semibold text-gray-500">sq ft</span>
                                </p>
                            </div>
                        </div>

                        {/* Material */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Material Type for {activeSection.name}
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { value: "asphalt_shingle", label: "Asphalt Shingles" },
                                    { value: "flat_tpo", label: "Flat Roof (TPO)" },
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
                                            className={`relative py-3.5 px-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 cursor-pointer ${
                                                isSelected
                                                    ? "border-[#00589e] bg-blue-50 text-[#00589e] shadow-sm font-black"
                                                    : "border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200 font-bold"
                                            }`}
                                        >
                                            <span className="text-sm">{m.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Pitch / Inclinación (Si es Asphalt) ─────────────────────────── */}
                        {!isTPO && (
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-3">
                                    Roof Pitch (Steepness)
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {ASPHALT_PITCHES.map((p) => {
                                        const isSelected = activeSection.pitch === p.value;
                                        return (
                                            <button
                                                key={p.value}
                                                type="button"
                                                onClick={() => updateActiveSection({ pitch: p.value })}
                                                className={`flex flex-col items-center justify-center py-4 px-2 rounded-2xl border-2 transition-all cursor-pointer ${
                                                    isSelected
                                                        ? "border-[#00589e] bg-blue-50 text-[#00589e] shadow-lg scale-[1.04]"
                                                        : "border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-300 hover:bg-gray-100"
                                                }`}
                                            >
                                                <RoofPitchIcon riseOverRun={p.riseOverRun} active={isSelected} />
                                                <span
                                                    className={`text-[13px] uppercase tracking-wider leading-tight text-center mt-1 font-black ${
                                                        isSelected ? "text-[#00589e]" : "text-gray-700"
                                                    }`}
                                                >
                                                    {p.label}
                                                </span>
                                                <span className="text-[12px] text-gray-700 mt-0.5 font-semibold">
                                                    {p.range}
                                                </span>
                                                <span
                                                    className={`text-[10px] mt-0.5 ${
                                                        isSelected ? "text-[#00589e]/70" : "text-gray-400"
                                                    }`}
                                                >
                                                    {p.degrees}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Capas a remover */}
                        {!isTPO && (
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Existing Layers to Remove
                                </label>
                                <div className="flex gap-2">
                                    {[1, 2, 3].map((n) => {
                                        const isSelected = activeSection.layersToRemove === n;
                                        return (
                                            <button
                                                key={n}
                                                type="button"
                                                onClick={() => updateActiveSection({ layersToRemove: n })}
                                                className={`flex-1 py-2 rounded-lg border-2 text-xs transition-all cursor-pointer ${
                                                    isSelected
                                                        ? "border-[#00589e] bg-blue-50 text-[#00589e] font-black shadow-sm"
                                                        : "border-gray-100 bg-gray-50 text-gray-500 font-bold hover:border-gray-200"
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
            <div className="lg:col-span-5 bg-gray-50 p-6 rounded-2xl border border-gray-200 flex flex-col justify-between shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-[#00589e]" />

                <div>
                    <h3 className="text-base font-black text-gray-900 mb-4 uppercase tracking-tight border-b border-gray-200 pb-2 flex items-center justify-between">
                        <span>Estimate Breakdown</span>
                        <span className="text-xs font-bold text-[#00589e]">
              {totalSqFt.toLocaleString()} sq ft
            </span>
                    </h3>

                    {/* Desglose de Secciones */}
                    <div className="space-y-3 mb-6 max-h-56 overflow-y-auto pr-1">
                        {sections.map((sec) => (
                            <div
                                key={sec.id}
                                className="bg-white p-3 rounded-xl border border-gray-200 text-xs flex items-center justify-between shadow-2xs"
                            >
                                <div className="flex items-center gap-2">
                  <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: sec.color || "#00589e" }}
                  />
                                    <div>
                                        <p className="font-bold text-gray-800">{sec.name}</p>
                                        <p className="text-[10px] text-gray-400 capitalize">
                                            {sec.material === "flat_tpo"
                                                ? "Flat TPO"
                                                : `Asphalt (${sec.pitch} pitch)`}
                                        </p>
                                    </div>
                                </div>
                                <span className="font-black text-gray-700">
                  {sec.areaSqFt.toLocaleString()} sq ft
                </span>
                            </div>
                        ))}
                    </div>

                    {/* Detalle de Costos Parciales */}
                    <div className="space-y-2 border-t border-gray-200 pt-4 text-xs">
                        <div className="flex justify-between text-gray-600 font-medium">
                            <span>Materials Cost:</span>
                            <span className="font-bold text-gray-800">${result.materialCost.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-gray-600 font-medium">
                            <span>Labor & Installation:</span>
                            <span className="font-bold text-gray-800">${result.laborCost.toLocaleString()}</span>
                        </div>
                        {result.removalCost > 0 && (
                            <div className="flex justify-between text-gray-600 font-medium">
                                <span>Tear-off & Removal:</span>
                                <span className="font-bold text-gray-800">${result.removalCost.toLocaleString()}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-6 pt-4 border-t-2 border-dashed border-gray-200">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1 mb-5">
            <span className="text-gray-400 font-black text-xs uppercase tracking-widest">
              Total Estimate
            </span>
                        <span className="text-3xl sm:text-4xl font-black text-[#00589e] tracking-tighter">
              ${result.total.toLocaleString()}
            </span>
                    </div>

                    <p className="text-[10px] text-gray-400 mt-3 italic text-center leading-tight">
                        *Multi-section estimate for {address || "selected property"}. <br />
                    </p>
                </div>
            </div>
        </div>
    );
};