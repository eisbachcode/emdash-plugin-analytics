/**
 * The two links a table row about a page can carry: to the entry's editor
 * and to the page itself. Both are element cells, which the host aligns
 * at the row's end, and a row without one leaves the cell empty.
 */

import type { LinkElement, TableColumn } from "@emdash-cms/blocks/server";

import { t, type Lang } from "../i18n.js";
import type { EntryRow } from "../store/rows.js";
import { link } from "./blocks.js";

export const LINK_COLUMNS: TableColumn[] = [
	{ key: "edit", label: "", format: "element" },
	{ key: "open", label: "", format: "element" },
];

/** A deleted entry has no editor to open; an unpublished one still does. */
export function editLink(
	entry: Pick<EntryRow, "collection" | "entryId" | "status"> | undefined,
	lang: Lang,
): LinkElement | undefined {
	if (!entry || entry.status === "deleted") return undefined;
	return link(t(lang, "editEntry"), { kind: "content", collection: entry.collection, id: entry.entryId }, { appearance: "inline" });
}

/** Undefined when the site has no URL to resolve the path against. */
export function openLink(path: string, siteUrl: string | undefined, lang: Lang): LinkElement | undefined {
	if (!siteUrl) return undefined;
	let url: string;
	try {
		url = new URL(path, siteUrl).href;
	} catch {
		return undefined;
	}
	return link(t(lang, "openPage"), { kind: "external", url }, { appearance: "inline" });
}

/** The row's link cells; a missing link is left out rather than set to undefined. */
export function linkCells(
	path: string,
	entry: Pick<EntryRow, "collection" | "entryId" | "status"> | undefined,
	siteUrl: string | undefined,
	lang: Lang,
): { edit?: LinkElement; open?: LinkElement } {
	const edit = editLink(entry, lang);
	const open = openLink(path, siteUrl, lang);
	return { ...(edit && { edit }), ...(open && { open }) };
}
