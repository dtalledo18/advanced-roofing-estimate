export const CHICAGO_ROOFING_PRICES = {
    SQUARE_FOOT_UNIT: 100,

    MATERIALS: {
        asphalt_shingle: 0, // precio varía por pitch — ver LABOR_BY_PITCH
        flat_tpo: 950,      // $/sq, TPO instalado
    },

    // Asphalt shingle: precio total por sq (material + labor) según pitch
    LABOR_BY_PITCH: {
        flat:       620, // no se usa en la UI; igual que shallow
        shallow:    620, // 2/12 – 4/12
        medium:     680, // 5/12 – 8/12
        steep:      830, // 9/12 – 11/12
        high_steep: 980, // 12/12+
    },

    REMOVAL_PER_LAYER_SQ: 75, // $/sq por capa adicional

    // Decking (hoja de triplay 4'x8'). Aún no lo usa el hook.
    DECKING_PER_SHEET: 95,

    // Reparto del precio base entre material y labor (solo afecta el desglose, no el total)
    MATERIAL_SHARE: 0.45,
    LABOR_SHARE: 0.55,
};