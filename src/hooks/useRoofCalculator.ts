// src/hooks/useRoofCalculator.ts
import { CHICAGO_ROOFING_PRICES as PRICES } from "@/lib/constants";
import { RoofingQuoteRequest, QuoteBreakdown } from "@/types/roofing";

export const useRoofCalculator = () => {
    const calculateQuote = ({ sections }: RoofingQuoteRequest): QuoteBreakdown => {
        let totalMaterialCost = 0;
        let totalLaborCost = 0;
        let totalRemovalCost = 0;

        sections.forEach((section) => {
            const squares = section.areaSqFt / PRICES.SQUARE_FOOT_UNIT;
            const isTPO = section.material === "flat_tpo";

            const ratePerSq = isTPO
                ? PRICES.MATERIALS.flat_tpo
                : PRICES.LABOR_BY_PITCH[section.pitch as keyof typeof PRICES.LABOR_BY_PITCH]
                ?? PRICES.LABOR_BY_PITCH.shallow;

            const baseCost = squares * ratePerSq;

            const matCost = Math.round(baseCost * PRICES.MATERIAL_SHARE);
            const labCost = Math.round(baseCost * PRICES.LABOR_SHARE);
            const remCost = isTPO
                ? 0
                : Math.round(squares * PRICES.REMOVAL_PER_LAYER_SQ * section.layersToRemove);

            totalMaterialCost += matCost;
            totalLaborCost += labCost;
            totalRemovalCost += remCost;
        });

        return {
            materialCost: totalMaterialCost,
            laborCost: totalLaborCost,
            removalCost: totalRemovalCost,
            total: totalMaterialCost + totalLaborCost + totalRemovalCost,
        };
    };

    return { calculateQuote };
};