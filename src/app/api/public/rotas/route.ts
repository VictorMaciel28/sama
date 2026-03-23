import { NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/** Logs verbosos: `ROTAS_DEBUG=1` no .env ou NODE_ENV=development */
function rotasDebugEnabled(): boolean {
  return process.env.ROTAS_DEBUG === '1' || process.env.NODE_ENV === 'development';
}

function rotasLog(label: string, data?: Record<string, unknown> | unknown[]) {
  if (!rotasDebugEnabled()) return;
  const ts = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[api/public/rotas ${ts}] ${label}`, JSON.stringify(data, null, 0));
  } else {
    console.log(`[api/public/rotas ${ts}] ${label}`);
  }
}

function roundCoord(n: number, decimals = 6): number {
  const p = 10 ** decimals;
  return Math.round(n * p) / p;
}

/** Coordenada em graus (WGS84). */
export type LatLng = { lat: number; lng: number };

/**
 * `stops`: endereços ou lat/lng na ordem da lista (geocoding no servidor quando for texto).
 *
 * `destinationMode`:
 * - `lastStop` (padrão): último item de `stops` é o destino final; os demais são intermediários.
 * - `returnToOrigin`: todos os itens de `stops` são paradas; o destino da rota é a própria `origin` (volta à base / ponto de partida).
 *
 * `optimizeWaypointOrder` (padrão `true`): o Google pode reordenar **somente os intermediários**
 * no modo `lastStop`, ou **todas** as paradas no modo `returnToOrigin`, para reduzir tempo/distância.
 * Use `false` se a ordem da lista for obrigatória (ex.: prioridade comercial).
 *
 * `routingPreference` (opcional): para carro/moto, o padrão é `TRAFFIC_AWARE_OPTIMAL` quando não há
 * otimização de paradas. **Importante:** a Routes API **não permite** `optimizeWaypointOrder: true` com
 * `TRAFFIC_AWARE_OPTIMAL` — nesse caso o servidor usa `TRAFFIC_AWARE` automaticamente.
 */
type RoutesBody = {
  origin?: LatLng;
  stops?: Array<LatLng | string>;
  travelMode?: 'DRIVE' | 'WALK' | 'BICYCLE' | 'TWO_WHEELER';
  /** Padrão: true */
  optimizeWaypointOrder?: boolean;
  /** Padrão: lastStop */
  destinationMode?: 'lastStop' | 'returnToOrigin';
  routingPreference?: 'TRAFFIC_UNAWARE' | 'TRAFFIC_AWARE' | 'TRAFFIC_AWARE_OPTIMAL';
};

const ROUTING_PREFS = new Set<RoutesBody['routingPreference']>([
  'TRAFFIC_UNAWARE',
  'TRAFFIC_AWARE',
  'TRAFFIC_AWARE_OPTIMAL',
]);

function defaultRoutingPreference(
  travelMode: NonNullable<RoutesBody['travelMode']>
): 'TRAFFIC_UNAWARE' | 'TRAFFIC_AWARE' | 'TRAFFIC_AWARE_OPTIMAL' {
  if (travelMode === 'WALK' || travelMode === 'BICYCLE') return 'TRAFFIC_UNAWARE';
  return 'TRAFFIC_AWARE_OPTIMAL';
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

function parseDurationSeconds(duration: unknown): number {
  if (duration == null) return 0;
  if (typeof duration === 'object' && duration !== null && 'seconds' in duration) {
    const sec = (duration as { seconds?: string | number }).seconds;
    return sec != null ? Number(sec) : 0;
  }
  const s = String(duration);
  const m = s.match(/^(\d+)s$/);
  return m ? Number(m[1]) : 0;
}

function isLatLng(x: unknown): x is LatLng {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.lat === 'number' && typeof o.lng === 'number' && Number.isFinite(o.lat) && Number.isFinite(o.lng);
}

type GeocodeDetails = {
  formattedAddress?: string;
  locationType?: string;
  partialMatch?: boolean;
};

/** Geocoding HTTP (explícito) — não usar `address` dentro da Routes API. */
async function geocodeAddress(
  apiKey: string,
  address: string
): Promise<(LatLng & { details?: GeocodeDetails }) | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', trimmed);
  url.searchParams.set('key', apiKey);
  /** Viés Brasil — reduz ambiguidade sem exigir match estrito em `components`. */
  url.searchParams.set('region', 'br');
  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      partial_match?: boolean;
      geometry?: {
        location?: { lat: number; lng: number };
        location_type?: string;
      };
    }>;
  };
  if (data.status !== 'OK' || !data.results?.[0]?.geometry?.location) return null;
  const first = data.results[0];
  const loc = first.geometry!.location!;
  const details: GeocodeDetails = {
    formattedAddress: first.formatted_address,
    locationType: first.geometry?.location_type,
    partialMatch: first.partial_match === true,
  };
  return { lat: loc.lat, lng: loc.lng, details };
}

/** Converte `stops` (strings e/ou LatLng) em lista só de LatLng (geocoding em paralelo). */
async function resolveStopsToLatLng(
  apiKey: string,
  stops: Array<LatLng | string>
): Promise<LatLng[] | { error: string }> {
  const tasks = stops.map(async (s, index) => {
    const i = index + 1;
    if (isLatLng(s)) {
      rotasLog(`parada[${i}] tipo=latLng`, {
        lat: roundCoord(s.lat),
        lng: roundCoord(s.lng),
      });
      return { ok: true as const, coord: { lat: s.lat, lng: s.lng } };
    }
    if (typeof s === 'string') {
      rotasLog(`parada[${i}] geocoding entrada`, {
        textoLen: s.length,
        textoPreview: s.length > 160 ? `${s.slice(0, 160)}…` : s,
      });
      const g = await geocodeAddress(apiKey, s);
      if (!g) {
        rotasLog(`parada[${i}] geocoding FALHOU`, { textoPreview: s.slice(0, 120) });
        return { ok: false as const, error: `Não foi possível geocodificar a parada ${i}` };
      }
      rotasLog(`parada[${i}] geocoding resultado`, {
        lat: roundCoord(g.lat),
        lng: roundCoord(g.lng),
        formattedAddress: g.details?.formattedAddress,
        locationType: g.details?.locationType,
        partialMatch: g.details?.partialMatch ?? false,
      });
      return { ok: true as const, coord: { lat: g.lat, lng: g.lng } };
    }
    return {
      ok: false as const,
      error: `Parada ${i} inválida (use lat/lng ou texto de endereço)`,
    };
  });

  const results = await Promise.all(tasks);
  const firstBad = results.find((r) => !r.ok);
  if (firstBad && !firstBad.ok) {
    return { error: firstBad.error };
  }
  return results.map((r) => (r as { ok: true; coord: LatLng }).coord);
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'Google Maps API Key não configurada' }, { status: 500, headers: corsHeaders });
    }

    const body = (await request.json()) as RoutesBody;
    const origin = body?.origin;
    const rawStops = Array.isArray(body?.stops) ? body.stops : [];
    const travelMode = body?.travelMode || 'DRIVE';
    const destinationMode = body?.destinationMode === 'returnToOrigin' ? 'returnToOrigin' : 'lastStop';
    const optimizeWaypointOrder =
      typeof body?.optimizeWaypointOrder === 'boolean' ? body.optimizeWaypointOrder : true;
    const routingPreference =
      body?.routingPreference && ROUTING_PREFS.has(body.routingPreference)
        ? body.routingPreference
        : defaultRoutingPreference(travelMode);

    rotasLog('POST entrada (resumo)', {
      origin: origin
        ? { lat: roundCoord(origin.lat), lng: roundCoord(origin.lng) }
        : null,
      travelMode,
      destinationMode,
      optimizeWaypointOrder,
      routingPreference,
      stopsCount: rawStops.length,
      stopsTipos: rawStops.map((s, i) =>
        typeof s === 'string' ? `string[${i}]` : isLatLng(s) ? `latLng[${i}]` : `? [${i}]`
      ),
      stopsPreview: rawStops.map((s) =>
        typeof s === 'string' ? (s.length > 100 ? `${s.slice(0, 100)}…` : s) : s
      ),
    });

    if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
      return NextResponse.json({ ok: false, error: 'Origem inválida' }, { status: 400, headers: corsHeaders });
    }
    if (rawStops.length < 1) {
      return NextResponse.json({ ok: false, error: 'Informe ao menos um destino' }, { status: 400, headers: corsHeaders });
    }

    const resolved = await resolveStopsToLatLng(apiKey, rawStops);
    if ('error' in resolved) {
      return NextResponse.json({ ok: false, error: resolved.error }, { status: 400, headers: corsHeaders });
    }
    const coords = resolved;

    let destinationCoord: LatLng;
    let intermediatesCoords: LatLng[];

    if (destinationMode === 'returnToOrigin') {
      destinationCoord = { lat: origin.lat, lng: origin.lng };
      intermediatesCoords = coords;
    } else {
      destinationCoord = coords[coords.length - 1];
      intermediatesCoords = coords.slice(0, -1);
    }

    /** Sem intermediários, o Google não otimiza nada; `true` pode ser rejeitado em alguns casos. */
    const effectiveOptimize =
      optimizeWaypointOrder && intermediatesCoords.length > 0 ? true : false;

    /**
     * Google Routes API: `optimize_waypoint_order` + `TRAFFIC_AWARE_OPTIMAL` → INVALID_ARGUMENT.
     * Com otimização de paradas ativa, usamos `TRAFFIC_AWARE` (ainda considera trânsito).
     */
    const appliedRoutingPreference =
      effectiveOptimize && routingPreference === 'TRAFFIC_AWARE_OPTIMAL'
        ? 'TRAFFIC_AWARE'
        : routingPreference;
    if (effectiveOptimize && routingPreference === 'TRAFFIC_AWARE_OPTIMAL') {
      rotasLog('routingPreference ajustado', {
        solicitado: 'TRAFFIC_AWARE_OPTIMAL',
        aplicado: 'TRAFFIC_AWARE',
        motivo: 'optimizeWaypointOrder incompatível com OPTIMAL',
      });
    }

    rotasLog('coordenadas resolvidas → Routes API', {
      destinationMode,
      effectiveOptimize,
      routingPreference: appliedRoutingPreference,
      origin: { lat: roundCoord(origin.lat), lng: roundCoord(origin.lng) },
      destination: {
        lat: roundCoord(destinationCoord.lat),
        lng: roundCoord(destinationCoord.lng),
      },
      intermediatesCount: intermediatesCoords.length,
      intermediates: intermediatesCoords.map((p, idx) => ({
        ordem: idx + 1,
        lat: roundCoord(p.lat),
        lng: roundCoord(p.lng),
      })),
    });

    const payload = {
      origin: {
        location: {
          latLng: { latitude: origin.lat, longitude: origin.lng },
        },
      },
      destination: {
        location: {
          latLng: { latitude: destinationCoord.lat, longitude: destinationCoord.lng },
        },
      },
      intermediates: intermediatesCoords.map((p) => ({
        location: {
          latLng: { latitude: p.lat, longitude: p.lng },
        },
        vehicleStopover: true,
      })),
      travelMode,
      optimizeWaypointOrder: effectiveOptimize,
      computeAlternativeRoutes: false,
      routingPreference: appliedRoutingPreference,
      polylineQuality: 'HIGH_QUALITY',
    };

    const res = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex',
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.routes?.length) {
      rotasLog('computeRoutes ERRO', {
        httpStatus: res.status,
        googleBody: json,
      });
      return NextResponse.json(
        { ok: false, error: 'Falha ao gerar rota', detalhe: json || null },
        { status: res.status || 502, headers: corsHeaders }
      );
    }

    const route = json.routes[0];
    const encoded = route?.polyline?.encodedPolyline as string | undefined;
    if (!encoded) {
      rotasLog('computeRoutes polyline vazia', { googleBody: json });
      return NextResponse.json({ ok: false, error: 'Polyline vazia na resposta', detalhe: json }, { status: 502, headers: corsHeaders });
    }

    const durationSec = parseDurationSeconds(route?.duration);
    const distanceMeters = Number(route?.distanceMeters ?? 0);

    const routeObj = route as Record<string, unknown> | undefined;
    const rawOpt =
      routeObj?.optimizedIntermediateWaypointIndex ?? routeObj?.optimized_intermediate_waypoint_index;
    const optimizedIdx = Array.isArray(rawOpt)
      ? rawOpt.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0)
      : [];

    /** Ordem sugerida para visitar os itens de `stops` (índices 0..n-1). */
    let visitOrder: number[];
    const n = coords.length;
    if (destinationMode === 'returnToOrigin') {
      visitOrder =
        effectiveOptimize && optimizedIdx.length === n ? optimizedIdx : coords.map((_, i) => i);
    } else {
      if (n < 2) {
        visitOrder = [0];
      } else if (effectiveOptimize && optimizedIdx.length === n - 1) {
        visitOrder = [...optimizedIdx, n - 1];
      } else {
        visitOrder = coords.map((_, i) => i);
      }
    }

    rotasLog('computeRoutes OK', {
      distanceMeters,
      durationRaw: route?.duration ?? null,
      durationSecParsed: durationSec,
      polylineChars: encoded.length,
      optimizedIntermediateWaypointIndex: optimizedIdx,
      visitOrder,
    });

    /**
     * Mesmas coordenadas enviadas à Routes API (geocoding + lat/lng diretos),
     * na ordem do array `stops` do POST — use nos marcadores do mapa.
     */
    const resolvedStops = coords.map((c) => ({ lat: c.lat, lng: c.lng }));

    return NextResponse.json(
      {
        ok: true,
        polyline: encoded,
        distanceMeters,
        duration: durationSec > 0 ? `${durationSec}s` : (route?.duration ?? null),
        destinationMode,
        optimizeWaypointOrder: effectiveOptimize,
        routingPreference: appliedRoutingPreference,
        optimizedIntermediateWaypointIndex: optimizedIdx.length ? optimizedIdx : undefined,
        visitOrder,
        resolvedStops,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    rotasLog('exceção não tratada', {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, error: 'Erro ao gerar rota' }, { status: 500, headers: corsHeaders });
  }
}
