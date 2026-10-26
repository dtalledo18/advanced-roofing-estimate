export const CHICAGO_ROOFING_PRICES = {
    SQUARE_FOOT_UNIT: 100,

    MATERIALS: {
        asphalt_shingle: 0, // precio varía por pitch — ver LABOR_BY_PITCH
        flat_tpo: 1050,     // $/sq, TPO ajustado
    },

    // Asphalt shingle: precio total por sq (material + labor) según pitch
    LABOR_BY_PITCH: {
        flat:       720,
        shallow:    720, // 2/12 – 4/12 (piso mínimo en 700 y algo)
        medium:     780, // 5/12 – 8/12 (estándar común)
        steep:      920, // 9/12 – 11/12
        high_steep: 1100,// 12/12+
    },

    REMOVAL_PER_LAYER_SQ: 85, // $/sq por capa adicional

    // Decking (hoja de triplay 4'x8')
    DECKING_PER_SHEET: 110,

    // Reparto del precio base entre material y labor
    MATERIAL_SHARE: 0.45,
    LABOR_SHARE: 0.55,
};