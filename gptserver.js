const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const htmlPath = path.join(__dirname, "slsu-chat.html.html");
let htmlContent = "";

try {
    htmlContent = fs.readFileSync(htmlPath, "utf-8");
    console.log("📄 Loaded HTML file successfully");
} catch (err) {
    console.error("❌ Could not load HTML:", err);
}

const server = http.createServer((req, res) => {
    console.log("HTTP Request:", req.url);

    if (req.url === "/" || req.url === "") {
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end(htmlContent);

    } else if (req.url === "/slsulogo.png") {
        // Serve logo
        const logoPath = path.join(__dirname, "slsulogo.png");
        try {
            const img = fs.readFileSync(logoPath);
            res.writeHead(200, { "Content-Type": "image/png" });
            return res.end(img);
        } catch (err) {
            res.writeHead(404);
            return res.end("Logo not found");
        }
    }

    res.writeHead(404);
    res.end("Not Found");
});

// ------------------------ WEBSOCKET SERVER --------------------------

const wss = new WebSocket.Server({ server });

let clients = {};       // username → ws
let availableUsers = []; // list of usernames
let paired = {};         // username → partner

function pairUsers() {
    for (let u of availableUsers) {
        if (paired[u]) continue;

        const others = availableUsers.filter(
            x => x !== u && !paired[x]
        );

        if (others.length === 0) continue;

        const partner = others[0];

        paired[u] = partner;
        paired[partner] = u;

        availableUsers = availableUsers.filter(x => x !== u && x !== partner);

        if (clients[u]) clients[u].send(JSON.stringify({ type: "paired", partner }));
        if (clients[partner]) clients[partner].send(JSON.stringify({ type: "paired", partner: u }));

        console.log(`🔗 Paired ${u} ↔ ${partner}`);
    }
}

wss.on("connection", (ws) => {
    console.log("📥 New WS connection");

    let username = null;

    ws.on("message", (message) => {
        let data = {};
        try {
            data = JSON.parse(message);
        } catch (e) {
            return;
        }

        // REGISTER USER
        if (data.type === "register") {
            username = data.username;
            clients[username] = ws;
            availableUsers.push(username);

            console.log(`👤 ${username} registered`);
            pairUsers();
        }

        // MESSAGE RELAY
        else if (data.type === "message" && paired[username]) {
            const partner = paired[username];
            if (clients[partner]) {
                clients[partner].send(JSON.stringify({
                    type: "message",
                    from: username,
                    text: data.text
                }));
            }
        }

        // SKIP
        else if (data.type === "skip" && paired[username]) {
            const partner = paired[username];

            delete paired[username];
            delete paired[partner];

            availableUsers.push(username);
            availableUsers.push(partner);

            if (clients[partner]) {
                clients[partner].send(JSON.stringify({ type: "skipped" }));
            }

            pairUsers();
        }
    });

    ws.on("close", () => {
        console.log(`❌ ${username} disconnected`);

        availableUsers = availableUsers.filter(x => x !== username);

        if (paired[username]) {
            const partner = paired[username];
            delete paired[partner];
            if (clients[partner]) {
                clients[partner].send(JSON.stringify({ type: "partner_left" }));
                availableUsers.push(partner);
            }
        }

        delete paired[username];
        delete clients[username];

        pairUsers();
    });
});

server.listen(8080, "0.0.0.0", () => {
    console.log("🚀 SLSU WebSocket Chat Server Running!");
    console.log("👉 Connect at: http://192.168.1.2:8080/");
});
