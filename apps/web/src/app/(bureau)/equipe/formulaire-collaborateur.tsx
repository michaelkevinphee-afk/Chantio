import { LIBELLE_ROLE, type RoleMembre } from '@chantio/shared';
import { BoutonEnvoi } from '@/components/retour';
import { inviter } from './actions';

const ROLES: { role: RoleMembre; detail: string }[] = [
  { role: 'technicien', detail: 'Voit ses interventions sur l’appli et remplit les fiches.' },
  { role: 'chef_chantier', detail: 'Planifie, suit l’équipe et valide les fiches.' },
  { role: 'apprenti', detail: 'Accompagne un technicien, mêmes écrans que lui.' },
  { role: 'assistant', detail: 'Bureau : clients, planning et facturation.' },
  { role: 'sous_traitant', detail: 'Ne voit que les interventions qu’on lui confie.' },
  { role: 'dirigeant', detail: 'Tous les droits, y compris l’équipe.' },
];

/** Fiche « Nouveau collaborateur » : identité, coordonnées, rôle, puis envoi du code par e-mail. */
export function FormulaireCollaborateur({ erreur }: { erreur?: string }) {
  return (
    <form action={inviter} className="space-y-5">
      <div className="carte space-y-3 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-gris">Identité</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-gris">Prénom</span>
            <input name="prenom" className="champ" required autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-gris">Nom</span>
            <input name="nom" className="champ" />
          </label>
        </div>
      </div>

      <div className="carte space-y-3 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-gris">Coordonnées</p>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-gris">E-mail (pour se connecter)</span>
          <input name="email" type="email" className="champ" required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-gris">Téléphone</span>
          <input name="telephone" type="tel" className="champ" />
        </label>
      </div>

      <div className="carte p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-gris">Rôle</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLES.map(({ role, detail }) => (
            <label
              key={role}
              className="cursor-pointer rounded-[14px] border border-trait bg-white p-3 transition hover:border-cobalt has-[:checked]:border-cobalt has-[:checked]:bg-doux has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-cobalt)]"
            >
              <input type="radio" name="role" value={role} defaultChecked={role === 'technicien'} className="sr-only" />
              <span className="block text-sm font-extrabold">{LIBELLE_ROLE[role]}</span>
              <span className="mt-0.5 block text-xs text-gris">{detail}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-[16px] bg-doux p-4 text-sm">
        <p className="font-bold">Et ensuite ?</p>
        <p className="mt-1 text-gris">
          Un e-mail avec un code part tout de suite. Votre collaborateur installe l’appli Chantio, touche « Première
          connexion ou mot de passe oublié » et choisit son mot de passe.
        </p>
      </div>

      {erreur && <p className="rounded-xl bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">{erreur}</p>}
      <div className="sticky -bottom-6 -mx-6 -mb-6 border-t border-trait bg-fond/90 px-6 py-4 backdrop-blur">
        <BoutonEnvoi className="w-full" enCours="Envoi de l’invitation…">Ajouter et envoyer l’invitation</BoutonEnvoi>
      </div>
    </form>
  );
}
