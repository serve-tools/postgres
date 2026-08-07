/** Split native tar output without treating Windows line endings as member data. */
export function parseTarListing(listing) {
	return listing.split(/\r?\n/).filter(Boolean);
}
