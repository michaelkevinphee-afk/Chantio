import { euroBac, type prevuRealise } from '@chantio/shared';
import { SECTION, TITRE_SECTION } from './styles';

const heures = (h: number) => `${String(Math.round(h * 100) / 100).replace('.', ',')} h`;

/**
 * « Prévu contre réalisé » (jamais montré au client), comme le bac : heures et fournitures prévues au devis signé,
 * ou à une visite du contrat d'entretien, comparées à la fiche (en rouge quand on dépasse).
 */
export function PrevuRealise({ pr, source }: { pr: ReturnType<typeof prevuRealise>; source: string }) {
  const tuiles = [
    { titre: 'Heures', prevu: `${heures(pr.heuresPrevues)} prévues`, reel: `${heures(pr.heuresPassees)} passées`, depasse: pr.heuresPassees > pr.heuresPrevues },
    {
      titre: 'Fournitures',
      prevu: `${euroBac(pr.fournituresPrevues, 0)} prévues`,
      reel: `${euroBac(pr.fournituresUtilisees, 0)} utilisées`,
      depasse: pr.fournituresUtilisees > pr.fournituresPrevues,
    },
  ];
  return (
    <section className={SECTION}>
      <h3 className={TITRE_SECTION}>
        Prévu contre réalisé <span className="text-[11px] font-bold text-violet">🔒 bureau</span>
      </h3>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2">
        {tuiles.map((t) => (
          <div key={t.titre} className="flex flex-col gap-0.5 rounded-[10px] bg-fond px-3 py-2.5">
            <small className="text-xs text-gris">{t.titre}</small>
            <b className="font-bold">{t.prevu}</b>
            <b className={`font-bold ${t.depasse ? 'text-rouge' : 'text-vert'}`}>{t.reel}</b>
          </div>
        ))}
      </div>
      <p className="text-[12.5px] text-gris">D’après {source} et la fiche.</p>
    </section>
  );
}
