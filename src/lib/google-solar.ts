// lib/google-solar.ts
// Enfoque: Grid Rasterization + Connected Components + Contour Tracing real (edge-following)
// 1. Proyectamos todos los boundingBoxes de segmentos a una grilla 2D
// 2. Nos quedamos con el componente conectado más grande (elimina ruido de estructuras vecinas)
// 3. Trazamos el contorno exterior REAL siguiendo los bordes expuestos de las celdas (no un hull)
// 4. Simplificamos colineales (mantiene esquinas a 90°, no redondea ni corta esquinas como RDP)

interface LatLng {
    lat: number;
    lng: number;
}

interface RoofSegment {
    center?: { latitude?: number; longitude?: number };
    pitchDegrees?: number;
    stats?: { areaMeters2?: number };
    boundingBox?: {
        sw?: { latitude?: number; longitude?: number };
        ne?: { latitude?: number; longitude?: number };
    };
}

interface Corner {
    r: number;
    c: number;
}

function isValidCoord(c: LatLng): boolean {
    return isFinite(c.lat) && isFinite(c.lng);
}

// ─── Filtrar cluster principal (pre-filtro estadístico, defensa en profundidad) ─
function filterMainCluster(segments: RoofSegment[], sigma = 1.2): RoofSegment[] {
    const valid = segments.filter(s =>
        s.center?.latitude !== undefined && isFinite(s.center.latitude!) &&
        s.center?.longitude !== undefined && isFinite(s.center.longitude!)
    );
    if (valid.length === 0) return segments;

    const cx = valid.reduce((s, seg) => s + seg.center!.longitude!, 0) / valid.length;
    const cy = valid.reduce((s, seg) => s + seg.center!.latitude!, 0) / valid.length;
    const dists = valid.map(seg => Math.hypot(seg.center!.longitude! - cx, seg.center!.latitude! - cy));
    const mean = dists.reduce((s, d) => s + d, 0) / dists.length;
    const std = Math.sqrt(dists.reduce((s, d) => s + (d - mean) ** 2, 0) / dists.length);

    const filtered = valid.filter((_, i) => dists[i] <= mean + sigma * std);
    console.log(`🔍 Cluster (pre-filtro estadístico): ${filtered.length}/${segments.length} retenidos`);
    return filtered.length > 0 ? filtered : valid;
}

// ─── Rasterización ──────────────────────────────────────────────────────────────
interface RasterResult {
    grid: boolean[][];
    safeRows: number;
    safeCols: number;
    globalMinLat: number;
    globalMaxLat: number;
    globalMinLng: number;
    globalMaxLng: number;
    spanLat: number;
    spanLng: number;
}

function rasterizeSegments(segments: RoofSegment[]): RasterResult | null {
    const boxes: { minLat: number; maxLat: number; minLng: number; maxLng: number }[] = [];
    for (const seg of segments) {
        const sw = seg.boundingBox?.sw;
        const ne = seg.boundingBox?.ne;
        if (!sw?.latitude || !sw?.longitude || !ne?.latitude || !ne?.longitude) continue;
        if (!isFinite(sw.latitude) || !isFinite(ne.latitude)) continue;
        boxes.push({
            minLat: Math.min(sw.latitude, ne.latitude),
            maxLat: Math.max(sw.latitude, ne.latitude),
            minLng: Math.min(sw.longitude, ne.longitude),
            maxLng: Math.max(sw.longitude, ne.longitude),
        });
    }
    if (boxes.length === 0) return null;

    const globalMinLat = Math.min(...boxes.map(b => b.minLat));
    const globalMaxLat = Math.max(...boxes.map(b => b.maxLat));
    const globalMinLng = Math.min(...boxes.map(b => b.minLng));
    const globalMaxLng = Math.max(...boxes.map(b => b.maxLng));

    const spanLat = globalMaxLat - globalMinLat;
    const spanLng = globalMaxLng - globalMinLng;
    if (spanLat === 0 || spanLng === 0) return null;

    const metersPerDegLat = 111320;
    const metersPerDegLng = 111320 * Math.cos(((globalMinLat + globalMaxLat) / 2) * Math.PI / 180);
    const cellSizeMeters = 1.0; // celdas más finas = contorno más fiel (antes 1.5)
    const COLS = Math.ceil(spanLng * metersPerDegLng / cellSizeMeters) + 2;
    const ROWS = Math.ceil(spanLat * metersPerDegLat / cellSizeMeters) + 2;

    const safeCols = Math.min(COLS, 300);
    const safeRows = Math.min(ROWS, 300);

    const grid: boolean[][] = Array.from({ length: safeRows + 2 }, () =>
        new Array(safeCols + 2).fill(false)
    );

    for (const box of boxes) {
        const c0 = Math.floor((box.minLng - globalMinLng) / spanLng * safeCols);
        const c1 = Math.ceil((box.maxLng - globalMinLng) / spanLng * safeCols);
        const r0 = Math.floor((box.minLat - globalMinLat) / spanLat * safeRows);
        const r1 = Math.ceil((box.maxLat - globalMinLat) / spanLat * safeRows);

        for (let r = Math.max(0, r0); r <= Math.min(safeRows - 1, r1); r++) {
            for (let c = Math.max(0, c0); c <= Math.min(safeCols - 1, c1); c++) {
                grid[r + 1][c + 1] = true;
            }
        }
    }

    return { grid, safeRows, safeCols, globalMinLat, globalMaxLat, globalMinLng, globalMaxLng, spanLat, spanLng };
}

// ─── Connected Components: nos quedamos SOLO con el blob más grande ────────────
// Esto reemplaza al filtro estadístico como defensa principal contra segmentos
// de estructuras vecinas (parking, casas de al lado) que pasaron el sigma-filter.
function keepLargestComponent(grid: boolean[][]): boolean[][] {
    const rows = grid.length;
    const cols = grid[0].length;
    const labels: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
    let bestLabel = -1, bestSize = 0, labelId = 0;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!grid[r][c] || labels[r][c] !== -1) continue;

            let size = 0;
            const queue: [number, number][] = [[r, c]];
            labels[r][c] = labelId;

            while (queue.length) {
                const [cr, cc] = queue.pop()!;
                size++;
                const neighbors: [number, number][] = [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]];
                for (const [nr, nc] of neighbors) {
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] && labels[nr][nc] === -1) {
                        labels[nr][nc] = labelId;
                        queue.push([nr, nc]);
                    }
                }
            }

            if (size > bestSize) { bestSize = size; bestLabel = labelId; }
            labelId++;
        }
    }

    console.log(`🔍 Connected components: ${labelId} blobs detectados, quedándonos con el de ${bestSize} celdas`);
    return grid.map((row, r) => row.map((v, c) => v && labels[r][c] === bestLabel));
}

// ─── Contour Tracing REAL (edge-following, no hull) ────────────────────────────
// Para cada celda ocupada, cada lado expuesto (vecino vacío) genera una arista
// dirigida de forma que el área ocupada quede siempre a la derecha del sentido
// de avance (recorrido horario). Esto forma un único ciclo por blob, sin perder
// concavidades ni redondear esquinas.
function traceContours(grid: boolean[][]): Corner[][] {
    const rows = grid.length;
    const cols = grid[0].length;
    const isFilled = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c];
    const key = (p: Corner) => `${p.r},${p.c}`;

    const next = new Map<string, Corner>();

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!grid[r][c]) continue;

            if (!isFilled(r - 1, c)) next.set(key({ r, c }), { r, c: c + 1 });               // top
            if (!isFilled(r + 1, c)) next.set(key({ r: r + 1, c: c + 1 }), { r: r + 1, c });  // bottom
            if (!isFilled(r, c - 1)) next.set(key({ r: r + 1, c }), { r, c });                // left
            if (!isFilled(r, c + 1)) next.set(key({ r, c: c + 1 }), { r: r + 1, c: c + 1 });  // right
        }
    }

    const visited = new Set<string>();
    const loops: Corner[][] = [];

    for (const startKey of next.keys()) {
        if (visited.has(startKey)) continue;
        const loop: Corner[] = [];
        let currentKey = startKey;
        let guard = 0;
        while (!visited.has(currentKey) && guard < 100000) {
            visited.add(currentKey);
            const [r, c] = currentKey.split(",").map(Number);
            loop.push({ r, c });
            const nxt = next.get(currentKey);
            if (!nxt) break;
            currentKey = key(nxt);
            guard++;
        }
        if (loop.length >= 4) loops.push(loop);
    }

    return loops;
}

function loopArea(loop: Corner[]): number {
    let area = 0;
    for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        area += a.c * b.r - b.c * a.r;
    }
    return Math.abs(area) / 2;
}

// ─── Simplificación de colineales (mantiene ángulos rectos exactos) ────────────
// A diferencia de RDP, esto NO corta ni redondea esquinas: solo elimina puntos
// intermedios donde dos aristas consecutivas van en la misma dirección.
function simplifyCollinear(points: LatLng[]): LatLng[] {
    if (points.length < 3) return points;
    const result: LatLng[] = [];
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const prev = points[(i - 1 + n) % n];
        const curr = points[i];
        const nextP = points[(i + 1) % n];
        const dx1 = curr.lng - prev.lng, dy1 = curr.lat - prev.lat;
        const dx2 = nextP.lng - curr.lng, dy2 = nextP.lat - curr.lat;
        const cross = dx1 * dy2 - dy1 * dx2;
        if (Math.abs(cross) > 1e-12) {
            result.push(curr);
        }
    }
    return result.length >= 3 ? result : points;
}

function buildPolygonFromGrid(segments: RoofSegment[]): LatLng[] {
    const raster = rasterizeSegments(segments);
    if (!raster) return [];

    const { grid, safeRows, safeCols, globalMinLat, globalMinLng, spanLat, spanLng } = raster;

    const cleanedGrid = keepLargestComponent(grid);

    const loops = traceContours(cleanedGrid);
    if (loops.length === 0) return [];

    const largestLoop = loops.reduce((best, l) => (loopArea(l) > loopArea(best) ? l : best));

    function cellToLatLng(row: number, col: number): LatLng {
        return {
            lat: globalMinLat + ((row - 1) / safeRows) * spanLat,
            lng: globalMinLng + ((col - 1) / safeCols) * spanLng,
        };
    }

    let coords = largestLoop.map(pt => cellToLatLng(pt.r, pt.c));
    coords = simplifyCollinear(coords);
    return coords;
}

// NOTA: el helper squareAroundMeters que estaba acá quedó obsoleto — ahora
// el flujo de "Add Roof Section" usa dibujo manual punto por punto con
// DrawingManager (ver RoofMap.tsx y page.tsx actualizados). Ya no se
// autogenera ningún cuadrado.

// ─── Función principal ──────────────────────────────────────────────────────────
export const getRoofData = async (lat: number, lng: number) => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    // Intento 1: HIGH quality (imágenes más precisas)
    let data = await fetchSolar(lat, lng, "HIGH", key!);

    // Fallback: edificios industriales/comerciales suelen tener mala cobertura HIGH.
    // Si no hay building o casi no hay segmentos útiles, reintentar con MEDIUM.
    const segCountHigh = data?.solarPotential?.roofSegmentStats?.length ?? 0;
    if (!data || data.error || segCountHigh < 2) {
        console.warn("⚠️ HIGH quality insuficiente, reintentando con MEDIUM");
        const fallback = await fetchSolar(lat, lng, "MEDIUM", key!);
        if (fallback && !fallback.error) data = fallback;
    }

    if (!data || data.error?.code === 404 || data.error?.status === "NOT_FOUND") {
        throw new Error("no_building");
    }

    const allSegments: RoofSegment[] = data.solarPotential?.roofSegmentStats ?? [];

    const areaM2: number = data.solarPotential?.wholeRoofStats?.areaMeters2 ?? 0;
    const areaSqFt = Math.round(areaM2 * 10.7639);

    const dominantSegment = allSegments.reduce<RoofSegment | null>((best, seg) => {
        const area = seg.stats?.areaMeters2 ?? 0;
        return area > (best?.stats?.areaMeters2 ?? 0) ? seg : best;
    }, null);
    const pitchDegrees: number = dominantSegment?.pitchDegrees ?? 15;

    const mainSegments = filterMainCluster(allSegments, 1.2);

    let coords: LatLng[] = buildPolygonFromGrid(mainSegments);
    console.log(`🔍 Contorno real trazado: ${coords.length} puntos`);

    // Fallback boundingBox global (si el trazado de contorno falla completamente)
    if (coords.length < 3 && data.boundingBox) {
        const box = data.boundingBox;
        coords = [
            { lat: box.ne.latitude, lng: box.ne.longitude },
            { lat: box.ne.latitude, lng: box.sw.longitude },
            { lat: box.sw.latitude, lng: box.sw.longitude },
            { lat: box.sw.latitude, lng: box.ne.longitude },
        ].filter(isValidCoord);
        console.warn("⚠️ Usando fallback de boundingBox global — revisar calidad de datos Solar API para esta dirección");
    }

    return { areaSqFt, pitchDegrees, coords };
};

async function fetchSolar(lat: number, lng: number, quality: "HIGH" | "MEDIUM", key: string) {
    const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&required_quality=${quality}&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) {
        if (res.status === 404) return { error: { code: 404, status: "NOT_FOUND" } };
        throw new Error(`Solar API error: ${res.status}`);
    }
    return res.json();
}