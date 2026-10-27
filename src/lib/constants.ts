export const CHICAGO_ROOFING_PRICES = {
    SQUARE_FOOT_UNIT: 100,

    MATERIALS: {
        asphalt_shingle: 0, // El precio total se determina por pitch
        flat_tpo: 1250,     // $/sq, TPO 60 mil completo
    },

    // Asphalt shingle: precio total por sq (material + labor) según pitch
    LABOR_BY_PITCH: {
        flat:       725,  // Techo plano / caso base
        shallow:    725,  // 2/12 – 4/12
        medium:     750,  // 5/12 – 8/12
        steep:      950,  // 9/12 – 11/12
        high_steep: 1150, // 12/12+
    },

    REMOVAL_PER_LAYER_SQ: 100, // $/sq por capa adicional

    // Decking (hoja de triplay 4'x8')
    DECKING_PER_SHEET: 110,

    // Reparto del precio base entre material y labor
    MATERIAL_SHARE: 0.45,
    LABOR_SHARE: 0.55,
};