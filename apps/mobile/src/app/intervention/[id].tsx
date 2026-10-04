import {
  LIBELLE_STATUT_TERRAIN,
  LIBELLE_TYPE,
  TON_STATUT,
  adresseComplete,
  aujourdhui,
  dateCourte,
  numeroIntervention,
  periode,
} from '@chantio/shared';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Apparition, Appui } from '@/components/Anime';
import { Bandeau } from '@/components/Bandeau';
import { BandeauEnvoi } from '@/components/BandeauEnvoi';
import { Bouton, BoutonRond } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { Ecran } from '@/components/Ecran';
import { Icone, type NomIcone } from '@/components/Icone';
import { BadgeUrgence, Puce } from '@/components/Puce';
import { Texte, Titre } from '@/components/Texte';
import { lireBrouillon } from '@/lib/brouillons';
import type { InterventionVue } from '@/lib/donnees';
import { heureCourte } from '@/lib/horaires';
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
  else if (close) action = <Bouton titre="Fiche envoyée" iconeAvant="check" desactive variante="secondaire" style={{ flex: 1 }} />;
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

  const faits = [...(i.site?.acces ?? '').split(/\s*·\s*/), i.site?.gardien ? `Gardien : ${i.site.gardien}` : ''].filter(Boolean);
  // Dans un immeuble, on appelle l'occupant chez qui on intervient, pas le syndic.
  const telephone = i.occupant?.telephone ?? i.client?.telephone ?? null;
  const contact = i.occupant ? [i.occupant.nom, i.occupant.lot].filter(Boolean).join(' · ') : i.client?.contact;
  const termine = ['terminee', 'validee', 'facturee'].includes(i.statut);
  let rang = 0;

  return (
    <Ecran barre={action}>
      <View style={styles.haut}>
        <BoutonRond rond icone="gauche" label="Retour" onPress={() => router.back()} />
        <Text style={styles.numero}>{numeroIntervention(i)}</Text>
      </View>
      <BandeauEnvoi />

      <Apparition rang={rang++}>
        <Carte style={{ borderRadius: 24, padding: 18, gap: 6 }}>
          <Text style={styles.surtitre}>
            {[LIBELLE_TYPE[i.type], ...(periode(i) ? [periode(i)] : [heureCourte(i.heure_prevue), i.date_prevue === aujourdhui() ? null : dateCourte(i.date_prevue)])]
              .filter((x) => x && x !== '--:--')
              .join(' · ')}
          </Text>
          <Titre taille={30} style={{ marginTop: 2 }}>{i.client?.nom ?? 'Client'}</Titre>
          {adresse ? <Texte style={{ fontSize: 18 }}>{adresse}</Texte> : null}
          {(i.statut !== 'planifiee' || i.urgence !== 'normale') && (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {i.statut !== 'planifiee' && (
                <Puce texte={LIBELLE_STATUT_TERRAIN[i.statut]} ton={TON_STATUT[i.statut]} icone={termine ? 'check' : undefined} />
              )}
              <BadgeUrgence urgence={i.urgence} />
            </View>
          )}
          {faits.length > 0 && (
            <View style={styles.faits}>
              {faits.map((f) => (
                <View key={f} style={styles.fait}>
                  <Icone nom={iconeAcces(f)} taille={18} couleur={c.cobalt} epaisseur={2.4} />
                  <Text style={styles.faitTexte}>{f}</Text>
                </View>
              ))}
            </View>
          )}
          {adresse || telephone ? (
            <View style={styles.deux}>
              {adresse ? <Fantome icone="aller" texte="Y aller" onPress={() => ouvrirCarte(adresse)} /> : null}
              {telephone ? <Fantome icone="telephone" texte="Appeler" onPress={() => appeler(telephone)} /> : null}
            </View>
          ) : null}
        </Carte>
      </Apparition>

      <Apparition rang={rang++}>
        <Carte style={styles.carteLigne}>
          <View style={styles.ti}>
            <Icone nom={ICONE_TYPE[i.type] ?? 'cle_molette'} taille={26} couleur={c.cobalt} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Texte variante="fort">{i.motif}</Texte>
            {i.description ? <Texte variante="doux" style={{ fontSize: 15 }}>{i.description}</Texte> : null}
          </View>
        </Carte>
      </Apparition>

      {i.site?.consignes ? (
        <Apparition rang={rang++}>
          <View style={styles.mot}>
            <Icone nom="info" taille={20} couleur={c.cobalt} />
            <View style={{ flex: 1 }}>
              <Text style={styles.motTitre}>Mot du bureau</Text>
              <Text style={styles.motTexte}>{i.site.consignes}</Text>
            </View>
          </View>
        </Apparition>
      ) : null}

      {contact ? (
        <Apparition rang={rang++}>
          <Carte style={styles.carteLigne}>
            <View style={styles.ti}>
              <Icone nom="telephone" taille={24} couleur={c.cobalt} />
            </View>
            <View style={{ flex: 1 }}>
              <Texte variante="doux" style={{ fontSize: 15 }}>{i.occupant ? 'Occupant à appeler' : 'Contact sur place'}</Texte>
              <Texte variante="fort">{contact}</Texte>
              {i.occupant?.telephone ? <Texte variante="doux" style={{ fontSize: 15 }}>{i.occupant.telephone}</Texte> : null}
            </View>
          </Carte>
        </Apparition>
      ) : null}

      <Apparition rang={rang++}>
        <Carte style={styles.carteLigne}>
          <View style={styles.ti}>
            <Icone nom="personne" taille={24} couleur={c.cobalt} />
          </View>
          <View style={{ flex: 1 }}>
            <Texte variante="doux" style={{ fontSize: 15 }}>Intervenants</Texte>
            <Texte variante="fort">{i.intervenants.map((m) => m.prenom).join(', ') || 'Pas encore attribuée'}</Texte>
          </View>
        </Carte>
      </Apparition>

      {apprenti && !close ? <Bandeau texte="La fiche est remplie par le technicien avec qui tu travailles." /> : null}
    </Ecran>
  );
}

const ICONE_TYPE: Partial<Record<InterventionVue['type'], NomIcone>> = {
  entretien: 'flamme',
  depannage: 'cle_molette',
  sav: 'cle_molette',
  installation: 'boite',
};

function iconeAcces(f: string): NomIcone {
  if (/^gardien/i.test(f)) return 'personne';
  if (/code|badge|cl[ée]/i.test(f)) return 'cle';
  if (/[ée]tage|niveau/i.test(f)) return 'couches';
  return 'info';
}

/** Bouton doux bleu pâle (« Y aller », « Appeler »). */
function Fantome({ icone, texte, onPress }: { icone: NomIcone; texte: string; onPress: () => void }) {
  return (
    <Appui accessibilityRole="button" onPress={onPress} echelle={0.96} style={styles.fantome}>
      <Icone nom={icone} taille={22} couleur={c.cobalt} />
      <Text style={styles.fantomeTexte}>{texte}</Text>
    </Appui>
  );
}

const styles = StyleSheet.create({
  haut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  numero: { fontFamily: polices.texte700, fontSize: 15, color: c.gris },
  surtitre: { fontFamily: polices.texte700, fontSize: 13, color: c.cobalt, textTransform: 'uppercase', letterSpacing: 1.05 },
  faits: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  fait: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.puce, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  faitTexte: { fontFamily: polices.texte700, fontSize: 15, color: c.puceTexte },
  deux: { flexDirection: 'row', gap: 10, marginTop: 8 },
  fantome: { flex: 1, height: 56, borderRadius: 16, backgroundColor: c.doux, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  fantomeTexte: { fontFamily: polices.texte800, fontSize: 17, color: c.encre },
  carteLigne: { borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 14 },
  ti: { width: 56, height: 56, borderRadius: 16, backgroundColor: c.doux, alignItems: 'center', justifyContent: 'center' },
  mot: { backgroundColor: c.puce, borderRadius: 22, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  motTitre: { fontFamily: polices.texte700, fontSize: 13, color: c.puceTexte, textTransform: 'uppercase', letterSpacing: 1.05, marginBottom: 2 },
  motTexte: { fontFamily: polices.texte, fontSize: 17, lineHeight: 23, color: c.encre },
});
