import { validateBlockResponse } from "@emdash-cms/blocks/server";
import { describe, expect, it } from "vitest";

import type { EntryRow } from "../src/store/rows.js";
import {
	combine,
	CONTENT_PATH,
	DEFAULT_VIEW,
	parseContentInput,
	renderContent,
	REBUILD_ACTION,
	TABLE_ACTION,
	viewAction,
	PAGE_ROWS,
	type ContentInput,
	type ContentRow,
	type ContentView,
} from "../src/ui/content.js";
import { formatDay } from "../src/ui/format.js";
import { PAGE_PATH } from "../src/ui/page.js";

const NOW = new Date("2026-09-24T12:00:00.000Z");

const row = (path: string, over: Partial<EntryRow> = {}): EntryRow => ({
	path,
	collection: "posts",
	entryId: `id${path}`,
	translationGroup: `id${path}`,
	locale: "en",
	title: path,
	status: "published",
	views7: 0,
	views30: 0,
	updatedAt: NOW.toISOString(),
	...over,
});

const contentRow = (title: string, path: string, over: Partial<ContentRow> = {}): ContentRow => ({
	title,
	collection: "posts",
	entryId: `id${path}`,
	status: "published",
	locale: "en",
	path,
	views7: 0,
	previous7: null,
	views30: 0,
	...over,
});

const QUIET = contentRow("", "/quiet/", { collection: "pages", allLanguages: 0 });

function input(over: Partial<ContentInput> = {}): ContentInput {
	return {
		view: DEFAULT_VIEW,
		state: { phase: "overview", provider: "cloudflare", indexComplete: true, indexVersion: 2, lastSync: NOW.toISOString() },
		collections: [
			{ slug: "pages", label: "Pages" },
			{ slug: "posts", label: "Posts" },
		],
		rows: [contentRow("Hello", "/blog/hello/", { views7: 5, views30: 20, allLanguages: 32 }), QUIET],
		multilingual: false,
		now: NOW,
		locale: "en",
		...over,
	};
}

function expectValid(blocks: unknown) {
	const result = validateBlockResponse({ blocks }, { pluginPagePaths: [PAGE_PATH, CONTENT_PATH] });
	if (!result.valid) {
		throw new Error(`Block Kit validation failed:\n${result.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n")}`);
	}
}

type AnyBlock = Record<string, unknown> & { type: string };

function find(blocks: unknown[], type: string): AnyBlock[] {
	const out: AnyBlock[] = [];
	const walk = (value: unknown) => {
		if (Array.isArray(value)) value.forEach(walk);
		else if (value && typeof value === "object") {
			const record = value as AnyBlock;
			if (record.type === type) out.push(record);
			Object.values(record).forEach(walk);
		}
	};
	walk(blocks);
	return out;
}

const texts = (blocks: unknown[]) => find(blocks, "context").map((b) => String(b.text));

describe("the view travels in the action ids", () => {
	const view: ContentView = { collection: "posts", sort: "views7", dir: "asc", mode: "combined", offset: 0 };

	it("round-trips through a view button", () => {
		expect(parseContentInput({ type: "block_action", action_id: viewAction(view) })).toEqual({ view, rebuild: false });
	});

	it("takes a header click's sort and starts from the top", () => {
		const table = find(renderContent(input({ view: { ...view, offset: 50, cursor: "c1" } })), "table")[0]!;
		const parsed = parseContentInput({
			type: "block_action",
			action_id: table.page_action_id,
			value: { sort: { key: "views30", dir: "desc" } },
		});
		expect(parsed.view).toEqual({ ...view, sort: "views30", dir: "desc", offset: 0 });
	});

	it("keeps the sort from the id when Load more sends none", () => {
		const table = find(renderContent(input({ view, nextCursor: "50~abc" })), "table")[0]!;
		expect(table.next_cursor).toBe("50~abc");
		const parsed = parseContentInput({
			type: "block_action",
			action_id: table.page_action_id,
			value: { cursor: table.next_cursor, sort: null },
		});
		expect(parsed.view).toEqual({ ...view, offset: 50, cursor: "abc" });
	});

	it("asks for a rebuild without losing the view", () => {
		const blocks = renderContent(input({ view }));
		const rebuild = find(blocks, "button").find((b) => String(b.action_id).startsWith(REBUILD_ACTION))!;
		expect(parseContentInput({ type: "block_action", action_id: rebuild.action_id })).toEqual({ view, rebuild: true });
	});

	it("falls back to the default view on anything it does not know", () => {
		expect(parseContentInput({ type: "page_load", page: CONTENT_PATH }).view).toEqual(DEFAULT_VIEW);
		expect(parseContentInput({ type: "block_action", action_id: `${TABLE_ACTION}|%zz|nope` }).view).toMatchObject({
			collection: null,
			sort: "views30",
		});
		expect(parseContentInput({ type: "block_action", action_id: `${VIEW_ACTION_ALIAS}|x` }).view).toEqual(DEFAULT_VIEW);
	});
});

const VIEW_ACTION_ALIAS = "analytics:something-else";

describe("renderContent", () => {
	it("renders valid blocks with every entry, the unviewed ones included", () => {
		const blocks = renderContent(input());
		expectValid(blocks);
		const [table] = find(blocks, "table");
		expect((table!.rows as Array<Record<string, unknown>>).map((r) => r.path)).toEqual(["/blog/hello/", "/quiet/"]);
		expect((table!.rows as Array<Record<string, unknown>>)[1]).toMatchObject({ entry: "—", views30: 0 });
	});

	it("shows languages and translation totals only on a multilingual site", () => {
		const keys = (i: ContentInput) =>
			(find(renderContent(i), "table")[0]!.columns as Array<{ key: string }>).map((c) => c.key);
		expect(keys(input())).not.toContain("allLanguages");
		expect(keys(input({ multilingual: true }))).toEqual(expect.arrayContaining(["language", "allLanguages"]));
		const modes = find(renderContent(input({ multilingual: true })), "button").map((b) => b.label);
		expect(modes).toEqual(expect.arrayContaining(["Each language", "Languages combined"]));
	});

	it("hides the collection column once a collection is chosen", () => {
		const columns = find(renderContent(input({ view: { ...DEFAULT_VIEW, collection: "posts" } })), "table")[0]!
			.columns as Array<{ key: string }>;
		expect(columns.map((c) => c.key)).not.toContain("collection");
	});

	it("marks the chosen collection", () => {
		const buttons = find(renderContent(input({ view: { ...DEFAULT_VIEW, collection: "posts" } })), "actions")[0]!
			.elements as Array<{ label: string; style: string }>;
		expect(buttons.map((b) => [b.label, b.style])).toEqual([
			["All", "secondary"],
			["Pages", "secondary"],
			["Posts", "primary"],
		]);
	});

	it("says where 30-day figures start when the store is younger than 30 days", () => {
		expect(texts(renderContent(input({ historySince: "2026-09-16" }))).join(" ")).toContain("30-day figures count from");
		expect(texts(renderContent(input({ historySince: "2026-08-01" }))).join(" ")).not.toContain("30-day figures");
	});

	it("says which rows a later page shows, and offers the first page", () => {
		const blocks = renderContent(input({ view: { ...DEFAULT_VIEW, offset: 50, cursor: "c" } }));
		expect(texts(blocks).join(" ")).toContain("Entries 51 to 52.");
		expect(find(blocks, "button").map((b) => b.label)).toContain("First page");
	});

	it("explains an empty index instead of showing an empty table", () => {
		const building = renderContent(input({ rows: [], state: { phase: "overview", indexComplete: false } }));
		expectValid(building);
		expect(find(building, "empty")[0]).toMatchObject({ title: "No entries yet" });
		expect(find(building, "empty")[0]!.description).toContain("still being built");

		const noUrls = renderContent(input({ rows: [] }));
		expect(find(noUrls, "empty")[0]!.description).toContain("site URL");
	});

	it("writes publish dates in the reader's language", () => {
		const blocks = renderContent(
			input({
				locale: "de",
				rows: [contentRow("Hallo", "/", { locale: "de", views7: 1, views30: 1, publishedAt: "2026-09-18T08:00:00.000Z" })],
			}),
		);
		expect((find(blocks, "table")[0]!.rows as Array<Record<string, unknown>>)[0]!.published).toBe("18.09.2026");
	});

	it("links back to the overview", () => {
		const links = find(renderContent(input()), "link");
		expect(links.map((l) => l.target)).toContainEqual({ kind: "plugin-page", path: PAGE_PATH });
	});

	it("links every row to its editor and to its page on the site", () => {
		const blocks = renderContent(input({ siteUrl: "https://example.test" }));
		expectValid(blocks);
		const rows = find(blocks, "table")[0]!.rows as Array<Record<string, { target: unknown }>>;
		expect(rows[0]!.edit!.target).toEqual({ kind: "content", collection: "posts", id: "id/blog/hello/" });
		expect(rows[0]!.open!.target).toEqual({ kind: "external", url: "https://example.test/blog/hello/" });
	});

	it("leaves the page link out when the site has no URL to resolve it against", () => {
		const rows = find(renderContent(input()), "table")[0]!.rows as Array<Record<string, unknown>>;
		expect(rows[0]).not.toHaveProperty("open");
		expect(rows[0]).toHaveProperty("edit");
	});

	it("shows each entry's change against the seven days before", () => {
		const blocks = renderContent(
			input({
				rows: [
					contentRow("Up", "/up/", { views7: 30, previous7: 20 }),
					contentRow("Down", "/down/", { views7: 9, previous7: 10 }),
					contentRow("New", "/new/", { views7: 4, previous7: 0 }),
					contentRow("Still", "/still/", { views7: 0, previous7: 0 }),
					contentRow("Young", "/young/", { views7: 7, previous7: null }),
				],
			}),
		);
		const rows = find(blocks, "table")[0]!.rows as Array<Record<string, unknown>>;
		expect(rows.map((r) => r.change)).toEqual(["+50%", "-10%", "from 0", "—", ""]);
	});

	it("says when the change column starts while the store holds less than two weeks", () => {
		// History from 2026-09-16 reaches two full weeks on 2026-09-29.
		const young = texts(renderContent(input({ historySince: "2026-09-16" }))).join(" ");
		expect(young).toContain("7-day change");
		expect(young).toContain(formatDay("2026-09-29", "en"));
		expect(texts(renderContent(input({ historySince: "2026-09-11" }))).join(" ")).not.toContain("7-day change");
	});

	it("shows percent-encoded paths the way the address bar does", () => {
		const blocks = renderContent(input({ rows: [contentRow("Tokyo", "/news/%E6%9D%B1%E4%BA%AC/")] }));
		expect((find(blocks, "table")[0]!.rows as Array<Record<string, unknown>>)[0]!.path).toBe("/news/東京/");
	});

	it("stays inside the host's response limits with a full page of linked rows", () => {
		const rows = Array.from({ length: PAGE_ROWS }, (_, i) =>
			contentRow(`Entry ${i}`, `/blog/entry-${i}/`, {
				views7: i,
				previous7: i + 1,
				views30: i * 4,
				allLanguages: i * 5,
				publishedAt: "2026-09-01T08:00:00.000Z",
			}),
		);
		expectValid(renderContent(input({ rows, multilingual: true, siteUrl: "https://example.test", nextCursor: "50~c" })));
	});
});

describe("combine", () => {
	const view: ContentView = { ...DEFAULT_VIEW, mode: "combined" };

	it("adds up translations and sorts by the group total", () => {
		const rows = [
			row("/de/a/", { locale: "de", translationGroup: "a", views30: 30, views7: 3 }),
			row("/en/a/", { locale: "en", translationGroup: "a", views30: 12, views7: 1 }),
			row("/de/b/", { locale: "de", translationGroup: "b", views30: 35, views7: 9 }),
		];
		const out = combine(rows, view, "de");
		expect(out.map((r) => [r.path, r.views30, r.views7])).toEqual([
			["/de/a/", 42, 4],
			["/de/b/", 35, 9],
		]);
		expect(out[0]!.byLanguage).toBe("de 30 · en 12");
	});

	it("compares a group with its earlier week only when every translation's is known", () => {
		const known = { recentViews: 5, olderPrev: 3, views7: 5 };
		const rows = [
			row("/de/a/", { locale: "de", translationGroup: "a", ...known }),
			row("/en/a/", { locale: "en", translationGroup: "a", ...known }),
			row("/de/b/", { locale: "de", translationGroup: "b", ...known }),
			row("/en/b/", { locale: "en", translationGroup: "b", views7: 5 }),
		];
		const out = combine(rows, { ...view, sort: "views7" }, "de", "en", "2026-09-24");
		expect(out.map((r) => [r.path, r.previous7])).toEqual([
			["/de/a/", 6],
			["/de/b/", null],
		]);
		expect(combine(rows, view, "de").map((r) => r.previous7)).toEqual([null, null]);
	});

	it("names a group after its original, whatever the site locale says", () => {
		// As on eisbachcode.de: German originals, English translations, and a
		// site locale that does not read "de".
		const rows = [
			row("/en/", { locale: "en", entryId: "t", translationGroup: "o", title: "Home", views30: 50 }),
			row("/", { locale: "de", entryId: "o", translationGroup: "o", title: "Startseite", views30: 1 }),
		];
		expect(combine(rows, view, "en")[0]).toMatchObject({ title: "Startseite", path: "/" });
	});

	it("falls back to the site-locale version, then the most viewed, when the original is not among the rows", () => {
		const rows = [
			row("/en/a/", { locale: "en", entryId: "x", translationGroup: "a", title: "Hello", views30: 50 }),
			row("/de/a/", { locale: "de", entryId: "y", translationGroup: "a", title: "Hallo", views30: 1 }),
		];
		expect(combine(rows, view, "de")[0]).toMatchObject({ title: "Hallo" });
		expect(combine(rows, view, "fr")[0]).toMatchObject({ title: "Hello" });
	});

	it("sorts ascending when asked, so groups nobody reads come first", () => {
		const rows = [row("/a/", { views30: 5 }), row("/b/", { views30: 0 })];
		expect(combine(rows, { ...view, dir: "asc" }, "en").map((r) => r.path)).toEqual(["/b/", "/a/"]);
	});
});
