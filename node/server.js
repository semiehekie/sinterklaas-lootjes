require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 5000;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error("DATABASE_URL ontbreekt. Voeg een .env-file toe met je Neon-connection string.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("neon.tech") ? { rejectUnauthorized: false } : false,
});

const CONFIG = {
    drawingDate: "2026-09-25T00:00:00",
    minParticipants: 2,
    allowMultipleDraws: false,
};

let users = [];
let draws = {};
let revealedDraws = new Set();

async function createDatabaseSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            wishlist TEXT DEFAULT '',
            hobbies TEXT DEFAULT ''
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS draws (
            drawer_username TEXT PRIMARY KEY,
            drawn_username TEXT NOT NULL,
            revealed_at TIMESTAMPTZ,
            already_drawn BOOLEAN NOT NULL DEFAULT FALSE
        );
    `);

    await pool.query(
        "ALTER TABLE draws ADD COLUMN IF NOT EXISTS revealed_at TIMESTAMPTZ",
    );
    await pool.query(
        "ALTER TABLE draws ADD COLUMN IF NOT EXISTS already_drawn BOOLEAN NOT NULL DEFAULT FALSE",
    );

    await pool.query(`
        CREATE TABLE IF NOT EXISTS app_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);

    const migration = await pool.query(
        "SELECT 1 FROM app_metadata WHERE key = 'draw_revealed_state_migrated'",
    );
    if (migration.rowCount === 0) {
        await pool.query(
            "UPDATE draws SET already_drawn = TRUE, revealed_at = COALESCE(revealed_at, NOW())",
        );
        await pool.query(
            "INSERT INTO app_metadata (key, value) VALUES ('draw_revealed_state_migrated', 'true')",
        );
    }
}

async function loadUsers() {
    const result = await pool.query(
        "SELECT username, password, wishlist, hobbies FROM users ORDER BY username",
    );
    users = result.rows.map((row) => ({
        username: row.username,
        password: row.password,
        wishlist: row.wishlist || "",
        hobbies: row.hobbies || "",
    }));
}

async function loadDraws() {
    const result = await pool.query(
        "SELECT drawer_username, drawn_username, already_drawn FROM draws",
    );
    draws = Object.fromEntries(
        result.rows.map((row) => [row.drawer_username, row.drawn_username]),
    );
    revealedDraws = new Set(
        result.rows
            .filter((row) => row.already_drawn)
            .map((row) => row.drawer_username),
    );
}

async function initializeData() {
    try {
        await pool.query("SELECT 1");
        await createDatabaseSchema();
        await loadUsers();
        await loadDraws();
        console.log(
            `Verbonden met PostgreSQL/Neon: ${users.length} gebruikers en ${Object.keys(draws).length} trekkingen geladen.`,
        );
    } catch (error) {
        console.error("Kan geen verbinding maken met Neon/PostgreSQL:", error.message);
        process.exit(1);
    }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));
app.use("/css", express.static(path.join(__dirname, "..", "css")));
app.use("/js", express.static(path.join(__dirname, "..", "js")));
app.use(
    session({
        secret: process.env.SESSION_SECRET || "veldhuizen-secret-2025",
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
    }),
);

function isDrawingAllowed() {
    const now = new Date();
    const drawDate = new Date(CONFIG.drawingDate);
    return now >= drawDate && users.length >= CONFIG.minParticipants;
}

function shuffle(items) {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[randomIndex]] = [
            shuffled[randomIndex],
            shuffled[index],
        ];
    }

    return shuffled;
}

function findAssignments(drawers, recipients, assignments = {}) {
    if (drawers.length === 0) return assignments;

    const orderedDrawers = [...drawers].sort((first, second) => {
        const firstOptions = recipients.filter((recipient) => recipient !== first).length;
        const secondOptions = recipients.filter((recipient) => recipient !== second).length;
        return firstOptions - secondOptions;
    });
    const drawer = orderedDrawers[0];
    const remainingDrawers = orderedDrawers.slice(1);

    for (const recipient of shuffle(recipients.filter((name) => name !== drawer))) {
        const remainingRecipients = recipients.filter((name) => name !== recipient);
        const result = findAssignments(
            remainingDrawers,
            remainingRecipients,
            { ...assignments, [drawer]: recipient },
        );

        if (result) return result;
    }

    return null;
}

async function ensureDrawAssignments() {
    const assignedDrawers = new Set(Object.keys(draws));
    const assignedRecipients = new Set(Object.values(draws));
    const remainingDrawers = users
        .map((user) => user.username)
        .filter((username) => !assignedDrawers.has(username));
    const remainingRecipients = users
        .map((user) => user.username)
        .filter((username) => !assignedRecipients.has(username));

    if (remainingDrawers.length === 0) return;

    const assignments = findAssignments(remainingDrawers, remainingRecipients);
    if (!assignments) {
        throw new Error("Er kan geen geldige verdeling van de lootjes worden gemaakt.");
    }

    for (const [drawer, recipient] of Object.entries(assignments)) {
        await pool.query(
            `INSERT INTO draws (drawer_username, drawn_username, already_drawn)
             VALUES ($1, $2, FALSE)
             ON CONFLICT (drawer_username) DO NOTHING`,
            [drawer, recipient],
        );
    }

    await loadDraws();
}

app.post("/api/register", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Gebruikersnaam en wachtwoord zijn verplicht" });
    }

    const existingUser = await pool.query("SELECT 1 FROM users WHERE username = $1", [username]);
    if (existingUser.rowCount > 0) {
        return res.status(400).json({ error: "Gebruikersnaam bestaat al" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
        "INSERT INTO users (username, password, wishlist, hobbies) VALUES ($1, $2, '', '')",
        [username, hashedPassword],
    );
    await loadUsers();

    res.json({ success: true });
});

app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    const result = await pool.query(
        "SELECT username, password, wishlist, hobbies FROM users WHERE username = $1",
        [username],
    );
    const user = result.rows[0];

    if (!user) {
        return res.status(401).json({ error: "Ongeldige inloggegevens" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(401).json({ error: "Ongeldige inloggegevens" });
    }

    req.session.username = username;
    res.json({
        username: user.username,
        wishlist: user.wishlist || "",
        hobbies: user.hobbies || "",
    });
});

app.post("/api/logout", (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get("/api/me", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Niet ingelogd" });
    }

    const result = await pool.query(
        "SELECT username, wishlist, hobbies FROM users WHERE username = $1",
        [req.session.username],
    );
    const user = result.rows[0];

    if (!user) return res.status(401).json({ error: "Gebruiker niet gevonden" });

    res.json({
        username: user.username,
        wishlist: user.wishlist || "",
        hobbies: user.hobbies || "",
    });
});

app.get("/api/participants", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Niet ingelogd" });
    }

    const result = await pool.query(
        "SELECT username, wishlist, hobbies FROM users ORDER BY username",
    );

    res.json(
        result.rows.map((user) => ({
            username: user.username,
            wishlist: user.wishlist || "",
            hobbies: user.hobbies || "",
        })),
    );
});

app.post("/api/profile", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Niet ingelogd" });
    }

    const { wishlist, hobbies } = req.body;
    const result = await pool.query(
        "UPDATE users SET wishlist = $1, hobbies = $2 WHERE username = $3 RETURNING username, wishlist, hobbies",
        [wishlist || "", hobbies || "", req.session.username],
    );

    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: "Gebruiker niet gevonden" });

    await loadUsers();
    res.json({ username: user.username, wishlist: user.wishlist, hobbies: user.hobbies });
});

app.get("/api/my-draw", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Niet ingelogd" });
    }

    const result = await pool.query(
        `SELECT d.drawn_username, u.wishlist, u.hobbies
         FROM draws d
         LEFT JOIN users u ON u.username = d.drawn_username
         WHERE d.drawer_username = $1 AND d.already_drawn = TRUE`,
        [req.session.username],
    );

    const draw = result.rows[0];
    if (!draw) return res.json({ drawn: null, revealed: false });

    res.json({
        drawn: draw.drawn_username,
        wishlist: draw.wishlist || "",
        hobbies: draw.hobbies || "",
        revealed: revealedDraws.has(req.session.username),
    });
});

app.post("/api/draw", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Niet ingelogd" });
    }

    await loadUsers();
    await loadDraws();

    if (!isDrawingAllowed()) {
        const drawDate = new Date(CONFIG.drawingDate);
        return res.status(403).json({
            error: `Lootjes trekken is pas mogelijk vanaf ${drawDate.toLocaleDateString("nl-NL", {
                day: "numeric",
                month: "long",
                year: "numeric",
            })}!`,
        });
    }

    const currentUser = req.session.username;
    const user = users.find((candidate) => candidate.username === currentUser);

    if (!user || !user.wishlist.trim() || !user.hobbies.trim()) {
        return res.status(400).json({
            error: "Vul eerst je verlanglijstje en hobby's in bij Mijn Profiel.",
        });
    }

    if (revealedDraws.has(currentUser)) {
        return res.status(400).json({ error: "Je hebt je lootje al getrokken!" });
    }

    try {
        await ensureDrawAssignments();
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }

    const drawn = draws[currentUser];
    if (!drawn) {
        return res.status(400).json({ error: "Er kon geen lootje voor deze gebruiker worden gevonden." });
    }

    await pool.query(
        "UPDATE draws SET already_drawn = TRUE, revealed_at = NOW() WHERE drawer_username = $1 AND already_drawn = FALSE",
        [currentUser],
    );
    revealedDraws.add(currentUser);

    res.json({ drawn });
});

app.get("/api/admin/users", async (req, res) => {
    const result = await pool.query("SELECT username FROM users ORDER BY username");
    res.json(result.rows.map((row) => ({ username: row.username })));
});

app.post("/api/admin/delete-user", async (req, res) => {
    const { username } = req.body;

    if (!username) return res.status(400).json({ error: "Gebruikersnaam is verplicht" });

    const userCheck = await pool.query("SELECT 1 FROM users WHERE username = $1", [username]);
    if (userCheck.rowCount === 0) {
        return res.status(404).json({ error: "Gebruiker niet gevonden" });
    }

    await pool.query("DELETE FROM users WHERE username = $1", [username]);
    await pool.query("DELETE FROM draws WHERE drawer_username = $1", [username]);
    await pool.query("DELETE FROM draws WHERE drawn_username = $1", [username]);
    await loadUsers();
    await loadDraws();

    res.json({ success: true });
});

app.listen(PORT, "0.0.0.0", async () => {
    await initializeData();
    console.log(`Server draait op http://0.0.0.0:${PORT}`);
});
