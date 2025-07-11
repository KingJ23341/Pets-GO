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
     * This function must be called by the main game script once it's loaded.
     * @param {object} mainGameInterface - An object containing references to main game functions and variables.
     */
    function init(mainGameInterface) {
        // Validate the interface from the main game
        const requiredFunctions = ['getDb', 'getUserId', 'getUserData', 'savePlayerProgress', 'showMessage', 'getGlobalConfig', 'getAssetDetails'];
        for (const func of requiredFunctions) {
            if (typeof mainGameInterface[func] !== 'function') {
                console.error(`LuckRace Init Error: Main game interface is missing the function '${func}'.`);
                return;
            }
        }
        mainGame = mainGameInterface;

        // Populate DOM element references
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

        // Hide main game UI if necessary (handled by main script)
        elements.luckRaceModal.classList.remove('hidden');
        elements.luckRaceModal.querySelector('.modal-content').classList.add('animate-in');

        renderRoom();
    }

    /**
     * Renders the current room's state, including prizes and chances.
     */
    function renderRoom() {
        const { luckRaceConfig } = mainGame.getGlobalConfig();
        if (!luckRaceConfig || !luckRaceConfig.rooms || luckRaceConfig.rooms.length === 0) {
            mainGame.showMessage("Luck Race is not configured. Please contact an admin.", 'error', 0);
            return end(null, true);
        }

        const roomIndex = gameState.currentRoom - 1;
        const roomConfig = luckRaceConfig.rooms[Math.min(roomIndex, luckRaceConfig.rooms.length - 1)];
        
        // Pick prizes for the two doors
        gameState.prizes.risk = pickPrizeFromPool(luckRaceConfig.itemPools[roomConfig.riskItemPool]);
        gameState.prizes.leave = pickPrizeFromPool(luckRaceConfig.itemPools[roomConfig.leaveItemPool]);

        if (!gameState.prizes.risk || !gameState.prizes.leave) {
            mainGame.showMessage("Could not determine prizes for this room. Please contact an admin.", 'error', 0);
            return end(null, true);
        }

        // Update UI Text
        const loseChance = Math.min(50, gameState.currentRoom * 5);
        elements.luckRaceRoomTitle.textContent = `Room ${gameState.currentRoom} of ${MAX_ROOMS}`;
        elements.luckRaceChanceText.textContent = `${loseChance}% chance of losing your prize if you continue...`;

        // Render Prize Cards
        elements.luckRaceCardLeft.innerHTML = createCardHTML('Risk it?', gameState.prizes.risk, 'For this prize');
        elements.luckRaceCardRight.innerHTML = createCardHTML('Leave now?', gameState.prizes.leave, 'For this prize');

        // Reset processing state
        gameState.isProcessing = false;
        toggleCardInteractivity(true);
    }

    /**
     * Handles the player's choice to either risk it or leave.
     * @param {'risk' | 'leave'} choice - The choice made by the player.
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
            // Player loses
            elements.luckRaceLostModal.classList.remove('hidden');
            end(null, true); // End the game, force no save
        } else {
            // Player proceeds
            gameState.currentRoom++;
            if (gameState.currentRoom > MAX_ROOMS) {
                // Player completed all rooms, award the final "risk" prize
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
     * @param {object} prize - The prize object to award.
     */
    function awardPrize(prize) {
        if (!prize) return end(null, true);

        const userData = mainGame.getUserData();
        if (prize.type === 'item') {
            const existingItem = userData.userItems.find(i => i.name === prize.name);
            if (existingItem) {
                existingItem.quantity = (existingItem.quantity || 1) + prize.quantity;
            } else {
                userData.userItems.push({ ...prize });
            }
        } else if (prize.type === 'pet') {
            const petDetails = mainGame.getAssetDetails('pet', prize.name);
            for (let i = 0; i < prize.quantity; i++) {
                userData.userPets.push({ ...petDetails, id: crypto.randomUUID() });
            }
        }
        
        showWinnings(prize);
        end(prize, false);
    }
    
    /**
     * Ends the minigame and resets its state.
     * @param {object | null} finalPrize - The prize that was won, if any.
     * @param {boolean} forceNoSave - If true, skips saving player progress.
     */
    function end(finalPrize, forceNoSave = false) {
        gameState.isActive = false;
        
        if (finalPrize && !forceNoSave) {
            mainGame.savePlayerProgress();
        }

        // Delay hiding the main modal to allow win/loss modals to show first
        setTimeout(() => {
            elements.luckRaceModal.classList.add('hidden');
            elements.luckRaceModal.querySelector('.modal-content').classList.remove('animate-in');
        }, 500);
    }


    // --- UI & HELPER FUNCTIONS ---

    /**
     * Creates the inner HTML for a prize card.
     * @param {string} title - The title of the card (e.g., "Risk it?").
     * @param {object} prize - The prize object.
     * @param {string} subtitle - The subtitle for the card.
     * @returns {string} The generated HTML string.
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
     * @param {Array<object>} pool - The array of prize objects with weights.
     * @returns {object | null} The chosen prize object or null if pool is invalid.
     */
    function pickPrizeFromPool(pool) {
        if (!pool || pool.length === 0) return null;
        const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
        if (totalWeight <= 0) return pool[0]; // Fallback for unweighted pools

        let random = Math.random() * totalWeight;
        for (const item of pool) {
            if (random < item.weight) {
                return item;
            }
            random -= item.weight;
        }
        return pool[pool.length - 1]; // Fallback
    }

    function showConfirmation(text, callback) {
        elements.luckRaceConfirmationText.textContent = text;
        elements.luckRaceModal.classList.add('hidden'); // Hide game to show confirmation
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
        // Simple visual effect for choosing a door
        chosenCard.classList.add('animate-pulse', 'border-yellow-400');
        const confetti = document.createElement('div');
        confetti.className = 'confetti-burst';
        chosenCard.appendChild(confetti);

        // A "Tada" sound would be played here, e.g., new Audio('path/to/tada.mp3').play();

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


    // --- ATTACH TO GLOBAL WINDOW ---
    // This exposes the public functions to the main game script.
    window.LuckRace = {
        init,
        start
    };

})();
