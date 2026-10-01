import {
  CONSTATS,
  FOURNITURES_FREQUENTES,
  LIBELLE_RESULTAT,
  MESURES,
  RESULTATS,
  dureeDepuis,
  duree,
  etatMesure,
  verifierFiche,
  type DefinitionMesure,
  type ResultatFiche,
} from '@chantio/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Apparition, Pop, Segment } from '@/components/Anime';
import { PastilleHorsLigne } from '@/components/Bandeau';
import { Bouton, BoutonRond } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { Champ } from '@/components/Champ';
import { Ecran } from '@/components/Ecran';
import { Icone, type NomIcone } from '@/components/Icone';
import { PhotoGrille } from '@/components/PhotoGrille';
import { SignaturePad } from '@/components/SignaturePad';
import { Quantite, Stepper, Vider } from '@/components/Stepper';
import { Texte, Titre } from '@/components/Texte';
import { GrilleTuiles, Tuile } from '@/components/Tuile';
import {
  enregistrerBrouillon,
  lireBrouillon,
  nouveauBrouillon,
  versFiche,
  type Brouillon,
} from '@/lib/brouillons';
import { choisirPhotos, supprimerPhotoLocale } from '@/lib/photos';
import { useSession } from '@/lib/session';
import { c, polices, serre } from '@/lib/theme';

const ETAPES = ['Constat', 'Mesures', 'Pièces', 'Résultat'];

const ICONE_CONSTAT: Partial<Record<string, NomIcone>> = {
  Fuite: 'goutte',
  'Joint usé': 'cle_molette',
  'Pièce cassée': 'boite',
  Entartrage: 'couches',
  'Pression basse': 'jauge',
  'Mauvaise combustion': 'flamme',
  'Problème électrique': 'alerte',
  RAS: 'check',
};

const ICONE_RESULTAT: Record<ResultatFiche, NomIcone> = {
  termine: 'check',
  a_reprendre: 'refaire',
  attente_piece: 'boite',
  devis_a_etablir: 'fichier',
};

const DEPART_MESURE: Record<string, number> = { co: 0, co2: 9, t_fumees: 100, pression: 1.5 };

const nombre = (n: number) => String(n).replace('.', ',');
function aideMesure(d: DefinitionMesure) {
  if (d.min != null && d.max != null) return `Attendu entre ${nombre(d.min)} et ${nombre(d.max)} ${d.unite}`;
  if (d.max != null) return `Alerte au-dessus de ${nombre(d.max)} ${d.unite}`;
  return 'Facultatif';
}

export default function FicheGuidee() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSession();
  const intervention = s.interventions.find((i) => i.id === id);
  const [b, setB] = useState<Brouillon | null>(null);
  const [photosEnCours, setPhotosEnCours] = useState<'avant' | 'apres' | null>(null);
  const [signe, setSigne] = useState(false);
  const [cleSignature, setCleSignature] = useState(0);
  const [nouvellePiece, setNouvellePiece] = useState('');
  const [manques, setManques] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const fini = useRef(false);
  const dernier = useRef<Brouillon | null>(null);
  const defilement = useRef<ScrollView>(null);

  // Chargement du brouillon (ou création au premier passage).
  useEffect(() => {
    lireBrouillon(id).then((existant) => {
      const brouillon = existant ?? nouveauBrouillon(id);
      if (!existant) enregistrerBrouillon(brouillon);
      setB(brouillon);
    });
  }, [id]);

  // Sauvegarde locale à chaque modification (et tout de suite si l'appli passe en arrière-plan).
  useEffect(() => {
    dernier.current = b;
    if (!b || fini.current) return;
    const t = setTimeout(() => enregistrerBrouillon(b), 300);
    return () => clearTimeout(t);
  }, [b]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (e) => {
      if (e !== 'active' && dernier.current && !fini.current) enregistrerBrouillon(dernier.current);
    });
    return () => {
      sub.remove();
      if (dernier.current && !fini.current) enregistrerBrouillon(dernier.current);
    };
  }, []);

  const maj = useCallback((f: (x: Brouillon) => Partial<Brouillon>) => {
    setB((x) => (x ? { ...x, ...f(x) } : x));
  }, []);

  if (!b) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.fond }}>
        <ActivityIndicator size="large" color={c.cobalt} />
      </View>
    );
  }

  const allerA = (etape: number) => {
    if (etape === 3 && b.dureeMinutes == null) maj((x) => ({ dureeMinutes: dureeDepuis(new Date(x.debut)) }));
    maj(() => ({ etape }));
    setManques([]);
    defilement.current?.scrollTo({ y: 0, animated: false });
  };

  const ajouterPhotos = async (categorie: 'avant' | 'apres', origine: 'camera' | 'galerie') => {
    setMessage(null);
    setPhotosEnCours(categorie);
    try {
      const nouvelles = await choisirPhotos(origine);
      maj((x) => ({ photos: [...x.photos, ...nouvelles.map((p) => ({ ...p, categorie }))] }));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "La photo n'a pas pu être ajoutée.");
    } finally {
      setPhotosEnCours(null);
    }
  };
  const retirerPhoto = (photoId: string) => {
    const p = b.photos.find((x) => x.id === photoId);
    if (p) supprimerPhotoLocale(p.uri);
    maj((x) => ({ photos: x.photos.filter((y) => y.id !== photoId) }));
  };

  const envoyer = async () => {
    const entrepriseId = s.profil?.entreprise.id;
    if (!entrepriseId) return;
    const problemes = verifierFiche(versFiche(b, entrepriseId));
    if (problemes.length) {
      setManques(problemes);
      setTimeout(() => defilement.current?.scrollToEnd({ animated: true }), 50);
      return;
    }
    setEnvoi(true);
    fini.current = true;
    try {
      const resultat = await s.envoyerFiche(b);
      router.replace({
        pathname: '/envoyee',
        params: { etat: resultat, client: intervention?.client?.nom ?? '', resultat: b.resultat, id },
      });
    } catch (e) {
      fini.current = false;
      setEnvoi(false);
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const etape = b.etape;
  // Liste recalculée en direct : un manque corrigé disparaît tout de suite.
  const manquesActuels = manques.length && s.profil ? verifierFiche(versFiche(b, s.profil.entreprise.id)) : [];
  const mesuresVides = !Object.values(b.mesures).some((v) => v != null);
  const derniere = etape === ETAPES.length - 1;
  const nbPieces = b.pieces.reduce((t, p) => t + p.quantite, 0);
  const etatCo = etatMesure('co', b.mesures.co);

  const barre = (
    <>
      {etape > 0 && <BoutonRond grand icone="gauche" label="Étape précédente" onPress={() => allerA(etape - 1)} />}
      <Bouton
        style={{ flex: 1 }}
        titre={derniere ? 'Envoyer la fiche' : etape === 1 && mesuresVides ? 'Passer' : 'Suivant'}
        icone={derniere ? 'envoyer' : 'droite'}
        chargement={envoi}
        desactive={!!photosEnCours}
        onPress={derniere ? envoyer : () => allerA(etape + 1)}
      />
    </>
  );

  return (
    <Ecran barre={barre} defilement={!signe} scrollRef={defilement}>
      <View style={styles.entete}>
        <BoutonRond rond icone="x" label="Fermer la fiche (elle reste enregistrée)" onPress={() => router.back()} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.petit} numberOfLines={1}>
            Étape {etape + 1} sur {ETAPES.length}
          </Text>
          <Text style={styles.nomEtape} numberOfLines={1}>{ETAPES[etape]}</Text>
        </View>
        {s.horsLigne && <PastilleHorsLigne />}
      </View>
      <View style={styles.progression}>
        {ETAPES.map((e, i) => (
          <Segment key={e} rempli={i <= etape} fond={c.trait} couleur={c.cobalt} style={styles.segment} />
        ))}
      </View>

      {message ? (
        <Carte alerte>
          <Texte style={{ color: c.rouge, fontFamily: polices.texte700 }}>{message}</Texte>
        </Carte>
      ) : null}

      {etape === 0 && (
        <>
          <Apparition>
            <Titre>Tu as trouvé quoi ?</Titre>
          </Apparition>
          <GrilleTuiles>
            {CONSTATS.map((k) => (
              <Tuile
                key={k}
                texte={k}
                icone={ICONE_CONSTAT[k]}
                choisie={b.constat.includes(k)}
                onPress={() =>
                  maj((x) => ({ constat: x.constat.includes(k) ? x.constat.filter((y) => y !== k) : [...x.constat, k] }))
                }
              />
            ))}
          </GrilleTuiles>
          <Apparition rang={5} style={{ gap: 14 }}>
          <Champ
            label="Précisions"
            indice="(facultatif)"
            multiligne
            value={b.constatDetail}
            onChangeText={(t) => maj(() => ({ constatDetail: t }))}
            placeholder="Fuite au raccord du flexible, traces anciennes…"
          />
          <Texte variante="etiquette">Photos avant</Texte>
          <PhotoGrille
            photos={b.photos.filter((p) => p.categorie === 'avant')}
            onAjouter={(o) => ajouterPhotos('avant', o)}
            onRetirer={retirerPhoto}
            enCours={photosEnCours === 'avant' ? 1 : 0}
          />
          </Apparition>
        </>
      )}

      {etape === 1 && (
        <>
          <Apparition style={{ gap: 4 }}>
            <Titre>Mesures</Titre>
            <Texte variante="doux" style={{ fontSize: 17 }}>Facultatif. Laisse vide s'il n'y a rien à mesurer.</Texte>
          </Apparition>
          {MESURES.map((d, n) => {
            const v = b.mesures[d.code];
            const e = etatMesure(d.code, v);
            return (
              <Apparition key={d.code} rang={n + 1}>
                <Carte style={styles.mesure}>
                  <View style={styles.ligneMesure}>
                    <Texte variante="fort" style={{ flex: 1 }}>{d.libelle}</Texte>
                    {e === 'ok' && <Etiquette texte="Conforme" icone="check" fond={c.vertDoux} couleur={c.vert} />}
                    {e === 'alerte' && <Etiquette texte="Alerte" icone="alerte" fond={c.rougeDoux} couleur={c.rouge} />}
                  </View>
                  <Stepper
                    label={d.libelle}
                    valeur={v}
                    pas={d.pas}
                    unite={d.unite}
                    depart={DEPART_MESURE[d.code] ?? 0}
                    onChange={(x) => maj((y) => ({ mesures: { ...y.mesures, [d.code]: x } }))}
                  />
                  <View style={styles.ligneMesure}>
                    <Texte variante="doux" style={{ fontSize: 15, flex: 1 }}>{aideMesure(d)}</Texte>
                    {v != null && <Vider onPress={() => maj((x) => ({ mesures: { ...x.mesures, [d.code]: null } }))} />}
                  </View>
                </Carte>
              </Apparition>
            );
          })}
        </>
      )}

      {etape === 2 && (
        <>
          <Apparition>
            <Titre>Pièces posées</Titre>
          </Apparition>
          {!b.pieces.length && (
            <Apparition rang={1}>
              <Texte variante="doux" style={{ fontSize: 17 }}>
                Aucune pièce pour l'instant. Touche une pièce courante ou écris son nom.
              </Texte>
            </Apparition>
          )}
          {b.pieces.map((p, n) => (
            <Apparition key={`${p.designation}-${n}`} rang={n + 1}>
              <View style={styles.piece}>
                <Texte variante="fort" style={{ flex: 1 }}>{p.designation}</Texte>
                <Quantite
                  label={`Quantité de ${p.designation}`}
                  valeur={p.quantite}
                  onChange={(q) =>
                    maj((x) => ({
                      pieces: q === 0 ? x.pieces.filter((_, k) => k !== n) : x.pieces.map((y, k) => (k === n ? { ...y, quantite: q } : y)),
                    }))
                  }
                />
              </View>
            </Apparition>
          ))}
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Champ
                value={nouvellePiece}
                onChangeText={setNouvellePiece}
                placeholder="Nom de la pièce"
                returnKeyType="done"
                onSubmitEditing={() => {
                  const d = nouvellePiece.trim();
                  if (d) maj((x) => ({ pieces: [...x.pieces, { designation: d, quantite: 1 }] }));
                  setNouvellePiece('');
                }}
              />
            </View>
            <BoutonRond
              grand
              icone="plus"
              label="Ajouter la pièce"
              fond={c.cobalt}
              couleur={c.blanc}
              onPress={() => {
                const d = nouvellePiece.trim();
                if (d) maj((x) => ({ pieces: [...x.pieces, { designation: d, quantite: 1 }] }));
                setNouvellePiece('');
              }}
            />
          </View>
          <Texte variante="section" style={{ marginTop: 8 }}>Pièces courantes</Texte>
          <GrilleTuiles>
            {FOURNITURES_FREQUENTES.map((f) => {
              const presente = b.pieces.some((p) => p.designation === f);
              return (
                <Tuile
                  key={f}
                  texte={f}
                  choisie={presente}
                  onPress={() =>
                    maj((x) => ({
                      pieces: presente
                        ? x.pieces.filter((p) => p.designation !== f)
                        : [...x.pieces, { designation: f, quantite: 1 }],
                    }))
                  }
                />
              );
            })}
          </GrilleTuiles>
        </>
      )}

      {etape === 3 && (
        <>
          <Apparition>
            <Titre>C'est terminé ?</Titre>
          </Apparition>
          <GrilleTuiles>
            {RESULTATS.map((r) => (
              <Tuile key={r} texte={r === 'termine' ? 'Oui, terminé' : LIBELLE_RESULTAT[r]} icone={ICONE_RESULTAT[r]} choisie={b.resultat === r} onPress={() => maj(() => ({ resultat: r }))} />
            ))}
          </GrilleTuiles>
          <Apparition rang={3} style={styles.puces}>
            {b.dureeMinutes != null && <PuceResume icone="horloge" texte={duree(b.dureeMinutes)} />}
            {nbPieces > 0 && <PuceResume icone="boite" texte={`${nbPieces} pièce${nbPieces > 1 ? 's' : ''}`} />}
            {etatCo === 'ok' && <PuceResume icone="check" texte="CO conforme" />}
            {etatCo === 'alerte' && <PuceResume icone="alerte" texte="CO en alerte" alerte />}
          </Apparition>
          {b.resultat !== 'termine' && (
            <Champ
              label="Ce qu'il reste à faire"
              multiligne
              value={b.aPrevoir}
              onChangeText={(t) => maj(() => ({ aPrevoir: t }))}
              placeholder="Pièce à commander, revenir jeudi…"
            />
          )}
          <Champ
            label="Travaux réalisés"
            multiligne
            value={b.travaux}
            onChangeText={(t) => maj(() => ({ travaux: t }))}
            placeholder="Nettoyage du brûleur, remplacement du joint…"
          />

          <Carte style={{ padding: 16 }}>
            <View style={styles.ligneMesure}>
              <Icone nom="horloge" taille={22} couleur={c.cobalt} />
              <Texte variante="fort" style={{ flex: 1 }}>Temps passé</Texte>
            </View>
            <Stepper label="Temps passé en minutes" valeur={b.dureeMinutes} pas={5} min={0} unite="min" depart={5} onChange={(n) => maj(() => ({ dureeMinutes: n }))} />
          </Carte>

          <Texte variante="etiquette">Photos après</Texte>
          <PhotoGrille
            photos={b.photos.filter((p) => p.categorie === 'apres')}
            onAjouter={(o) => ajouterPhotos('apres', o)}
            onRetirer={retirerPhoto}
            enCours={photosEnCours === 'apres' ? 1 : 0}
          />

          <Carte style={{ padding: 16 }}>
            {b.clientAbsent ? (
              <>
                <Texte variante="fort">Client absent ou refus de signer</Texte>
                <Champ
                  value={b.motifAbsence}
                  onChangeText={(t) => maj(() => ({ motifAbsence: t }))}
                  placeholder="Ex. : client absent, clés laissées au gardien"
                />
                <Lien texte="Faire signer le client" onPress={() => maj(() => ({ clientAbsent: false }))} />
              </>
            ) : (
              <>
                <View style={styles.ligneMesure}>
                  <Texte variante="fort" style={{ flex: 1, fontSize: 16 }}>
                    Signature {intervention?.client?.nom ? `de ${intervention.client.nom}` : 'du client'}
                  </Texte>
                  <Lien
                    texte="Effacer"
                    onPress={() => {
                      maj(() => ({ signature: null }));
                      setCleSignature((k) => k + 1);
                    }}
                  />
                </View>
                <SignaturePad
                  key={cleSignature}
                  valeur={b.signature}
                  onChange={(t) => maj(() => ({ signature: t }))}
                  onDebut={() => setSigne(true)}
                  onFin={() => setSigne(false)}
                />
                <Champ
                  value={b.signataireNom}
                  onChangeText={(t) => maj(() => ({ signataireNom: t }))}
                  placeholder="Nom de la personne qui signe"
                  autoCapitalize="words"
                />
              </>
            )}
          </Carte>
          {!b.clientAbsent && (
            <View style={{ alignItems: 'center' }}>
              <Lien texte="Client absent ou refuse de signer" onPress={() => maj(() => ({ clientAbsent: true }))} />
            </View>
          )}

          {manquesActuels.length > 0 && (
            <Carte alerte>
              <Texte variante="fort" style={{ color: c.rouge }}>Avant d'envoyer :</Texte>
              {manquesActuels.map((m) => (
                <Texte key={m} style={{ color: c.rouge }}>• {m}</Texte>
              ))}
            </Carte>
          )}
        </>
      )}
    </Ecran>
  );
}

/** Étiquette « Conforme » / « Alerte » à côté d'une mesure. */
function Etiquette({ texte, icone, fond, couleur }: { texte: string; icone: NomIcone; fond: string; couleur: string }) {
  return (
    <Pop style={[styles.etiquette, { backgroundColor: fond }]}>
      <Icone nom={icone} taille={15} epaisseur={3} couleur={couleur} />
      <Text style={{ fontFamily: polices.texte700, fontSize: 14, color: couleur }}>{texte}</Text>
    </Pop>
  );
}

/** Puce bleue du résumé (durée, pièces, CO), rouge pâle en cas d'alerte. */
function PuceResume({ icone, texte, alerte }: { icone: NomIcone; texte: string; alerte?: boolean }) {
  const couleur = alerte ? c.rouge : c.puceTexte;
  return (
    <View style={[styles.puceResume, alerte && { backgroundColor: c.rougeDoux }]}>
      <Icone nom={icone} taille={17} epaisseur={2.6} couleur={couleur} />
      <Text style={{ fontFamily: polices.texte700, fontSize: 15, color: couleur }}>{texte}</Text>
    </View>
  );
}

function Lien({ texte, onPress }: { texte: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={10} style={{ paddingVertical: 6 }}>
      <Texte variante="fort" style={{ fontSize: 17, color: c.cobalt, textDecorationLine: 'underline' }}>{texte}</Texte>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  entete: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  petit: { fontFamily: polices.texte600, fontSize: 15, lineHeight: 18, color: c.gris },
  nomEtape: { fontFamily: polices.titre, fontSize: 22, lineHeight: 27, letterSpacing: serre(22), color: c.encre },
  progression: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  segment: { flex: 1, height: 7, borderRadius: 4 },
  ligneMesure: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mesure: { borderRadius: 22, paddingVertical: 14, paddingHorizontal: 16, gap: 6 },
  etiquette: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  piece: { backgroundColor: c.blanc, borderWidth: 1, borderColor: c.trait, borderRadius: 20, paddingVertical: 14, paddingLeft: 16, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  puces: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  puceResume: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.puce, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
