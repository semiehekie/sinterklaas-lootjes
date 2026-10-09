class App {
    constructor() {
        this.currentUser = null;
        this.participants = [];
        this.currentTab = "wheel";
        this.authStep = "welcome";
        this.authError = "";
        this.onboarding = false;
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

    showAuthError(message) {
        this.authError = message;
        const errorElement = document.getElementById("auth-error");
        if (errorElement) errorElement.textContent = message;
    }

    async register(username, password) {
        try {
            const response = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            if (response.ok) {
                await this.login(username, password, true);
            } else {
                const error = await response.json();
                this.showAuthError(error.error || "Registratie mislukt");
            }
        } catch (error) {
            this.showAuthError("Registratie mislukt: " + error.message);
        }
    }

    async login(username, password, isNewAccount = false) {
        try {
            const response = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            if (response.ok) {
                this.currentUser = await response.json();
                this.onboarding = isNewAccount || !this.currentUser.wishlist?.trim() || !this.currentUser.hobbies?.trim();
                this.render();
            } else {
                const error = await response.json();
                this.showAuthError(error.error || "Login mislukt");
            }
        } catch (error) {
            this.showAuthError("Inloggen mislukt: " + error.message);
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

    showDrawModal() {
        const hasProfile =
            this.currentUser.wishlist &&
            this.currentUser.wishlist.trim() &&
            this.currentUser.hobbies &&
            this.currentUser.hobbies.trim();
        const modal = document.createElement("div");

        modal.className = "draw-modal-overlay";
        modal.innerHTML = hasProfile
            ? `
                <div class="draw-modal" role="dialog" aria-modal="true" aria-labelledby="draw-modal-title">
                    <h2 id="draw-modal-title">Even opletten</h2>
                    <p>De naam die tijdens het draaien op het rad staat, is niet altijd de naam die je echt hebt getrokken.</p>
                    <p>Kijk na het draaien bij <strong>Mijn Getrokken Lootje</strong> voor het juiste resultaat.</p>
                    <button type="button" class="draw-modal-ok">OK, draai het rad</button>
                </div>
            `
            : `
                <div class="draw-modal" role="dialog" aria-modal="true" aria-labelledby="draw-modal-title">
                    <h2 id="draw-modal-title">Profiel eerst invullen</h2>
                    <p>Vul eerst je verlanglijstje en hobby's in. Daarna kun je een lootje trekken.</p>
                    <button type="button" class="draw-modal-profile">Ga naar profiel</button>
                </div>
            `;

        document.body.appendChild(modal);

        const closeModal = () => modal.remove();
        const profileButton = modal.querySelector(".draw-modal-profile");
        const okButton = modal.querySelector(".draw-modal-ok");

        if (profileButton) {
            profileButton.addEventListener("click", () => {
                closeModal();
                this.switchTab("profile");
            });
        }

        if (okButton) {
            okButton.addEventListener("click", () => {
                closeModal();
                this.spinWheel();
            });
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

            const wheel = document.querySelector("#wheel svg");
            const randomSpins = 5 + Math.random() * 3;
            const wheelParticipants = this.participants.filter(
                (p) => p.username !== this.currentUser.username,
            );
            const targetIndex = wheelParticipants.findIndex(
                (p) => p.username === data.drawn,
            );

            if (targetIndex === -1) {
                document.getElementById("result").innerHTML =
                    `<div class="error-message">${data.drawn} staat niet op het rad. Vernieuw de pagina en probeer opnieuw.</div>`;
                return;
            }

            const degreesPerSegment = 360 / wheelParticipants.length;
            const targetCenter = (targetIndex + 0.5) * degreesPerSegment;
            const totalRotation = randomSpins * 360 - targetCenter;

            if (wheel) {
                wheel.style.transformOrigin = "50% 50%";
                wheel.style.transform = `rotate(${totalRotation}deg)`;
            }

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

    renderAuthPage(isLogin = true) {
        if (this.authStep === "welcome") {
            return `
                <div class="container invitation-page">
                    <div class="invitation-icon" aria-hidden="true">🎁</div>
                    <p class="invitation-kicker">Sinterklaas 2026</p>
                    <h1>Hallo, u bent uitgenodigd voor lootjes trekken!</h1>
                    <p class="invitation-intro">Leuk dat je meedoet. Kies hieronder wat bij jou past. We leggen alles stap voor stap uit.</p>
                    <div class="draw-reminder gift-expectation" role="note">
                        <strong>Wat doen we met Sinterklaas?</strong>
                        <p>We maken <span class="geen-accent">geen</span> surprise. Het gaat om een gedichtje, een cadeautje en eventueel iets geks of grappigs.</p>
                    </div>
                    <div class="invitation-choices">
                        <button type="button" class="invitation-choice" id="choose-login">
                            <span>🔑 Ik heb al een account</span>
                            <small>Log in met je bestaande gebruikersnaam en wachtwoord.</small>
                        </button>
                        <button type="button" class="invitation-choice" id="choose-register">
                            <span>✨ Ik doe mee voor 2026</span>
                            <small>Maak een account aan en vul daarna je verlanglijstje in.</small>
                        </button>
                    </div>
                    <div class="footer-credits">Gemaakt door <a href="https://semhekman.nl" target="_blank" rel="noopener">Sem Hekman</a> 💻</div>
                </div>
            `;
        }

        const isLoginStep = this.authStep === "login";
        return `
            <div class="container guided-auth-page">
                <button type="button" class="back-link" id="auth-back">← Terug</button>
                <p class="invitation-kicker">Stap 1 van 2 · Account</p>
                <h1>${isLoginStep ? "Welkom terug!" : "Maak je account aan"}</h1>
                <p class="invitation-intro">${isLoginStep ? "Vul je gebruikersnaam en wachtwoord in om verder te gaan." : "Kies een gebruikersnaam die je herkent en bedenk een wachtwoord. Bewaar je wachtwoord goed."}</p>
                <div class="auth-form-container guided-auth-form">
                    <form id="auth-form">
                        <div class="form-group">
                            <label for="auth-username">Gebruikersnaam</label>
                            <input type="text" id="auth-username" required autocomplete="username" placeholder="Bijvoorbeeld: Sam" ${isLoginStep ? "" : "minlength=\"2\" maxlength=\"24\""}>
                            ${isLoginStep ? "" : '<small class="field-help">Zo herkennen anderen jou bij het lootjes trekken.</small>'}
                        </div>
                        <div class="form-group">
                            <label for="auth-password">Wachtwoord</label>
                            <input type="password" id="auth-password" required autocomplete="${isLoginStep ? "current-password" : "new-password"}" placeholder="${isLoginStep ? "Je wachtwoord" : "Minimaal 4 tekens"}" ${isLoginStep ? "" : "minlength=\"4\""}>
                            ${isLoginStep ? "" : '<small class="field-help">Gebruik minimaal 4 tekens. Je hebt dit straks nodig om opnieuw in te loggen.</small>'}
                        </div>
                        <div id="auth-error" class="error-message auth-error" role="alert">${this.authError}</div>
                        <button type="submit" class="auth-submit-btn">${isLoginStep ? "Inloggen en verdergaan 🎅" : "Account maken en verdergaan 🎁"}</button>
                    </form>
                </div>
                <p class="step-note">Daarna vul je je verlanglijstje en hobby's in. Dat helpt degene die jou trekt om een leuk cadeau te kiezen.</p>
                <div class="footer-credits">Gemaakt door <a href="https://semhekman.nl" target="_blank" rel="noopener">Sem Hekman</a> 💻</div>
            </div>
        `;
    }

    renderOnboardingPage() {
        if (this.onboarding === "finished") {
            return `
                <div class="container guided-auth-page onboarding-page">
                    <p class="invitation-kicker">Stap 3 van 3 · Klaar om mee te doen</p>
                    <div class="invitation-icon" aria-hidden="true">🎅</div>
                    <h1>Je bent helemaal klaar!</h1>
                    <p class="invitation-intro">Je account en verlanglijstje zijn opgeslagen. Je kunt nu meedoen met het lootjes trekken.</p>
                    <div class="draw-reminder gift-expectation" role="note">
                        <strong>Even handig om te weten:</strong>
                        <p>We maken <span class="geen-accent">geen</span> surprise. We doen een gedichtje, een cadeautje en eventueel iets geks of grappigs.</p>
                    </div>
                    <div class="draw-reminder" role="note">
                        <strong>Belangrijk als je straks een lootje trekt:</strong>
                        <p>Kijk naar de naam die staat bij <strong>‘Mijn Getrokken Lootje’</strong>. De naam die je op het rad ziet terwijl het draait, kan verkeerd zijn. Alleen de naam bij ‘Mijn Getrokken Lootje’ is de juiste.</p>
                    </div>
                    <button type="button" id="onboarding-finish">Begrepen, naar de lootjes 🎁</button>
                </div>
            `;
        }

        return `
            <div class="container guided-auth-page onboarding-page">
                <p class="invitation-kicker">Stap 2 van 2 · Jouw profiel</p>
                <h1>Leuk je te ontmoeten, ${this.currentUser.username}!</h1>
                <p class="invitation-intro">Vul hieronder wat ideeën in. Je kunt later altijd terugkomen om je lijstje aan te passen.</p>
                <div class="auth-form-container guided-auth-form">
                    <form id="onboarding-form">
                        <div class="form-group">
                            <label for="onboarding-wishlist">Wat wil je graag krijgen?</label>
                            <textarea id="onboarding-wishlist" required placeholder="Zet elke wens op een nieuwe regel. Bijvoorbeeld:\nEen boek\nEen spelletje\nChocolade">${this.currentUser.wishlist || ""}</textarea>
                            <small class="field-help">Een paar ideeën zijn al genoeg. Zo kan jouw lootjegever iets uitkiezen dat bij jou past.</small>
                        </div>
                        <div class="form-group">
                            <label for="onboarding-hobbies">Wat vind je leuk om te doen?</label>
                            <textarea id="onboarding-hobbies" required placeholder="Bijvoorbeeld:\nLezen\nVoetballen\nTekenen">${this.currentUser.hobbies || ""}</textarea>
                            <small class="field-help">Noem hobby's of interesses. Dit geeft extra inspiratie voor een cadeau.</small>
                        </div>
                        <div id="onboarding-error" class="error-message auth-error" role="alert"></div>
                        <button type="submit">Verlanglijstje opslaan en klaar zijn 🎁</button>
                    </form>
                </div>
                <p class="step-note">Je verlanglijstje is zichtbaar voor de andere deelnemers, zodat zij een passend cadeau kunnen bedenken.</p>
            </div>
        `;
    }

    renderLoginPage() {
        return this.renderAuthPage(true);
    }

    renderRegisterPage() {
        return this.renderAuthPage(false);
    }

    renderAdminPage() {
        return `
            <div class="container admin-page">
                <h1>🔧 Admin Paneel</h1>
                <h2>Gebruikersbeheer</h2>
                <div id="admin-message"></div>
                <div class="users-admin-list" id="users-admin-list">
                    <p style="text-align: center; color: #666;">Laden...</p>
                </div>
                <button class="logout-btn" id="admin-logout-btn">Terug naar app 🚪</button>
                
                <div class="footer-credits">
                    Gemaakt door <a href="https://semhekman.nl" target="_blank">Sem Hekman</a> 💻
                </div>
            </div>
        `;
    }

    async loadUsersForAdmin() {
        try {
            const response = await fetch("/api/admin/users");
            if (response.ok) {
                const users = await response.json();
                const adminList = document.getElementById("users-admin-list");

                if (users.length === 0) {
                    adminList.innerHTML =
                        '<p style="text-align: center; color: #666;">Geen gebruikers gevonden</p>';
                    return;
                }

                adminList.innerHTML = users
                    .map(
                        (user) => `
                    <div class="admin-user-card">
                        <div class="admin-user-info">
                            <strong>${user.username}</strong>
                        </div>
                        <button class="delete-user-btn" onclick="app.deleteUser('${user.username}')">
                            🗑️ Verwijderen
                        </button>
                    </div>
                `,
                    )
                    .join("");
            } else {
                document.getElementById("users-admin-list").innerHTML =
                    '<p style="text-align: center; color: #c41e3a;">Geen toegang tot admin paneel</p>';
            }
        } catch (error) {
            console.error("Failed to load users:", error);
        }
    }

    async deleteUser(username) {
        if (
            !confirm(
                `Weet je zeker dat je gebruiker "${username}" wilt verwijderen?`,
            )
        ) {
            return;
        }

        try {
            const response = await fetch("/api/admin/delete-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username }),
            });

            if (response.ok) {
                document.getElementById("admin-message").innerHTML =
                    '<div class="success-message">✅ Gebruiker verwijderd!</div>';
                setTimeout(() => {
                    document.getElementById("admin-message").innerHTML = "";
                }, 3000);
                await this.loadUsersForAdmin();
            } else {
                const error = await response.json();
                alert(error.error || "Verwijderen mislukt");
            }
        } catch (error) {
            alert("Verwijderen mislukt: " + error.message);
        }
    }

    async loadMyDraw() {
        try {
            const response = await fetch("/api/my-draw");
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error("Failed to load draw:", error);
        }
        return null;
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

        let segments = "";

        // Filter out current user from wheel participants
        const wheelParticipants = this.participants.filter(
            (p) => p.username !== this.currentUser.username,
        );

        if (wheelParticipants.length > 0) {
            const numSegments = wheelParticipants.length;
            const anglePerSegment = 360 / numSegments;

            // Create SVG segments
            let svgPaths = "";
            for (let i = 0; i < numSegments; i++) {
                const startAngle = i * anglePerSegment;
                const endAngle = (i + 1) * anglePerSegment;
                const color = colors[i % colors.length];

                // Convert angles to radians
                const startRad = ((startAngle - 90) * Math.PI) / 180;
                const endRad = ((endAngle - 90) * Math.PI) / 180;

                // Calculate path points (radius = 150)
                const x1 = 150 + 150 * Math.cos(startRad);
                const y1 = 150 + 150 * Math.sin(startRad);
                const x2 = 150 + 150 * Math.cos(endRad);
                const y2 = 150 + 150 * Math.sin(endRad);

                const largeArc = anglePerSegment > 180 ? 1 : 0;

                svgPaths += `
                    <path d="M 150,150 L ${x1},${y1} A 150,150 0 ${largeArc},1 ${x2},${y2} Z" 
                          fill="${color}" 
                          stroke="white" 
                          stroke-width="3"/>
                `;
            }

            // Create labels
            let labels = "";
            for (let i = 0; i < numSegments; i++) {
                const angle = i * anglePerSegment + anglePerSegment / 2;
                const angleRad = ((angle - 90) * Math.PI) / 180;
                const radius = 85; // Moved closer to center
                const x = 150 + radius * Math.cos(angleRad);
                const y = 150 + radius * Math.sin(angleRad);

                // Truncate long names
                const username = wheelParticipants[i].username;
                const displayName =
                    username.length > 10
                        ? username.substring(0, 8) + ".."
                        : username;

                labels += `
                    <text x="${x}" y="${y}" 
                          text-anchor="middle" 
                          dominant-baseline="middle"
                          fill="white" 
                          font-weight="bold" 
                          font-size="13"
                          style="text-shadow: 2px 2px 4px rgba(0,0,0,0.8); pointer-events: none;">
                        ${displayName}
                    </text>
                `;
            }

            segments = `
                <svg width="300" height="300" viewBox="0 0 300 300" style="transform: rotate(0deg); transform-origin: 50% 50%; transition: transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99);">
                    ${svgPaths}
                    ${labels}
                    <circle cx="150" cy="150" r="20" fill="#333" stroke="white" stroke-width="4"/>
                    <circle cx="150" cy="150" r="12" fill="white"/>
                </svg>
            `;
        } else {
            segments =
                '<div style="text-align: center; padding: 50px;">Geen deelnemers gevonden</div>';
        }

        // Check if user has filled in wishlist
        const hasWishlist = this.currentUser.wishlist && this.currentUser.wishlist.trim();
        const wishlistReminder = !hasWishlist ? `
            <div class="wishlist-reminder">
                <div class="reminder-icon">🎁</div>
                <div class="reminder-content">
                    <h3>Vergeet je verlanglijstje niet!</h3>
                    <p>Help anderen jou te verrassen door je wensen te delen</p>
                    <button class="reminder-button" data-tab="profile">
                        📝 Verlanglijstje Invullen
                    </button>
                </div>
            </div>
        ` : '';

        return `
            <div class="container">
                <h1>🎅 Sinterklaas Lootjes Trekken 🎁</h1>
                <div class="user-welcome">Welkom, ${this.currentUser.username}! 👞</div>
                
                ${wishlistReminder}
                
                <div class="nav-tabs">
                    <button class="nav-tab ${this.currentTab === "wheel" ? "active" : ""}" data-tab="wheel">
                        🎡 Lootjes Trekken
                    </button>
                    <button class="nav-tab ${this.currentTab === "mydraw" ? "active" : ""}" data-tab="mydraw">
                        🎁 Mijn Getrokken Lootje
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
                            🎅 Trek je lootje en ontdek wie je gaat verrassen! 🎁
                        </div>
                        <div class="wheel-notice">
                            ℹ️ Let op: Het rad kan soms een verkeerde naam tonen tijdens het draaien.<br>
                            De <strong>juiste naam</strong> verschijnt altijd hieronder na het trekken! ⬇️
                        </div>
                        <button id="spin-btn">Trek een lootje! 🎅</button>
                        <div id="result"></div>
                    </div>
                </div>

                <div class="tab-content ${this.currentTab === "mydraw" ? "active" : ""}" id="mydraw-tab">
                    <div class="profile-section">
                        <h2>🎁 Mijn Getrokken Lootje</h2>
                        <div id="my-draw-content">
                            <p style="text-align: center; color: #666;">Laden...</p>
                        </div>
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
                
                <div class="footer-credits">
                    Gemaakt door <a href="https://semhekman.nl" target="_blank">Sem Hekman</a> 💻
                </div>
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

        // Reset wheel rotation when switching to wheel tab
        if (tabName === "wheel") {
            setTimeout(() => {
                const wheel = document.querySelector("#wheel svg");
                if (wheel && !wheel.style.transform.includes("rotate")) {
                    wheel.style.transform = "rotate(0deg)";
                }
            }, 50);
        }
    }

    async render() {
        const app = document.getElementById("app");

        // Check for admin page via hash
        if (window.location.hash === "#admin") {
            app.innerHTML = this.renderAdminPage();
            await this.loadUsersForAdmin();

            document
                .getElementById("admin-logout-btn")
                .addEventListener("click", () => {
                    window.location.hash = "";
                    this.render();
                });
            return;
        }

        if (!this.currentUser) {
            app.innerHTML = this.renderAuthPage();

            const loginChoice = document.getElementById("choose-login");
            const registerChoice = document.getElementById("choose-register");
            if (loginChoice) {
                loginChoice.addEventListener("click", () => {
                    this.authStep = "login";
                    this.authError = "";
                    this.render();
                });
            }
            if (registerChoice) {
                registerChoice.addEventListener("click", () => {
                    this.authStep = "register";
                    this.authError = "";
                    this.render();
                });
            }

            const backButton = document.getElementById("auth-back");
            if (backButton) {
                backButton.addEventListener("click", () => {
                    this.authStep = "welcome";
                    this.authError = "";
                    this.render();
                });
            }

            const authForm = document.getElementById("auth-form");
            if (authForm) {
                authForm.addEventListener("submit", (e) => {
                    e.preventDefault();
                    const username = document.getElementById("auth-username").value.trim();
                    const password = document.getElementById("auth-password").value;

                    if (this.authStep === "login") {
                        this.login(username, password);
                    } else {
                        this.register(username, password);
                    }
                });
            }
        } else if (this.onboarding) {
            app.innerHTML = this.renderOnboardingPage();
            const onboardingForm = document.getElementById("onboarding-form");
            if (onboardingForm) {
                onboardingForm.addEventListener("submit", async (e) => {
                    e.preventDefault();
                    const wishlist = document.getElementById("onboarding-wishlist").value.trim();
                    const hobbies = document.getElementById("onboarding-hobbies").value.trim();
                    const errorElement = document.getElementById("onboarding-error");

                    try {
                        const response = await fetch("/api/profile", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ wishlist, hobbies }),
                        });
                        const data = await response.json();
                        if (!response.ok) {
                            errorElement.textContent = data.error || "Opslaan is niet gelukt. Probeer het opnieuw.";
                            return;
                        }

                        this.currentUser = data;
                        this.onboarding = "finished";
                        this.render();
                    } catch (error) {
                        errorElement.textContent = "Opslaan is niet gelukt: " + error.message;
                    }
                });
            }
            const finishOnboardingButton = document.getElementById("onboarding-finish");
            if (finishOnboardingButton) {
                finishOnboardingButton.addEventListener("click", () => {
                    this.onboarding = false;
                    this.currentTab = "wheel";
                    this.render();
                });
            }
        } else {
            app.innerHTML = await this.renderHomePage();

            document.querySelectorAll(".nav-tab").forEach((tab) => {
                tab.addEventListener("click", (e) => {
                    this.switchTab(e.target.dataset.tab);
                });
            });
            
            // Add listener for reminder button if it exists
            const reminderBtn = document.querySelector(".reminder-button");
            if (reminderBtn) {
                reminderBtn.addEventListener("click", (e) => {
                    this.switchTab(e.target.dataset.tab);
                });
            }

            const spinBtn = document.getElementById("spin-btn");
            if (spinBtn) {
                spinBtn.addEventListener("click", () => {
                    this.showDrawModal();
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

            // Load my draw if on that tab
            if (this.currentTab === "mydraw") {
                const myDraw = await this.loadMyDraw();
                const myDrawContent =
                    document.getElementById("my-draw-content");

                if (myDraw && myDraw.drawn) {
                    const wishlistItems = myDraw.wishlist
                        ? myDraw.wishlist
                              .split("\n")
                              .filter((i) => i.trim())
                              .map(
                                  (item) =>
                                      `<div class="wishlist-item">🎁 ${item}</div>`,
                              )
                              .join("")
                        : '<p style="color: #666;">Nog geen verlanglijstje ingevuld</p>';

                    const hobbiesText = myDraw.hobbies
                        ? myDraw.hobbies
                              .split("\n")
                              .filter((i) => i.trim())
                              .map(
                                  (item) =>
                                      `<div class="wishlist-item">⭐ ${item}</div>`,
                              )
                              .join("")
                        : '<p style="color: #666;">Nog geen hobby\'s ingevuld</p>';

                    myDrawContent.innerHTML = `
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h3 style="font-size: 28px; color: #4CAF50;">
                                Je hebt <strong>${myDraw.drawn}</strong> getrokken! 🎅
                            </h3>
                        </div>
                        <h3 style="margin-top: 20px; margin-bottom: 10px;">🎁 Verlanglijstje:</h3>
                        ${wishlistItems}
                        <h3 style="margin-top: 20px; margin-bottom: 10px;">⭐ Hobby's & Interesses:</h3>
                        ${hobbiesText}
                    `;
                } else {
                    myDrawContent.innerHTML = `
                        <p style="text-align: center; color: #666; font-size: 18px;">
                            Je hebt nog geen lootje getrokken! 🎡<br><br>
                            Ga naar "Lootjes Trekken" om een naam te trekken.
                        </p>
                    `;
                }
            }
        }
    }
}

const app = new App();
