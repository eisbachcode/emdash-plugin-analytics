import type { PluginRuntimeTestHost } from "@emdash-cms/plugin-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GRAPHQL_ENDPOINT, RUM_DATASET } from "../src/providers/cloudflare.js";
import type { SyncState } from "../src/sync/scheduler.js";
import { addDays, utcDay } from "../src/sync/window.js";
import { bridgeCalls, bridgeCallsWithLimit } from "./bridge-calls.js";
import { daysBack, fullTick, graphql, newHost, pathsOf, seedEntries, setState, synced, TODAY } from "./host.js";

/**
 * A scheduled tick runs a second step where the host has room for it, and
 * finds out for itself whether it has: nothing tells a plugin the host's
 * version or its subrequest limit.
 */

/** What a sandboxed invocation gets before EmDash 1.5.0. */
const OLD_LIMIT = 10;

let host: PluginRuntimeTestHost | undefined;

afterEach(async () => {
	await host?.dispose();
	host = undefined;
	vi.unstubAllEnvs();
});

const PATHS = pathsOf(3);

function overviewReply(): Response {
	const series = daysBack(8).map((date) => ({
		count: 10,
		sum: { visits: 5 },
		avg: { sampleInterval: 1 },
		dimensions: { date },
	}));
	return graphql({ totals: [{ count: 80, sum: { visits: 40 } }], series, pages: [], refs: [], geo: [] });
}

/** Seven views a day on every path, for the eight days a paths step asks about. */
function pathsReply(): Response {
	const rows = PATHS.flatMap((path) =>
		daysBack(8).map((date) => ({
			count: 7,
			sum: { visits: 3 },
			avg: { sampleInterval: 1 },
			dimensions: { date, requestPath: path },
		})),
	);
	return graphql({ [RUM_DATASET]: rows });
}

/** A caught-up Cloudflare site whose next step is an overview. */
async function caughtUp(extra: Partial<SyncState> = {}): Promise<PluginRuntimeTestHost> {
	const runtime = await newHost("cloudflare");
	await seedEntries(runtime, PATHS);
	await setState(runtime, { ...synced, provider: "cloudflare", ...extra });
	return runtime;
}

const stateOf = (runtime: PluginRuntimeTestHost) => runtime.inspect.kv.get<SyncState>("state");
const viewsOf = async (runtime: PluginRuntimeTestHost) =>
	(await runtime.inspect.storage.get<{ views7: number }>("entries", PATHS[0]!))?.views7;

describe("a scheduled tick", () => {
	it("runs the overview and a paths slot on a host with room for both", async () => {
		host = await caughtUp();
		await host.http.respond(GRAPHQL_ENDPOINT, overviewReply());
		await host.http.respond(GRAPHQL_ENDPOINT, pathsReply());

		await bridgeCalls(fullTick(host));

		expect(host.http.requests()).toHaveLength(2);
		await expect(host.inspect.storage.get("rollup", addDays(TODAY, -1))).resolves.not.toBeNull();
		expect(await viewsOf(host)).toBe(49);
		const state = await stateOf(host);
		expect(state?.lastError).toBeUndefined();
		expect(state?.phase).toBe("overview");
		expect(state?.second).toBeUndefined();
		expect(state?.oneStepOn).toBeUndefined();
	});

	it("runs one step a tick for the rest of the day once the host cut a second step short", async () => {
		host = await caughtUp();
		await host.http.respond(GRAPHQL_ENDPOINT, overviewReply());
		// The cut-short step still spends its request; the next tick asks again.
		await host.http.respond(GRAPHQL_ENDPOINT, pathsReply());
		await host.http.respond(GRAPHQL_ENDPOINT, pathsReply());
		await host.http.respond(GRAPHQL_ENDPOINT, overviewReply());

		const cut = await bridgeCallsWithLimit(OLD_LIMIT, fullTick(host));

		expect(cut.length).toBeGreaterThan(OLD_LIMIT);
		await expect(host.inspect.storage.get("rollup", addDays(TODAY, -1))).resolves.not.toBeNull();
		expect(await viewsOf(host)).toBe(0);
		expect(await stateOf(host)).toMatchObject({ phase: "paths", second: "pending" });

		const next = await bridgeCallsWithLimit(OLD_LIMIT, fullTick(host));

		expect(next.length, next.join(", ")).toBeLessThanOrEqual(OLD_LIMIT);
		expect(await viewsOf(host)).toBe(49);
		const state = await stateOf(host);
		expect(state?.phase).toBe("overview");
		expect(state?.second).toBeUndefined();
		expect(state?.oneStepOn).toBe(utcDay(new Date()));
		expect(state?.lastError).toBeUndefined();

		const later = await bridgeCallsWithLimit(OLD_LIMIT, fullTick(host));

		expect(later.length, later.join(", ")).toBeLessThanOrEqual(OLD_LIMIT);
		expect(await stateOf(host)).toMatchObject({ phase: "paths" });
		expect((await stateOf(host))?.second).toBeUndefined();
		expect(host.http.requests()).toHaveLength(4);
	});

	it("tries a second step again on the next day", async () => {
		host = await caughtUp({ oneStepOn: addDays(TODAY, -1) });
		await host.http.respond(GRAPHQL_ENDPOINT, overviewReply());
		await host.http.respond(GRAPHQL_ENDPOINT, pathsReply());

		await bridgeCalls(fullTick(host));

		expect(host.http.requests()).toHaveLength(2);
		expect(await viewsOf(host)).toBe(49);
		expect((await stateOf(host))?.second).toBeUndefined();
	});

	it("does not follow a failed step with a second one", async () => {
		host = await caughtUp();
		await host.http.respond(GRAPHQL_ENDPOINT, new Response("upstream down", { status: 502 }));
		await host.http.respond(GRAPHQL_ENDPOINT, pathsReply());

		await bridgeCalls(fullTick(host));

		expect(host.http.requests()).toHaveLength(1);
		const state = await stateOf(host);
		expect(state?.lastProblem?.key).toBe("cfHttp");
		expect(state?.second).toBeUndefined();
		expect(state?.oneStepOn).toBeUndefined();
	});
});
