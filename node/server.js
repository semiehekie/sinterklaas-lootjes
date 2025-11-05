const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const path = require("path");
const fs = require("fs").promises;
const crypto = require("crypto");

const app = express();
const PORT = 5000;

// CONFIGURATIE VARIABELEN - PAS HIER AAN
const CONFIG = {
    drawingDate: "2025-11-07T00:00:00", // Datum vanaf wanneer lootjes trekken mogelijk is
    minParticipants: 2, // Minimum aantal deelnemers voordat lootjes trekken mogelijk is
    allowMultipleDraws: false, // Of iemand meerdere keren mag trekken
};

// Encryption key - in productie zou je dit in een environment variable moeten zetten
const ENCRYPTION_KEY = crypto.scryptSync(
    "veldhuizen-draws-secret-2025",
    "salt",
    32,
);
const ALGORITHM = "aes-256-cbc";

// Encrypt data
function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
}

// Decrypt data
function decrypt(text) {
    const parts = text.split(":");
    const iv = Buffer.from(parts.shift(), "hex");
    const encryptedText = parts.join(":");
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

// Data directory
const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const DRAWS_FILE = path.join(DATA_DIR, "draws.json");

// In-memory database (loaded from files)
let users = [];
let draws = {}; // { username: drawnPerson }

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (error) {
        console.error("Error creating data directory:", error);
    }
}

// Load users from file
async function loadUsers() {
    try {
        const data = await fs.readFile(USERS_FILE, "utf8");
        users = JSON.parse(data);
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error("Error loading users:", error);
        }
        users = [];
    }
}

// Save users to file
async function saveUsers() {
    try {
        await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error("Error saving users:", error);
    }
}

// Load draws from file
async function loadDraws() {
    try {
        const data = await fs.readFile(DRAWS_FILE, "utf8");
        const decrypted = decrypt(data);
        draws = JSON.parse(decrypted);
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error("Error loading draws:", error);
        }
        draws = {};
    }
}

// Save draws to file
async function saveDraws() {
    try {
        const jsonData = JSON.stringify(draws, null, 2);
        const encrypted = encrypt(jsonData);
        await fs.writeFile(DRAWS_FILE, encrypted);
    } catch (error) {
        console.error("Error saving draws:", error);
    }
}

// Initialize data on startup
async function initializeData() {
    await ensureDataDir();
    await loadUsers();
    await loadDraws();
    console.log(
        `Geladen: ${users.length} gebruikers en ${Object.keys(draws).length} trekkingen`,
    );
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));
app.use("/css", express.static(path.join(__dirname, "..", "css")));
app.use("/js", express.static(path.join(__dirname, "..", "js")));
app.use(
    session({
        secret: "veldhuizen-secret-2025",
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
    }),
);

// Check if drawing is allowed
function isDrawingAllowed() {
    const now = new Date();
    const drawDate = new Date(CONFIG.drawingDate);
    return now >= drawDate && users.length >= CONFIG.minParticipants;
}

// Get all participants except those already drawn
function getAvailableParticipants(currentUser) {
    const alreadyDrawn = Object.values(draws);
    return users
        .filter((u) => u.username !== currentUser)
        .filter((u) => !alreadyDrawn.includes(u.username));
}

// API Routes
app.post("/api/register", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res
            .status(400)
            .json({ error: "Gebruikersnaam en wachtwoord zijn verplicht" });
    }

    if (users.find((u) => u.username === username)) {
        return res.status(400).json({ error: "Gebruikersnaam bestaat al" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({
        username,
        password: hashedPassword,
        wishlist: "",
        hobbies: "",
    });

    await saveUsers();
    res.json({ success: true });
});

app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;

    const user = users.find((u) => u.username === username);
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

app.get("/api/me", (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Niet ingelogd" });
    }

    const user = users.find((u) => u.username === req.session.username);
    if (!user) {
        return res.status(401).json({ error: "Gebruiker niet gevonden" });
    }

    res.json({
        username: user.username,
        wishlist: user.wishlist || "",
        hobbies: user.hobbies || "",
    });
});

app.get("/api/participants", (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Niet ingelogd" });
    }

    const participants = users.map((u) => ({
        username: u.username,
        wishlist: u.wishlist || "",
        hobbies: u.hobbies || "",
    }));
    res.json(participants);
});

app.post("/api/profile", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Niet ingelogd" });
    }

    const { wishlist, hobbies } = req.body;
    const user = users.find((u) => u.username === req.session.username);

    if (!user) {
        return res.status(404).json({ error: "Gebruiker niet gevonden" });
    }

    user.wishlist = wishlist || "";
    user.hobbies = hobbies || "";

    await saveUsers();

    res.json({
        username: user.username,
        wishlist: user.wishlist,
        hobbies: user.hobbies,
    });
});

app.get("/api/my-draw", (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Niet ingelogd" });
    }

    const drawnPerson = draws[req.session.username];

    if (!drawnPerson) {
        return res.json({ drawn: null });
    }

    const drawnUser = users.find((u) => u.username === drawnPerson);

    res.json({
        drawn: drawnPerson,
        wishlist: drawnUser?.wishlist || "",
        hobbies: drawnUser?.hobbies || "",
    });
});

app.post("/api/draw", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Niet ingelogd" });
    }

    if (!isDrawingAllowed()) {
        const drawDate = new Date(CONFIG.drawingDate);
        return res.status(403).json({
            error: `Lootjes trekken is pas mogelijk vanaf ${drawDate.toLocaleDateString(
                "nl-NL",
                {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                },
            )}!`,
        });
    }

    const currentUser = req.session.username;

    if (!CONFIG.allowMultipleDraws && draws[currentUser]) {
        return res
            .status(400)
            .json({ error: "Je hebt al een lootje getrokken!" });
    }

    const available = getAvailableParticipants(currentUser);

    if (available.length === 0) {
        return res.status(400).json({
            error: "Er zijn geen beschikbare personen meer om te trekken!",
        });
    }

    const randomIndex = Math.floor(Math.random() * available.length);
    const drawn = available[randomIndex].username;

    draws[currentUser] = drawn;
    await saveDraws();

    res.json({ drawn });
});

// Admin endpoints
app.get("/api/admin/users", (req, res) => {
    const userList = users.map((u) => ({ username: u.username }));
    res.json(userList);
});

app.post("/api/admin/delete-user", async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ error: "Gebruikersnaam is verplicht" });
    }

    const userIndex = users.findIndex((u) => u.username === username);

    if (userIndex === -1) {
        return res.status(404).json({ error: "Gebruiker niet gevonden" });
    }

    // Remove user
    users.splice(userIndex, 1);

    // Remove from draws if present
    if (draws[username]) {
        delete draws[username];
    }

    // Remove if someone drew this user
    for (const [drawer, drawn] of Object.entries(draws)) {
        if (drawn === username) {
            delete draws[drawer];
        }
    }

    await saveUsers();
    await saveDraws();

    res.json({ success: true });
});

app.listen(PORT, "0.0.0.0", async () => {
    await initializeData();
    console.log(`Server draait op http://0.0.0.0:${PORT}`);
    console.log(`Configuratie:`);
    console.log(`  - Trekkingsdatum: ${CONFIG.drawingDate}`);
    console.log(`  - Minimum deelnemers: ${CONFIG.minParticipants}`);
    console.log(
        `  - Meerdere trekkingen toegestaan: ${CONFIG.allowMultipleDraws}`,
    );
});
