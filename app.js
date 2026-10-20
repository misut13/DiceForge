        // Global State
        let profiles = [];
        let currentProfile = null;
        let lastRoll = null;
        let isLastRollVisible = false;
        let deleteMode = false;
        const historyBaseUrl = window.location.pathname + window.location.search;
        let isNavigatingThroughHistory = false;
        let resultHistoryActive = false;
        let diceAnimationHideTimeout = null;
        let attackFormulaLayoutFrame = null;
        const defaultAppSettings = { animationEnabled: true };
        let appSettings = { ...defaultAppSettings };

        function pushHistoryState(view, data = {}) {
            if (!window.history || !history.pushState || isNavigatingThroughHistory) {
                return;
            }
            const state = { view, ...data };
            history.pushState(state, '', historyBaseUrl);
        }

        function replaceHistoryState(view, data = {}) {
            if (!window.history || !history.replaceState) {
                return;
            }
            const state = { view, ...data };
            history.replaceState(state, '', historyBaseUrl);
        }

        function hideLastRollResult({ triggeredByHistory = false } = {}) {
            hideDiceAnimation();
            const bar = document.getElementById('lastRollBar');
            const isBarVisible = !!(bar && bar.style.display !== 'none');
            if (!isBarVisible && !resultHistoryActive) {
                return false;
            }
            const hadHistoryEntry = resultHistoryActive;
            isLastRollVisible = false;
            updateLastRollBar();
            if (hadHistoryEntry && !triggeredByHistory && window.history && typeof history.back === 'function') {
                history.back();
            }
            return isBarVisible || hadHistoryEntry;
        }

        function navigateBackOr(fallback) {
            if (hideLastRollResult()) {
                return;
            }
            const hasHistorySupport = window.history && typeof history.back === 'function';
            const hasAppState = !!(hasHistorySupport && history.state && history.state.view);
            if (hasHistorySupport && hasAppState) {
                history.back();
            } else if (typeof fallback === 'function') {
                fallback();
            }
        }

        function setDeleteModeState(isActive) {
            deleteMode = isActive;
            const profileContent = document.getElementById('profileContent');
            if (profileContent) {
                profileContent.classList.toggle('delete-mode', deleteMode);
            }
        }

        const standardDiceSides = [3, 4, 6, 8, 10, 12, 20, 100];
        const diceSoundFiles = [
            'sounds/dice1.wav',
            'sounds/dice2.wav',
            'sounds/dice3.wav',
            'sounds/dice4.wav',
            'sounds/dice5.wav'
        ];
        const multiDiceSoundFiles = [
            'sounds/multidice1.wav',
            'sounds/multidice2.wav',
            'sounds/multidice3.wav',
            'sounds/multidice4.wav',
            'sounds/multidice5.wav',
            'sounds/multidice6.wav'
        ];

        function playRandomSound(soundFiles) {
            if (!soundFiles || soundFiles.length === 0) {
                return;
            }
            const source = soundFiles[Math.floor(Math.random() * soundFiles.length)];
            const audio = new Audio(source);
            audio.play().catch(() => {});
        }

        function hideDiceAnimation() {
            if (diceAnimationHideTimeout) {
                clearTimeout(diceAnimationHideTimeout);
                diceAnimationHideTimeout = null;
            }
            const overlay = document.getElementById('diceAnimationOverlay');
            if (overlay) {
                overlay.classList.remove('active');
                overlay.setAttribute('aria-hidden', 'true');
            }
            const image = document.getElementById('diceAnimationImage');
            if (image) {
                image.onload = null;
                image.onerror = null;
                image.src = '';
            }
        }

        function showDiceAnimation() {
            if (!appSettings.animationEnabled) {
                hideDiceAnimation();
                return;
            }
            const overlay = document.getElementById('diceAnimationOverlay');
            const image = document.getElementById('diceAnimationImage');
            if (!overlay || !image) {
                return;
            }

            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');

            if (diceAnimationHideTimeout) {
                clearTimeout(diceAnimationHideTimeout);
            }
            const hideDelay = 2000;
            image.onload = () => {
                image.onload = null;
                image.onerror = null;
                if (diceAnimationHideTimeout) {
                    clearTimeout(diceAnimationHideTimeout);
                }
                diceAnimationHideTimeout = setTimeout(() => {
                    hideDiceAnimation();
                }, hideDelay);
            };
            image.onerror = () => {
                image.onload = null;
                image.onerror = null;
                hideDiceAnimation();
            };
            image.src = `dice.gif?${Date.now()}`;
        }

        // Persistenz über Local Storage
        function saveProfiles() {
            localStorage.setItem('profiles', JSON.stringify(profiles));
        }

        function loadProfiles() {
            try {
                const stored = localStorage.getItem('profiles');
                profiles = stored ? JSON.parse(stored) : [];
            } catch (e) {
                profiles = [];
            }
        }

        function saveAppSettings() {
            try {
                localStorage.setItem('appSettings', JSON.stringify(appSettings));
            } catch (e) {
                // Lokale Speicherung fehlgeschlagen, Einstellung wird nicht persistiert
            }
        }

        function loadAppSettings() {
            try {
                const stored = localStorage.getItem('appSettings');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    appSettings = { ...defaultAppSettings, ...parsed };
                } else {
                    appSettings = { ...defaultAppSettings };
                }
            } catch (e) {
                appSettings = { ...defaultAppSettings };
            }
            appSettings.animationEnabled = !!appSettings.animationEnabled;
        }

        // App initialisieren
        function initializeApp() {
            loadProfiles();
            loadAppSettings();
            setDeleteModeState(false);
            updateSettingsUI();
        }

        // Utility Functions
        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text.toString();
            return div.innerHTML;
        }

        function getDiceFunctionNameClasses(name) {
            const value = typeof name === 'string' ? name : '';
            const length = value.trim().length;
            const classes = ['dice-function-name'];

            if (length > 19) {
                classes.push('dice-function-name--small');
            } else if (length > 15) {
                classes.push('dice-function-name--medium');
            }

            return classes.join(' ');
        }

        function updateAttackFormulaLayouts(rootElement) {
            const scope = rootElement && typeof rootElement.querySelectorAll === 'function'
                ? rootElement
                : document;
            const formulas = scope.querySelectorAll('.dice-function-formula--attack');

            formulas.forEach(formula => {
                const attackPart = formula.querySelector('.dice-formula-part--attack');
                const damagePart = formula.querySelector('.dice-formula-part--damage');

                if (!attackPart || !damagePart) {
                    return;
                }

                formula.classList.remove('dice-function-formula--wrapped');

                const attackTop = attackPart.offsetTop;
                const damageTop = damagePart.offsetTop;

                if ((damageTop - attackTop) > 1) {
                    formula.classList.add('dice-function-formula--wrapped');
                }
            });
        }

        function scheduleAttackFormulaLayoutUpdate(rootElement) {
            if (attackFormulaLayoutFrame !== null) {
                cancelAnimationFrame(attackFormulaLayoutFrame);
            }

            attackFormulaLayoutFrame = requestAnimationFrame(() => {
                attackFormulaLayoutFrame = null;
                updateAttackFormulaLayouts(rootElement);
            });
        }

        function generateId() {
            return Date.now().toString() + Math.random().toString(36).substr(2, 9);
        }

        // Screen Management
        function showScreen(screenId) {
            closeSettings();
            document.querySelectorAll('.screen').forEach(screen => {
                screen.classList.remove('active');
            });
            document.getElementById(screenId).classList.add('active');

            const backBtn = document.getElementById('backBtn');
            const settingsBtn = document.getElementById('settingsBtn');
            const header = document.querySelector('.header');
            if (header) {
                header.classList.toggle('header--profile', screenId === 'profileDetailScreen');
            }
            if (screenId === 'profileListScreen') {
                backBtn.style.display = 'none';
                settingsBtn.style.display = 'none';
            } else if (screenId === 'profileDetailScreen') {
                backBtn.style.display = 'block';
                settingsBtn.style.display = 'block';
            } else {
                backBtn.style.display = 'block';
                settingsBtn.style.display = 'none';
            }
            updateLastRollBar();
        }

        function showProfileList(skipHistory = false) {
            showScreen('profileListScreen');
            setDeleteModeState(false);
            const headerTitle = document.getElementById('headerTitle');
            headerTitle.textContent = 'DiceForge';
            headerTitle.style.fontSize = '';
            document.getElementById('headerSubtitle').textContent = '';
            renderProfiles();
            if (!skipHistory) {
                pushHistoryState('profileList');
            }
        }

        function showCreateProfile(skipHistory = false) {
            showScreen('createProfileScreen');
            setDeleteModeState(false);
            const headerTitle = document.getElementById('headerTitle');
            headerTitle.textContent = 'Neues Profil';
            headerTitle.style.fontSize = '';
            document.getElementById('headerSubtitle').textContent = 'Charakterprofil erstellen';
            document.getElementById('profileName').value = '';
            if (!skipHistory) {
                pushHistoryState('createProfile');
            }
        }

        function showProfileDetail(skipHistory = false, profileId = null) {
            if (profileId) {
                const profile = profiles.find(p => p.id === profileId);
                if (profile) {
                    currentProfile = profile;
                } else {
                    currentProfile = null;
                }
            }
            showScreen('profileDetailScreen');
            setDeleteModeState(false);
            if (currentProfile) {
                const headerTitle = document.getElementById('headerTitle');
                headerTitle.textContent = currentProfile.name;
                // Reduce oversized profile names by two font-size steps
                headerTitle.style.fontSize = currentProfile.name.length > 14 ? '17px' : '';
                document.getElementById('headerSubtitle').textContent = '';
                renderProfileDetail();
                if (!skipHistory) {
                    pushHistoryState('profileDetail', { profileId: currentProfile.id });
                }
            } else {
                showProfileList(true);
                if (skipHistory) {
                    replaceHistoryState('profileList');
                }
            }
        }

        function showAddAttackFunction(skipHistory = false, profileId = null) {
            setDeleteModeState(false);
            if (profileId) {
                const profile = profiles.find(p => p.id === profileId);
                if (profile) {
                    currentProfile = profile;
                }
            }
            if (!currentProfile) {
                currentProfile = null;
                showProfileList(true);
                if (skipHistory) {
                    replaceHistoryState('profileList');
                }
                return;
            }
            showScreen('addAttackFunctionScreen');
            const headerTitle = document.getElementById('headerTitle');
            headerTitle.textContent = 'Angriffsfunktion';
            headerTitle.style.fontSize = '';
            document.getElementById('headerSubtitle').textContent = 'Neue Funktion hinzufügen';
            document.getElementById('attackFunctionName').value = '';
            document.getElementById('attackFunctionAttack').value = '';
            document.getElementById('attackFunctionDamage').value = '';
            if (!skipHistory) {
                pushHistoryState('addAttackFunction', { profileId: currentProfile.id });
            }
        }

        function showAddDiceFunction(skipHistory = false, profileId = null) {
            setDeleteModeState(false);
            if (profileId) {
                const profile = profiles.find(p => p.id === profileId);
                if (profile) {
                    currentProfile = profile;
                }
            }
            if (!currentProfile) {
                currentProfile = null;
                showProfileList(true);
                if (skipHistory) {
                    replaceHistoryState('profileList');
                }
                return;
            }
            showScreen('addDiceFunctionScreen');
            const headerTitle = document.getElementById('headerTitle');
            headerTitle.textContent = 'Würfelfunktion';
            headerTitle.style.fontSize = '';
            document.getElementById('headerSubtitle').textContent = 'Neue Funktion hinzufügen';
            document.getElementById('functionName').value = '';
            document.getElementById('functionFormula').value = '';
            if (!skipHistory) {
                pushHistoryState('addDiceFunction', { profileId: currentProfile.id });
            }
        }

        function showAddSimpleDice(skipHistory = false, profileId = null) {
            setDeleteModeState(false);
            if (profileId) {
                const profile = profiles.find(p => p.id === profileId);
                if (profile) {
                    currentProfile = profile;
                }
            }
            if (!currentProfile) {
                currentProfile = null;
                showProfileList(true);
                if (skipHistory) {
                    replaceHistoryState('profileList');
                }
                return;
            }
            showScreen('addSimpleDiceScreen');
            const headerTitle = document.getElementById('headerTitle');
            headerTitle.textContent = 'Einfacher Würfel';
            headerTitle.style.fontSize = '';
            document.getElementById('headerSubtitle').textContent = 'Neuen Würfel hinzufügen';
            document.getElementById('diceType').value = '6';
            document.getElementById('customDiceSides').value = '';
            document.getElementById('customDiceSides').style.display = 'none';
            if (!skipHistory) {
                pushHistoryState('addSimpleDice', { profileId: currentProfile.id });
            }
        }

        function handleHistoryNavigation(event) {
            const state = event.state || {};
            const view = state.view;
            if (view === 'profileDetail' && resultHistoryActive) {
                hideLastRollResult({ triggeredByHistory: true });
                return;
            }
            isNavigatingThroughHistory = true;
            switch (view) {
                case 'createProfile':
                    showCreateProfile(true);
                    break;
                case 'profileDetailResult':
                    isLastRollVisible = true;
                    resultHistoryActive = true;
                    showProfileDetail(true, state.profileId || (currentProfile && currentProfile.id) || null);
                    break;
                case 'profileDetail':
                    showProfileDetail(true, state.profileId || null);
                    break;
                case 'addAttackFunction':
                    showAddAttackFunction(true, state.profileId || null);
                    break;
                case 'addDiceFunction':
                    showAddDiceFunction(true, state.profileId || null);
                    break;
                case 'addSimpleDice':
                    showAddSimpleDice(true, state.profileId || null);
                    break;
                case 'profileList':
                default:
                    showProfileList(true);
                    break;
            }
            isNavigatingThroughHistory = false;
        }

        function initializeHistory() {
            if (!window.history || !history.replaceState) {
                return;
            }
            replaceHistoryState('profileList');
            window.addEventListener('popstate', handleHistoryNavigation);
        }

        // Profile Management
        function renderProfiles() {
            const profileList = document.getElementById('profileList');
            
            if (profiles.length === 0) {
                profileList.innerHTML = `
                    <div class="empty-state">
                        <div class="icon">🎲</div>
                        <h3>Keine Profile vorhanden</h3>
                        <p>Erstellen Sie Ihr erstes Charakterprofil</p>
                    </div>
                `;
                return;
            }

            profileList.innerHTML = '';
            profiles.forEach(profile => {
                const profileCard = document.createElement('div');
                profileCard.className = 'profile-card';
                profileCard.innerHTML = `
                    <button class="profile-delete-btn" title="Profil löschen">×</button>
                    <div class="profile-name">${escapeHtml(profile.name)}</div>
                    <div class="profile-stats">
                        <span>📜 ${(profile.diceFunctions || []).length + (profile.attackFunctions || []).length} Funktionen</span>
                        <span>🎲 ${(profile.simpleDices || []).length} Würfel</span>
                    </div>
                `;
                
                // Event Listeners
                profileCard.addEventListener('click', (e) => {
                    if (!e.target.classList.contains('profile-delete-btn')) {
                        openProfile(profile.id);
                    }
                });
                
                profileCard.querySelector('.profile-delete-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    profiles = profiles.filter(p => p.id !== profile.id);
                    saveProfiles();
                    renderProfiles();
                });
                
                profileList.appendChild(profileCard);
            });
        }

        function createProfile() {
            const name = document.getElementById('profileName').value.trim();
            if (!name) {
                alert('Bitte geben Sie einen Profilnamen ein.');
                return;
            }
            if (name.length > 24) {
                alert('Profilname darf maximal 24 Zeichen lang sein.');
                return;
            }

            const profile = {
                id: generateId(),
                name: name,
                diceFunctions: [],
                attackFunctions: [],
                simpleDices: standardDiceSides.map(sides => ({ sides }))
            };

            profiles.push(profile);
            saveProfiles();
            navigateBackOr(() => showProfileList(true));
        }

        function openProfile(profileId) {
            currentProfile = profiles.find(p => p.id === profileId);
            lastRoll = null;
            isLastRollVisible = false;
            showProfileDetail();
        }

        // Profile Detail Rendering
        function renderProfileDetail() {
            const attackFunctionsList = document.getElementById('attackFunctionsList');
            const diceFunctionsList = document.getElementById('diceFunctionsList');
            const simpleDicesList = document.getElementById('simpleDicesList');

            // Clear previous content
            attackFunctionsList.innerHTML = '';
            diceFunctionsList.innerHTML = '';
            simpleDicesList.innerHTML = '';

            // Angriffsfunktionen und Würfelfunktionen
            const hasAttackFunctions = currentProfile.attackFunctions && currentProfile.attackFunctions.length > 0;
            const hasDiceFunctions = currentProfile.diceFunctions && currentProfile.diceFunctions.length > 0;
            let shouldUpdateAttackLayouts = false;

            if (!hasAttackFunctions && !hasDiceFunctions) {
                attackFunctionsList.innerHTML = '<p style="color: #718096; font-style: italic;">Es sind keine Funktionen definiert</p>';
            } else {
                if (hasAttackFunctions) {
                    currentProfile.attackFunctions.forEach((func, index) => {
                        const card = document.createElement('div');
                        card.className = 'dice-function-card';
                        const nameClasses = getDiceFunctionNameClasses(func.name);
                        const safeName = escapeHtml(func.name);
                        card.innerHTML = `
                            <div class="${nameClasses}">${safeName}</div>
                            <div class="dice-function-formula dice-function-formula--attack">
                                <span class="dice-formula-part dice-formula-part--attack">A: ${escapeHtml(func.attack)}</span>
                                <span class="dice-formula-separator">|</span>
                                <span class="dice-formula-part dice-formula-part--damage">S: ${escapeHtml(func.damage)}</span>
                            </div>
                        `;

                        card.addEventListener('click', (e) => {
                            if (deleteMode) {
                                e.stopPropagation();
                                e.preventDefault();
                                currentProfile.attackFunctions.splice(index, 1);
                                lastRoll = null;
                                isLastRollVisible = false;
                                setDeleteModeState(false);
                                saveProfiles();
                                renderProfileDetail();
                                return;
                            }
                            rollAttackFunction(index);
                        });

                        attackFunctionsList.appendChild(card);
                        shouldUpdateAttackLayouts = true;
                    });
                }

                if (hasDiceFunctions) {
                    currentProfile.diceFunctions.forEach((func, index) => {
                        const card = document.createElement('div');
                        card.className = 'dice-function-card';
                        const nameClasses = getDiceFunctionNameClasses(func.name);
                        const safeName = escapeHtml(func.name);
                        card.innerHTML = `
                            <div class="${nameClasses}">${safeName}</div>
                            <div class="dice-function-formula">${escapeHtml(func.formula)}</div>
                        `;

                        card.addEventListener('click', (e) => {
                            if (deleteMode) {
                                e.stopPropagation();
                                e.preventDefault();
                                currentProfile.diceFunctions.splice(index, 1);
                                lastRoll = null;
                                isLastRollVisible = false;
                                setDeleteModeState(false);
                                saveProfiles();
                                renderProfileDetail();
                                return;
                            }
                            rollDiceFunction(index);
                        });

                        diceFunctionsList.appendChild(card);
                    });
                }
            }

            if (shouldUpdateAttackLayouts) {
                scheduleAttackFormulaLayoutUpdate(attackFunctionsList);
            }

            // Einfache Würfel
            if (!currentProfile.simpleDices || currentProfile.simpleDices.length === 0) {
                simpleDicesList.innerHTML = '<p style="color: #718096; font-style: italic;">Keine einfachen Würfel hinzugefügt</p>';
            } else {
                currentProfile.simpleDices.forEach((dice, index) => {
                    const card = document.createElement('div');
                    card.className = 'simple-dice-card';
                    card.innerHTML = `
                        <div class="dice-function-name">W${dice.sides}</div>
                    `;

                    card.addEventListener('click', (e) => {
                        if (deleteMode) {
                            e.stopPropagation();
                            e.preventDefault();
                            currentProfile.simpleDices.splice(index, 1);
                            lastRoll = null;
                            isLastRollVisible = false;
                            setDeleteModeState(false);
                            saveProfiles();
                            renderProfileDetail();
                            return;
                        }
                        rollSimpleDice(index);
                    });

                    simpleDicesList.appendChild(card);
                });
            }

            updateLastRollBar();
        }

        function updateLastRollBar() {
            const bar = document.getElementById('lastRollBar');
            const text = document.getElementById('lastRollText');
            const activeScreen = document.querySelector('.screen.active');
            const shouldShow = !!(activeScreen && activeScreen.id === 'profileDetailScreen' && lastRoll && isLastRollVisible);

            if (shouldShow) {
                bar.style.display = 'flex';
                if (lastRoll.isAttack) {
                    text.innerHTML = `
                        <div class="roll-name">${escapeHtml(lastRoll.name)}</div>
                        <div class="roll-result"><strong>Angriff:</strong> ${escapeHtml(lastRoll.attack.details)} = <strong>${lastRoll.attack.result}</strong></div>
                        <div class="roll-result"><strong>Schaden:</strong> ${escapeHtml(lastRoll.damage.details)} = <strong>${lastRoll.damage.result}</strong></div>
                    `.trim();
                } else {
                    text.innerHTML = `
                        <div class="roll-name">${escapeHtml(lastRoll.name)}</div>
                        <div class="roll-result">${escapeHtml(lastRoll.details)} = <strong>${lastRoll.result}</strong></div>
                    `.trim();
                }

                if (!resultHistoryActive) {
                    const profileId = currentProfile ? currentProfile.id : (history.state && history.state.profileId) || null;
                    if (!isNavigatingThroughHistory) {
                        pushHistoryState('profileDetailResult', { profileId });
                    }
                    resultHistoryActive = true;
                }
            } else {
                bar.style.display = 'none';
                resultHistoryActive = false;
            }
        }

        // Dice Functions
        function addAttackFunction() {
            const nameInput = document.getElementById('attackFunctionName').value.trim();
            const attack = document.getElementById('attackFunctionAttack').value.trim();
            const damage = document.getElementById('attackFunctionDamage').value.trim();

            if (!nameInput || !attack || !damage) {
                alert('Bitte füllen Sie alle Felder aus.');
                return;
            }
            if (nameInput.length > 26) {
                alert('Der Name der Angriffsfunktion darf maximal 26 Zeichen lang sein.');
                return;
            }
            if (attack.length > 20 || damage.length > 20) {
                alert('Die Würfelformel darf maximal 20 Zeichen lang sein.');
                return;
            }

            if (!isValidFormula(attack) || !isValidFormula(damage)) {
                alert('Ungültige Formel. Beispiele: 3w6+3 oder 3w6+3+2w6-2');
                return;
            }

            const name = nameInput;
            currentProfile.attackFunctions.push({ name, attack, damage });
            saveProfiles();
            lastRoll = null;
            isLastRollVisible = false;
            navigateBackOr(() => showProfileDetail(true));
        }

        function addDiceFunction() {
            const nameInput = document.getElementById('functionName').value.trim();
            const formula = document.getElementById('functionFormula').value.trim();

            if (!nameInput || !formula) {
                alert('Bitte füllen Sie alle Felder aus.');
                return;
            }
            if (nameInput.length > 26) {
                alert('Der Name der Würfelfunktion darf maximal 26 Zeichen lang sein.');
                return;
            }
            if (formula.length > 20) {
                alert('Die Würfelformel darf maximal 20 Zeichen lang sein.');
                return;
            }

            if (!isValidFormula(formula)) {
                alert('Ungültige Formel. Beispiele: 3w6+3 oder 3w6+3+2w6-2');
                return;
            }

            const name = nameInput;
            currentProfile.diceFunctions.push({ name, formula });
            saveProfiles();
            lastRoll = null;
            isLastRollVisible = false;
            navigateBackOr(() => showProfileDetail(true));
        }

        // Simple Dice
        function addSimpleDice() {
            const type = document.getElementById('diceType').value;
            let sides;
            if (type === 'custom') {
                const customInput = document.getElementById('customDiceSides');
                const rawValue = customInput.value.trim();
                if (!rawValue) {
                    alert('Bitte geben Sie eine gültige Seitenanzahl ein');
                    return;
                }
                if (rawValue.length > 5) {
                    alert('Die Seitenanzahl darf maximal 5 Zeichen lang sein.');
                    return;
                }
                if (!/^\d+$/.test(rawValue)) {
                    alert('Bitte geben Sie nur Ziffern für die Seitenanzahl ein.');
                    return;
                }
                sides = parseInt(rawValue, 10);
            } else {
                sides = parseInt(type, 10);
            }
            if (!sides || sides < 1) {
                alert('Bitte geben Sie eine gültige Seitenanzahl ein');
                return;
            }
            currentProfile.simpleDices.push({ sides });
            saveProfiles();
            lastRoll = null;
            isLastRollVisible = false;
            navigateBackOr(() => showProfileDetail(true));
        }

        // Dice Rolling
        function isValidFormula(formula) {
            return parseFormula(formula) !== null;
        }

        function parseFormula(formula) {
            if (!formula) return null;
            const clean = formula.replace(/\s+/g, '').replace(/-/g, '+-');
            const tokens = clean.split('+').filter(t => t);
            const terms = [];

            for (let token of tokens) {
                let sign = 1;
                if (token.startsWith('-')) {
                    sign = -1;
                    token = token.slice(1);
                }
                const diceMatch = token.match(/^(\d*)[wWdD](\d+)$/);
                if (diceMatch) {
                    const count = parseInt(diceMatch[1] || '1', 10);
                    const sides = parseInt(diceMatch[2], 10);
                    // Huge counts like 99999999w6 would freeze the browser
                    if (count < 1 || count > 100 || sides < 1) {
                        return null;
                    }
                    terms.push({ type: 'dice', count, sides, sign });
                } else if (/^\d+$/.test(token)) {
                    terms.push({ type: 'number', value: sign * parseInt(token, 10) });
                } else {
                    return null;
                }
            }
            return terms;
        }

        function rollDice(sides) {
            return Math.floor(Math.random() * sides) + 1;
        }

        function rollFromFormula(formula) {
            const terms = parseFormula(formula);
            if (!terms) return null;
            let total = 0;
            const detailParts = [];

            terms.forEach(term => {
                if (term.type === 'dice') {
                    const rolls = [];
                    for (let r = 0; r < term.count; r++) {
                        rolls.push(rollDice(term.sides));
                    }
                    const sum = rolls.reduce((a, b) => a + b, 0) * term.sign;
                    total += sum;
                    const sign = term.sign < 0 ? '-' : (detailParts.length ? '+' : '');
                    detailParts.push(`${sign}${term.count}w${term.sides} [${rolls.join(', ')}]`);
                } else {
                    total += term.value;
                    const sign = term.value < 0 ? '-' : (detailParts.length ? '+' : '');
                    detailParts.push(`${sign}${Math.abs(term.value)}`);
                }
            });

            return { total, detail: detailParts.join(' ') };
        }

        function rollDiceFunction(index) {
            const func = currentProfile.diceFunctions[index];
            const result = rollFromFormula(func.formula);

            if (!result) {
                alert('Fehlerhafte Formel');
                return;
            }

            lastRoll = {
                name: func.name,
                details: result.detail,
                result: result.total
            };
            isLastRollVisible = true;
            showDiceAnimation();
            playRandomSound(multiDiceSoundFiles);
            updateLastRollBar();
        }

        function rollAttackFunction(index) {
            const func = currentProfile.attackFunctions[index];
            const attack = rollFromFormula(func.attack);
            const damage = rollFromFormula(func.damage);

            if (!attack || !damage) {
                alert('Fehlerhafte Formel');
                return;
            }

            lastRoll = {
                name: func.name,
                isAttack: true,
                attack: { details: attack.detail, result: attack.total },
                damage: { details: damage.detail, result: damage.total }
            };
            isLastRollVisible = true;
            showDiceAnimation();
            playRandomSound(multiDiceSoundFiles);
            updateLastRollBar();
        }

        function rollSimpleDice(index) {
            const dice = currentProfile.simpleDices[index];
            const result = rollDice(dice.sides);

            lastRoll = {
                name: `W${dice.sides}`,
                details: `1w${dice.sides}`,
                result: result
            };
            isLastRollVisible = true;
            showDiceAnimation();
            playRandomSound(diceSoundFiles);
            updateLastRollBar();
        }

        // Settings
        function updateSettingsUI() {
            const animationBtn = document.getElementById('toggleAnimationBtn');
            if (animationBtn) {
                const isEnabled = !!appSettings.animationEnabled;
                animationBtn.textContent = isEnabled ? 'Animation ausschalten' : 'Animation einschalten';
                animationBtn.setAttribute('aria-pressed', isEnabled ? 'true' : 'false');
            }
        }

        function toggleSettings() {
            const overlay = document.getElementById('settingsOverlay');
            const profileContent = document.getElementById('profileContent');

            if (overlay.classList.contains('active')) {
                overlay.classList.remove('active');
                profileContent.classList.remove('dimmed');
            } else {
                updateSettingsUI();
                overlay.classList.add('active');
                profileContent.classList.add('dimmed');
                setDeleteModeState(false);
            }
        }

        function closeSettings() {
            const overlay = document.getElementById('settingsOverlay');
            const profileContent = document.getElementById('profileContent');
            overlay.classList.remove('active');
            profileContent.classList.remove('dimmed');
        }

        function enableDeleteMode() {
            setDeleteModeState(true);
            closeSettings();
        }

        function toggleAnimationSetting() {
            appSettings.animationEnabled = !appSettings.animationEnabled;
            saveAppSettings();
            if (!appSettings.animationEnabled) {
                hideDiceAnimation();
            }
            updateSettingsUI();
        }

        // Initialize Event Listeners
        function initializeEventListeners() {
            // Navigation
            document.getElementById('backBtn').addEventListener('click', () => {
                navigateBackOr(() => showProfileList(true));
            });

            document.getElementById('settingsBtn').addEventListener('click', toggleSettings);

            // Settings Overlay
            document.getElementById('settingsOverlay').addEventListener('click', (e) => {
                if (e.target.id === 'settingsOverlay') {
                    closeSettings();
                }
            });

            // Profile creation
            document.getElementById('createNewProfileBtn').addEventListener('click', () => showCreateProfile());
            document.getElementById('createProfileBtn').addEventListener('click', createProfile);
            document.getElementById('cancelCreateProfileBtn').addEventListener('click', () => navigateBackOr(() => showProfileList(true)));

            // Settings panel
            document.getElementById('addAttackFunctionBtn').addEventListener('click', () => showAddAttackFunction());
            document.getElementById('addDiceFunctionBtn').addEventListener('click', () => showAddDiceFunction());
            document.getElementById('addSimpleDiceBtn').addEventListener('click', () => showAddSimpleDice());
            document.getElementById('toggleAnimationBtn').addEventListener('click', toggleAnimationSetting);
            document.getElementById('deleteModeBtn').addEventListener('click', enableDeleteMode);

            // Dice function creation
            document.getElementById('saveAttackFunctionBtn').addEventListener('click', addAttackFunction);
            document.getElementById('cancelAttackFunctionBtn').addEventListener('click', () => navigateBackOr(() => showProfileDetail(true)));
            document.getElementById('saveDiceFunctionBtn').addEventListener('click', addDiceFunction);
            document.getElementById('cancelDiceFunctionBtn').addEventListener('click', () => navigateBackOr(() => showProfileDetail(true)));

            // Simple dice creation
            document.getElementById('saveSimpleDiceBtn').addEventListener('click', addSimpleDice);
            document.getElementById('cancelSimpleDiceBtn').addEventListener('click', () => navigateBackOr(() => showProfileDetail(true)));
            document.getElementById('diceType').addEventListener('change', (e) => {
                const custom = document.getElementById('customDiceSides');
                if (e.target.value === 'custom') {
                    custom.style.display = 'block';
                } else {
                    custom.style.display = 'none';
                }
            });
            document.getElementById('customDiceSides').addEventListener('input', (e) => {
                let value = e.target.value.replace(/[^0-9]/g, '');
                if (value.length > 5) {
                    value = value.slice(0, 5);
                }
                e.target.value = value;
            });
            document.getElementById('closeResultBtn').addEventListener('click', () => {
                hideLastRollResult();
            });

            window.addEventListener('resize', () => {
                scheduleAttackFormulaLayoutUpdate();
            });
        }

        // Initialize App
        initializeApp();
        initializeEventListeners();
        showProfileList(true);
        initializeHistory();
    
