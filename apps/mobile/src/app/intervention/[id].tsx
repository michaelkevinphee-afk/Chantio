import {
  LIBELLE_STATUT_TERRAIN,
  LIBELLE_TYPE,
  TON_STATUT,
  adresseComplete,
  dateCourte,
  heure,
  numero,
} from '@chantio/shared';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Bandeau } from '@/components/Bandeau';
import { BandeauEnvoi } from '@/components/BandeauEnvoi';
import { Bouton, BoutonRond } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { Ecran } from '@/components/Ecran';
import { Icone } from '@/components/Icone';
import { BadgeUrgence, Puce } from '@/components/Puce';
import { Texte, Titre } from '@/components/Texte';
import { lireBrouillon } from '@/lib/brouillons';
import { appeler, ouvrirCarte } from '@/lib/liens';
import { useSession } from '@/lib/session';
import { c, polices } from '@/lib/theme';

export default function DetailIntervention() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSession();
  const i = s.interventions.find((x) => x.id === id);
  const [brouillon, setBrouillon] = useState(false);

  useFocusEffect(
    useCallback(() => {
      lireBrouillon(id).then((b) => setBrouillon(!!b));
    }, [id]),
  );

  if (!i) {
    return (
      <Ecran barre={<Bouton titre="Retour" onPress={() => router.back()} style={{ flex: 1 }} />}>
        <Titre style={{ marginTop: 24 }}>Introuvable</Titre>
        <Texte variante="doux">Cette intervention n'est plus dans ta liste. Elle a peut-être été déplacée par le bureau.</Texte>
      </Ecran>
    );
  }

  const adresse = adresseComplete(i.site);
  const enAttente = s.enAttente.some((o) => o.type === 'fiche' && o.fiche.intervention_id === i.id);
  const apprenti = s.profil?.membre.role === 'apprenti';
  const close = ['terminee', 'validee', 'facturee'].includes(i.statut);

  let action: React.ReactNode = null;
  if (enAttente) action = <Bouton titre="Fiche en attente d'envoi" desactive style={{ flex: 1 }} />;
  else if (close) action = <Bouton titre="Fiche envoyée" iconeAvant="check" desactive variante="blanc" style={{ flex: 1 }} />;
  else if (!apprenti) {
    const reprendre = brouillon || i.statut === 'en_cours';
    action = (
      <Bouton
        titre={reprendre ? 'Reprendre la fiche' : i.statut === 'a_reprendre' ? 'Nouvelle fiche' : 'Démarrer la fiche'}
        icone="droite"
        style={{ flex: 1 }}
        onPress={() => {
          s.demarrer(i);
          router.push({ pathname: '/fiche/[id]', params: { id: i.id } });
        }}
      />
    );
  }

  return (
    <Ecran barre={action}>
      <View style={styles.haut}>
        <BoutonRond icone="gauche" label="Retour" onPress={() => router.back()} />
        <Text style={styles.numero}>{numero(i.numero)}</Text>
      </View>
      <BandeauEnvoi />

      <Carte style={{ borderRadius: 26, padding: 20, gap: 8 }}>
        <Text style={styles.surtitre}>
          {[LIBELLE_TYPE[i.type], heure(i.heure_prevue), dateCourte(i.date_prevue)].filter(Boolean).join(' · ')}
        </Text>
        <Titre taille={34}>{i.client?.nom ?? 'Client'}</Titre>
        {adresse ? <Texte style={{ fontSize: 18 }}>{adresse}</Texte> : null}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <Puce texte={LIBELLE_STATUT_TERRAIN[i.statut]} ton={TON_STATUT[i.statut]} />
          <BadgeUrgence urgence={i.urgence} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          {adresse ? (
            <Bouton titre="Y aller" iconeAvant="aller" variante="marine" petit onPress={() => ouvrirCarte(adresse)} style={{ flexGrow: 1 }} />
          ) : null}
          {i.client?.telephone ? (
            <Bouton titre={i.client.telephone} iconeAvant="telephone" variante="marine" petit onPress={() => appeler(i.client!.telephone!)} style={{ flexGrow: 1 }} />
          ) : null}
        </View>
      </Carte>

      {i.site?.acces ? <Info icone="cle" titre="Accès" texte={i.site.acces} /> : null}
      {i.site?.consignes ? <Info icone="alerte" titre="Consignes" texte={i.site.consignes} jaune /> : null}
      {i.client?.contact ? <Info icone="telephone" titre="Contact sur place" texte={i.client.contact} /> : null}

      <Carte>
        <Texte variante="section">Motif</Texte>
        <Texte variante="fort" style={{ fontSize: 20 }}>{i.motif}</Texte>
        {i.description ? <Texte>{i.description}</Texte> : null}
      </Carte>

      <Carte>
        <Texte variante="section">Intervenants</Texte>
        <Texte variante="fort">{i.intervenants.map((m) => m.prenom).join(', ') || 'Pas encore attribuée'}</Texte>
      </Carte>

      {apprenti && !close ? <Bandeau texte="La fiche est remplie par le technicien avec qui tu travailles." /> : null}
    </Ecran>
  );
}

function Info({ icone, titre, texte, jaune }: { icone: 'cle' | 'alerte' | 'telephone'; titre: string; texte: string; jaune?: boolean }) {
  return (
    <View style={[styles.info, jaune && { backgroundColor: c.jauneDoux }]}>
      <View style={styles.infoIcone}>
        <Icone nom={icone} taille={22} couleur={c.marine} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Texte variante="doux" style={{ fontSize: 15 }}>{titre}</Texte>
        <Texte variante="fort">{texte}</Texte>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  haut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  numero: { fontFamily: polices.texte700, fontSize: 15, color: c.texteDoux },
  surtitre: { fontFamily: polices.texte700, fontSize: 13, color: c.texteDoux, textTransform: 'uppercase', letterSpacing: 1 },
  info: { backgroundColor: c.blanc, borderRadius: 22, padding: 14, flexDirection: 'row', gap: 14, alignItems: 'center' },
  infoIcone: { width: 48, height: 48, borderRadius: 15, backgroundColor: c.beton, alignItems: 'center', justifyContent: 'center' },
});
