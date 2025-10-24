class App {
    constructor() {
        this.currentUser = null;
        this.participants = [];
        this.currentTab = "wheel";
        this.init();
    }

    async init() {
        await this.checkAuth();
        this.render();
    }

    async checkAuth() {
        try {
            const response = await fetch("/api/me");
            if (response.ok) {
                this.currentUser = await response.json();
            }
        } catch (error) {
            console.error("Auth check failed:", error);
        }
    }

    async register(username, password) {
        try {
            const response = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            if (response.ok) {
                await this.login(username, password);
            } else {
                const error = await response.json();
                alert(error.error || "Registratie mislukt");
            }
        } catch (error) {
            alert("Registratie mislukt: " + error.message);
        }
    }

    async login(username, password) {
        try {
            const response = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            if (response.ok) {
                this.currentUser = await response.json();
                this.render();
            } else {
                const error = await response.json();
                alert(error.error || "Login mislukt");
            }
        } catch (error) {
            alert("Login mislukt: " + error.message);
        }
    }

    async logout() {
        await fetch("/api/logout", { method: "POST" });
        this.currentUser = null;
        this.render();
    }

    async loadParticipants() {
        const response = await fetch("/api/participants");
        this.participants = await response.json();
    }

    async updateProfile(wishlist, hobbies) {
        try {
            const response = await fetch("/api/profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ wishlist, hobbies }),
            });

            if (response.ok) {
                this.currentUser = await response.json();
                document.getElementById("profile-message").innerHTML =
                    '<div class="success-message">✅ Profiel opgeslagen!</div>';
                setTimeout(() => {
                    document.getElementById("profile-message").innerHTML = "";
                }, 3000);
            }
        } catch (error) {
            alert("Opslaan mislukt: " + error.message);
        }
    }

    async spinWheel() {
        try {
            const response = await fetch("/api/draw", { method: "POST" });
            const data = await response.json();

            if (!response.ok) {
                document.getElementById("result").innerHTML =
                    `<div class="error-message">${data.error}</div>`;
                return;
            }

            const wheel = document.getElementById("wheel");
            const randomSpins = 5 + Math.random() * 3;
            const targetIndex = this.participants.findIndex(
                (p) => p.username === data.drawn,
            );
            const degreesPerSegment = 360 / this.participants.length;
            const targetDegrees =
                360 - targetIndex * degreesPerSegment - degreesPerSegment / 2;
            const totalRotation = randomSpins * 360 + targetDegrees;

            wheel.style.transform = `rotate(${totalRotation}deg)`;

            setTimeout(() => {
                document.getElementById("result").innerHTML =
                    `<div class="result-message success">
                         Je hebt <strong>${data.drawn}</strong> getrokken! 🎁
                    </div>`;
                document.getElementById("spin-btn").disabled = true;
            }, 4000);
        } catch (error) {
            document.getElementById("result").innerHTML =
                `<div class="error-message">Er ging iets mis: ${error.message}</div>`;
        }
    }

    renderLoginPage() {
        return `
            <div class="container">
                <h1>👞 Familie Veldhuizen Sinterklaas 🎁</h1>
                <h2>Login</h2>
                <div class="login-wrapper">
                    <div class="decorative-wheel">
                        <div class="decorative-icon">🎁</div>
                        <div class="decorative-icon">🍫</div>
                        <div class="decorative-icon">👞</div>
                        <div class="decorative-icon">🍬</div>
                    </div>
                    <div class="login-form-container">
                        <form id="login-form">
                            <div class="form-group">
                                <label>Gebruikersnaam</label>
                                <input type="text" id="login-username" required>
                            </div>
                            <div class="form-group">
                                <label>Wachtwoord</label>
                                <input type="password" id="login-password" required>
                            </div>
                            <button type="submit">Inloggen 🎅</button>
                        </form>
                        <div class="link-text">
                            Nog geen account? <a href="#" id="show-register">Registreer hier</a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderRegisterPage() {
        return `
            <div class="container">
                <h1>🎅 Familie Veldhuizen Sinterklaas 🎁</h1>
                <h2>Registreren</h2>
                <div class="login-wrapper">
                    <div class="decorative-wheel">
                        <div class="decorative-icon">🎁</div>
                        <div class="decorative-icon">🍫</div>
                        <div class="decorative-icon">👞</div>
                        <div class="decorative-icon">🍬</div>
                    </div>
                    <div class="login-form-container">
                        <form id="register-form">
                            <div class="form-group">
                                <label>Gebruikersnaam</label>
                                <input type="text" id="register-username" required>
                            </div>
                            <div class="form-group">
                                <label>Wachtwoord</label>
                                <input type="password" id="register-password" required>
                            </div>
                            <button type="submit">Registreer 🎁</button>
                        </form>
                        <div class="link-text">
                            Al een account? <a href="#" id="show-login">Login hier</a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async renderHomePage() {
        await this.loadParticipants();

        const colors = [
            "#FF6B6B",
            "#4ECDC4",
            "#FFE66D",
            "#95E1D3",
            "#F38181",
            "#AA96DA",
            "#FCBAD3",
            "#A8E6CF",
        ];
        const degreesPerSegment =
            this.participants.length > 0 ? 360 / this.participants.length : 0;

        const segments =
            this.participants.length > 0
                ? this.participants
                      .map((participant, index) => {
                          const rotation = index * degreesPerSegment;
                          const color = colors[index % colors.length];
                          const labelRotation =
                              rotation + degreesPerSegment / 2;
                          const radius = 120;
                          const x =
                              Math.cos(((labelRotation - 90) * Math.PI) / 180) *
                              radius;
                          const y =
                              Math.sin(((labelRotation - 90) * Math.PI) / 180) *
                              radius;

                          return `
                <div class="wheel-segment" style="
                    background: ${color};
                    transform: rotate(${rotation}deg) skewY(${-90 + degreesPerSegment}deg);
                    clip-path: polygon(0 0, 100% 0, 100% 100%);
                    border-right: 3px solid white;
                    box-shadow: inset 0 0 10px rgba(0,0,0,0.1);
                ">
                </div>
                <div style="
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    transform: translate(-50%, -50%) translate(${x}px, ${y}px);
                    font-weight: bold;
                    color: white;
                    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.9);
                    font-size: 15px;
                    pointer-events: none;
                    z-index: 10;
                    white-space: nowrap;
                    background: rgba(0, 0, 0, 0.3);
                    padding: 4px 8px;
                    border-radius: 5px;
                ">
                    ${participant.username}
                </div>
            `;
                      })
                      .join("")
                : '<div style="text-align: center; padding: 50px;">Geen deelnemers gevonden</div>';

        return `
            <div class="container">
                <h1>🎅 Sinterklaas Lootjes Trekken 🎁</h1>
                <div class="user-welcome">Welkom, ${this.currentUser.username}! 👞</div>

                <div class="nav-tabs">
                    <button class="nav-tab ${this.currentTab === "wheel" ? "active" : ""}" data-tab="wheel">
                        🎡 Lootjes Trekken
                    </button>
                    <button class="nav-tab ${this.currentTab === "profile" ? "active" : ""}" data-tab="profile">
                        📝 Mijn Profiel
                    </button>
                    <button class="nav-tab ${this.currentTab === "others" ? "active" : ""}" data-tab="others">
                        👥 Verlanglijstjes
                    </button>
                </div>

                <div class="tab-content ${this.currentTab === "wheel" ? "active" : ""}" id="wheel-tab">
                    <h2>Deelnemers aan het lootjes trekken:</h2>
                    <div class="wheel-container">
                        <div class="wheel-wrapper">
                            <div class="wheel-arrow"></div>
                            <div id="wheel">
                                ${segments}
                            </div>
                        </div>
                        <div class="info-text">
                            🎅 Lootjes trekken is mogelijk vanaf 5 november 2025 🎁
                        </div>
                        <button id="spin-btn">Trek een lootje! 🎅</button>
                        <div id="result"></div>
                    </div>
                </div>

                <div class="tab-content ${this.currentTab === "profile" ? "active" : ""}" id="profile-tab">
                    <div class="profile-section">
                        <h2>🎁 Mijn Verlanglijstje</h2>
                        <div id="profile-message"></div>
                        <form id="profile-form">
                            <div class="form-group">
                                <label>Verlanglijstje (één item per regel)</label>
                                <textarea id="wishlist" placeholder="Bijv:\nEen boek\nEen spelletje\nChocolade">${this.currentUser.wishlist || ""}</textarea>
                            </div>
                            <div class="form-group">
                                <label>Hobby's & Interesses</label>
                                <textarea id="hobbies" placeholder="Bijv:\nLezen\nFotografie\nKoken">${this.currentUser.hobbies || ""}</textarea>
                            </div>
                            <button type="submit">Opslaan 💾</button>
                        </form>
                    </div>
                </div>

                <div class="tab-content ${this.currentTab === "others" ? "active" : ""}" id="others-tab">
                    <h2>👥 Verlanglijstjes van anderen</h2>
                    <div class="users-list" id="users-list">
                        ${this.renderUsersList()}
                    </div>
                </div>

                <button class="logout-btn" id="logout-btn">Uitloggen 🚪</button>
            </div>
        `;
    }

    renderUsersList() {
        return this.participants
            .filter((p) => p.username !== this.currentUser.username)
            .map(
                (user) => `
                <div class="user-card" onclick="app.showUserDetails('${user.username}')">
                    <h3>🎅 ${user.username}</h3>
                    <p style="font-size: 12px; color: #666;">Klik om te bekijken</p>
                </div>
            `,
            )
            .join("");
    }

    async showUserDetails(username) {
        const user = this.participants.find((p) => p.username === username);
        if (!user) return;

        const wishlistItems = user.wishlist
            ? user.wishlist
                  .split("\n")
                  .filter((i) => i.trim())
                  .map((item) => `<div class="wishlist-item">🎁 ${item}</div>`)
                  .join("")
            : '<p style="color: #666;">Nog geen verlanglijstje ingevuld</p>';

        const hobbiesText = user.hobbies
            ? user.hobbies
                  .split("\n")
                  .filter((i) => i.trim())
                  .map((item) => `<div class="wishlist-item">⭐ ${item}</div>`)
                  .join("")
            : '<p style="color: #666;">Nog geen hobby\'s ingevuld</p>';

        document.getElementById("users-list").innerHTML = `
            <div style="grid-column: 1/-1;">
                <button onclick="app.render()" style="margin-bottom: 20px; width: auto; padding: 10px 20px;">
                    ← Terug naar overzicht
                </button>
                <div class="profile-section">
                    <h2>🎅 ${username}</h2>
                    <h3 style="margin-top: 20px; margin-bottom: 10px;">🎁 Verlanglijstje:</h3>
                    ${wishlistItems}
                    <h3 style="margin-top: 20px; margin-bottom: 10px;">⭐ Hobby's & Interesses:</h3>
                    ${hobbiesText}
                </div>
            </div>
        `;
    }

    switchTab(tabName) {
        this.currentTab = tabName;
        this.render();
    }

    async render() {
        const app = document.getElementById("app");

        if (!this.currentUser) {
            app.innerHTML = this.renderLoginPage();

            document
                .getElementById("login-form")
                .addEventListener("submit", (e) => {
                    e.preventDefault();
                    const username =
                        document.getElementById("login-username").value;
                    const password =
                        document.getElementById("login-password").value;
                    this.login(username, password);
                });

            document
                .getElementById("show-register")
                .addEventListener("click", (e) => {
                    e.preventDefault();
                    app.innerHTML = this.renderRegisterPage();

                    document
                        .getElementById("register-form")
                        .addEventListener("submit", (e) => {
                            e.preventDefault();
                            const username =
                                document.getElementById(
                                    "register-username",
                                ).value;
                            const password =
                                document.getElementById(
                                    "register-password",
                                ).value;
                            this.register(username, password);
                        });

                    document
                        .getElementById("show-login")
                        .addEventListener("click", (e) => {
                            e.preventDefault();
                            this.render();
                        });
                });
        } else {
            app.innerHTML = await this.renderHomePage();

            document.querySelectorAll(".nav-tab").forEach((tab) => {
                tab.addEventListener("click", (e) => {
                    this.switchTab(e.target.dataset.tab);
                });
            });

            const spinBtn = document.getElementById("spin-btn");
            if (spinBtn) {
                spinBtn.addEventListener("click", () => {
                    this.spinWheel();
                });
            }

            const profileForm = document.getElementById("profile-form");
            if (profileForm) {
                profileForm.addEventListener("submit", (e) => {
                    e.preventDefault();
                    const wishlist = document.getElementById("wishlist").value;
                    const hobbies = document.getElementById("hobbies").value;
                    this.updateProfile(wishlist, hobbies);
                });
            }

            document
                .getElementById("logout-btn")
                .addEventListener("click", () => {
                    this.logout();
                });
        }
    }
}

const app = new App();
