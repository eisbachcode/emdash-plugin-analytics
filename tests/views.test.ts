import { describe, expect, it } from "vitest";

import type { EntryRow } from "../src/store/rows.js";
import {
	foldByPath,
	olderWindow,
	previousStart,
	previousViews7,
	recentViewsOf,
	risingEntry,
	withOlder,
	withRecent,
} from "../src/store/views.js";
import { addDays, daysBetween, enumerateDays } from "../src/sync/window.js";

const TODAY = "2026-09-24";

const entry = (over: Partial<EntryRow> = {}): EntryRow => ({
	path: "/blog/hello/",
	collection: "posts",
	entryId: "e1",
	translationGroup: "e1",
	locale: "en",
	title: "Hello",
	status: "published",
	views7: 0,
	views30: 0,
	updatedAt: "2026-09-24T00:00:00.000Z",
	...over,
});

describe("the two windows", () => {
	it("cover thirty days between them, with no day in both", () => {
		// The recent part is what a paths tick fetches: today - 7 to today.
		const recent = enumerateDays(addDays(TODAY, -7), TODAY);
		const { since, until } = olderWindow(TODAY);
		const older = enumerateDays(since, until);

		expect(recent.length + older.length).toBe(30);
		expect(older.filter((day) => recent.includes(day))).toEqual([]);
		expect(daysBetween(until, recent[0]!)).toBe(1);
	});
});

describe("recentViewsOf", () => {
	it("counts seven days for views7 and eight for the recent part", () => {
		const rows = enumerateDays(addDays(TODAY, -7), TODAY).map((date) => ({ date, pageviews: 1 }));
		expect(recentViewsOf(rows, TODAY)).toEqual({ views7: 7, recent: 8 });
	});

	it("ignores rows outside the window instead of adding them", () => {
		const rows = [
			{ date: addDays(TODAY, -8), pageviews: 100 },
			{ date: addDays(TODAY, 1), pageviews: 100 },
			{ date: TODAY, pageviews: 2 },
		];
		expect(recentViewsOf(rows, TODAY)).toEqual({ views7: 2, recent: 2 });
	});
});

describe("withRecent", () => {
	it("adds today's older part to the fetched recent part", () => {
		const next = withRecent(entry({ olderViews: 40, olderDay: TODAY }), { views7: 5, recent: 6 }, TODAY, true);
		expect(next).toMatchObject({ views7: 5, recentViews: 6, olderViews: 40, views30: 46 });
	});

	it("keeps yesterday's older part while today's pass is still running", () => {
		const next = withRecent(
			entry({ olderViews: 40, olderDay: addDays(TODAY, -1) }),
			{ views7: 5, recent: 6 },
			TODAY,
			false,
		);
		expect(next).toMatchObject({ olderViews: 40, views30: 46 });
	});

	it("zeroes an older part today's finished pass did not reach", () => {
		// All of this entry's older traffic was on the day that just left the
		// window, so the pass found no rows for it and never wrote it.
		const next = withRecent(
			entry({ olderViews: 40, olderDay: addDays(TODAY, -1) }),
			{ views7: 5, recent: 6 },
			TODAY,
			true,
		);
		expect(next).toMatchObject({ olderViews: 0, olderDay: TODAY, views30: 6 });
	});

	it("reports no change when nothing moved, so the tick writes nothing", () => {
		const settled = entry({ views7: 5, recentViews: 6, olderViews: 40, olderDay: TODAY, views30: 46 });
		expect(withRecent(settled, { views7: 5, recent: 6 }, TODAY, true)).toBeNull();
	});

	it("repairs a views30 that an older build left at zero", () => {
		const legacy = entry({ views7: 5, views30: 0 });
		expect(withRecent(legacy, { views7: 5, recent: 6 }, TODAY, false)).toMatchObject({ views30: 6 });
	});
});

describe("withOlder", () => {
	it("writes the day even when the number is unchanged", () => {
		const next = withOlder(
			entry({ olderViews: 40, olderPrev: 9, olderDay: addDays(TODAY, -1), recentViews: 6 }),
			{ views: 40, prev: 9 },
			TODAY,
		);
		expect(next).toMatchObject({ olderDay: TODAY, views30: 46 });
	});

	it("reports no change when the day and the numbers match", () => {
		expect(withOlder(entry({ olderViews: 40, olderPrev: 9, olderDay: TODAY }), { views: 40, prev: 9 }, TODAY)).toBeNull();
	});

	it("writes the previous-week part an older build left out, even when the 30-day part is unchanged", () => {
		const next = withOlder(entry({ olderViews: 40, olderDay: TODAY }), { views: 40, prev: 9 }, TODAY);
		expect(next).toMatchObject({ olderViews: 40, olderPrev: 9 });
	});
});

describe("foldByPath", () => {
	const OLD = addDays(TODAY, -20);
	const PREV_SINCE = previousStart(TODAY);
	const rows = (path: string, n: number, date = OLD) => Array.from({ length: n }, () => ({ date, path, pageviews: 2 }));
	const views = (finished: Map<string, { views: number }>) =>
		Object.fromEntries([...finished].map(([path, sums]) => [path, sums.views]));

	it("finishes every path of the last page", () => {
		const { finished, carry } = foldByPath([...rows("/a/", 3), ...rows("/b/", 2)], undefined, false, PREV_SINCE);
		expect(views(finished)).toEqual({ "/a/": 6, "/b/": 4 });
		expect(carry).toBeUndefined();
	});

	it("carries a path that may continue on the next page", () => {
		const first = foldByPath([...rows("/a/", 3), ...rows("/b/", 2)], undefined, true, PREV_SINCE);
		expect(views(first.finished)).toEqual({ "/a/": 6 });
		expect(first.carry).toEqual({ path: "/b/", views: 4, prev: 0 });

		const second = foldByPath([...rows("/b/", 1), ...rows("/c/", 1)], first.carry, false, PREV_SINCE);
		expect(views(second.finished)).toEqual({ "/b/": 6, "/c/": 2 });
	});

	it("finishes a carry whose path does not continue", () => {
		const { finished } = foldByPath(rows("/c/", 1), { path: "/b/", views: 4, prev: 0 }, false, PREV_SINCE);
		expect(views(finished)).toEqual({ "/b/": 4, "/c/": 2 });
	});

	it("finishes a carry when the next page is empty", () => {
		const { finished, carry } = foldByPath([], { path: "/b/", views: 4, prev: 0 }, false, PREV_SINCE);
		expect(views(finished)).toEqual({ "/b/": 4 });
		expect(carry).toBeUndefined();
	});

	it("sums the days from the previous week's start on the side, across a carried page", () => {
		const first = foldByPath(
			[...rows("/a/", 2), ...rows("/a/", 1, PREV_SINCE)],
			undefined,
			true,
			PREV_SINCE,
		);
		expect(first.carry).toEqual({ path: "/a/", views: 6, prev: 2 });

		const second = foldByPath(rows("/a/", 2, addDays(TODAY, -8)), first.carry, false, PREV_SINCE);
		expect(second.finished.get("/a/")).toEqual({ views: 10, prev: 6 });
	});
});

describe("the seven days before views7", () => {
	// Eight recent days of 2 views: views7 is 14, and the eighth day, today - 7, belongs to the week before.
	const known = { views7: 14, recentViews: 16, olderPrev: 9, olderDay: TODAY };

	it("adds the recent window's first day to the older pass's six", () => {
		expect(previousViews7(entry(known), TODAY)).toBe(11);
	});

	it("is unknown until a pass has summed the older six days", () => {
		expect(previousViews7(entry({ views7: 14, recentViews: 16 }), TODAY)).toBeNull();
	});

	it("is unknown for an entry published inside that week, whose earlier week is not a full one", () => {
		const published = (daysAgo: number) => `${addDays(TODAY, -daysAgo)}T09:00:00.000Z`;
		expect(previousViews7(entry({ ...known, publishedAt: published(10) }), TODAY)).toBeNull();
		expect(previousViews7(entry({ ...known, publishedAt: published(13) }), TODAY)).toBe(11);
	});

	it("drops to zero for an entry today's finished pass did not reach", () => {
		const next = withRecent(
			entry({ ...known, olderViews: 40, olderDay: addDays(TODAY, -1) }),
			{ views7: 14, recent: 16 },
			TODAY,
			true,
		);
		expect(next).toMatchObject({ olderPrev: 0 });
	});
});

describe("risingEntry", () => {
	const grown = (path: string, views7: number, previous: number) =>
		entry({ path, views7, recentViews: views7, olderPrev: previous, olderDay: TODAY });

	it("picks the entry that grew the most against its earlier week", () => {
		const rising = risingEntry([grown("/a/", 30, 20), grown("/b/", 12, 4), grown("/c/", 50, 60)], TODAY);
		expect(rising).toMatchObject({ entry: { path: "/b/" }, previous: 4 });
	});

	it("names nothing when no entry grew", () => {
		expect(risingEntry([grown("/a/", 20, 20), grown("/c/", 50, 60)], TODAY)).toBeNull();
	});

	it("ignores growth from nothing and entries with only a few views", () => {
		expect(risingEntry([grown("/new/", 40, 0), grown("/tiny/", 4, 1)], TODAY)).toBeNull();
	});

	it("ignores entries that are no longer published", () => {
		expect(risingEntry([{ ...grown("/gone/", 40, 10), status: "unpublished" }], TODAY)).toBeNull();
	});
});
