import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import type { Etape } from '@/lib/tournee';
import { c, ombres, polices } from '@/lib/theme';
import type { Point } from '@chantio/shared';

const HAUTEUR = 340;
const versCoord = (p: Point) => ({ latitude: p.lat, longitude: p.lon });

/**
 * Carte de la tournée : une pastille numérotée par chantier, reliées dans l'ordre
 * conseillé. Plans d'Apple sur iPhone, Google Maps sur Android (aucune clé dans Expo Go).
 */
export function CarteTournee({ etapes, depart, onChoisir }: { etapes: Etape[]; depart: Point | null; onChoisir: (e: Etape) => void }) {
  const carte = useRef<MapView>(null);
  const coords = etapes.map((e) => versCoord(e.point));
  const cadre = [...(depart ? [versCoord(depart)] : []), ...coords];
  const cle = cadre.map((p) => `${p.latitude},${p.longitude}`).join('|');

  const cadrer = () => {
    if (!cadre.length) return;
    carte.current?.fitToCoordinates(cadre, { edgePadding: { top: 60, right: 50, bottom: 50, left: 50 }, animated: true });
  };
  useEffect(cadrer, [cle]);

  return (
    <View style={styles.cadre}>
      <MapView
        ref={carte}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: cadre[0]?.latitude ?? 48.8566, longitude: cadre[0]?.longitude ?? 2.3522, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
        onMapReady={cadrer}
        showsUserLocation
        showsPointsOfInterests={false}
        toolbarEnabled={false}
      >
        {coords.length > 1 && (
          <Polyline coordinates={[...(depart ? [versCoord(depart)] : []), ...coords]} strokeColor={c.cobalt} strokeWidth={4} lineDashPattern={[8, 8]} />
        )}
        {etapes.map((e) => (
          <Marker
            key={e.intervention.id}
            coordinate={versCoord(e.point)}
            anchor={{ x: 0.5, y: 0.5 }}
            title={`${e.rang}. ${e.intervention.client?.nom ?? e.intervention.motif}`}
            description={e.intervention.motif}
            onCalloutPress={() => onChoisir(e)}
          >
            <View style={[styles.pastille, e.intervention.statut === 'en_cours' && styles.enCours]}>
              <Text style={styles.numero}>{e.rang}</Text>
            </View>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: { height: HAUTEUR, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: c.trait, backgroundColor: c.doux, boxShadow: ombres.carte },
  pastille: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.cobalt,
    borderWidth: 3,
    borderColor: c.blanc,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enCours: { backgroundColor: c.menthe },
  numero: { fontFamily: polices.texte800, fontSize: 16, color: c.blanc },
});
