/**
 * The dashboard widget.
 *
 * It reads storage, and asks the provider only when storage has nothing
 * current: before the first sync, on a site without a scheduler, or after
 * the sync has stopped (`sync/live.ts`). The widget dispatches one
 * `page_load` per mount, for every editor on every dashboard visit, and
 * `cacheControl` is stripped for private routes, so that live answer is
 * kept for five minutes rather than asked for on each render.
 *
 * Blocks come from `./blocks.js`, whose constructors return upstream's own
 * block interfaces and emit snake_case keys. Hand-written camelCase keys
 * are silently ignored by the renderer — that is the live bug in upstream's
 * own `audit-log` widget, where "Load more" and the empty text never
 * render. `tests/widget.test.ts` runs the host's real `validateBlocks()`
 * over this output, so that class of mistake fails a test rather than
 * shipping.
 */

import type { PluginContext } from "emdash/plugin";

import { actions, button, context, empty, link, stats, table, timeseries, type AnalyticsBlock } from "./blocks.js";
import type { Problem } from "../i18n.js";
import type { Provider } from "../providers/types.js";
import { entriesStore, rollupStore, BIND_LIMIT } from "../store/access.js";
import { historyReaches, type EntryRow, type RollupRow } from "../store/rows.js";
import { liveWeek, storeIsStale, type LiveWeek } from "../sync/live.js";
import { addDays, daysBetween, utcDay, type Day } from "../sync/window.js";
import { CHART_DAYS, WIDGET_DAYS, type SyncState } from "../sync/scheduler.js";
import { langOf, t, type Lang } from "../i18n.js";
import { comparisonText, formatCount, readablePath, trendOf } from "./format.js";
import { LINK_COLUMNS, linkCells } from "./links.js";
import { mergeDays, PAGE_PATH } from "./page.js";
import { emptyReason, fixedInSettings, statusLine } from "./status.js";

export const REFRESH_ACTION = "analytics:refresh";

const TOP_PATHS = 5;

type TopPath = { path: string; pageviews: number; visits: number };

/** How a live read went, when the store had nothing current to show. */
export type WidgetLive =
	| { ok: true; fetchedAt: string; provider: string; topPaths: TopPath[] }
	| { ok: false; error: string; problem?: Problem };

/**
 * What a live read needs, or why the settings rule one out. `kept` is the
 * last live answer, which the caller read together with the sync state.
 */
export type LiveOption =
	| { provider: Provider; source: string; kept: LiveWeek | null; fresh?: boolean }
	| { blocked: { error: string; problem?: Problem } };

export interface WidgetInput {
	state: SyncState;
	rollups: RollupRow[];
	entriesByPath: Map<string, EntryRow>;
	now: Date;
	locale?: string;
	live?: WidgetLive;
	/** The site's address, for the links to its pages. */
	siteUrl?: string;
}

/**
 * Gather what the widget needs: the rollups of the chart's month, which
 * include the comparison's two weeks, and a single `getMany` over the
 * five paths actually being shown. A store that never synced is empty and
 * is not read; a stale one gets the live week laid over it.
 */
export async function loadWidget(
	ctx: PluginContext,
	state: SyncState,
	now: Date,
	locale?: string,
	options: { live?: LiveOption; siteUrl?: string } = {},
): Promise<WidgetInput> {
	const entries = entriesStore(ctx);

	let rollups: RollupRow[] = [];
	if (state.lastSync) {
		const page = await rollupStore(ctx)?.query({
			where: { date: { gte: addDays(utcDay(now), -(CHART_DAYS - 1)) } },
			orderBy: { date: "asc" },
			limit: BIND_LIMIT,
		});
		rollups = (page?.items ?? []).map((item) => item.data);
	}

	let live: WidgetLive | undefined;
	if (options.live && storeIsStale(state, now)) {
		if ("blocked" in options.live) {
			live = { ok: false, ...options.live.blocked };
		} else {
			const { provider, source, kept, fresh } = options.live;
			const res = await liveWeek(ctx, provider, source, kept, now, { fresh });
			if (res.ok) {
				rollups = mergeDays(rollups, res.week, new Date(res.week.fetchedAt));
				live = { ok: true, fetchedAt: res.week.fetchedAt, provider: provider.id, topPaths: res.week.topPaths };
			} else {
				live = res;
			}
		}
	}

	const paths = topPathsOf(state, live).map((p) => p.path);
	const entriesByPath = paths.length > 0 && entries ? await entries.getMany(paths) : new Map<string, EntryRow>();

	return {
		state,
		rollups,
		entriesByPath,
		now,
		locale,
		...(live && { live }),
		...(options.siteUrl && { siteUrl: options.siteUrl }),
	};
}

/** The live answer's top paths when there is one, the sync's snapshot otherwise. */
function topPathsOf(state: SyncState, live: WidgetLive | undefined): TopPath[] {
	return (live?.ok ? live.topPaths : (state.topPaths ?? [])).slice(0, TOP_PATHS);
}

export function renderWidget(input: WidgetInput): AnalyticsBlock[] {
	const { state, rollups, entriesByPath, now, locale } = input;
	const lang = langOf(locale);
	const today = utcDay(now);
	const live = input.live?.ok ? input.live : undefined;

	const current = sumRange(rollups, addDays(today, -(WIDGET_DAYS - 1)), today);
	const previousStart = addDays(today, -(WIDGET_DAYS * 2 - 1));
	const previous = sumRange(rollups, previousStart, addDays(today, -WIDGET_DAYS));

	// A previous period the store does not fully reach is "no history yet",
	// which is different from "zero traffic" and must not render as a trend.
	const hasPrevious = historyReaches(rollups, previousStart);

	const out: AnalyticsBlock[] = [];

	if (rollups.length === 0) {
		out.push(
			empty({
				title: t(lang, "noAnalyticsYet"),
				description: emptyReason(state, now, lang, input.live),
			}),
		);
		const problem = state.lastProblem ?? (input.live && !input.live.ok ? input.live.problem : undefined);
		out.push(refreshRow(lang, fixedInSettings(problem)));
		return out;
	}

	const visitsTrend = trendOf(current.visits, hasPrevious ? previous.visits : null);
	const viewsTrend = trendOf(current.pageviews, hasPrevious ? previous.pageviews : null);

	out.push(
		stats([
			{
				label: t(lang, "visitsLastDays", { days: WIDGET_DAYS }),
				value: formatCount(current.visits, lang),
				description: comparisonText(current.visits, hasPrevious ? previous.visits : null, lang),
				...(visitsTrend ? { trend: visitsTrend } : {}),
			},
			{
				label: t(lang, "pageviewsLastDays", { days: WIDGET_DAYS }),
				value: formatCount(current.pageviews, lang),
				description: comparisonText(current.pageviews, hasPrevious ? previous.pageviews : null, lang),
				...(viewsTrend ? { trend: viewsTrend } : {}),
			},
		]),
	);

	// One day is a dot, not a trend.
	const days = [...rollups].sort((a, b) => daysBetween(b.date, a.date));
	if (days.length > 1) {
		const at = (day: Day) => Date.parse(`${day}T00:00:00.000Z`);
		out.push(
			timeseries(
				[
					{ name: t(lang, "pageviews"), data: days.map((d) => [at(d.date), d.pageviews] as [number, number]) },
					{ name: t(lang, "visits"), data: days.map((d) => [at(d.date), d.visits] as [number, number]) },
				],
				{ blockId: "analytics:widget:chart", height: 160, gradient: true },
			),
		);
	}

	const topPaths = topPathsOf(state, input.live);
	if (topPaths.length > 0) {
		out.push(
			table({
				blockId: "analytics:top-paths",
				pageActionId: "analytics:top-paths:page",
				columns: [
					{ key: "page", label: t(lang, "colPage"), format: "text" },
					{ key: "path", label: t(lang, "colPath"), format: "code" },
					{ key: "views", label: t(lang, "colViews"), format: "number" },
					...LINK_COLUMNS,
				],
				rows: topPaths.map((row) => {
					const known = entriesByPath.get(row.path);
					return {
						// The entry title where the join knows it, the raw path
						// otherwise: plenty of real traffic hits paths that are not
						// entries at all, and those are still worth showing.
						page: known?.title || "—",
						path: readablePath(row.path),
						views: row.pageviews,
						...linkCells(row.path, known, input.siteUrl, lang),
					};
				}),
				emptyText: t(lang, "noPagesYet"),
			}),
		);
	}

	const note = statusLine(state, now, lang, {
		estimated: live ? current.estimated : state.estimated || current.estimated,
		provisional: current.provisional,
		unmatched: !live,
		...(live && { live: { fetchedAt: live.fetchedAt, provider: live.provider } }),
	});
	if (note) out.push(context(note));

	out.push(refreshRow(lang, false));
	return out;
}

function refreshRow(lang: Lang, settings: boolean) {
	return actions([
		button(REFRESH_ACTION, t(lang, "refresh"), { style: "secondary" }),
		link(t(lang, "openAnalytics"), { kind: "plugin-page", path: PAGE_PATH }, { appearance: "secondary" }),
		...(settings ? [link(t(lang, "openSettings"), { kind: "plugin-settings" }, { appearance: "secondary" })] : []),
	]);
}

/**
 * Sum the rollup rows inside an inclusive day range.
 *
 * `days` counts rows that exist, not days in the range: a day Cloudflare
 * never reported is absent rather than zero, and treating absence as zero
 * is what makes a fresh install look like a traffic collapse.
 */
function sumRange(rows: RollupRow[], since: Day, until: Day) {
	let pageviews = 0;
	let visits = 0;
	let days = 0;
	let estimated = false;
	let provisional = false;
	const today = until;

	for (const row of rows) {
		if (daysBetween(since, row.date) < 0) continue;
		if (daysBetween(row.date, until) < 0) continue;
		pageviews += row.pageviews;
		visits += row.visits;
		days++;
		if (row.sampleInterval > 1) estimated = true;
		if (row.date === today) provisional = true;
	}

	return { pageviews, visits, days, estimated, provisional };
}
