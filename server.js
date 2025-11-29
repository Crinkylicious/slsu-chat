// -----------------------------
//  SLSU CHAT SERVER (FIXED)
// -----------------------------
const http = require("http");
const WebSocket = require("ws");
const os = require("os");

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
        for (const config of iface) {
            if (config.family === "IPv4" && !config.internal) {
                return config.address;
            }
        }
    }
    return "localhost";
}

const localIP = getLocalIP();
const PORT = 8080;

// -----------------------------
//  CREATE HTTP SERVER
// -----------------------------
const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("SLSU Chat WebSocket Server is running.\n");
});

// -----------------------------
//  CREATE WEBSOCKET SERVER
// -----------------------------
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, ws => {
        wss.emit("connection", ws, req);
    });
});

// -----------------------------
//  CHAT SERVER STORAGE
// -----------------------------
let users = {};            // username → { ws, id }
let conversations = {};     // "user1-user2" → [messages]

function generateUserId() {
    return "user_" + Math.random().toString(36).substring(2, 10);
}

// -----------------------------
//  WEBSOCKET CONNECTION
// -----------------------------
wss.on("connection", ws => {
    console.log("🔥 A user connected");
    let username = null;
    let userId = generateUserId();

    ws.on("message", data => {
        try {
            const msg = JSON.parse(data);

            switch (msg.type) {

                // -------------------------
                // REGISTER USER
                // -------------------------
                case "register":
                    username = msg.username.trim();
                    users[username] = { ws, id: userId };

                    console.log(`👤 ${username} joined`);

                    // Send back confirmation
                    ws.send(JSON.stringify({
                        type: "registered",
                        username,
                        onlineUsers: Object.keys(users).filter(u => u !== username),
                        totalUsers: Object.keys(users).length
                    }));

                    // Notify others
                    broadcast({
                        type: "user_joined",
                        username,
                        totalUsers: Object.keys(users).length
                    });
                break;

                // -------------------------
                // GET ONLINE USERS
                // -------------------------
                case "get_users":
                    ws.send(JSON.stringify({
                        type: "user_list",
                        users: Object.keys(users).filter(u => u !== username),
                        totalUsers: Object.keys(users).length
                    }));
                break;

                // -------------------------
                // DIRECT MESSAGE
                // -------------------------
                case "direct_message":
                    const recipient = msg.recipient;
                    const text = msg.message;

                    if (!users[recipient]) {
                        ws.send(JSON.stringify({ type: "error", message: "User not online" }));
                        return;
                    }

                    // Store conversation
                    const key = [username, recipient].sort().join("-");
                    if (!conversations[key]) conversations[key] = [];

                    let entry = {
                        sender: username,
                        message: text,
                        timestamp: new Date().toISOString()
                    };

                    conversations[key].push(entry);

                    // Send to recipient
                    users[recipient].ws.send(JSON.stringify({
                        type: "direct_message",
                        from: username,
                        message: text,
                        timestamp: entry.timestamp
                    }));

                    // Confirm to sender
                    ws.send(JSON.stringify({
                        type: "message_sent",
                        to: recipient,
                        message: text,
                        timestamp: entry.timestamp
                    }));

                    console.log(`💬 ${username} → ${recipient}: ${text}`);
                break;

                // -------------------------
                // GET CHAT HISTORY
                // -------------------------
                case "get_conversation":
                    const other = msg.with;
                    const convKey = [username, other].sort().join("-");
                    ws.send(JSON.stringify({
                        type: "conversation_history",
                        with: other,
                        history: conversations[convKey] || []
                    }));
                break;
            }

        } catch (err) {
            console.error("❌ Error processing message:", err);
        }
    });

    ws.on("close", () => {
        if (username && users[username]) {
            console.log(`❌ ${username} disconnected`);
            delete users[username];
            broadcast({
                type: "user_left",
                username,
                totalUsers: Object.keys(users).length
            });
        }
    });

    ws.on("error", err => {
        console.error("⚠ WebSocket error:", err);
    });
});

// -----------------------------
//  BROADCAST FUNCTION
// -----------------------------
function broadcast(data) {
    let message = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(message);
    });
}

// -----------------------------
//  START SERVER
// -----------------------------
server.listen(PORT, "0.0.0.0", () => {
    console.log("🚀 SLSU WebSocket Chat Server Running!");
    console.log("📡 Connect clients using:");
    console.log(`👉 ws://${localIP}:${PORT}`);
});
