import {SearchQuery, SearchMatch} from '../types';

export function findMatches(docText: string, query: SearchQuery): SearchMatch[] {
	if (!query.searchTerm) return [];

	try {
		const regex = buildSearchRegex(query);
		const matches: SearchMatch[] = [];
		let match: RegExpExecArray | null;

		while ((match = regex.exec(docText)) !== null) {
			matches.push({from: match.index, to: match.index + match[0].length});
			if (match[0].length === 0) regex.lastIndex++;
		}
		return matches;
	} catch {
		return [];
	}
}

function buildSearchRegex(query: SearchQuery): RegExp {
	let pattern: string;

	if (query.useRegex) {
		pattern = query.searchTerm;
	} else {
		pattern = escapeRegex(query.searchTerm);
	}

	if (query.wholeWord) {
		pattern = `\\b${pattern}\\b`;
	}

	const flags = query.caseSensitive ? 'g' : 'gi';
	return new RegExp(pattern, flags);
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findNearestMatchIndex(matches: SearchMatch[], cursorOffset: number): number {
	if (matches.length === 0) return -1;
	for (let i = 0; i < matches.length; i++) {
		const m = matches[i];
		if (m && m.from >= cursorOffset) return i;
	}
	return 0;
}
