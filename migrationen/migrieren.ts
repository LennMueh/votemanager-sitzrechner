import { migriere, schliesseDb } from '../src/lib/server/db.ts';

try {
	await migriere();
	console.log('Migrationen abgeschlossen.');
} finally {
	await schliesseDb();
}
