// Le document tel qu'il part chez le client (A4) : aperçu en direct dans
// l'éditeur et page à imprimer en PDF. Sans état : utilisable côté serveur.

import {
  calculer,
  clauses,
  euro,
  nomClient,
  pourcent,
  texteMetre,
  titreDocument,
  type ClientDocument,
  type ConditionsDocument,
  type GenreDocument,
  type LigneDocument,
  type ReglagesFacturation,
  type TypeFacture,
} from '@chantio/shared';

export interface EntreprisePapier {
  nom: string;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  siret: string | null;
  metiers: string[];
  logo: string | null;
  facturation: ReglagesFacturation;
}

export interface DonneesPapier {
  genre: GenreDocument;
  type_facture: TypeFacture | null;
  numero: string | null;
  date_document: string;
  echeance?: string | null;
  client: ClientDocument;
  objet: string;
  conditions: ConditionsDocument;
  remise: number;
  pourcentage: number;
  avancement: number;
  avancement_precedent: number;
  situation_numero: number | null;
  lignes: LigneDocument[];
  refDevis?: string | null;
  refFacture?: string | null;
}

const dateFr = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const METIERS: Record<string, string> = {
  plomberie: 'Plomberie',
  chauffage: 'Chauffage',
  climatisation: 'Génie climatique',
  sanitaire: 'Sanitaire',
  electricite: 'Électricité',
};

/** Désignation imprimée : n° de poste du client (DPGF) et détail du métré, jamais les coûts. */
function Designation({ l }: { l: LigneDocument }) {
  return (
    <>
      {l.reference && <span className="ref-poste">{l.reference}</span>}
      {l.designation}
      {l.metre && <div className="metre-p">Métré : {texteMetre(l.metre, l.unite)}</div>}
    </>
  );
}

export function Papier({ d, entreprise, flash }: { d: DonneesPapier; entreprise: EntreprisePapier; flash?: number }) {
  const T = calculer(d);
  const facture = d.genre === 'facture';
  const tf = d.type_facture;
  const situation = facture && tf === 'situation';
  const signe = facture && tf === 'avoir' ? -1 : 1;
  const cl = d.client;
  const pro = cl.type === 'pro';
  const c = d.conditions;
  const f = entreprise.facturation;
  const titre = titreDocument(d.genre, tf, d.situation_numero);
  const L = clauses({ genre: d.genre, date: dateFr(d.date_document), client: cl, conditions: c }, T);
  const slogan = f.slogan || entreprise.metiers.map((m) => METIERS[m] ?? m).join(' · ');

  let bandeau: React.ReactNode = null;
  if (facture) {
    const avGlob = T.marcheHT ? (T.cumulSituation / T.marcheHT) * 100 : 0;
    bandeau = {
      acompte: (
        <>
          <span>
            Acompte sur {d.refDevis ? <b>{d.refDevis}</b> : 'le marché'}
          </span>
          <span>
            Marché {euro(T.marcheHT)} HT · <b>{pourcent(d.pourcentage)}</b>
          </span>
        </>
      ),
      avancement: (
        <>
          <span>
            Avancement global <b>{pourcent(d.avancement)}</b>
          </span>
          <span>
            Déjà facturé {pourcent(d.avancement_precedent)} · cette facture <b>{pourcent(Math.max(0, d.avancement - d.avancement_precedent))}</b>
          </span>
        </>
      ),
      situation: (
        <>
          <span>
            Travaux au <b>{dateFr(d.date_document)}</b>
            {d.refDevis ? ` · devis ${d.refDevis}` : ''}
          </span>
          <span>
            Avancement global <b>{pourcent(avGlob)}</b>
          </span>
        </>
      ),
      solde: (
        <>
          <span>
            Décompte final{d.refDevis ? <> · devis <b>{d.refDevis}</b></> : ''}
          </span>
          <span>
            Déjà facturé <b>{pourcent(d.avancement_precedent)}</b> · reste <b>{pourcent(100 - d.avancement_precedent)}</b>
          </span>
        </>
      ),
      totale: (
        <>
          <span>Travaux terminés</span>
          <span>{d.refDevis ? `Devis ${d.refDevis}` : ''}</span>
        </>
      ),
      avoir: (
        <>
          <span>
            Avoir sur la facture <b>{d.refFacture ?? 'à préciser'}</b>
          </span>
          <span>À déduire du prochain règlement ou remboursé</span>
        </>
      ),
    }[tf ?? 'totale'];
  }

  return (
    <>
      <div className="papier">
        <div className="haut">
          <div className="logo">
            {entreprise.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={entreprise.logo} alt="" style={{ height: 38, maxWidth: 120, objectFit: 'contain' }} />
            ) : (
              <span className="rond">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
                </svg>
              </span>
            )}
            <div>
              <b>{entreprise.nom}</b>
              <span>{slogan}</span>
            </div>
          </div>
          <div className="titre-doc">
            <b>{titre}</b>
            <span>{d.numero ?? 'Brouillon, sans numéro'}</span>
            <span>{dateFr(d.date_document)}</span>
            {facture && d.echeance && <span>Échéance {dateFr(d.echeance)}</span>}
          </div>
        </div>
        <div className="parties">
          <div className="partie">
            <small>Entreprise</small>
            <b>
              {entreprise.nom}
              {f.forme ? ` ${f.forme}` : ''}
            </b>
            <br />
            {entreprise.adresse && (
              <>
                {entreprise.adresse}
                <br />
              </>
            )}
            {[entreprise.telephone, entreprise.email].filter(Boolean).join(' · ')}
            <br />
            <span className="ref-pro">
              {f.siret || entreprise.siret ? `SIRET ${f.siret || entreprise.siret}` : 'SIRET à compléter dans les réglages'}
              {f.tva_intra ? ` · TVA ${f.tva_intra}` : ''}
              {f.rcs ? ` · ${f.rcs}` : ''}
              {f.capital ? ` · capital ${f.capital}` : ''}
            </span>
          </div>
          <div className="partie client">
            {pro ? (
              <>
                <small>Client professionnel</small>
                <b>{cl.raison || 'Entreprise à rechercher'}</b>
                <br />
                {cl.contact && (
                  <>
                    À l’attention de {cl.contact}
                    <br />
                  </>
                )}
                {cl.adresse}
                <br />
                <span className="ref-pro">
                  {cl.siret ? `SIRET ${cl.siret}` : 'SIRET à renseigner'}
                  {cl.tvaIntra && (
                    <>
                      <br />
                      TVA {cl.tvaIntra}
                    </>
                  )}
                  {cl.bdc && (
                    <>
                      <br />
                      Commande {cl.bdc}
                    </>
                  )}
                </span>
              </>
            ) : (
              <>
                <small>Client</small>
                <b>{nomClient(cl)}</b>
                <br />
                {cl.adresse}
                <br />
                {cl.tel}
                {cl.email && (
                  <>
                    <br />
                    {cl.email}
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div className="objet">
          <b>Objet :</b> {d.objet || 'à préciser'}
        </div>
        {!cl.identique && (
          <div className="objet">
            <b>Adresse du chantier :</b> {cl.adresseChantier || 'à renseigner'}
          </div>
        )}
        {!facture && c.ao && (
          <div className="objet">
            <b>Réponse à l’appel d’offres :</b> {c.aoConsultation || 'consultation à préciser'}
            {c.aoQuantites && ' · quantités du cadre de réponse du client'}
          </div>
        )}
        {bandeau && <div className="bandeau-sit">{bandeau}</div>}
        <table>
          <thead>
            {situation ? (
              <tr>
                <th>Désignation</th>
                <th className="dr">Marché HT</th>
                <th className="dr">Cumul</th>
                <th className="dr">Cumul HT</th>
                <th className="dr">Ce mois HT</th>
              </tr>
            ) : (
              <tr>
                <th>Désignation</th>
                <th className="dr">Qté</th>
                <th className="dr">P.U. HT</th>
                <th className="dr">TVA</th>
                <th className="dr">Total HT</th>
              </tr>
            )}
          </thead>
          <tbody>
            {!d.lignes.length && (
              <tr>
                <td colSpan={5} className="vide">
                  Ajoutez une première ligne depuis le catalogue.
                </td>
              </tr>
            )}
            {d.lignes.map((l, i) => {
              if (l.titre)
                return (
                  <tr key={i} className="section">
                    <td colSpan={5}>{l.designation}</td>
                  </tr>
                );
              const mt = l.quantite * l.prix_unitaire;
              const av = l.avancement ?? 0;
              const prec = l.avancement_precedent ?? 0;
              return situation ? (
                <tr key={i} className={i === flash ? 'flash' : ''}>
                  <td>
                    <Designation l={l} />
                  </td>
                  <td className="dr">{euro(mt)}</td>
                  <td className="dr">{av} %</td>
                  <td className="dr">{euro((mt * av) / 100)}</td>
                  <td className="dr">
                    <b>{euro((mt * Math.max(0, av - prec)) / 100)}</b>
                  </td>
                </tr>
              ) : (
                <tr key={i} className={i === flash ? 'flash' : ''}>
                  <td>
                    <Designation l={l} />
                  </td>
                  <td className="dr">
                    {String(+l.quantite.toFixed(3)).replace('.', ',')} {l.unite}
                  </td>
                  <td className="dr">{euro(l.prix_unitaire)}</td>
                  <td className="dr">{String(l.tva).replace('.', ',')} %</td>
                  <td className="dr">{euro(mt * signe)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="totaux">
          {facture && (tf === 'acompte' || tf === 'avancement' || tf === 'solde') ? (
            <>
              <div>
                <span>Montant du marché HT</span>
                <span>{euro(T.marcheHT)}</span>
              </div>
              {(tf === 'avancement' || tf === 'solde') && T.dejaFacture > 0 && (
                <div>
                  <span>Déjà facturé ({pourcent(d.avancement_precedent)})</span>
                  <span>− {euro(T.dejaFacture)}</span>
                </div>
              )}
              <div>
                <span>
                  <b>Montant de cette facture HT</b>
                </span>
                <span>
                  <b>{euro(T.ht)}</b>
                </span>
              </div>
            </>
          ) : situation ? (
            <>
              <div>
                <span>Cumul des travaux HT</span>
                <span>{euro(T.cumulSituation)}</span>
              </div>
              <div>
                <span>{d.situation_numero && d.situation_numero > 1 ? 'Situations précédentes' : 'Déjà facturé'}</span>
                <span>− {euro(T.dejaFacture)}</span>
              </div>
              <div>
                <span>
                  <b>Travaux du mois HT</b>
                </span>
                <span>
                  <b>{euro(T.ht)}</b>
                </span>
              </div>
            </>
          ) : (
            <>
              <div>
                <span>Total HT</span>
                <span>{euro(T.brut * signe)}</span>
              </div>
              {T.remise > 0 && (
                <>
                  <div>
                    <span>Remise {pourcent(d.remise)}</span>
                    <span>− {euro(T.remise)}</span>
                  </div>
                  <div>
                    <span>Net HT</span>
                    <span>{euro(T.ht)}</span>
                  </div>
                </>
              )}
            </>
          )}
          {T.autoliq ? (
            <div>
              <span>TVA autoliquidée</span>
              <span>0,00 €</span>
            </div>
          ) : (
            T.tva.map((x) => (
              <div key={x.taux}>
                <span>
                  TVA {String(x.taux).replace('.', ',')} % sur {euro(x.base)}
                </span>
                <span>{euro(x.montant)}</span>
              </div>
            ))
          )}
          <div className="ttc">
            <span>{T.autoliq ? 'Total net HT' : 'Total TTC'}</span>
            <span>{euro(T.ttc)}</span>
          </div>
          {T.retenue > 0 && (
            <div className="retenue">
              <span>Retenue de garantie 5 %</span>
              <span>− {euro(T.retenue)}</span>
            </div>
          )}
          {T.aide > 0 && (
            <div className="retenue">
              <span>Prime {c.aideOrga} déduite</span>
              <span>− {euro(T.aide)}</span>
            </div>
          )}
          {(T.retenue > 0 || T.aide > 0) && (
            <div className="net">
              <span>{T.aide ? 'Reste à payer' : 'Net à payer'}</span>
              <span>{euro(T.net)}</span>
            </div>
          )}
          {!facture && c.echeancier === 'acompte' && (
            <div className="acompte">
              <span>Acompte {c.acompte} % à la signature</span>
              <span>{euro((T.net * Number(c.acompte)) / 100)}</span>
            </div>
          )}
          {!facture && c.echeancier === '303040' && (
            <div className="acompte">
              <span>30 % · 40 % · 30 %</span>
              <span>{euro(T.net * 0.3)}</span>
            </div>
          )}
        </div>
        <div className="bas">
          <div className="mentions">
            {c.decennale && `Assurance décennale : ${c.assureur}, ${c.contrat}, ${c.zone}. `}
            Conditions particulières en page 2.
            {T.autoliq && ' Autoliquidation, art. 283-2 nonies du CGI.'}
            {facture && f.iban && ` IBAN ${f.iban}${f.bic ? ` · BIC ${f.bic}` : ''}.`}
          </div>
          {facture ? (
            <div className="signature" style={{ borderStyle: 'solid', borderColor: 'var(--trait)' }}>
              <b style={{ color: 'var(--encre)', fontSize: 9 }}>{tf === 'avoir' ? 'Remboursement' : 'Paiement'}</b>
              <br />
              {c.delai}
              <br />
              {[c.virement && 'Virement', c.cheque && 'chèque', c.carte && 'carte'].filter(Boolean).join(', ')}
            </div>
          ) : (
            <div className="signature">Date, signature et mention « Bon pour accord »</div>
          )}
        </div>
        <div className="pied">
          {entreprise.nom}
          {entreprise.adresse ? ` · ${entreprise.adresse}` : ''} · Document créé avec Chantio
        </div>
        <div className="num-page">Page 1 sur 2</div>
      </div>
      <div className="papier page2">
        <h3>Conditions particulières</h3>
        <ol>
          {L.map(([t, x]) => (
            <li key={t}>
              <b>{t}.</b> {x}
            </li>
          ))}
        </ol>
        <div className="num-page">Page 2 sur 2</div>
      </div>
    </>
  );
}

export function nombreClauses(d: DonneesPapier) {
  const T = calculer(d);
  return clauses({ genre: d.genre, date: dateFr(d.date_document), client: d.client, conditions: d.conditions }, T).length;
}
