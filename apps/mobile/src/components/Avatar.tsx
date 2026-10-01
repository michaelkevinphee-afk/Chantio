import { initiales } from '@chantio/shared';
import { useState } from 'react';
import { Image, Text, View } from 'react-native';

import { c, polices } from '@/lib/theme';

/**
 * Photo de profil ronde cerclée de jaune (style v2), ou initiales
 * jaunes sur fond marine quand il n'y a pas de photo.
 * `espace` ajoute un liseré couleur fond entre la photo et l'anneau (grand format).
 */
export function Avatar({ uri, prenom, nom, taille = 56, anneau = 3, espace, fondEspace = c.beton }: {
  uri: string | null | undefined;
  prenom: string;
  nom?: string | null;
  taille?: number;
  anneau?: number;
  espace?: number;
  fondEspace?: string;
}) {
  const [echec, setEchec] = useState<string | null>(null);
  const photo = uri && uri !== echec ? uri : null;
  const e = espace ?? 0;
  const total = taille + 2 * (anneau + e);
  return (
    <View
      style={{ width: total, height: total, borderRadius: total / 2, backgroundColor: c.jaune, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="image"
      accessibilityLabel={photo ? `Photo de ${prenom}` : `Initiales de ${prenom}`}
    >
      <View
        style={{
          width: taille + 2 * e,
          height: taille + 2 * e,
          borderRadius: (taille + 2 * e) / 2,
          backgroundColor: fondEspace,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: taille,
            height: taille,
            borderRadius: taille / 2,
            overflow: 'hidden',
            backgroundColor: c.marine,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {photo ? (
            <Image source={{ uri: photo }} style={{ width: taille, height: taille }} resizeMode="cover" onError={() => setEchec(photo)} />
          ) : (
            <Text style={{ fontFamily: polices.titre, fontSize: taille * 0.4, color: c.jaune, letterSpacing: 0.5 }}>
              {initiales(prenom, nom)}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}
