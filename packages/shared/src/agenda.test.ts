import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fichierAgenda, lundiDe } from './agenda.ts';

const maintenant = new Date('2026-10-01T20:00:00Z');

test('invitation avec heure : fuseau de Paris, une heure par défaut', () => {
  const ics = fichierAgenda(
    {
      uid: 'i42',
      titre: 'Mme Durand · Fuite chauffe-eau',
      lieu: '25 avenue Mozart, 75016 Paris',
      date: '2026-10-05',
      heure: '08:30:00',
      organisateur: { nom: 'Verger', email: 'bureau@verger.example' },
      participants: [{ nom: 'Julien Roux', email: 'julien@verger.example' }],
    },
    maintenant,
  );
  assert.match(ics, /METHOD:REQUEST/);
  assert.match(ics, /DTSTART;TZID=Europe\/Paris:20261005T083000/);
  assert.match(ics, /DTEND;TZID=Europe\/Paris:20261005T093000/);
  assert.match(ics, /LOCATION:25 avenue Mozart\\, 75016 Paris/);
  // Les lignes longues sont repliées : on les recolle avant de chercher.
  assert.match(ics.replace(/\r\n /g, ''), /ATTENDEE;CN=Julien Roux;.*mailto:julien@verger\.example/);
  assert.match(ics, /UID:i42@chantio/);
  assert.ok(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
});

test('sans heure : journée entière', () => {
  const ics = fichierAgenda({ uid: 'i1', titre: 'Test', date: '2026-12-31' }, maintenant);
  assert.match(ics, /METHOD:PUBLISH/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261231/);
  assert.match(ics, /DTEND;VALUE=DATE:20270101/);
  assert.doesNotMatch(ics, /VTIMEZONE/);
});

test('annulation', () => {
  const ics = fichierAgenda({ uid: 'i1', titre: 'Test', date: '2026-10-05', heure: '23:30', annule: true }, maintenant);
  assert.match(ics, /METHOD:CANCEL/);
  assert.match(ics, /STATUS:CANCELLED/);
  assert.match(ics, /DTEND;TZID=Europe\/Paris:20261006T003000/);
});

test('lundi de la semaine', () => {
  assert.equal(lundiDe('2026-10-01'), '2026-09-28');
  assert.equal(lundiDe('2026-10-04'), '2026-09-28');
  assert.equal(lundiDe('2026-10-05'), '2026-10-05');
});

test('chantier sur plusieurs jours : journées entières jusqu’au dernier jour', () => {
  const ics = fichierAgenda({ uid: 'c1', titre: 'Salle de bain', date: '2026-10-08', heure: '08:00', dateFin: '2026-10-13' }, new Date('2026-10-01T10:00:00Z'));
  assert.match(ics, /DTSTART;VALUE=DATE:20261008/);
  assert.match(ics, /DTEND;VALUE=DATE:20261014/);
  assert.doesNotMatch(ics, /VTIMEZONE/);
});
