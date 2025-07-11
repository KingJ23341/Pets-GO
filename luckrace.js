(function() {
    // Minigame State
    const luckRaceState = {
        currentRoom: 0,
        accumulatedPrizes: [],
        isActive: false,
    };

    // DOM Elements (fetched when minigame starts)
    let luckRaceModal, roomTitle, chanceText, riskItCard, leaveNowCard, luckRaceConfirmModal, luckRaceConfirmText, luckRaceConfirmYes, luckRaceConfirmNo, luckRaceResultModal, luckRaceResultTitle, luckRaceResultItemsContainer, luckRaceResultCloseBtn;
    
    // Utility to find an asset (pet or item) by name
    function findAsset(name) {
        const item = window.gameContext.availableItems.find(i => i.name === name);
        if (item) return { ...item, assetType: 'item' };
        const pet = window.gameContext.globalPets.find(p => p.name === name);
        if (pet) return { ...pet, assetType: 'pet' };
        return null;
    }

    // Creates the HTML for a prize card
    function createPrizeCard(asset, title) {
        if (!asset) {
            return `<div class="luck-race-prize-card-inner"><h3>${title}</h3><p>No Prize Configured</p></div>`;
        }
        const rarityClass = asset.rarity ? (window.gameContext.rarityColors[normalizeRarity(asset.rarity)] || 'text-gray-700') : 'text-gray-700';
        const quantityText = asset.quantity > 1 ? ` (x${asset.quantity})` : '';

        return `
            <div class="luck-race-prize-card-inner">
                <h3 class="text-2xl font-bold mb-2">${title}</h3>
                <img src="${asset.imageUrl || 'https://placehold.co/100x100/cccccc/333333?text=Prize'}" alt="${asset.name}" class="w-24 h-24 object-contain rounded-lg mx-auto my-4">
                <p class="font-semibold text-lg">${asset.name}${quantityText}</p>
                <p class="text-md ${rarityClass}">${asset.rarity || asset.type}</p>
            </div>
        `;
    }

    // Sets up the UI for the current room
    function setupLuckRaceRoom(roomNumber) {
        if (!luckRaceState.isActive) return;

        const config = window.gameContext.config;
        if (!config || !config[roomNumber] || !config[roomNumber].riskItPrize || !config[roomNumber].leaveNowPrize) {
            window.gameContext.showMessage("Luck Race is not configured for this room by the admin.", "error");
            endLuckRace(false, true); // End without showing loss message
            return;
        }

        const roomConfig = config[roomNumber];
        const riskPrize = findAsset(roomConfig.riskItPrize);
        const leavePrize = findAsset(roomConfig.leaveNowPrize);
        
        luckRaceState.currentRiskPrize = riskPrize ? { name: riskPrize.name, quantity: roomConfig.riskItQuantity || 1 } : null;
        luckRaceState.currentLeavePrize = leavePrize ? { name: leavePrize.name, quantity: roomConfig.leaveNowQuantity || 1 } : null;

        const chance = Math.min(5 * roomNumber, 50); // Cap chance at 50%
        roomTitle.textContent = `Room ${roomNumber} of 20`;
        chanceText.textContent = `${chance}% chance of losing your prize if you continue...`;

        riskItCard.innerHTML = createPrizeCard(riskPrize, "Risk It?");
        leaveNowCard.innerHTML = createPrizeCard(leavePrize, "Leave Now?");

        // Re-attach event listeners
        const newRiskItCard = riskItCard.cloneNode(true);
        riskItCard.parentNode.replaceChild(newRiskItCard, riskItCard);
        riskItCard = newRiskItCard;
        riskItCard.addEventListener('click', handleRiskItClick);

        const newLeaveNowCard = leaveNowCard.cloneNode(true);
        leaveNowCard.parentNode.replaceChild(newLeaveNowCard, leaveNowCard);
        leaveNowCard = newLeaveNowCard;
        leaveNowCard.addEventListener('click', handleLeaveClick);
    }
    
    // Normalize Rarity (copied from main script for standalone compatibility if needed)
    function normalizeRarity(rarityString) {
        if (!rarityString) return '';
        const upperCaseRarity = rarityString.toUpperCase();
        if (upperCaseRarity === 'EXCLUSIVE' || upperCaseRarity === 'HUGE') return upperCaseRarity;
        return rarityString.charAt(0).toUpperCase() + rarityString.slice(1).toLowerCase();
    }

    // Shows the custom confirmation modal for the minigame
    function showLuckRaceConfirmation(message, onConfirm) {
        luckRaceConfirmText.textContent = message;
        luckRaceConfirmModal.classList.remove('hidden');

        const confirmHandler = () => {
            luckRaceConfirmModal.classList.add('hidden');
            luckRaceConfirmYes.removeEventListener('click', confirmHandler);
            luckRaceConfirmNo.removeEventListener('click', cancelHandler);
            onConfirm(true);
        };
        const cancelHandler = () => {
            luckRaceConfirmModal.classList.add('hidden');
            luckRaceConfirmYes.removeEventListener('click', confirmHandler);
            luckRaceConfirmNo.removeEventListener('click', cancelHandler);
            onConfirm(false);
        };

        luckRaceConfirmYes.addEventListener('click', confirmHandler);
        luckRaceConfirmNo.addEventListener('click', cancelHandler);
    }

    // Handles the "Risk It" choice
    function handleRiskItClick() {
        showLuckRaceConfirmation("Are you sure you want to risk it?", (confirmed) => {
            if (confirmed) {
                const losingChance = Math.min(5 * luckRaceState.currentRoom, 50);
                const roll = Math.random() * 100;

                if (roll < losingChance) {
                    // Player loses
                    endLuckRace(false);
                } else {
                    // Player wins the round
                    if (luckRaceState.currentRiskPrize) {
                        luckRaceState.accumulatedPrizes.push(luckRaceState.currentRiskPrize);
                    }
                    
                    // Simple confetti effect
                    luckRaceModal.querySelector('.luck-race-modal-content').classList.add('animate-pulse-fast');
                    setTimeout(() => luckRaceModal.querySelector('.luck-race-modal-content').classList.remove('animate-pulse-fast'), 500);

                    if (luckRaceState.currentRoom >= 20) {
                        endLuckRace(true);
                    } else {
                        luckRaceState.currentRoom++;
                        setupLuckRaceRoom(luckRaceState.currentRoom);
                    }
                }
            }
        });
    }

    // Handles the "Leave Now" choice
    function handleLeaveClick() {
        showLuckRaceConfirmation("Leave and claim your item?", (confirmed) => {
            if (confirmed) {
                if (luckRaceState.currentLeavePrize) {
                     luckRaceState.accumulatedPrizes.push(luckRaceState.currentLeavePrize);
                }
                endLuckRace(true);
            }
        });
    }

    // Ends the minigame and processes the result
    function endLuckRace(isWinner, silent = false) {
        luckRaceModal.classList.add('hidden');
        luckRaceState.isActive = false;

        if (silent) return; // Used if the game can't start due to config issues

        if (isWinner && luckRaceState.accumulatedPrizes.length > 0) {
            luckRaceResultTitle.textContent = "You Got Items!";
            luckRaceResultItemsContainer.innerHTML = '';
            
            const prizeCounts = {};
            luckRaceState.accumulatedPrizes.forEach(prize => {
                prizeCounts[prize.name] = (prizeCounts[prize.name] || 0) + prize.quantity;
            });
            
            Object.entries(prizeCounts).forEach(([name, quantity]) => {
                const asset = findAsset(name);
                if (asset) {
                    // Add to player inventory
                    if (asset.assetType === 'item') {
                        const existingItem = window.gameContext.userItems.find(i => i.name === asset.name);
                        if (existingItem) {
                            existingItem.quantity = (existingItem.quantity || 1) + quantity;
                        } else {
                            window.gameContext.userItems.push({ ...asset, quantity });
                        }
                    } else if (asset.assetType === 'pet') {
                        for (let i = 0; i < quantity; i++) {
                            window.gameContext.userPets.push({ ...asset, id: crypto.randomUUID() });
                        }
                    }

                    // Create result card
                    const card = document.createElement('div');
                    card.className = 'luck-race-result-card';
                    const rarityClass = asset.rarity ? (window.gameContext.rarityColors[normalizeRarity(asset.rarity)] || 'text-gray-700') : 'text-gray-700';
                     card.innerHTML = `
                        <img src="${asset.imageUrl || 'https://placehold.co/100x100/cccccc/333333?text=Prize'}" alt="${asset.name}" class="w-20 h-20 object-contain rounded-lg mx-auto mb-2">
                        <p class="font-semibold">${asset.name} (x${quantity})</p>
                        <p class="text-sm ${rarityClass}">${asset.rarity || asset.type}</p>
                    `;
                    luckRaceResultItemsContainer.appendChild(card);
                }
            });

            window.gameContext.savePlayerProgress();
            luckRaceResultModal.classList.remove('hidden');

        } else {
            // Player lost
            luckRaceResultTitle.textContent = "You Lost!";
            luckRaceResultItemsContainer.innerHTML = '<p class="text-lg text-gray-600">Better luck next time!</p>';
            luckRaceResultModal.classList.remove('hidden');
        }
    }

    // Function to start the minigame, attached to the window object
    window.startLuckRace = function() {
        if (luckRaceState.isActive) {
            window.gameContext.showMessage("You are already in a Luck Race!", "info");
            return;
        }
        
        // Fetch DOM elements on start
        luckRaceModal = document.getElementById('luckRaceModal');
        roomTitle = document.getElementById('luckRaceRoomTitle');
        chanceText = document.getElementById('luckRaceChanceText');
        riskItCard = document.getElementById('luckRaceRiskItCard');
        leaveNowCard = document.getElementById('luckRaceLeaveNowCard');
        luckRaceConfirmModal = document.getElementById('luckRaceConfirmModal');
        luckRaceConfirmText = document.getElementById('luckRaceConfirmText');
        luckRaceConfirmYes = document.getElementById('luckRaceConfirmYes');
        luckRaceConfirmNo = document.getElementById('luckRaceConfirmNo');
        luckRaceResultModal = document.getElementById('luckRaceResultModal');
        luckRaceResultTitle = document.getElementById('luckRaceResultTitle');
        luckRaceResultItemsContainer = document.getElementById('luckRaceResultItemsContainer');
        luckRaceResultCloseBtn = document.getElementById('luckRaceResultCloseBtn');

        // Reset state and start
        luckRaceState.currentRoom = 1;
        luckRaceState.accumulatedPrizes = [];
        luckRaceState.isActive = true;

        setupLuckRaceRoom(1);
        luckRaceModal.classList.remove('hidden');
    };

    // Initialize event listeners for modals that are part of the minigame
    function init() {
         document.getElementById('closeLuckRaceModal')?.addEventListener('click', () => {
            if (luckRaceState.isActive) {
                 showLuckRaceConfirmation("Are you sure you want to forfeit the current run?", (confirmed) => {
                    if(confirmed) {
                        endLuckRace(false, true); // End silently
                    }
                 });
            } else {
                 document.getElementById('luckRaceModal').classList.add('hidden');
            }
        });
        
        document.getElementById('luckRaceResultCloseBtn')?.addEventListener('click', () => {
            document.getElementById('luckRaceResultModal').classList.add('hidden');
        });
    }

    // Run init once the main script has loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
