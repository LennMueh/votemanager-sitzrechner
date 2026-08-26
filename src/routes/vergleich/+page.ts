import { redirect } from '@sveltejs/kit';

export const load = ({ url }: { url: URL }) => {
	if ((url.searchParams.has('instanz') || url.searchParams.has('ags')) &&
		url.searchParams.has('wahl') && url.searchParams.has('gebiet')) return;
	const wahltag = url.searchParams.get('wahltag');
	throw redirect(307, `/wahlen${wahltag ? `?wahltag=${wahltag}` : ''}`);
};
