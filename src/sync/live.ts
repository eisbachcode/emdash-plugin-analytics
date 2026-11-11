/**
 * The widget's live read: the last seven days straight from the provider,
 * for a site whose store has nothing current to show.
 *
 * That is a site without a scheduler (Workers without a Cron Trigger), a
 * fresh install before its first tick, and a site whose sync has stopped.
 * The store stays the widget's normal source: it costs no provider request
 * and holds the comparison week, which the provider can no longer answer
 * exactly.
 *
 * The window is the widget's own week, which sits inside every provider's
 * exact window, so nothing read here is sampled beyond today's row.
 *
 * The answer is kept for five minutes, because the widget loads on every
 * dashboard visit of every editor. It lives under the sync state's key as
 * a prefix so one `kv.list` returns both: the first widget load on a site
 * that never synced spends nine of the ten bridge calls a sandboxed
 * invocation gets, and a read of its own would be the tenth.
 */

import type { PluginContext } from "emdash/plugin";

import type { Problem } from "../i18n.js";
import type { DailyRow, Provider } from "../providers/types.js";
import type { AnalyticsSettings } from "../settings.js";
import { STATE_KEY, WIDGET_DAYS, type SyncState } from "./scheduler.js";
import { addDays, utcDay } from "./window.js";

export const LIVE_KEY = `${STATE_KEY}:live`;

/** How long one live answer serves every widget load. */
export const LIVE_TTL_MS = 5 * 60_000;

/** A store whose last sync is older than this no longer speaks for today. */
export const STALE_AFTER_MS = 60 * 60_000;

const TOP_PATHS = 5;

export interface LiveWeek {
	fetchedAt: string;
	/** What was asked, so a changed setting never serves the old site's numbers. */
	source: string;
	series: DailyRow[];
	topPaths: Array<{ path: string; pageviews: number; visits: number }>;
}

export type LiveResult = { ok: true; week: LiveWeek } | { ok: false; error: string; problem?: Problem };

/** The settings a live answer depends on, as one comparable string. */
export function liveSource(settings: AnalyticsSettings): string {
	return [settings.provider, settings.accountId, settings.siteTag, settings.hosts.join(",")].join("|");
}

export function storeIsStale(state: SyncState, now: Date): boolean {
	if (!state.lastSync) return true;
	const at = Date.parse(state.lastSync);
	return Number.isNaN(at) || now.getTime() - at > STALE_AFTER_MS;
}

/** The sync state and the kept live answer, in one bridge call. */
export async function readStateAndLive(ctx: PluginContext): Promise<{ state: SyncState; kept: LiveWeek | null }> {
	const rows = await ctx.kv.list(STATE_KEY);
	const valueOf = (key: string) => rows.find((row) => row.key === key)?.value;
	return {
		state: (valueOf(STATE_KEY) as SyncState | undefined) ?? { phase: "overview" },
		kept: (valueOf(LIVE_KEY) as LiveWeek | undefined) ?? null,
	};
}

/**
 * The live week: the kept answer while it is fresh and for the same
 * source, otherwise one provider request and one write. `fresh` skips the
 * kept answer, which is what Refresh asks for.
 */
export async function liveWeek(
	ctx: PluginContext,
	provider: Provider,
	source: string,
	kept: LiveWeek | null,
	now: Date,
	options: { fresh?: boolean } = {},
): Promise<LiveResult> {
	if (!options.fresh && kept && kept.source === source) {
		const age = now.getTime() - Date.parse(kept.fetchedAt);
		if (age >= 0 && age < LIVE_TTL_MS) return { ok: true, week: kept };
	}

	const today = utcDay(now);
	const res = await provider.overview({ since: addDays(today, -(WIDGET_DAYS - 1)), until: today });
	if (!res.ok) return res;

	const week: LiveWeek = {
		fetchedAt: now.toISOString(),
		source,
		series: res.value.series,
		topPaths: res.value.topPaths.slice(0, TOP_PATHS).map((p) => ({
			path: p.path,
			pageviews: p.pageviews,
			visits: p.visits,
		})),
	};
	await ctx.kv.set(LIVE_KEY, week);
	return { ok: true, week };
}
