import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";

/**
 * GeoJSON público dos estados brasileiros (codeforgermany/click_that_hood).
 * Propriedade `name` contém o nome completo do estado em português.
 */
const GEOJSON_URL =
  "https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/brazil-states.geojson";

const NOME_TO_UF: Record<string, string> = {
  "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amazonas": "AM",
  "Bahia": "BA", "Ceará": "CE", "Distrito Federal": "DF", "Espírito Santo": "ES",
  "Goiás": "GO", "Maranhão": "MA", "Mato Grosso": "MT", "Mato Grosso do Sul": "MS",
  "Minas Gerais": "MG", "Pará": "PA", "Paraíba": "PB", "Paraná": "PR",
  "Pernambuco": "PE", "Piauí": "PI", "Rio de Janeiro": "RJ", "Rio Grande do Norte": "RN",
  "Rio Grande do Sul": "RS", "Rondônia": "RO", "Roraima": "RR", "Santa Catarina": "SC",
  "São Paulo": "SP", "Sergipe": "SE", "Tocantins": "TO",
};

interface Props {
  porUf: Record<string, number>;
  maxUf: number;
  ufSelecionada: string | null;
  onSelectUf: (uf: string) => void;
}

export default function BrazilMap({ porUf, maxUf, ufSelecionada, onSelectUf }: Props) {
  const [geo, setGeo] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch(GEOJSON_URL)
      .then((r) => r.json())
      .then((g) => { if (!cancel) setGeo(g as FeatureCollection); })
      .catch(() => {});
    return () => { cancel = true; };
  }, []);

  const style = useMemo(() => (feat?: Feature): PathOptions => {
    const nome = (feat?.properties as { name?: string } | undefined)?.name ?? "";
    const uf = NOME_TO_UF[nome];
    const v = uf ? porUf[uf] ?? 0 : 0;
    const intensity = v / maxUf;
    const active = uf === ufSelecionada;
    return {
      fillColor: `oklch(0.71 ${0.16 * intensity} 50)`,
      fillOpacity: 0.15 + intensity * 0.75,
      color: active ? "oklch(0.71 0.16 50)" : "rgba(120,120,120,0.7)",
      weight: active ? 2.5 : 0.7,
    };
  }, [porUf, maxUf, ufSelecionada]);

  function onEach(feat: Feature, layer: Layer) {
    const nome = (feat.properties as { name?: string }).name ?? "";
    const uf = NOME_TO_UF[nome];
    const v = uf ? porUf[uf] ?? 0 : 0;
    layer.bindTooltip(`<strong>${uf ?? nome}</strong> · ${v} BU${v === 1 ? "" : "s"}`, { sticky: true });
    layer.on({
      click: () => uf && onSelectUf(uf),
      mouseover: (e) => (e.target as any).setStyle({ weight: 2 }),
      mouseout: (e) => (e.target as any).setStyle({ weight: style(feat).weight }),
    });
  }

  return (
    <MapContainer
      center={[-14.2, -51.9]}
      zoom={4}
      minZoom={3}
      maxZoom={10}
      scrollWheelZoom
      style={{ height: "100%", width: "100%", background: "transparent" }}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap'
      />
      {geo && (
        <>
          <GeoJSON data={geo} style={style as any} onEachFeature={onEach} />
          <FitToFeatures geo={geo} ufSelecionada={ufSelecionada} />
        </>
      )}
    </MapContainer>
  );
}

function FitToFeatures({ geo, ufSelecionada }: { geo: FeatureCollection; ufSelecionada: string | null }) {
  const map = useMap();
  const fittedAll = useRef(false);

  useEffect(() => {
    if (!ufSelecionada) {
      if (!fittedAll.current) {
        const L = (window as any).L;
        const layer = L.geoJSON(geo);
        map.fitBounds(layer.getBounds(), { padding: [10, 10] });
        fittedAll.current = true;
      }
      return;
    }
    const feat = geo.features.find((f) => NOME_TO_UF[(f.properties as any)?.name] === ufSelecionada);
    if (feat) {
      const L = (window as any).L;
      const layer = L.geoJSON(feat);
      map.fitBounds(layer.getBounds(), { padding: [20, 20] });
    }
  }, [ufSelecionada, geo, map]);

  return null;
}
