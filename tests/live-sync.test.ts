import type { PluginRuntimeTestHost } from "@emdash-cms/plugin-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GRAPHQL_ENDPOINT } from "../src/providers/cloudflare.js";
import { LIVE_KEY, LIVE_TTL_MS, type LiveWeek } from "../src/sync/live.js";
import { daysBack, graphql, newHost, NOW, seedRollup, setState, synced, TODAY } from "./host.js";

/**
 * The widget's live read, through the sandbox: when it asks the provider,
 * when it reuses the kept answer, and when it leaves the store alone.
 */

let host: PluginRuntimeTestHost | undefined;

afterEach(async () => {
	await host?.dispose();
	host = undefined;
	vi.unstubAllEnvs();
});

/** What `newHost("cloudflare")` saves, as the live read keys its kept answer. */
const SOURCE = "cloudflare|acct-1|tag-1|example.test,www.example.test";

/** A week of 10 page views and 5 visits a day, with one top path. */
function weekReply(): Response {
	const series = daysBack(7).map((date) => ({
		count: 10,
		sum: { visits: 5 },
		avg: { sampleInterval: 1 },
		dimensions: { date },
	}));
	return graphql({
		totals: [{ count: 70, sum: { visits: 35 }, avg: { sampleInterval: 1 } }],
		series,
		pages: [{ count: 40, sum: { visits: 20 }, avg: { sampleInterval: 1 }, dimensions: { requestPath: "/live/" } }],
		refs: [],
		geo: [],
		devices: [],
	});
}

const kept = (ageMs: number, source = SOURCE): LiveWeek => ({
	fetchedAt: new Date(Date.now() - ageMs).toISOString(),
	source,
	series: [{ date: TODAY, pageviews: 3, visits: 2, sampleInterval: 1 }],
	topPaths: [{ path: "/kept/", pageviews: 3, visits: 2 }],
});

const textOf = (response: { blocks: unknown[] }) => JSON.stringify(response.blocks);

describe("a site that has never synced", () => {
	it("shows the last seven days from the provider, without a scheduler having run", async () => {
		host = await newHost("cloudflare");
		await host.http.respond(GRAPHQL_ENDPOINT, weekReply());

		const response = await host.admin.loadWidget("traffic");

		expect(host.http.requests()).toHaveLength(1);
		const text = textOf(response);
		expect(text).toContain('"value":"35"');
		expect(text).toContain('"value":"70"');
		expect(text).toContain("/live/");
		expect(text).toMatch(/Read live/);
		// Nothing is stored: storing is the sync's job, with its own write rules.
		await expect(host.inspect.storage.get("rollup", TODAY)).resolves.toBeNull();
	});

	it("asks only for the widget's own week, which no provider samples", async () => {
		host = await newHost("cloudflare");
		await host.http.respond(GRAPHQL_ENDPOINT, weekReply());
		await host.admin.loadWidget("traffic");

		const sent = JSON.parse(new TextDecoder().decode(host.http.requests()[0]!.body)) as {
			variables: { since: string; until: string };
		};
		expect(sent.variables).toMatchObject({ since: daysBack(7)[6], until: TODAY });
	});

	it("keeps the answer, so the next dashboard visit asks nobody", async () => {
		host = await newHost("cloudflare");
		await host.http.respond(GRAPHQL_ENDPOINT, weekReply());

		await host.admin.loadWidget("traffic");
		const second = await host.admin.loadWidget("traffic");

		expect(host.http.requests()).toHaveLength(1);
		expect(textOf(second)).toContain("/live/");
	});

	it("asks again once the kept answer is older than its five minutes", async () => {
		host = await newHost("cloudflare");
		await host.fixtures.plugin.kv(LIVE_KEY, kept(LIVE_TTL_MS + 60_000));
		await host.http.respond(GRAPHQL_ENDPOINT, weekReply());

		const response = await host.admin.loadWidget("traffic");

		expect(host.http.requests()).toHaveLength(1);
		expect(textOf(response)).toContain("/live/");
		expect(textOf(response)).not.toContain("/kept/");
	});

	it("does not show a kept answer that was read for another site tag", async () => {
		host = await newHost("cloudflare");
		await host.fixtures.plugin.kv(LIVE_KEY, kept(60_000, SOURCE.replace("tag-1", "tag-0")));
		await host.http.respond(GRAPHQL_ENDPOINT, weekReply());

		const response = await host.admin.loadWidget("traffic");

		expect(host.http.requests()).toHaveLength(1);
		expect(textOf(response)).not.toContain("/kept/");
	});

	it("re-reads on Refresh although a fresh answer is kept, and says so", async () => {
		host = await newHost("cloudflare");
		await host.fixtures.plugin.kv(LIVE_KEY, kept(60_000));
		await host.http.respond(GRAPHQL_ENDPOINT, weekReply());

		const response = await host.admin.act("widget:traffic", "analytics:refresh");

		expect(host.http.requests()).toHaveLength(1);
		expect(textOf(response)).toContain("/live/");
		expect(response.toast).toMatchObject({ type: "success", message: "Updated with the latest numbers." });
	});

	it("gives Cloudflare's reason and the way to the settings when the token is refused", async () => {
		host = await newHost("cloudflare");
		await host.http.respond(GRAPHQL_ENDPOINT, new Response("forbidden", { status: 403 }));

		const response = await host.admin.loadWidget("traffic");

		const text = textOf(response);
		expect(text).toMatch(/rejected the token \(403\)/);
		expect(text).toContain('"kind":"plugin-settings"');
		await expect(host.inspect.kv.get(LIVE_KEY)).resolves.toBeNull();
	});
});

describe("a site whose store is current", () => {
	it("reads the store and asks the provider nothing", async () => {
		host = await newHost("cloudflare");
		await seedRollup(host, 14);
		await setState(host, { ...synced, provider: "cloudflare" });

		const response = await host.admin.loadWidget("traffic");

		expect(host.http.requests()).toHaveLength(0);
		expect(textOf(response)).not.toMatch(/Read live/);
		expect(textOf(response)).toMatch(/Synced/);
	});
});

describe("a site whose sync has stopped", () => {
	it("lays the live week over the stored days and keeps the stored week for the comparison", async () => {
		host = await newHost("cloudflare");
		// Fourteen stored days of 10 page views and 5 visits; the live week reports the same per day.
		await seedRollup(host, 14);
		await setState(host, {
			...synced,
			provider: "cloudflare",
			lastSync: new Date(NOW.getTime() - 3 * 86_400_000).toISOString(),
		});
		await host.http.respond(GRAPHQL_ENDPOINT, weekReply());

		const response = await host.admin.loadWidget("traffic");

		expect(host.http.requests()).toHaveLength(1);
		const text = textOf(response);
		expect(text).toMatch(/Read live/);
		expect(text).toMatch(/Synced 3 days ago/);
		expect(text).toContain('"trend":"neutral"');
	});
});
