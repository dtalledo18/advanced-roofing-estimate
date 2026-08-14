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

const SECTION_COLORS = ["#00589e", "#e65100", "#2e7d32", "#6a1b9a", "#c2185b"];

export default function SalesEstimatorPage() {
  const [step, setStep] = useState<AppStep>("map");
  const [location, setLocation] = useState(DEFAULT_CENTER);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [sections, setSections] = useState<RoofSection[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [mapZoom, setMapZoom] = useState(11);
  const [roofError, setRoofError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

  const handleAddSection = () => {
    const offset = (sections.length + 1) * 0.0001;
    const centerLat = location.lat;
    const centerLng = location.lng;

    // Crear un cuadrado pequeño por defecto cerca del centro del mapa
    const defaultCoords = [
      { lat: centerLat + offset, lng: centerLng + offset },
      { lat: centerLat + offset, lng: centerLng + offset + 0.00015 },
      { lat: centerLat + offset - 0.00015, lng: centerLng + offset + 0.00015 },
      { lat: centerLat + offset - 0.00015, lng: centerLng + offset },
    ];

    const newId = `section-${Date.now()}`;
    const newSection: RoofSection = {
      id: newId,
      name: `Section ${String.fromCharCode(65 + sections.length)}`, // ej. Section B, Section C
      coords: defaultCoords,
      areaSqFt: computeAreaSqFt(defaultCoords) || 400,
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
  };

  const totalSqFt = sections.reduce((acc, s) => acc + s.areaSqFt, 0);

  return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header / Navbar */}
        <header className="bg-[#00589e] text-white py-4 px-6 shadow-md border-b border-blue-900 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white p-2 rounded-lg text-[#00589e]">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-black uppercase tracking-wider leading-none">
                  Advanced Roofing
                </h1>
                <p className="text-xs text-blue-100 font-medium tracking-tight">
                  Sales Agent Estimator Platform
                </p>
              </div>
            </div>

            {selectedAddress && (
                <button
                    onClick={handleReset}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border border-white/20 cursor-pointer"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  New Search
                </button>
            )}
          </div>
        </header>

        {/* Stepper Indicator */}
        <div className="bg-white border-b border-gray-200 py-3 px-6 shadow-xs">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-xs font-bold uppercase tracking-wider">
            <div className="flex items-center gap-3 sm:gap-6">
              <button
                  onClick={() => setStep("map")}
                  className={`flex items-center gap-2 transition-colors cursor-pointer ${
                      step === "map" ? "text-[#00589e]" : "text-gray-400 hover:text-gray-700"
                  }`}
              >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                  step === "map" ? "bg-[#00589e] text-white" : "bg-gray-200 text-gray-600"
              }`}>1</span>
                <span>Address & Multi-Roof Boundaries</span>
              </button>

              <span className="text-gray-300">/</span>

              <button
                  disabled={!selectedAddress}
                  onClick={() => selectedAddress && setStep("quote")}
                  className={`flex items-center gap-2 transition-colors ${
                      step === "quote"
                          ? "text-[#00589e]"
                          : selectedAddress
                              ? "text-gray-400 hover:text-gray-700 cursor-pointer"
                              : "text-gray-300 cursor-not-allowed"
                  }`}
              >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                  step === "quote" ? "bg-[#00589e] text-white" : "bg-gray-200 text-gray-600"
              }`}>2</span>
                <span>Estimate & Specifications</span>
              </button>
            </div>

            {selectedAddress && (
                <div className="hidden sm:flex items-center gap-2 text-gray-700 font-bold">
                  <span className="text-gray-400 text-[10px] uppercase">Total Roof Area:</span>
                  <span className="bg-blue-50 text-[#00589e] px-2.5 py-1 rounded border border-blue-100 font-black">
                {totalSqFt.toLocaleString()} sq ft ({sections.length} {sections.length === 1 ? "section" : "sections"})
              </span>
                </div>
            )}
          </div>
        </div>

        {/* Main Workspace */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {step === "map" ? (
              <div className="space-y-6 animate-in fade-in duration-300">
                <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">
                    Search Property Address
                  </label>
                  <AddressSearch
                      onAddressSelect={handleAddressSelect}
                      variant="default"
                      placeholder="Type customer address to detect roof & estimate..."
                  />
                </section>

                {roofError && (
                    <div className="p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-xl">
                      <p className="text-sm font-bold text-amber-800">
                        {roofError === "no_building"
                            ? "No roof or building could be clearly detected at this address. Please search another address or adjust points manually."
                            : "Unable to retrieve solar data for this location. You can still outline the roof manually on the map."}
                      </p>
                    </div>
                )}

                <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-sm font-black text-gray-700 uppercase tracking-wider flex items-center gap-2">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      Roof Boundary Detection
                    </h2>
                    {selectedAddress && (
                        <span className="text-xs font-semibold bg-blue-50 text-[#00589e] px-3 py-1 rounded-md border border-blue-100 truncate">
                    {selectedAddress}
                  </span>
                    )}
                  </div>

                  <div className="min-h-[520px] rounded-xl overflow-hidden border border-gray-200 relative">
                    <RoofMap
                        center={location}
                        zoom={mapZoom}
                        sections={sections}
                        activeSectionId={activeSectionId}
                        onSelectSection={setActiveSectionId}
                        onUpdateSectionCoords={handleUpdateCoords}
                        onAddSection={handleAddSection}
                        onRemoveSection={handleRemoveSection}
                        hideControls={!selectedAddress}
                    />

                    {isLoading && (
                        <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center z-20 gap-3">
                          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#00589e] border-t-transparent"></div>
                          <p className="text-sm font-bold text-[#00589e] uppercase tracking-wider">
                            Analyzing roof structures...
                          </p>
                        </div>
                    )}
                  </div>

                  {selectedAddress && !isLoading && sections.length > 0 && (
                      <div className="pt-2">
                        <button
                            onClick={() => setStep("quote")}
                            className="w-full py-5 bg-[#00589e] hover:bg-[#00437a] text-white font-black text-lg uppercase tracking-widest rounded-xl cursor-pointer transition-all active:scale-[0.99] shadow-lg flex items-center justify-center gap-3"
                        >
                          Continue to Estimate Details →
                        </button>
                      </div>
                  )}
                </div>
              </div>
          ) : (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                  <button
                      onClick={() => setStep("map")}
                      className="flex items-center gap-2 text-gray-600 hover:text-[#00589e] font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="19" y1="12" x2="5" y2="12" />
                      <polyline points="12 19 5 12 12 5" />
                    </svg>
                    Back to Map & Roof Boundaries
                  </button>

                  <div className="text-right">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Selected Property</p>
                    <p className="text-xs font-bold text-gray-800 truncate max-w-md">{selectedAddress}</p>
                  </div>
                </div>

                {/* QuoteForm multi-sección (Siguiente paso: actualizar el QuoteForm para editar cada sección) */}
                <QuoteForm
                    sections={sections}
                    onUpdateSections={setSections}
                    address={selectedAddress}
                />
              </div>
          )}
        </main>
      </div>
  );
}