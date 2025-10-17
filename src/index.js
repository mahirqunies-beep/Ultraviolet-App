import { createServer } from "node:http";
import { join } from "node:path";
import { hostname } from "node:os";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import wisp from "wisp-server-node";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

// static paths
import { publicPath } from "ultraviolet-static";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const fastify = Fastify({
	serverFactory: (handler) => {
		return createServer()
			.on("request", (req, res) => {
				res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
				res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
				handler(req, res);
			})
			.on("upgrade", (req, socket, head) => {
				if (req.url.endsWith("/wisp/")) wisp.routeRequest(req, socket, head);
				else socket.end();
			});
	},
});

// Memory storage file path
const MEMORY_FILE = join(process.cwd(), "chat_memory.json");

// Initialize memory storage
let chatMemory = { lastUrl: "", lastSearch: "", timestamp: null };

// Load existing memory
if (existsSync(MEMORY_FILE)) {
	try {
		const data = readFileSync(MEMORY_FILE, "utf8");
		chatMemory = JSON.parse(data);
	} catch (err) {
		console.log("Could not load chat memory, starting fresh");
	}
}

// Save memory to file
function saveMemory() {
	try {
		writeFileSync(MEMORY_FILE, JSON.stringify(chatMemory, null, 2));
	} catch (err) {
		console.error("Failed to save chat memory:", err);
	}
}

// Serve custom public directory first
fastify.register(fastifyStatic, {
	root: join(process.cwd(), "public"),
	decorateReply: true,
});

// Serve UV static files with a different prefix to avoid conflicts
fastify.register(fastifyStatic, {
	root: publicPath,
	prefix: "/uv-static/",
	decorateReply: false,
});

fastify.get("/uv/uv.config.js", (req, res) => {
	return res.sendFile("uv/uv.config.js", join(process.cwd(), "public"));
});

// API endpoints for chat memory
fastify.post("/api/memory/save", async (request, reply) => {
	try {
		const { url, search } = request.body;
		chatMemory.lastUrl = url || "";
		chatMemory.lastSearch = search || "";
		chatMemory.timestamp = new Date().toISOString();
		saveMemory();
		return { success: true, message: "Memory saved" };
	} catch (error) {
		reply.code(500);
		return { success: false, message: "Failed to save memory" };
	}
});

fastify.get("/api/memory/load", async (request, reply) => {
	try {
		return { success: true, data: chatMemory };
	} catch (error) {
		reply.code(500);
		return { success: false, message: "Failed to load memory" };
	}
});

fastify.register(fastifyStatic, {
	root: uvPath,
	prefix: "/uv/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: epoxyPath,
	prefix: "/epoxy/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: baremuxPath,
	prefix: "/baremux/",
	decorateReply: false,
});

fastify.server.on("listening", () => {
	const address = fastify.server.address();

	// by default we are listening on 0.0.0.0 (every interface)
	// we just need to list a few
	console.log("Listening on:");
	console.log(`\thttp://localhost:${address.port}`);
	console.log(`\thttp://${hostname()}:${address.port}`);
	console.log(
		`\thttp://${
			address.family === "IPv6" ? `[${address.address}]` : address.address
		}:${address.port}`
	);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
	console.log("SIGTERM signal received: closing HTTP server");
	fastify.close();
	process.exit(0);
}

let port = parseInt(process.env.PORT || "");

if (isNaN(port)) port = 8080;

fastify.listen({
	port: port,
	host: "0.0.0.0",
});
