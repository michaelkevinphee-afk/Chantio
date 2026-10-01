'use client';

import 'leaflet/dist/leaflet.css';
import { adresseComplete, geocoder, type Point } from '@chantio/shared';
import { useEffect, useRef, useState } from 'react';

export interface ArretCarte {
  id: string;
  heure: string;
  titre: string;
  detail: string;
  enCours: boolean;
  site: { adresse: string; code_postal: string | null; ville: string | null; latitude: number | null; longitude: number | null } | null;
}

// Fond de carte de l'IGN (Plan IGN) : gratuit, sans compte ni clé.
const TUILES =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

const echapper = (t: string) => t.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** Position d'un site : celle enregistrée, sinon l'adresse géocodée (gardée dans le navigateur). */
async function position(site: ArretCarte['site']): Promise<Point | null> {
  if (!site) return null;
  if (site.latitude != null && site.longitude != null) return { lat: site.latitude, lon: site.longitude };
  const adresse = adresseComplete(site);
  const cle = `chantio:geo:${adresse.toLowerCase()}`;
  try {
    const deja = localStorage.getItem(cle);
    if (deja) return JSON.parse(deja) as Point;
  } catch {}
  const p = await geocoder(adresse);
  try {
    if (p) localStorage.setItem(cle, JSON.stringify(p));
  } catch {}
  return p;
}

/** Carte des interventions du jour : une pastille numérotée par chantier, dans l'ordre des heures. */
export function CarteDuJour({ arrets }: { arrets: ArretCarte[] }) {
  const zone = useRef<HTMLDivElement>(null);
  const [manquants, setManquants] = useState(0);

  useEffect(() => {
    let actif = true;
    let carte: import('leaflet').Map | null = null;
    (async () => {
      const L = (await import('leaflet')).default;
      const points = await Promise.all(arrets.map((a) => position(a.site)));
      if (!actif || !zone.current) return;
      carte = L.map(zone.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer(TUILES, { maxZoom: 19, attribution: '© IGN – Géoplateforme' }).addTo(carte);
      const places: [number, number][] = [];
      arrets.forEach((a, n) => {
        const p = points[n];
        if (!p) return;
        places.push([p.lat, p.lon]);
        const icone = L.divIcon({
          className: '',
          html: `<span class="pastille-carte${a.enCours ? ' en-cours' : ''}">${n + 1}</span>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        L.marker([p.lat, p.lon], { icon: icone, title: a.titre })
          .addTo(carte!)
          .bindPopup(
            `<a href="/interventions/${a.id}" class="bulle-carte"><b>${echapper(a.heure)} · ${echapper(a.titre)}</b><br>${echapper(a.detail)}</a>`,
          );
      });
      setManquants(points.filter((p) => !p).length);
      if (places.length) carte.fitBounds(places, { padding: [40, 40], maxZoom: 15 });
      else carte.setView([48.8566, 2.3522], 11);
    })();
    return () => {
      actif = false;
      carte?.remove();
    };
  }, [arrets]);

  return (
    <div className="carte isolate overflow-hidden p-0">
      <div ref={zone} className="h-[320px] w-full bg-doux" aria-label="Carte des interventions du jour" />
      {manquants > 0 && (
        <p className="border-t border-trait px-4 py-2 text-sm text-gris">
          {manquants} adresse{manquants > 1 ? 's' : ''} introuvable{manquants > 1 ? 's' : ''} : vérifie la fiche client.
        </p>
      )}
    </div>
  );
}
