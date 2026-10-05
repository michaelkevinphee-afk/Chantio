import { LienBouton, Vide } from '@/components/ui';

// Page introuvable, affichée dans le cadre du bureau (menu et barres restent là).
export default function Introuvable() {
  return (
    <div className="mx-auto max-w-xl pt-10">
      <Vide titre="Cette page n’existe pas">L’adresse a peut-être changé. Le menu mène à tous les écrans.</Vide>
      <div className="mt-6 text-center">
        <LienBouton href="/" variante="secondaire">
          Retour à l’accueil
        </LienBouton>
      </div>
    </div>
  );
}
