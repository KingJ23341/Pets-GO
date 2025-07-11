/**
 * Pets GO! Luck Race Minigame Script
 * This script should be loaded dynamically by the main game.
 * It attaches its functionality to the global window object.
 */
(() => {
    'use strict';

    // --- CONFIGURATION ---
    const MAX_ROOMS = 20;

    // --- STATE MANAGEMENT ---
    let gameState = {
        isActive: false,
        isProcessing: false,
        currentRoom: 1,
        prizes: {
            risk: null,
            leave: null
        }
    };

    // --- DOM ELEMENT REFERENCES (will be populated on init) ---
    let elements = {};
    const requiredElementIds = [
        'luckRaceModal', 'luckRaceContent', 'luckRaceRoomTitle', 'luckRaceChanceText',
        'luckRaceCardLeft', 'luckRaceCardRight', 'luckRaceConfirmationModal',
        'luckRaceConfirmationText', 'luckRaceConfirmYes', 'luckRaceConfirmNo',
        'luckRaceWinningsModal', 'luckRaceWinningsContent', 'closeLuckRaceWinnings',
        'luckRaceLostModal', 'closeLuckRaceLost'
    ];

    // --- REFERENCES TO MAIN GAME (will be populated on init) ---
    let mainGame = {};

    /**
     * Initializes the Luck Race module.
     * @param {object} mainGameInterface - An object containing references to main game functions and variables.
     */
    function init(mainGameInterface) {
        const requiredFunctions = ['getDb', 'getUserId', 'getUserData', 'savePlayerProgress', 'showMessage', 'getGlobalConfig', 'getAssetDetails'];
        for (const func of requiredFunctions) {
            if (typeof mainGameInterface[func] !== 'function') {
                console.error(`LuckRace Init Error: Main game interface is missing the function '${func}'.`);
                return;
            }
        }
        mainGame = mainGameInterface;

        let allElementsFound = true;
        requiredElementIds.forEach(id => {
            elements[id] = document.getElementById(id);
            if (!elements[id]) {
                console.error(`LuckRace Init Error: Missing required HTML element with id: #${id}`);
                allElementsFound = false;
            }
        });

        if (!allElementsFound) return;

        console.log("Luck Race Minigame Initialized Successfully.");
        attachEventListeners();
    }

    /**
     * Attaches event listeners to the minigame's UI elements.
     */
    function attachEventListeners() {
        elements.luckRaceCardLeft.addEventListener('click', () => handleChoice('risk'));
        elements.luckRaceCardRight.addEventListener('click', () => handleChoice('leave'));
        elements.closeLuckRaceWinnings.addEventListener('click', closeWinningsModal);
        elements.closeLuckRaceLost.addEventListener('click', closeLostModal);
    }

    /**
     * Starts the Luck Race minigame.
     */
    function start() {
        if (gameState.isActive) return;

        console.log("Starting Luck Race...");
        gameState.isActive = true;
        gameState.isProcessing = false;
        gameState.currentRoom = 1;

        elements.luckRaceModal.classList.remove('hidden');
        elements.luckRaceModal.querySelector('.modal-content').classList.add('animate-in');

        renderRoom();
    }

    /**
     * Renders the current room's state, including prizes and chances.
     */
    function renderRoom() {
        const { luckRaceConfig } = mainGame.getGlobalConfig();
        if (!luckRaceConfig || !luckRaceConfig.rooms || !luckRaceConfig.itemPools) {
            mainGame.showMessage("Luck Race is not configured. Please contact an admin.", 'error', 0);
            return end(null, true);
        }

        const roomIndex = gameState.currentRoom - 1;
        const roomConfig = luckRaceConfig.rooms[Math.min(roomIndex, luckRaceConfig.rooms.length - 1)];
        
        gameState.prizes.risk = pickPrizeFromPool(luckRaceConfig.itemPools[roomConfig.riskItemPool]);
        gameState.prizes.leave = pickPrizeFromPool(luckRaceConfig.itemPools[roomConfig.leaveItemPool]);

        if (!gameState.prizes.risk || !gameState.prizes.leave) {
            mainGame.showMessage("Could not determine prizes for this room. Please contact an admin.", 'error', 0);
            return end(null, true);
        }

        const loseChance = Math.min(50, gameState.currentRoom * 5);
        elements.luckRaceRoomTitle.textContent = `Room ${gameState.currentRoom} of ${MAX_ROOMS}`;
        elements.luckRaceChanceText.textContent = `${loseChance}% chance of losing your prize if you continue...`;

        elements.luckRaceCardLeft.innerHTML = createCardHTML('Risk it?', gameState.prizes.risk, 'For this prize');
        elements.luckRaceCardRight.innerHTML = createCardHTML('Leave now?', gameState.prizes.leave, 'For this prize');

        gameState.isProcessing = false;
        toggleCardInteractivity(true);
    }

    /**
     * Handles the player's choice to either risk it or leave.
     */
    function handleChoice(choice) {
        if (gameState.isProcessing) return;
        gameState.isProcessing = true;
        toggleCardInteractivity(false);

        const confirmationText = choice === 'risk' ?
            `Are you sure you want to risk it for the next prize?` :
            `Are you sure you want to leave and claim your prize?`;

        showConfirmation(confirmationText, (confirmed) => {
            if (confirmed) {
                playTransitionEffect(choice === 'risk' ? elements.luckRaceCardLeft : elements.luckRaceCardRight, () => {
                    if (choice === 'risk') {
                        processRisk();
                    } else {
                        processLeave();
                    }
                });
            } else {
                gameState.isProcessing = false;
                toggleCardInteractivity(true);
            }
        });
    }

    /**
     * Processes the "Risk" decision.
     */
    function processRisk() {
        const loseChance = (gameState.currentRoom * 5) / 100;
        const hasLost = Math.random() < loseChance;

        if (hasLost) {
            elements.luckRaceLostModal.classList.remove('hidden');
            end(null, true); 
        } else {
            gameState.currentRoom++;
            if (gameState.currentRoom > MAX_ROOMS) {
                awardPrize(gameState.prizes.risk);
            } else {
                renderRoom();
            }
        }
    }

    /**
     * Processes the "Leave" decision.
     */
    function processLeave() {
        awardPrize(gameState.prizes.leave);
    }

    /**
     * Awards the chosen prize to the player and ends the game.
     */
    function awardPrize(prize) {
        if (!prize) return end(null, true);

        const userData = mainGame.getUserData();
        if (prize.type === 'item') {
            const existingItemIndex = userData.userItems.findIndex(i => i.name === prize.name);
            if (existingItemIndex > -1) {
                userData.userItems[existingItemIndex].quantity = (userData.userItems[existingItemIndex].quantity || 1) + prize.quantity;
            } else {
                userData.userItems.push({ ...prize });
            }
        } else if (prize.type === 'pet') {
            const petDetails = mainGame.getAssetDetails('pet', prize.name);
            if (petDetails) {
                 for (let i = 0; i < prize.quantity; i++) {
                    userData.userPets.push({ ...petDetails, id: crypto.randomUUID() });
                }
            }
        }
        
        showWinnings(prize);
        end(prize, false);
    }
    
    /**
     * Ends the minigame and resets its state.
     */
    function end(finalPrize, forceNoSave = false) {
        gameState.isActive = false;
        
        if (finalPrize && !forceNoSave) {
            mainGame.savePlayerProgress();
        }

        setTimeout(() => {
            elements.luckRaceModal.classList.add('hidden');
            elements.luckRaceModal.querySelector('.modal-content').classList.remove('animate-in');
        }, 500);
    }


    // --- UI & HELPER FUNCTIONS ---

    // THIS FUNCTION WAS MISSING FROM THE PREVIOUS TRUNCATED RESPONSES
    function normalizeRarity(rarityString) {
        if (!rarityString) return '';
        const upperCaseRarity = rarityString.toUpperCase();
        if (upperCaseRarity === 'EXCLUSIVE' || upperCaseRarity === 'HUGE') return upperCaseRarity;
        return rarityString.charAt(0).toUpperCase() + rarityString.slice(1).toLowerCase();
    }

    /**
     * Creates the inner HTML for a prize card.
     */
    function createCardHTML(title, prize, subtitle) {
        const assetDetails = mainGame.getAssetDetails(prize.type, prize.name);
        if (!assetDetails) return `<p class="text-red-500">Error: Prize '${prize.name}' not found.</p>`;

        const quantityText = prize.quantity > 1 ? `x${prize.quantity}` : '';
        const rarityClass = assetDetails.rarity ? (mainGame.getGlobalConfig().rarityColors[normalizeRarity(assetDetails.rarity)] || 'text-gray-700') : 'text-gray-700';

        return `
            <h3 class="text-2xl font-bold text-gray-800">${title}</h3>
            <p class="text-sm text-gray-500 mb-4">${subtitle}</p>
            <img src="${assetDetails.imageUrl || ''}" alt="${prize.name}" class="w-32 h-32 object-contain mx-auto my-4">
            <p class="text-xl font-semibold text-gray-900">${prize.name} ${quantityText}</p>
            <p class="text-md font-bold ${rarityClass}">${assetDetails.rarity || prize.type}</p>
        `;
    }

    /**
     * Picks a random prize from a given weighted pool.
     */
    function pickPrizeFromPool(pool) {
        if (!pool || pool.length === 0) return null;
        const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
        if (totalWeight <= 0) return pool[0];

        let random = Math.random() * totalWeight;
        for (const item of pool) {
            if (random < item.weight) {
                return item;
            }
            random -= item.weight;
        }
        return pool[pool.length - 1];
    }

    function showConfirmation(text, callback) {
        elements.luckRaceConfirmationText.textContent = text;
        elements.luckRaceModal.classList.add('hidden');
        elements.luckRaceConfirmationModal.classList.remove('hidden');

        elements.luckRaceConfirmYes.onclick = () => {
            elements.luckRaceConfirmationModal.classList.add('hidden');
            elements.luckRaceModal.classList.remove('hidden');
            callback(true);
        };
        elements.luckRaceConfirmNo.onclick = () => {
            elements.luckRaceConfirmationModal.classList.add('hidden');
            elements.luckRaceModal.classList.remove('hidden');
            callback(false);
        };
    }

    function showWinnings(prize) {
        elements.luckRaceWinningsContent.innerHTML = createCardHTML('You Won!', prize, 'This has been added to your inventory.');
        elements.luckRaceWinningsModal.classList.remove('hidden');
    }
    
    function closeWinningsModal() {
        elements.luckRaceWinningsModal.classList.add('hidden');
    }
    
    function closeLostModal() {
        elements.luckRaceLostModal.classList.add('hidden');
    }

    function playTransitionEffect(chosenCard, callback) {
        chosenCard.classList.add('animate-pulse', 'border-yellow-400');
        const confetti = document.createElement('div');
        confetti.className = 'confetti-burst';
        chosenCard.appendChild(confetti);

        setTimeout(() => {
            chosenCard.classList.remove('animate-pulse', 'border-yellow-400');
            chosenCard.removeChild(confetti);
            if (callback) callback();
        }, 1000);
    }
    
    function toggleCardInteractivity(enabled) {
        if (enabled) {
            elements.luckRaceCardLeft.classList.remove('opacity-50', 'cursor-not-allowed');
            elements.luckRaceCardRight.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            elements.luckRaceCardLeft.classList.add('opacity-50', 'cursor-not-allowed');
            elements.luckRaceCardRight.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    window.LuckRace = {
        init,
        start
    };

})();
