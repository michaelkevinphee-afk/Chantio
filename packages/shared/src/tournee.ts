// Tournée du jour : position des adresses et ordre de passage conseillé.

export interface Point {
  lat: number;
  lon: number;
}

/**
 * Géocodeur national (IGN / Géoplateforme) : gratuit, sans compte ni clé, France uniquement.
 * Retourne null si l'adresse est introuvable ou si le réseau ne répond pas.
 */
export async function geocoder(adresse: string): Promise<Point | null> {
  const q = adresse.trim();
  if (q.length < 3) return null;
  try {
    const rep = await fetch(`https://data.geopf.fr/geocodage/search?limit=1&q=${encodeURIComponent(q)}`);
    if (!rep.ok) return null;
    const json = (await rep.json()) as { features?: { geometry?: { coordinates?: [number, number] }; properties?: { score?: number } }[] };
    const f = json.features?.[0];
    const c = f?.geometry?.coordinates;
    // En dessous de 0,4 le résultat ne ressemble plus vraiment à l'adresse demandée.
    if (!c || (f?.properties?.score ?? 1) < 0.4) return null;
    return { lon: c[0], lat: c[1] };
  } catch {
    return null;
  }
}

/** Distance à vol d'oiseau, en kilomètres. */
export function distanceKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Longueur d'un trajet qui passe par les points dans l'ordre donné (départ compris s'il est fourni). */
export function longueurTrajet(points: Point[], ordre: number[], depart?: Point | null): number {
  let total = 0;
  let prec = depart ?? null;
  for (const i of ordre) {
    if (prec) total += distanceKm(prec, points[i]);
    prec = points[i];
  }
  return total;
}

/**
 * Ordre de passage qui raccourcit le trajet : on part du plus proche, puis on
 * corrige les croisements (2-opt). Retourne les indices des points dans l'ordre conseillé.
 * Avec `premier`, ce point reste en tête (chantier déjà en cours).
 */
export function ordreConseille(points: Point[], depart?: Point | null, premier?: number): number[] {
  const n = points.length;
  if (n <= 1) return points.map((_, i) => i);

  const restants = new Set(points.map((_, i) => i));
  const ordre: number[] = [];
  let ici = depart ?? null;
  if (premier != null && premier >= 0 && premier < n) {
    ordre.push(premier);
    restants.delete(premier);
    ici = points[premier];
  }
  while (restants.size) {
    let meilleur = -1;
    let d = Infinity;
    for (const i of restants) {
      const di = ici ? distanceKm(ici, points[i]) : 0;
      if (di < d) {
        d = di;
        meilleur = i;
      }
    }
    ordre.push(meilleur);
    restants.delete(meilleur);
    ici = points[meilleur];
  }

  // 2-opt : on retourne un morceau du trajet tant que ça le raccourcit.
  const fixe = premier != null && ordre[0] === premier ? 1 : 0;
  let mieux = true;
  while (mieux) {
    mieux = false;
    for (let i = fixe; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const essai = [...ordre.slice(0, i), ...ordre.slice(i, j + 1).reverse(), ...ordre.slice(j + 1)];
        if (longueurTrajet(points, essai, depart) + 1e-9 < longueurTrajet(points, ordre, depart)) {
          ordre.splice(0, n, ...essai);
          mieux = true;
        }
      }
    }
  }
  return ordre;
}

/** Liens de navigation vers un point, pour les applis du téléphone. */
export function liensNavigation(p: Point) {
  const ll = `${p.lat},${p.lon}`;
  return {
    plans: `http://maps.apple.com/?daddr=${ll}&dirflg=d`,
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`,
    waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
  };
}
