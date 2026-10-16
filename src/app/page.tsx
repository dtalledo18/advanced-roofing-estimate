// src/app/page.tsx
"use client";

import { useState } from "react";
import { AddressSearch } from "@/features/estimate/components/AddressSearch";
import { RoofMap } from "@/features/estimate/components/RoofMap";
import { QuoteForm } from "@/features/estimate/components/QuoteForm";
import { getRoofData } from "@/lib/google-solar";
import { computeAreaSqFt } from "@/lib/polygon-area";
import { DEFAULT_CENTER } from "@/lib/google-maps";
import { RoofSection, DetectedPitch } from "@/types/roofing";

type AppStep = "map" | "quote";

// Paleta VCM — amarillo primario, mostaza, negro, fondos claros.
// (Si luego pasamos estos valores a tokens de Tailwind en globals.css,
// se reemplazan los hex arbitrarios por clases tipo bg-vcm-yellow.)
// VCM_YELLOW      = #FDB913
// VCM_YELLOW_DARK = #E0A10A
// VCM_BLACK       = #0A0A0A
// VCM_BG          = #EFEFEF
// VCM_CHIP        = #E4E4E4

// Colores de los polígonos sobre el satélite: la sección principal va en
// amarillo VCM; el resto son colores que contrastan bien con la imagen aérea
// y que no se confunden con el amarillo.
const SECTION_COLORS = ["#FDB913", "#6a1b9a", "#2e7d32", "#c2185b", "#0288d1"];

// Contador de IDs a nivel de módulo — evita usar Date.now()/crypto.randomUUID()
// dentro del componente, que dispara el lint react-hooks/purity de React 19.
let sectionIdCounter = 0;
function nextSectionId(): string {
  sectionIdCounter += 1;
  return `section-${sectionIdCounter}`;
}

export default function SalesEstimatorPage() {
  const [step, setStep] = useState<AppStep>("map");
  const [location, setLocation] = useState(DEFAULT_CENTER);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [sections, setSections] = useState<RoofSection[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [mapZoom, setMapZoom] = useState(11);
  const [roofError, setRoofError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDrawingMode, setIsDrawingMode] = useState(false);

  const handleAddressSelect = async (address: string, lat: number, lng: number) => {
    setLocation({ lat, lng });
    setSelectedAddress(address);
    setMapZoom(19);
    setRoofError(null);
    setIsLoading(true);

    try {
      const data = await getRoofData(lat, lng);
      if (!data.areaSqFt || data.areaSqFt < 300) {
        setRoofError("no_building");
        return;
      }

      let pitch: DetectedPitch = "medium";
      if (data.pitchDegrees < 5) pitch = "flat";
      else if (data.pitchDegrees < 15) pitch = "shallow";
      else if (data.pitchDegrees < 30) pitch = "medium";
      else pitch = "steep";

      const initialSection: RoofSection = {
        id: "section-main",
        name: "Main Roof",
        coords: data.coords,
        areaSqFt: data.areaSqFt,
        material: pitch === "flat" ? "flat_tpo" : "asphalt_shingle",
        pitch: pitch === "flat" ? "shallow" : pitch,
        layersToRemove: 1,
        color: SECTION_COLORS[0],
      };

      setSections([initialSection]);
      setActiveSectionId(initialSection.id);
    } catch {
      setRoofError("api_error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateCoords = (id: string, newCoords: { lat: number; lng: number }[]) => {
    const newArea = computeAreaSqFt(newCoords);
    setSections((prev) =>
        prev.map((sec) =>
            sec.id === id ? { ...sec, coords: newCoords, areaSqFt: newArea || sec.areaSqFt } : sec
        )
    );
  };

  const handleStartAddSection = () => {
    setIsDrawingMode(true);
  };

  const handleCancelDrawing = () => {
    setIsDrawingMode(false);
  };

  const handleSectionDrawn = (coords: { lat: number; lng: number }[]) => {
    setIsDrawingMode(false);

    if (coords.length < 3) return; // polígono inválido, ignorar

    const newId = nextSectionId();
    const newSection: RoofSection = {
      id: newId,
      name: `Section ${String.fromCharCode(65 + sections.length)}`,
      coords,
      areaSqFt: computeAreaSqFt(coords) || 400,
      material: "asphalt_shingle",
      pitch: "medium",
      layersToRemove: 1,
      color: SECTION_COLORS[sections.length % SECTION_COLORS.length],
    };

    setSections((prev) => [...prev, newSection]);
    setActiveSectionId(newId);
  };

  const handleRemoveSection = (id: string) => {
    if (sections.length <= 1) return; // Mantener al menos 1 sección
    const filtered = sections.filter((s) => s.id !== id);
    setSections(filtered);
    setActiveSectionId(filtered[0].id);
  };

  const handleReset = () => {
    setStep("map");
    setSelectedAddress("");
    setSections([]);
    setActiveSectionId(null);
    setLocation(DEFAULT_CENTER);
    setRoofError(null);
    setMapZoom(11);
    setIsDrawingMode(false);
  };

  const totalSqFt = sections.reduce((acc, s) => acc + s.areaSqFt, 0);

  return (
      <div className="min-h-screen bg-[#EFEFEF] flex flex-col text-[#0A0A0A]">
        {/* Header / Navbar */}
        <header className="bg-[#0A0A0A] text-white py-4 px-6 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="bg-[#FDB913] w-10 h-10 rounded-full flex items-center justify-center text-[#0A0A0A] shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight leading-none truncate">
                  Virtual Construction Management
                </h1>
                <p className="text-xs text-white/60 font-medium mt-1">
                  Sales Agent Estimator Platform
                </p>
              </div>
            </div>

            {selectedAddress && (
                <button
                    onClick={handleReset}
                    className="flex items-center gap-2 bg-[#FDB913] hover:bg-[#E0A10A] text-[#0A0A0A] px-5 py-2 rounded-full text-sm font-semibold transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FDB913]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  New search
                </button>
            )}
          </div>
        </header>

        {/* Stepper Indicator */}
        <div className="bg-white border-b border-[#E4E4E4] py-3 px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-sm font-semibold">
            <div className="flex items-center gap-3 sm:gap-6">
              <button
                  onClick={() => setStep("map")}
                  className={`flex items-center gap-2 transition-colors cursor-pointer ${
                      step === "map" ? "text-[#0A0A0A]" : "text-gray-400 hover:text-[#0A0A0A]"
                  }`}
              >
              <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      step === "map" ? "bg-[#FDB913] text-[#0A0A0A]" : "bg-[#E4E4E4] text-gray-500"
                  }`}
              >
                1
              </span>
                <span>Address & roof boundaries</span>
              </button>

              <span className="text-gray-300">/</span>

              <button
                  disabled={!selectedAddress}
                  onClick={() => selectedAddress && setStep("quote")}
                  className={`flex items-center gap-2 transition-colors ${
                      step === "quote"
                          ? "text-[#0A0A0A]"
                          : selectedAddress
                              ? "text-gray-400 hover:text-[#0A0A0A] cursor-pointer"
                              : "text-gray-300 cursor-not-allowed"
                  }`}
              >
              <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      step === "quote" ? "bg-[#FDB913] text-[#0A0A0A]" : "bg-[#E4E4E4] text-gray-500"
                  }`}
              >
                2
              </span>
                <span>Estimate & specifications</span>
              </button>
            </div>

            {selectedAddress && (
                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-gray-500 text-xs">Total roof area</span>
                  <span className="bg-[#0A0A0A] text-[#FDB913] px-3 py-1 rounded-full font-bold text-xs">
                {totalSqFt.toLocaleString()} sq ft · {sections.length}{" "}
                    {sections.length === 1 ? "section" : "sections"}
              </span>
                </div>
            )}
          </div>
        </div>

        {/* Main Workspace */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {step === "map" ? (
              <div className="space-y-6 animate-in fade-in duration-300">
                <section className="bg-white p-6 rounded-3xl">
                  <label className="inline-block text-[10px] font-semibold text-[#0A0A0A] uppercase tracking-wider border border-[#0A0A0A] rounded-full px-3 py-1 mb-3">
                    Property address
                  </label>
                  <AddressSearch
                      onAddressSelect={handleAddressSelect}
                      variant="default"
                      placeholder="Type the customer's address to detect the roof..."
                  />
                </section>

                {roofError && (
                    <div className="p-4 bg-[#FDB913]/15 border-l-4 border-[#FDB913] rounded-r-2xl">
                      <p className="text-sm font-semibold text-[#0A0A0A]">
                        {roofError === "no_building"
                            ? "No roof or building could be clearly detected at this address. Search another address or outline the roof manually."
                            : "Solar data isn't available for this location. You can still outline the roof manually on the map."}
                      </p>
                    </div>
                )}

                <div className="bg-white p-4 sm:p-6 rounded-3xl space-y-4">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-[#0A0A0A] text-[#FDB913] flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </span>
                      Roof boundary detection
                    </h2>
                    {selectedAddress && (
                        <span className="text-xs font-medium bg-[#E4E4E4] text-[#0A0A0A] px-3 py-1.5 rounded-full truncate max-w-[50%]">
                    {selectedAddress}
                  </span>
                    )}
                  </div>

                  <div className="min-h-[520px] rounded-2xl overflow-hidden relative">
                    <RoofMap
                        center={location}
                        zoom={mapZoom}
                        sections={sections}
                        activeSectionId={activeSectionId}
                        onSelectSection={setActiveSectionId}
                        onUpdateSectionCoords={handleUpdateCoords}
                        isDrawingMode={isDrawingMode}
                        onStartAddSection={handleStartAddSection}
                        onSectionDrawn={handleSectionDrawn}
                        onCancelDrawing={handleCancelDrawing}
                        onRemoveSection={handleRemoveSection}
                        hideControls={!selectedAddress}
                    />

                    {isLoading && (
                        <div className="absolute inset-0 bg-[#0A0A0A]/70 backdrop-blur-sm flex flex-col items-center justify-center z-20 gap-3">
                          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FDB913] border-t-transparent"></div>
                          <p className="text-sm font-semibold text-white">Analyzing roof structures...</p>
                        </div>
                    )}
                  </div>

                  {selectedAddress && !isLoading && sections.length > 0 && (
                      <div className="pt-2 flex justify-end">
                        <button
                            onClick={() => setStep("quote")}
                            className="w-full sm:w-auto px-10 py-4 bg-[#FDB913] hover:bg-[#E0A10A] text-[#0A0A0A] font-bold text-base rounded-full cursor-pointer transition-colors active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A0A0A]"
                        >
                          Continue to estimate details
                        </button>
                      </div>
                  )}
                </div>
              </div>
          ) : (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-3xl">
                  <button
                      onClick={() => setStep("map")}
                      className="flex items-center gap-2 text-[#0A0A0A] font-semibold text-sm cursor-pointer group"
                  >
                <span className="w-8 h-8 rounded-full bg-[#0A0A0A] text-[#FDB913] flex items-center justify-center group-hover:bg-[#FDB913] group-hover:text-[#0A0A0A] transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                </span>
                    Back to map
                  </button>

                  <div className="text-right min-w-0">
                    <p className="text-xs text-gray-500">Selected property</p>
                    <p className="text-sm font-semibold truncate max-w-md">{selectedAddress}</p>
                  </div>
                </div>

                {/* QuoteForm multi-sección (Siguiente paso: actualizar el QuoteForm para editar cada sección) */}
                <QuoteForm
                    sections={sections}
                    onUpdateSections={setSections}
                    address={selectedAddress}
                    location={location}
                />
              </div>
          )}
        </main>
      </div>
  );
}