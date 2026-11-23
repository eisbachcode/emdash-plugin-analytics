/**
 * The sentences the widget and the analytics page share: how fresh the
 * numbers are, what is wrong if anything is, and why a store is empty.
 */

import { langOf, problemText, t, type Problem } from "../i18n.js";
import { WIDGET_DAYS, type SyncState } from "../sync/scheduler.js";
import { formatAge, qualifier } from "./format.js";

/**
 * One line saying how fresh the numbers are and what is wrong, if
 * anything. Every failure mode that would otherwise render as a dashboard
 * of zeroes should read as a sentence naming the fix.
 */
export function statusLine(
	state: SyncState,
	now: Date,
	locale: string | undefined,
	flags: {
		estimated?: boolean;
		provisional?: boolean;
		unmatched?: boolean;
		/** When the numbers were read live rather than from the store, and for which provider. */
		live?: { fetchedAt: string; provider: string };
	},
): string | null {
	const lang = langOf(locale);
	const parts: string[] = [];
	const provider = flags.live?.provider ?? state.provider;
	if (provider === "demo") parts.push(t(lang, "demoData"));

	const age = formatAge(state.lastSync, now, lang);
	if (flags.live) {
		parts.push(t(lang, "liveRead", { age: formatAge(flags.live.fetchedAt, now, lang) ?? t(lang, "recently") }));
		parts.push(age ? t(lang, "synced", { age }) : t(lang, "liveNoSync"));
	} else {
		parts.push(age ? t(lang, "synced", { age }) : t(lang, "notSynced"));
	}

	const marks = qualifier({ ...flags, provider }, lang);
	if (marks) parts.push(marks);
	if (flags.unmatched && nothingMatched(state)) parts.push(t(lang, "nothingMatched"));

	const error = errorText(state, lang);
	if (error) {
		const errorAge = formatAge(state.lastErrorAt, now, lang);
		parts.push(
			errorAge ? t(lang, "lastAttemptFailedAge", { age: errorAge, error }) : t(lang, "lastAttemptFailed", { error }),
		);
	}

	return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Why there is nothing to show. `live` is the outcome of a live read, when
 * one was tried: its failure is the reason, and its success with no rows
 * means the provider has none.
 */
export function emptyReason(
	state: SyncState,
	now: Date,
	locale: string | undefined,
	live?: { ok: true } | { ok: false; error: string; problem?: Problem },
): string {
	const lang = langOf(locale);
	const error = errorText(state, lang);
	if (error) return error;
	if (live && !live.ok) return live.problem ? problemText(lang, live.problem) : live.error;
	if (live?.ok) return t(lang, "liveNoViews", { days: WIDGET_DAYS });
	if (!state.lastSync) return t(lang, "firstSyncPending");
	const age = formatAge(state.lastSync, now, lang);
	return t(lang, "syncedNoViews", { age: age ?? t(lang, "recently") });
}

/** Problems whose fix is a value in the plugin's settings form. */
const SETTINGS_PROBLEMS: ReadonlySet<string> = new Set([
	"notConfigured",
	"noSiteTagSites",
	"noSiteTagNoTraffic",
	"noSiteTagYet",
	"cfForbidden",
	"cfZoneToken",
	"cfNoAccount",
]);

export function fixedInSettings(problem: Problem | undefined): boolean {
	return problem !== undefined && SETTINGS_PROBLEMS.has(problem.key);
}

/** The stored failure in the reader's language; an unrecognized one as it came. */
function errorText(state: SyncState, lang: ReturnType<typeof langOf>): string | undefined {
	if (!state.lastError) return undefined;
	return state.lastProblem ? problemText(lang, state.lastProblem) : state.lastError;
}

/**
 * The index walk finished without matching a single entry. Paths still
 * show, untitled, so without saying so the numbers look plausible while
 * every per-entry figure stays empty.
 */
export function nothingMatched(state: SyncState): boolean {
	return Boolean(state.indexComplete) && (state.indexed ?? 0) === 0;
}
