import type { StatutIntervention } from '@chantio/shared';

// Valeurs partagées entre la page d'Accueil (serveur) et EquipeDuJour (client) :
// une constante exportée d'un fichier 'use client' n'arrive pas telle quelle côté serveur.

/** Terminée, validée ou facturée : comptée « faite » sur la carte et dans la journée de chacun. */
export const FAITES: StatutIntervention[] = ['terminee', 'validee', 'facturee'];
