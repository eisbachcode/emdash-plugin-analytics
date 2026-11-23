/**
 * How an entry's 7- and 30-day view counts are put together. Pure.
 *
 * Thirty days cannot come from the provider: a Cloudflare query reaching
 * back further than `today - 7` is served from a ~10 % sample for every
 * day in it (see `UNSAMPLED_WINDOW_DAYS`). So `views30` has two parts:
 *
 * - **Recent**, `today - 7` to today: the window every paths tick fetches
 *   exactly anyway, summed as it arrives. `views7` is the last seven of
 *   those eight days.
 * - **Older**, `today - 29` to `today - 8`: days the provider can no longer
 *   reproduce and nothing writes any more, so their sum only changes when
 *   the date does. A pass over the stored `daily` rows computes it once
 *   per UTC day (`sync/older.ts`).
 *
 * Summing all thirty days from the store on every tick would need about
 * thirty `getMany` ids per path, which a ten-call sandbox budget cannot
 * pay for more than a few paths at a time.
 *
 * The seven days before `views7` are split the same way: `today - 7` is
 * the recent window's first day, and `today - 13` to `today - 8` are the
 * newest six days of the older window, which the older pass sums on the
 * side (`olderPrev`).
 */

import { addDays, daysBetween, UNSAMPLED_WINDOW_DAYS, type Day } from "../sync/window.js";
import { isPublished, type EntryRow } from "./rows.js";

export const VIEWS7_DAYS = 7;
export const VIEWS30_DAYS = 30;

/** The days the older part covers on `today`: from `today - 29` to `today - 8`. */
export function olderWindow(today: Day): { since: Day; until: Day } {
	return {
		since: addDays(today, -(VIEWS30_DAYS - 1)),
		until: addDays(today, -(UNSAMPLED_WINDOW_DAYS + 1)),
	};
}

/** The first day of the seven before `views7`: `today - 13`. */
export function previousStart(today: Day): Day {
	return addDays(today, -(VIEWS7_DAYS * 2 - 1));
}

/**
 * Page views over the seven days before `views7`, or null while they are
 * not known: before a pass has summed `olderPrev` for the entry, or for an
 * entry published inside those days, whose earlier week is not a full one.
 */
export function previousViews7(entry: EntryRow, today: Day): number | null {
	if (entry.olderPrev === undefined || entry.recentViews === undefined) return null;
	if (entry.publishedAt && daysBetween(previousStart(today), entry.publishedAt.slice(0, 10)) > 0) return null;
	return entry.olderPrev + Math.max(0, entry.recentViews - entry.views7);
}

/**
 * `views7` and the recent part of `views30` from one path's fetched rows.
 *
 * Rows outside the recent window are ignored rather than trusted: the
 * caller's window is the adapter's business, and a day counted twice
 * would be hard to spot in a sum.
 */
export function recentViewsOf(rows: Array<{ date: Day; pageviews: number }>, today: Day): { views7: number; recent: number } {
	let views7 = 0;
	let recent = 0;
	for (const row of rows) {
		const age = daysBetween(row.date, today);
		if (age < 0 || age > UNSAMPLED_WINDOW_DAYS) continue;
		recent += row.pageviews;
		if (age < VIEWS7_DAYS) views7 += row.pageviews;
	}
	return { views7, recent };
}

/**
 * The entry after a paths tick, or null when nothing changed.
 *
 * `olderSettled` says today's older pass has finished. An entry it did not
 * reach then had no stored traffic in the older window, so its older part
 * is zero, however large it was yesterday. Until the pass finishes,
 * yesterday's older part stands in: off by at most two days' views for a
 * few ticks, where zero would drop 22 days' worth.
 */
export function withRecent(
	entry: EntryRow,
	fetched: { views7: number; recent: number },
	today: Day,
	olderSettled: boolean,
): EntryRow | null {
	const stale = entry.olderDay !== today;
	const olderViews = stale && olderSettled ? 0 : (entry.olderViews ?? 0);
	const olderPrev = stale && olderSettled ? 0 : entry.olderPrev;
	const olderDay = stale && olderSettled ? today : entry.olderDay;
	const views30 = olderViews + fetched.recent;

	if (
		entry.views7 === fetched.views7 &&
		entry.recentViews === fetched.recent &&
		(entry.olderViews ?? 0) === olderViews &&
		entry.olderPrev === olderPrev &&
		entry.views30 === views30
	) {
		return null;
	}

	return {
		...entry,
		views7: fetched.views7,
		recentViews: fetched.recent,
		olderViews,
		...(olderPrev !== undefined && { olderPrev }),
		...(olderDay !== undefined && { olderDay }),
		views30,
	};
}

/**
 * The entry after the older pass summed `older` for it on `day`, or null
 * when nothing changed.
 *
 * The day is written even when the number is the same, because it is what
 * tells the paths tick the entry was reached today (see `withRecent`).
 */
export function withOlder(entry: EntryRow, older: OlderSums, day: Day): EntryRow | null {
	if (entry.olderViews === older.views && entry.olderPrev === older.prev && entry.olderDay === day) return null;
	return {
		...entry,
		olderViews: older.views,
		olderPrev: older.prev,
		olderDay: day,
		views30: older.views + (entry.recentViews ?? 0),
	};
}

/** One path's older window: all of it, and the days from `previousStart` on. */
export interface OlderSums {
	views: number;
	prev: number;
}

/** A path whose rows may continue on the next page. `prev` is absent on a carry an older build stored. */
export interface OlderCarry {
	path: string;
	views: number;
	prev?: number;
}

/**
 * Per-path sums from `daily` rows read in path order, one page at a time.
 *
 * A path's rows can straddle two pages, so the last path of a page that
 * has more after it is carried into the next call instead of being
 * reported with half its days. The carry is plain data: the pass stores
 * it with its cursor, so the next tick can pick it up.
 */
export function foldByPath(
	rows: Array<{ date: Day; path: string; pageviews: number }>,
	carry: OlderCarry | undefined,
	hasMore: boolean,
	prevSince: Day,
): { finished: Map<string, OlderSums>; carry: OlderCarry | undefined } {
	const finished = new Map<string, OlderSums>();
	let current = carry ? { path: carry.path, views: carry.views, prev: carry.prev ?? 0 } : undefined;

	const finish = (done: { path: string; views: number; prev: number }) => {
		const sums = finished.get(done.path) ?? { views: 0, prev: 0 };
		finished.set(done.path, { views: sums.views + done.views, prev: sums.prev + done.prev });
	};

	for (const row of rows) {
		const prev = daysBetween(prevSince, row.date) >= 0 ? row.pageviews : 0;
		if (current && current.path === row.path) {
			current.views += row.pageviews;
			current.prev += prev;
			continue;
		}
		if (current) finish(current);
		current = { path: row.path, views: row.pageviews, prev };
	}

	if (current && !hasMore) {
		finish(current);
		current = undefined;
	}
	return { finished, carry: current };
}

/** Views an entry needs in its last seven days before its growth is worth a sentence. */
const RISING_MIN_VIEWS = 5;

/**
 * The published entry whose last seven days grew the most against the
 * seven before, or null when none grew. Small numbers swing wildly, so an
 * entry needs a handful of views and an earlier week that had any: growth
 * from nothing has no ratio to rank by.
 */
export function risingEntry(entries: Iterable<EntryRow>, today: Day): { entry: EntryRow; previous: number } | null {
	let best: { entry: EntryRow; previous: number } | null = null;
	let bestRatio = 1;
	for (const entry of entries) {
		if (!isPublished(entry) || entry.views7 < RISING_MIN_VIEWS) continue;
		const previous = previousViews7(entry, today);
		if (previous === null || previous === 0) continue;
		const ratio = entry.views7 / previous;
		if (ratio > bestRatio || (best !== null && ratio === bestRatio && entry.views7 > best.entry.views7)) {
			best = { entry, previous };
			bestRatio = ratio;
		}
	}
	return best;
}
