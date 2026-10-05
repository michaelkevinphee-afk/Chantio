import { euro, euroAchat, jjmmaaaaBac, type Fournisseur, type LigneAchat } from '@chantio/shared';

const nb = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
const date = (iso: string | null) => (iso ? jjmmaaaaBac(iso) : '—');

/**
 * La facture redessinée à partir de ses informations (papierA() du bac), quand il n'y a pas de fichier à montrer :
 * fournisseur, « FACTURE N° … du … », « Facturé à », lignes, totaux, échéance, autoliquidation, IBAN.
 */
export function PapierAchat({
  achat,
  fournisseur,
  entreprise,
}: {
  achat: {
    numero: string;
    date_facture: string;
    echeance: string;
    avoir: boolean;
    montant_ht: number;
    taux_tva: number;
    montant_tva: number;
    reception: string;
    lignes: LigneAchat[];
  };
  fournisseur: Fournisseur | null;
  entreprise: { nom: string; adresse: string | null };
}) {
  const ttc = Math.round((achat.montant_ht + achat.montant_tva) * 100) / 100;
  const L = achat.lignes ?? [];
  return (
    <div className="af-papier">
      <div className="ap-tete">
        <div>
          <b className="text-base">{fournisseur?.nom || 'Fournisseur'}</b>
          {fournisseur?.adresse && (
            <>
              <br />
              {fournisseur.adresse}
            </>
          )}
          {fournisseur?.siret && (
            <>
              <br />
              SIRET {fournisseur.siret}
            </>
          )}
          {fournisseur?.tva_intracom && (
            <>
              <br />
              TVA {fournisseur.tva_intracom}
            </>
          )}
        </div>
        <div className="ap-cadre">
          <b>
            {achat.avoir ? 'AVOIR' : 'FACTURE'} N° {achat.numero || '—'}
          </b>
          <br />
          du {date(achat.date_facture)}
          {achat.reception === 'electronique' && (
            <>
              <br />
              <span className="mt-1.5 inline-block rounded-full bg-vert-doux px-2 py-px text-[11px] font-bold text-vert">Factur-X</span>
            </>
          )}
        </div>
      </div>
      <div className="ap-dest">
        <small className="block text-[#5B6478]">Facturé à</small>
        <b>{entreprise.nom}</b>
        {entreprise.adresse && (
          <>
            <br />
            {entreprise.adresse}
          </>
        )}
      </div>
      <table className="ap-l">
        <thead>
          <tr>
            <th>Désignation</th>
            <th className="d">Qté</th>
            <th className="d">PU HT</th>
            <th className="d">Montant HT</th>
          </tr>
        </thead>
        <tbody>
          {L.length ? (
            L.map((l, i) => {
              const total = l.total_ht != null ? Number(l.total_ht) : Math.round((Number(l.quantite ?? 0) * Number(l.prix_unitaire_ht ?? 0)) * 100) / 100;
              return (
                <tr key={i}>
                  <td>{l.designation}</td>
                  <td className="d">{l.quantite != null ? nb(Number(l.quantite)) : ''}</td>
                  <td className="d">{l.prix_unitaire_ht != null ? euro(Number(l.prix_unitaire_ht)) : ''}</td>
                  <td className="d">{euro(total)}</td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={4} className="text-[#5B6478]">
                Détail des lignes sur le document original
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="ap-tot">
        <table>
          <tbody>
            <tr>
              <td>Total HT</td>
              <td className="d">{euroAchat(achat, achat.montant_ht)}</td>
            </tr>
            <tr>
              <td>TVA {String(achat.taux_tva).replace('.', ',')} %</td>
              <td className="d">{euroAchat(achat, achat.montant_tva)}</td>
            </tr>
            <tr className="fort">
              <td>{achat.avoir ? 'Total de l’avoir' : 'Net à payer'}</td>
              <td className="d">{euroAchat(achat, ttc)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-[18px] text-[11.5px] text-[#5B6478]">
        {achat.echeance ? `Échéance : ${date(achat.echeance)}. ` : ''}
        {Number(achat.taux_tva) === 0 && !achat.avoir ? 'Autoliquidation : TVA due par le preneur. ' : ''}
        {fournisseur?.iban ? `IBAN : ${fournisseur.iban}` : ''}
      </p>
    </div>
  );
}
