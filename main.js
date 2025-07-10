<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pets GO! RNG Game</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, doc, setDoc, onSnapshot, collection, getDocs, deleteDoc, updateDoc, getDoc, query, where, addDoc, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

        // Global variables for Firebase (provided by the Canvas environment)
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        // Initialize Firebase
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        const functions = getFunctions(app); // Initialize Cloud Functions

        let userId = null; 
        let localPersistentUserId = null;
        let userDataRef = null;

        // Game state variables
        let hasPlayedBefore = false;
        let globalPets = [];
        let rollCount = 0;
        let upgradesAvailable = 0;
        let coins = 0;
        let userPets = [];
        let userItems = [];
        let petsSelectedForDeletion = [];
        let petsSelectedForFusion = [];

        // Shop state variables
        let foreverPackConfig = null;
        let playerShopState = {
            claimedCount: 0,
            lastResetTimestamp: 0,
            currentLuck: 1.0,
            resetExtensionMinutes: 0,
            shopQueue: [] // Holds pre-rolled items for the conveyor belt
        };
        let shopResetIntervalId = null;
        let shopSessionWinnings = []; // To batch item reveals

        // Upgrade states
        let isCoinUpgradePurchased = false;
        let isRollStreakUpgradePurchased = false;
        let isInventoryUpgradePurchased = false;
        let isAutoRollUpgradePurchased = false;
        let isHidePopupUpgradePurchased = false;
        let isFasterRollsIUpgradePurchased = false;
        let isRollItemsUpgradePurchased = false;
        let isDeletePetsUpgradePurchased = false;
        let isBetterDiceIUpgradePurchased = false;
        let isRollBetterItemsUpgradePurchased = false;
        let isMoreCoinsIUpgradePurchased = false;
        let isLeaderboardsUpgradePurchased = false;
        let isBetterDiceIIUpgradePurchased = false;
        let isMoreCoinsIIUpgradePurchased = false;
        let isRollMoreItemsUpgradePurchased = false;
        let isFusePetsUpgradePurchased = false; 

        // Potion states
        let activeSpeedPotions = []; 
        let activeLuckPotions = []; 

        let rollStreak = 0; 
        let userNickname = null;

        // Admin User ID
        const ADMIN_USER_ID = '01831831262543787394';

        let isProcessingRoll = false; 
        let isProcessingShopClaim = false; 
        let isAutoRolling = false;
        let autoRollTimeoutId = null; 
        let currentRollAnimationDuration = 0; 

        const BASE_TOTAL_WEIGHT = 1000000;
        let minChanceDenominatorForAnnouncement = 100;

        const rarityOrder = {
            'Common': 0, 'Uncommon': 1, 'Rare': 2, 'Epic': 3, 'Legendary': 4,
            'Mythic': 5, 'EXCLUSIVE': 6, 'HUGE': 7
        };
        const rarityColors = {
            'Common': 'text-gray-500', 'Uncommon': 'text-green-500', 'Rare': 'text-blue-500',
            'Epic': 'text-purple-600', 'Legendary': 'text-orange-500', 'Mythic': 'text-red-600 animate-pulse',
            'EXCLUSIVE': 'text-yellow-400 animate-pulse', 'HUGE': 'text-cyan-400 animate-bounce'
        };

        function normalizeRarity(rarityString) {
            if (!rarityString) return '';
            const upperCaseRarity = rarityString.toUpperCase();
            if (upperCaseRarity === 'EXCLUSIVE' || upperCaseRarity === 'HUGE') return upperCaseRarity;
            return rarityString.charAt(0).toUpperCase() + rarityString.slice(1).toLowerCase();
        }

        const availableItems = [
            { name: "Faster Rolls Potion", type: "speed", description: "Increases roll speed by 10% for 5 minutes.", imageUrl: "https://placehold.co/100x100/ADD8E6/000000?text=Speed+Potion+I", tier: 1, speedBoost: 0.10, durationSeconds: 300 },
            { name: "Lucky Roll Potion", type: "luck", description: "Increases luck of the next roll by 10%. Lasts one roll.", imageUrl: "https://placehold.co/100x100/FFD700/000000?text=Lucky+Potion+I", tier: 1, luckBoost: 0.10 },
            { name: "Faster Rolls Potion II", type: "speed", description: "Increases roll speed by 15% for 8 minutes.", imageUrl: "https://placehold.co/100x100/4CAF50/FFFFFF?text=Speed+Potion+II", tier: 2, speedBoost: 0.15, durationSeconds: 480 },
            { name: "Lucky Roll Potion II", type: "luck", description: "Increases luck of the next roll by 15%. Lasts one roll.", imageUrl: "https://placehold.co/100x100/FF5722/FFFFFF?text=Lucky+Potion+II", tier: 2, luckBoost: 0.15 },
            { name: "Lucky Roll Potion III", type: "luck", description: "Increases luck of the next roll by 20%. Lasts one roll.", imageUrl: "https://placehold.co/100x100/FF0000/FFFFFF?text=Lucky+Potion+III", tier: 3, luckBoost: 0.20 },
            { name: "Faster Rolls Potion III", type: "speed", description: "Increases roll speed by 25% for 5 minutes.", imageUrl: "https://placehold.co/100x100/0000FF/FFFFFF?text=Speed+Potion+III", tier: 3, speedBoost: 0.25, durationSeconds: 300 },
            { name: "HUGE Egg", type: "huge_egg", description: "Guarantees a random HUGE pet when opened!", imageUrl: "https://placehold.co/100x100/00FFFF/000000?text=HUGE+Egg" }
        ];
        
        const shopRarityLevels = ['Common', 'Uncommon', 'Rare', 'Exclusive'];


        // Get DOM elements
        const loadingSpinner = document.getElementById('loadingSpinner');
        const gameContainer = document.getElementById('gameContainer');
        const diceButton = document.getElementById('diceButton');
        const arrowIndicator = document.getElementById('arrowIndicator');
        const messageBox = document.getElementById('messageBox');
        const globalAnnouncementBox = document.getElementById('globalAnnouncementBox');
        const userIdDisplay = document.getElementById('userIdDisplay');
        const adminPanelButton = document.getElementById('adminPanelButton');
        const coinsDisplay = document.getElementById('coinsDisplay');
        const upgradeButton = document.getElementById('upgradeButton');
        const upgradeCountBadge = document.getElementById('upgradeCountBadge');
        const inventoryButton = document.getElementById('inventoryButton');
        const autoRollButton = document.getElementById('autoRollButton');
        const petCollectionButton = document.getElementById('petCollectionButton');
        const leaderboardsButton = document.getElementById('leaderboardsButton');
        const recentRollsButton = document.getElementById('recentRollsButton'); 
        const shopButton = document.getElementById('shopButton'); 

        // Admin Panel Modal elements
        const adminPanelModal = document.getElementById('adminPanelModal');
        const closeAdminPanelModal = document.getElementById('closeAdminPanelModal');
        const wipeGlobalPetsButton = document.getElementById('wipeGlobalPetsButton');
        const openPetsListButton = document.getElementById('openPetsListButton');
        const manageCurrencyButton = document.getElementById('manageCurrencyButton');
        const openAdminUpgradeTreeButton = document.getElementById('openAdminUpgradeTreeButton');
        const openForeverPackManagerButton = document.getElementById('openForeverPackManagerButton');
        const resetForeverPackButton = document.getElementById('resetForeverPackButton');
        const minAnnouncementRarityInput = document.getElementById('minAnnouncementRarityInput');
        const saveMinAnnouncementRarityButton = document.getElementById('saveMinAnnouncementRarityButton');

        // Confirmation Modal elements
        const confirmationModal = document.getElementById('confirmationModal');
        const confirmationMessage = document.getElementById('confirmationMessage');
        const confirmYesButton = document.getElementById('confirmYesButton');
        const confirmNoButton = document.getElementById('confirmNoButton');
        let confirmationCallback = null;

        // Pets List Management Modal elements
        const petsListModal = document.getElementById('petsListModal');
        const closePetsListModal = document.getElementById('closePetsListModal');
        const petNameInput = document.getElementById('petNameInput');
        const petRarityInput = document.getElementById('petRarityInput');
        const petChanceInput = document.getElementById('petChanceInput');
        const petImageURLInput = document.getElementById('petImageURLInput');
        const petMinCoinsInput = document.getElementById('petMinCoinsInput');
        const submitPetButton = document.getElementById('submitPetButton');
        const petsManagementTableBody = document.getElementById('petsManagementTableBody');
        const downloadPetsButton = document.getElementById('downloadPetsButton');
        const uploadPetsInput = document.getElementById('uploadPetsInput');

        // Rolling animation elements
        const rollingPetDisplay = document.getElementById('rollingPetDisplay');
        let currentRollingPetImg = null;

        // Upgrade Tree Modal elements
        const upgradeTreeContainer = document.getElementById('upgradeTreeContainer');
        const closeUpgradeTreeModal = document.getElementById('closeUpgradeTreeModal');
        const currentUpgradesAvailableDisplay = document.getElementById('currentUpgradesAvailable');
        const buyUpgrade1Button = document.getElementById('buyUpgrade1Button');
        const rollStreakUpgradeSection = document.getElementById('rollStreakUpgradeSection');
        const currentRollStreakDisplay = document.getElementById('currentRollStreakDisplay');
        const buyRollStreakUpgradeButton = document.getElementById('buyRollStreakUpgradeButton');
        const inventoryUpgradeSection = document.getElementById('inventoryUpgradeSection');
        const buyInventoryUpgradeButton = document.getElementById('buyInventoryUpgradeButton');
        const autoRollUpgradeSection = document.getElementById('autoRollUpgradeSection');
        const buyAutoRollUpgradeButton = document.getElementById('buyAutoRollUpgradeButton');
        const hidePopupUpgradeSection = document.getElementById('hidePopupUpgradeSection');
        const buyHidePopupUpgradeButton = document.getElementById('buyHidePopupUpgradeButton');
        const fasterRollsIUpgradeSection = document.getElementById('fasterRollsIUpgradeSection');
        const buyFasterRollsIUpgradeButton = document.getElementById('buyFasterRollsIUpgradeButton');
        const rollItemsUpgradeSection = document.getElementById('rollItemsUpgradeSection');
        const buyRollItemsUpgradeButton = document.getElementById('buyRollItemsUpgradeButton');
        const deletePetsUpgradeSection = document.getElementById('deletePetsUpgradeSection');
        const buyDeletePetsUpgradeButton = document.getElementById('buyDeletePetsUpgradeButton');
        const betterDiceIUpgradeSection = document.getElementById('betterDiceIUpgradeSection');
        const buyBetterDiceIUpgradeButton = document.getElementById('buyBetterDiceIUpgradeButton');
        const rollBetterItemsUpgradeSection = document.getElementById('rollBetterItemsUpgradeSection');
        const buyRollBetterItemsUpgradeButton = document.getElementById('buyRollBetterItemsUpgradeButton');
        const moreCoinsIUpgradeSection = document.getElementById('moreCoinsIUpgradeSection');
        const buyMoreCoinsIUpgradeButton = document.getElementById('buyMoreCoinsIUpgradeButton');
        const leaderboardsUpgradeSection = document.getElementById('leaderboardsUpgradeSection');
        const buyLeaderboardsUpgradeButton = document.getElementById('buyLeaderboardsUpgradeButton');
        const betterDiceIIUpgradeSection = document.getElementById('betterDiceIIUpgradeSection');
        const buyBetterDiceIIUpgradeButton = document.getElementById('buyBetterDiceIIUpgradeButton');
        const moreCoinsIIUpgradeSection = document.getElementById('moreCoinsIIUpgradeSection');
        const buyMoreCoinsIIUpgradeButton = document.getElementById('buyMoreCoinsIIUpgradeButton');
        const rollMoreItemsUpgradeSection = document.getElementById('rollMoreItemsUpgradeSection');
        const buyRollMoreItemsUpgradeButton = document.getElementById('buyRollMoreItemsUpgradeButton');
        const fusePetsUpgradeSection = document.getElementById('fusePetsUpgradeSection'); 
        const buyFusePetsUpgradeButton = document.getElementById('buyFusePetsUpgradeButton'); 

        // Admin Upgrade Tree Modal elements
        const adminUpgradeTreeModal = document.getElementById('adminUpgradeTreeModal');
        const closeAdminUpgradeTreeModal = document.getElementById('closeAdminUpgradeTreeModal');
        const adminUpgradesList = document.getElementById('adminUpgradesList');

        // Inventory Modal elements
        const inventoryModal = document.getElementById('inventoryModal');
        const closeInventoryModal = document.getElementById('closeInventoryModal');
        const inventoryTabButton = document.getElementById('inventoryTabButton'); 
        const fuseMachineTabButton = document.getElementById('fuseMachineTabButton'); 
        const inventoryContent = document.getElementById('inventoryContent'); 
        const fuseMachineContent = document.getElementById('fuseMachineContent'); 
        const inventoryItemsContainer = document.getElementById('inventoryItemsContainer');
        const inventoryPetsContainer = document.getElementById('inventoryPetsContainer');
        const confirmDeleteSelectedPetsButton = document.getElementById('confirmDeleteSelectedPetsButton');
        const fuseablePetsContainer = document.getElementById('fuseablePetsContainer'); 
        const fuseSelectedCountDisplay = document.getElementById('fuseSelectedCountDisplay'); 
        const fusePetsButton = document.getElementById('fusePetsButton'); 

        // Pet Collection Modal elements
        const petCollectionModal = document.getElementById('petCollectionModal');
        const closePetCollectionModal = document.getElementById('closePetCollectionModal');
        const petCollectionContainer = document.getElementById('petCollectionContainer');
        const collectionLuckFactorDisplay = document.getElementById('collectionLuckFactorDisplay');
        const itemCollectionContainer = document.getElementById('itemCollectionContainer');

        // Manage Currency Modal elements
        const manageCurrencyModal = document.getElementById('manageCurrencyModal');
        const closeManageCurrencyModalBtn = document.getElementById('closeManageCurrencyModal');
        const targetUserIdInput = document.getElementById('targetUserIdInput');
        const amountOfCoinsInput = document.getElementById('amountOfCoinsInput');
        const currencyActionAdd = document.getElementById('currencyActionAdd');
        const currencyActionSet = document.getElementById('currencyActionSet');
        const currencyActionSubtract = document.getElementById('currencyActionSubtract');
        const submitCurrencyActionButton = document.getElementById('submitCurrencyActionButton');

        // Pet Reveal Modal elements
        const petRevealModal = document.getElementById('petRevealModal');
        const closePetRevealModalButton = document.getElementById('closePetRevealModalButton');
        const revealedPetsContainer = document.getElementById('revealedPetsContainer');
        const petRevealCoinsMessage = document.getElementById('petRevealCoinsMessage');
        const dismissPetRevealModalButton = document.getElementById('dismissPetRevealModal');

        // Nickname Input Modal elements
        const nicknameInputModal = document.getElementById('nicknameInputModal');
        const nicknameInputField = document.getElementById('nicknameInputField');
        const submitNicknameButton = document.getElementById('submitNicknameButton');
        const closeNicknameInputModalElement = document.getElementById('closeNicknameInputModal');

        // Leaderboard Modal elements
        const leaderboardModal = document.getElementById('leaderboardModal');
        const closeLeaderboardModal = document.getElementById('closeLeaderboardModal');
        const leaderboardTableBody = document.getElementById('leaderboardTableBody');
        const leaderboardYourRank = document.getElementById('leaderboardYourRank');

        // Recent Rolls Modal elements
        const recentRollsModal = document.getElementById('recentRollsModal');
        const closeRecentRollsModalBtn = document.getElementById('closeRecentRollsModal');
        const recentRollsTableBody = document.getElementById('recentRollsTableBody');

        // Shop Modal elements
        const shopModal = document.getElementById('shopModal');
        const closeShopModal = document.getElementById('closeShopModal');
        const shopItemsContainer = document.getElementById('shopItemsContainer');
        const shopResetTimerDisplay = document.getElementById('shopResetTimerDisplay');
        const shopLuckDisplay = document.getElementById('shopLuckDisplay');

        // Forever Pack Manager Modal elements
        const foreverPackManagerModal = document.getElementById('foreverPackManagerModal');
        const closeForeverPackManagerModalBtn = document.getElementById('closeForeverPackManagerModal');
        const downloadPackConfigButton = document.getElementById('downloadPackConfigButton');
        const uploadPackConfigInput = document.getElementById('uploadPackConfigInput');
        const packTiersContainer = document.getElementById('packTiersContainer');
        const addTierButton = document.getElementById('addTierButton');
        const packItemsContainer = document.getElementById('packItemsContainer');
        const addShopItemButton = document.getElementById('addShopItemButton');
        const savePackConfigButton = document.getElementById('savePackConfigButton');


        let editingPetId = null;

        // Debounce setup for savePlayerProgress
        let saveTimeoutId = null;
        const DEBOUNCE_DELAY = 1000;

        function debouncedSavePlayerProgress() {
            clearTimeout(saveTimeoutId);
            saveTimeoutId = setTimeout(savePlayerProgress, DEBOUNCE_DELAY);
        }

        // --- Utility Functions ---
        function showMessage(message, type = 'info', duration = 3000) {
            messageBox.textContent = message;
            messageBox.classList.remove('hidden', 'bg-red-100', 'text-red-800', 'bg-green-100', 'text-green-800', 'bg-blue-100', 'text-blue-800', 'border-red-400', 'border-green-400', 'border-blue-400');
            if (type === 'error') {
                messageBox.classList.add('bg-red-100', 'text-red-800', 'border-red-400');
            } else if (type === 'success') {
                messageBox.classList.add('bg-green-100', 'text-green-800', 'border-green-400');
            } else { 
                messageBox.classList.add('bg-blue-100', 'text-blue-800', 'border-blue-400');
            }
            messageBox.classList.remove('hidden');
            if (duration > 0 && type !== 'error') {
                setTimeout(() => hideMessage(), duration);
            }
        }

        function hideMessage() {
            messageBox.classList.add('hidden');
        }

        let globalAnnouncementTimeoutId = null;
        function showGlobalAnnouncement(message, duration = 5000) {
            clearTimeout(globalAnnouncementTimeoutId); 
            globalAnnouncementBox.textContent = message;
            globalAnnouncementBox.classList.remove('hidden', 'animate-slide-out');
            globalAnnouncementBox.classList.add('animate-slide-in');

            globalAnnouncementTimeoutId = setTimeout(() => {
                globalAnnouncementBox.classList.remove('animate-slide-in');
                globalAnnouncementBox.classList.add('animate-slide-out');
                globalAnnouncementTimeoutId = setTimeout(() => {
                    globalAnnouncementBox.classList.add('hidden');
                }, 500); 
            }, duration);
        }

        function showLoading() {
            loadingSpinner.classList.remove('hidden');
            gameContainer.classList.add('hidden');
            document.querySelector('.header-container').classList.add('hidden');
        }

        function hideLoading() {
            loadingSpinner.classList.add('hidden');
            gameContainer.classList.remove('hidden');
            document.querySelector('.header-container').classList.remove('hidden');
            enableMainButtons();
        }

        function hideArrow() {
            arrowIndicator.classList.add('hidden');
            arrowIndicator.classList.remove('pointing-to-upgrades');
        }

        function showConfirmation(message, callback) {
            confirmationMessage.textContent = message;
            confirmationCallback = callback;
            confirmationModal.classList.remove('hidden');
        }

        function hideConfirmation() {
            confirmationModal.classList.add('hidden');
            confirmationCallback = null;
        }

        function disableMainButtons(keepAutoRollActive = false) {
            diceButton.classList.add('disabled-dice');
            diceButton.disabled = true;
            upgradeButton.disabled = true;
            inventoryButton.disabled = true;
            petCollectionButton.disabled = true;
            leaderboardsButton.disabled = true;
            recentRollsButton.disabled = true; 
            shopButton.disabled = true; 
            adminPanelButton.disabled = true;
            if (!keepAutoRollActive) {
                autoRollButton.disabled = true;
            }
        }

        function enableMainButtons() {
            const shouldDisableAll = isProcessingRoll || isProcessingShopClaim; 

            diceButton.disabled = shouldDisableAll || isAutoRolling;
            diceButton.classList.toggle('disabled-dice', diceButton.disabled);

            upgradeButton.disabled = shouldDisableAll;
            inventoryButton.disabled = shouldDisableAll;
            autoRollButton.disabled = shouldDisableAll;
            petCollectionButton.disabled = shouldDisableAll;
            leaderboardsButton.disabled = shouldDisableAll;
            recentRollsButton.disabled = shouldDisableAll; 
            shopButton.disabled = shouldDisableAll;
            adminPanelButton.disabled = shouldDisableAll;

            if (!shouldDisableAll) {
                if (rollCount < 4) {
                    upgradeButton.classList.add('hidden');
                    inventoryButton.classList.add('hidden');
                    autoRollButton.classList.add('hidden');
                    leaderboardsButton.classList.add('hidden');
                } else {
                    upgradeButton.classList.remove('hidden');
                    inventoryButton.classList.toggle('hidden', !isInventoryUpgradePurchased);
                    autoRollButton.classList.toggle('hidden', !isAutoRollUpgradePurchased);
                    leaderboardsButton.classList.toggle('hidden', !isLeaderboardsUpgradePurchased);
                }

                if (rollCount >= 4 && !isCoinUpgradePurchased && !isAutoRolling) {
                    diceButton.classList.add('disabled-dice');
                    diceButton.disabled = true;
                    arrowIndicator.classList.remove('hidden');
                    arrowIndicator.classList.add('pointing-to-upgrades');
                } else {
                    hideArrow();
                }
            } else {
                hideArrow();
            }

            adminPanelButton.classList.toggle('hidden', userId !== ADMIN_USER_ID || shouldDisableAll);
        }


        // --- Firebase & Local Storage Functions ---

        function getLocalPersistentUserId() {
            let id = localStorage.getItem('petsgo_local_user_uuid');
            if (!id) {
                id = crypto.randomUUID();
                localStorage.setItem('petsgo_local_user_uuid', id);
            }
            return id;
        }

        function initializeNewGameData() {
            hasPlayedBefore = false; rollCount = 0; upgradesAvailable = 0; coins = 0; userPets = []; userItems = [];
            isCoinUpgradePurchased = false; isRollStreakUpgradePurchased = false; isInventoryUpgradePurchased = false;
            isAutoRollUpgradePurchased = false; isHidePopupUpgradePurchased = false; isFasterRollsIUpgradePurchased = false;
            isRollItemsUpgradePurchased = false; isDeletePetsUpgradePurchased = false;
            isBetterDiceIUpgradePurchased = false; isRollBetterItemsUpgradePurchased = false;
            isMoreCoinsIUpgradePurchased = false; isLeaderboardsUpgradePurchased = false;
            isBetterDiceIIUpgradePurchased = false; isMoreCoinsIIUpgradePurchased = false;
            isRollMoreItemsUpgradePurchased = false;
            isFusePetsUpgradePurchased = false; 
            activeSpeedPotions = []; activeLuckPotions = [];
            userNickname = null;
            rollStreak = 0;
            playerShopState = {
                claimedCount: 0,
                lastResetTimestamp: Date.now(),
                currentLuck: 1.0,
                resetExtensionMinutes: 0,
                shopQueue: []
            };
        }

        function loadGameDataFromObject(data) {
            hasPlayedBefore = data.hasPlayed || false;
            rollCount = data.rollCount || 0;
            upgradesAvailable = data.upgradesAvailable || 0;
            coins = data.coins || 0;
            userPets = data.userPets || [];
            userItems = data.userItems || [];
            isCoinUpgradePurchased = data.isCoinUpgradePurchased || false;
            isRollStreakUpgradePurchased = data.isRollStreakUpgradePurchased || false;
            isInventoryUpgradePurchased = data.isInventoryUpgradePurchased || false;
            isAutoRollUpgradePurchased = data.isAutoRollUpgradePurchased || false;
            isHidePopupUpgradePurchased = data.isHidePopupUpgradePurchased || false;
            isFasterRollsIUpgradePurchased = data.isFasterRollsIUpgradePurchased || false;
            isRollItemsUpgradePurchased = data.isRollItemsUpgradePurchased || false;
            isDeletePetsUpgradePurchased = data.isDeletePetsUpgradePurchased || false;
            isBetterDiceIUpgradePurchased = data.isBetterDiceIUpgradePurchased || false;
            isRollBetterItemsUpgradePurchased = data.isRollBetterItemsUpgradePurchased || false;
            isMoreCoinsIUpgradePurchased = data.isMoreCoinsIUpgradePurchased || false;
            isLeaderboardsUpgradePurchased = data.isLeaderboardsUpgradePurchased || false;
            isBetterDiceIIUpgradePurchased = data.isBetterDiceIIUpgradePurchased || false;
            isMoreCoinsIIUpgradePurchased = data.isMoreCoinsIIUpgradePurchased || false;
            isRollMoreItemsUpgradePurchased = data.isRollMoreItemsUpgradePurchased || false;
            isFusePetsUpgradePurchased = data.isFusePetsUpgradePurchased || false;
            activeSpeedPotions = data.activeSpeedPotions || [];
            userNickname = data.userNickname || null;

            playerShopState = data.playerShopState || {
                claimedCount: 0,
                lastResetTimestamp: Date.now(),
                currentLuck: 1.0,
                resetExtensionMinutes: 0,
                shopQueue: []
            };
            if (!playerShopState.shopQueue) playerShopState.shopQueue = []; // Backwards compatibility
        }

        function loadGameDataFromLocalStorage() {
            const dataString = localStorage.getItem(`petsgo_local_data_${localPersistentUserId}`);
            if (dataString) {
                try {
                    return JSON.parse(dataString);
                } catch (e) {
                    console.error("Error parsing local storage data:", e);
                    localStorage.removeItem(`petsgo_local_data_${localPersistentUserId}`);
                    return null;
                }
            }
            return null;
        }

        function saveGameDataToLocalStorage() {
            const dataToSave = {
                hasPlayed: hasPlayedBefore, rollCount: rollCount, upgradesAvailable: upgradesAvailable, coins: coins,
                userPets: userPets, userItems: userItems, isCoinUpgradePurchased: isCoinUpgradePurchased,
                isRollStreakUpgradePurchased: isRollStreakUpgradePurchased, isInventoryUpgradePurchased: isInventoryUpgradePurchased,
                isAutoRollUpgradePurchased: isAutoRollUpgradePurchased, isHidePopupUpgradePurchased: isHidePopupUpgradePurchased,
                isFasterRollsIUpgradePurchased: isFasterRollsIUpgradePurchased, isRollItemsUpgradePurchased: isRollItemsUpgradePurchased,
                isDeletePetsUpgradePurchased: isDeletePetsUpgradePurchased,
                isBetterDiceIUpgradePurchased: isBetterDiceIUpgradePurchased,
                isRollBetterItemsUpgradePurchased: isRollBetterItemsUpgradePurchased,
                isMoreCoinsIUpgradePurchased: isMoreCoinsIUpgradePurchased,
                isLeaderboardsUpgradePurchased: isLeaderboardsUpgradePurchased,
                isBetterDiceIIUpgradePurchased: isBetterDiceIIUpgradePurchased,
                isMoreCoinsIIUpgradePurchased: isMoreCoinsIIUpgradePurchased,
                isRollMoreItemsUpgradePurchased: isRollMoreItemsUpgradePurchased,
                isFusePetsUpgradePurchased: isFusePetsUpgradePurchased, 
                activeSpeedPotions: activeSpeedPotions,
                userNickname: userNickname,
                playerShopState: playerShopState
            };
            try {
                localStorage.setItem(`petsgo_local_data_${localPersistentUserId}`, JSON.stringify(dataToSave));
            } catch (e) {
                console.error("Error saving to local storage:", e);
            }
        }

        async function savePlayerProgress(forceFirebaseSave = false) {
            saveGameDataToLocalStorage();
            if (auth.currentUser && auth.currentUser.uid && userDataRef) {
                try {
                    await setDoc(userDataRef, {
                        hasPlayed: hasPlayedBefore, rollCount: rollCount, upgradesAvailable: upgradesAvailable, coins: coins,
                        userPets: userPets, userItems: userItems, isCoinUpgradePurchased: isCoinUpgradePurchased,
                        isRollStreakUpgradePurchased: isRollStreakUpgradePurchased, isInventoryUpgradePurchased: isInventoryUpgradePurchased,
                        isAutoRollUpgradePurchased: isAutoRollUpgradePurchased, isHidePopupUpgradePurchased: isHidePopupUpgradePurchased,
                        isFasterRollsIUpgradePurchased: isFasterRollsIUpgradePurchased, isRollItemsUpgradePurchased: isRollItemsUpgradePurchased,
                        isDeletePetsUpgradePurchased: isDeletePetsUpgradePurchased,
                        isBetterDiceIUpgradePurchased: isBetterDiceIUpgradePurchased,
                        isRollBetterItemsUpgradePurchased: isRollBetterItemsUpgradePurchased,
                        isMoreCoinsIUpgradePurchased: isMoreCoinsIUpgradePurchased,
                        isLeaderboardsUpgradePurchased: isLeaderboardsUpgradePurchased,
                        isBetterDiceIIUpgradePurchased: isBetterDiceIIUpgradePurchased,
                        isMoreCoinsIIUpgradePurchased: isMoreCoinsIIUpgradePurchased,
                        isRollMoreItemsUpgradePurchased: isRollMoreItemsUpgradePurchased,
                        isFusePetsUpgradePurchased: isFusePetsUpgradePurchased,
                        activeSpeedPotions: activeSpeedPotions,
                        userNickname: userNickname,
                        playerShopState: playerShopState
                    }, { merge: true });
                    hasPlayedBefore = true; 

                    if (isLeaderboardsUpgradePurchased && auth.currentUser.uid && userNickname) {
                        const leaderboardScoresRef = doc(db, `artifacts/${appId}/public/data/leaderboardScores`, auth.currentUser.uid);
                        await setDoc(leaderboardScoresRef, {
                            userId: auth.currentUser.uid,
                            nickname: userNickname,
                            coins: coins
                        }, { merge: true });
                    }
                    console.log("Progress saved to Firebase.");
                }
                catch (error) {
                    console.error("Error saving player progress to Firebase:", error);
                    showMessage("Failed to save progress to Firebase. Saving locally only.", 'error', 0);
                }
            } else {
                console.log("Firebase not authenticated or userDataRef not set. Saving locally only.");
            }
        }

        function setupPublicDataListeners() {
            const gameSettingsRef = doc(db, `artifacts/${appId}/public/data/gameSettings`, 'global');
            onSnapshot(gameSettingsRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    minChanceDenominatorForAnnouncement = data.minChanceDenominatorForAnnouncement || 100;
                } else {
                    setDoc(gameSettingsRef, { minChanceDenominatorForAnnouncement: 100 }, { merge: true }).catch(e => console.error("Error setting default game settings:", e));
                }
                if (minAnnouncementRarityInput) {
                    minAnnouncementRarityInput.value = minChanceDenominatorForAnnouncement;
                }
            }, (error) => {
                console.error("Error listening to game settings:", error);
            });

            const foreverPackConfigRef = doc(db, `artifacts/${appId}/public/data/shopConfig`, 'foreverPack');
            onSnapshot(foreverPackConfigRef, (docSnap) => {
                if (docSnap.exists()) {
                    foreverPackConfig = docSnap.data();
                    console.log("Forever Pack config loaded from Firebase.");
                } else {
                    console.log("No Forever Pack config found in Firebase. Using/creating default.");
                     const defaultConfig = {
                        tiers: [
                            { paywallCost: 500, freeClaimsAfterPaywall: 1, luckBonus: 0 },
                            { paywallCost: 1500, freeClaimsAfterPaywall: 2, luckBonus: 0.25 }
                        ],
                        items: [
                            { name: "Faster Rolls Potion", chance: 2, quantity: 1, rarity: "Common" },
                            { name: "Lucky Roll Potion", chance: 10, quantity: 1, rarity: "Uncommon" },
                            { name: "HUGE Egg", chance: 500, quantity: 1, rarity: "Exclusive" }
                        ]
                    };
                    setDoc(foreverPackConfigRef, defaultConfig, { merge: true })
                        .then(() => foreverPackConfig = defaultConfig)
                        .catch(e => console.error("Error setting default shop config:", e));
                }
            }, (error) => {
                console.error("Error listening to shop config:", error);
            });

            const petsCollectionRef = collection(db, `artifacts/${appId}/public/data/pets`);
            onSnapshot(petsCollectionRef, async (snapshot) => {
                globalPets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => {
                    const chanceA = a.chanceDenominator !== undefined && a.chanceDenominator > 0 ? a.chanceDenominator : Infinity;
                    const chanceB = b.chanceDenominator !== undefined && b.chanceDenominator > 0 ? b.chanceDenominator : Infinity;

                    if (chanceA !== chanceB) return chanceA - chanceB;
                    return a.name.localeCompare(b.name);
                });
                populatePetsManagementTable();
                await preloadPetImages(globalPets);
            }, (error) => {
                console.error("Error listening to global pets:", error);
                showMessage("Failed to load global pet list. Please refresh.", 'error', 0);
            });

            const announcementsCollectionRef = collection(db, `artifacts/${appId}/public/data/announcements`);
            onSnapshot(announcementsCollectionRef, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === "added") {
                        showGlobalAnnouncement(change.doc.data().message);
                        setTimeout(() => {
                            deleteDoc(change.doc.ref).catch(e => console.error("Error deleting announcement:", e));
                        }, 6000);
                    }
                });
            }, (error) => {
                console.error("Error listening to global announcements:", error);
            });

            const recentRollsCollectionRef = query(
                collection(db, `artifacts/${appId}/public/data/recentRolls`),
                orderBy("timestamp", "desc"),
                limit(20)
            );
            onSnapshot(recentRollsCollectionRef, (snapshot) => {
                const rolls = snapshot.docs.map(doc => doc.data());
                populateRecentRollsTable(rolls);
            }, (error) => {
                console.error("Error listening to recent rolls:", error);
                showMessage("Failed to load recent rolls.", 'error', 0);
            });
        }

        function updateUIBasedOnGameState() {
            updateUpgradeBadge();
            updateCoinsDisplay();
            updateUpgradeButtonState();
            updateRollStreakUI();
            updateInventoryUpgradeUI();
            updateAutoRollUpgradeUI();
            updateAutoRollButtonVisibility();
            updateHidePopupUpgradeUI();
            updateFasterRollsIUpgradeUI();
            updateRollItemsUpgradeUI();
            updateDeletePetsUpgradeUI();
            updateBetterDiceIUpgradeUI();
            updateRollBetterItemsUpgradeUI();
            updateMoreCoinsIUpgradeUI();
            updateLeaderboardsUpgradeUI();
            updateBetterDiceIIUpgradeUI();
            updateMoreCoinsIIUpgradeUI();
            updateRollMoreItemsUpgradeUI();
            updateFusePetsUpgradeUI(); 
            enableMainButtons();
        }

        async function setupFirebase() {
            showLoading();
            localPersistentUserId = getLocalPersistentUserId(); 

            try {
                if (initialAuthToken) {
                    try {
                        console.log("Login Ticket:", initialAuthToken);
                        await signInWithCustomToken(auth, initialAuthToken);
                        console.log("Signed in with custom token.");
                    } catch (customTokenError) {
                        console.warn("Custom token sign-in failed:", customTokenError.code, customTokenError.message);
                        if (customTokenError.code === 'auth/invalid-custom-token' || customTokenError.code === 'auth/invalid-claims' || customTokenError.code === 'auth/argument-error') {
                            console.log("Attempting anonymous sign-in due to invalid custom token.");
                            await signInAnonymously(auth);
                        } else {
                            throw customTokenError;
                        }
                    }
                } else {
                    await signInAnonymously(auth);
                    console.log("Signed in anonymously (no custom token provided).");
                }
            } catch (error) {
                console.error("Firebase authentication error during setup:", error);
                userId = localPersistentUserId; 
                userIdDisplay.textContent = `User ID (Local Save): ${userId}`;
                showMessage("Failed to connect to game server. Using local save. Progress will not sync to cloud.", 'error', 0);
                loadGameDataFromObject(loadGameDataFromLocalStorage() || {}); 
                updateUIBasedOnGameState();
                hideLoading();
                return; 
            }

            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    userId = user.uid; 
                    localStorage.setItem('petsgo_last_firebase_uid', userId); 
                    userIdDisplay.textContent = `User ID (Firebase): ${userId}`;

                    userDataRef = doc(db, `artifacts/${appId}/users/${userId}/gameData`, 'playerProgress');

                    onSnapshot(userDataRef, async (docSnap) => {
                        if (docSnap.exists()) {
                            console.log("Loading game data from Firebase.");
                            loadGameDataFromObject(docSnap.data());
                            saveGameDataToLocalStorage();
                        } else {
                            console.log("No Firebase data found for current UID. Checking local storage for old progress.");
                            const localData = loadGameDataFromLocalStorage();
                            if (localData && Object.keys(localData).length > 0) {
                                console.log("Local storage data found. Migrating to Firebase under new UID.");
                                loadGameDataFromObject(localData);
                                await savePlayerProgress(true);
                                showMessage("Old local progress migrated to Firebase!", 'success', 4000);
                            } else {
                                console.log("No local or Firebase data found. Starting a new game.");
                                initializeNewGameData();
                                debouncedSavePlayerProgress();
                            }
                        }
                        updateUIBasedOnGameState(); 
                        hideLoading();
                    }, (error) => {
                        console.error("Error listening to user data from Firebase:", error);
                        userId = localPersistentUserId; 
                        userIdDisplay.textContent = `User ID (Local Save): ${userId}`;
                        showMessage("Failed to load game data from Firebase. Using local save. Progress may not sync.", 'error', 0);
                        loadGameDataFromObject(loadGameDataFromLocalStorage() || {});
                        updateUIBasedOnGameState();
                        hideLoading();
                    });

                    setupPublicDataListeners();

                } else {
                    console.warn("Firebase authentication failed or user not yet authenticated. Using local save only.");
                    userId = localPersistentUserId; 
                    userIdDisplay.textContent = `User ID (Local Save): ${userId}`;
                    showMessage("Not authenticated with Firebase. Using local save. Progress will not sync to cloud.", 'info', 0);
                    loadGameDataFromObject(loadGameDataFromLocalStorage() || {}); 
                    updateUIBasedOnGameState();
                    hideLoading();
                }
            });
        }


        function preloadPetImages(petsArray) {
            const imagePromises = petsArray.map(pet => {
                return new Promise((resolve) => {
                    if (!pet.imageUrl) { resolve(); return; }
                    const img = new Image();
                    img.src = pet.imageUrl;
                    img.onload = () => resolve();
                    img.onerror = () => { console.warn(`Failed to load image: ${pet.imageUrl}`); resolve(); };
                });
            });
            return Promise.all(imagePromises);
        }

        // --- Game Logic Functions ---
        function populatePetsManagementTable() {
            petsManagementTableBody.innerHTML = '';
            if (globalPets.length === 0) {
                petsManagementTableBody.innerHTML = `<tr><td colspan="6" class="px-4 py-2 text-center text-gray-500">No pets added.</td></tr>`;
                return;
            }
            globalPets.forEach(pet => {
                const row = petsManagementTableBody.insertRow();
                row.className = 'border-b border-gray-200 hover:bg-gray-50';
                const chanceDisplay = pet.chanceDenominator ? `1 in ${pet.chanceDenominator}` : `Weight: ${pet.weight}`;
                row.innerHTML = `
                    <td class="px-4 py-2">${pet.name}</td>
                    <td class="px-4 py-2 ${rarityColors[normalizeRarity(pet.rarity)] || 'text-gray-700'}">${pet.rarity}</td>
                    <td class="px-4 py-2">${chanceDisplay}</td>
                    <td class="px-4 py-2">${pet.minCoins !== undefined ? pet.minCoins : 0}</td>
                    <td class="px-4 py-2">
                        <img src="${pet.imageUrl || 'https://placehold.co/50x50/cccccc/333333?text=No+Img'}" alt="${pet.name}" class="w-12 h-12 object-cover rounded-md mx-auto" onerror="this.onerror=null; this.src='https://placehold.co/50x50/cccccc/333333?text=Failed';">
                    </td>
                    <td class="px-4 py-2">
                        <button class="edit-pet-btn bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded text-sm mr-2" data-id="${pet.id}">Edit</button>
                        <button class="delete-pet-btn bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-sm" data-id="${pet.id}" data-name="${pet.name}">Delete</button>
                    </td>`;
            });
            petsManagementTableBody.querySelectorAll('.edit-pet-btn').forEach(button => button.addEventListener('click', (e) => {
                const pet = globalPets.find(p => p.id === e.target.dataset.id);
                if (pet) {
                    petNameInput.value = pet.name;
                    petRarityInput.value = pet.rarity;
                    petChanceInput.value = pet.chanceDenominator || '';
                    petImageURLInput.value = pet.imageUrl || '';
                    petMinCoinsInput.value = pet.minCoins !== undefined ? pet.minCoins : 0;
                    submitPetButton.textContent = 'Update Pet';
                    editingPetId = pet.id;
                }
            }));
            petsManagementTableBody.querySelectorAll('.delete-pet-btn').forEach(button => button.addEventListener('click', (e) => deletePetFromFirestore(e.target.dataset.id, e.target.dataset.name)));
        }

        async function savePetToFirestore(petData, petId = null) {
            try {
                if (auth.currentUser && auth.currentUser.uid === ADMIN_USER_ID) {
                    const petsCollectionRef = collection(db, `artifacts/${appId}/public/data/pets`);
                    if (petId) {
                        await setDoc(doc(petsCollectionRef, petId), petData);
                        showMessage(`Pet "${petData.name}" updated successfully!`, 'success');
                    } else {
                        await addDoc(petsCollectionRef, petData);
                        showMessage(`Pet "${petData.name}" added successfully!`, 'success');
                    }
                    closePetsList();
                } else {
                    showMessage("You are not authorized to add or edit pets.", 'error');
                }
            } catch (error) {
                console.error("Error saving pet:", error);
                showMessage(`Failed to save pet "${petData.name}". Error: ${error.message}`, 'error', 0);
            }
        }

        async function deletePetFromFirestore(petId, petName) {
            showConfirmation(`Are you sure you want to delete "${petName}"? This is permanent.`, async (confirmed) => {
                hideConfirmation();
                if (confirmed) {
                    try {
                        if (auth.currentUser && auth.currentUser.uid === ADMIN_USER_ID) {
                            const petDocRef = doc(db, `artifacts/${appId}/public/data/pets`, petId);
                            await deleteDoc(petDocRef);
                            showMessage(`Pet "${petName}" deleted successfully!`, 'success');
                            populatePetsManagementTable();
                        } else {
                            showMessage("You are not authorized to delete pets.", 'error');
                        }
                    } catch (error) {
                        console.error("Error deleting pet:", error);
                        showMessage(`Failed to delete pet "${petName}". Error: ${error.message}`, 'error', 0);
                    }
                }
            });
        }


        async function wipeGlobalPets() {
            showConfirmation("Are you sure you want to wipe ALL global pets? This is permanent.", async (confirmed) => {
                hideConfirmation();
                if (confirmed) {
                    try {
                        if (auth.currentUser && auth.currentUser.uid === ADMIN_USER_ID) {
                            const petsCollectionRef = collection(db, `artifacts/${appId}/public/data/pets`);
                            const querySnapshot = await getDocs(petsCollectionRef);
                            const deletePromises = querySnapshot.docs.map(d => deleteDoc(d.ref));
                            await Promise.all(deletePromises);
                            showMessage("All global pets wiped successfully!", 'success');
                            populatePetsManagementTable();
                        } else {
                            showMessage("You are not authorized to wipe global pets.", 'error');
                        }
                    } catch (error) {
                        console.error("Error wiping global pets:", error);
                        showMessage(`Failed to wipe global pets. Error: ${error.message}`, 'error', 0);
                    }
                }
            });
        }

        function getRandomPetByWeight(currentRollStreak, isFusionRoll = false, isHugeRoll = false) {
            let petsToConsider = globalPets;
            if(isHugeRoll) {
                const hugePets = globalPets.filter(pet => normalizeRarity(pet.rarity) === 'HUGE');
                if (hugePets.length > 0) {
                    petsToConsider = hugePets;
                } else {
                    showMessage("You opened a HUGE Egg, but no HUGE pets exist in the game! Admin needs to add them.", 'error', 0);
                    return null;
                }
            } else {
                if (!isFusionRoll && isBetterDiceIIUpgradePurchased) {
                    const filtered = globalPets.filter(pet => pet.chanceDenominator && pet.chanceDenominator >= 8);
                    if (filtered.length > 0) petsToConsider = filtered;
                    else showMessage("Better Dice II active, but no pets with 1/8 or rarer chance available! Rolling from all pets.", 'info', 3000);
                } else if (!isFusionRoll && isBetterDiceIUpgradePurchased) {
                    const filtered = globalPets.filter(pet => pet.chanceDenominator && pet.chanceDenominator >= 5);
                    if (filtered.length > 0) petsToConsider = filtered;
                    else showMessage("Better Dice I active, but no pets with 1/5 or rarer chance available! Rolling from all pets.", 'info', 3000);
                }

                if (isFusionRoll) {
                    const nonExclusivePets = petsToConsider.filter(pet => normalizeRarity(pet.rarity) !== 'EXCLUSIVE');
                    if (nonExclusivePets.length > 0) petsToConsider = nonExclusivePets;
                    else console.warn("Attempted to fuse, but no non-EXCLUSIVE pets available in global collection. Rolling from all pets.");
                }
            }

            if (petsToConsider.length === 0) {
                showMessage("No pets available to roll!", 'error', 0);
                return null;
            }

            const totalWeight = petsToConsider.reduce((sum, pet) => sum + (pet.weight || 0), 0);
            let luckFactor = 1 + (rollStreak * 0.001) + activeLuckPotions.reduce((sum, p) => sum + p.luckBoost, 0);
            let skewedRandomVal = 1 - Math.pow(1 - Math.random(), luckFactor);
            let randomNumber = skewedRandomVal * totalWeight;

            for (const pet of petsToConsider) {
                if (randomNumber < (pet.weight || 0)) return pet;
                randomNumber -= (pet.weight || 0);
            }
            return petsToConsider[petsToConsider.length - 1];
        }

        function getRandomItemByWeight() {
            let itemPool = [];
            const itemTypes = [...new Set(availableItems.map(item => item.type))];

            itemTypes.forEach(type => {
                const tiers = [1, 2, 3].map(t => availableItems.filter(item => item.type === type && item.tier === t));
                const weights = isRollBetterItemsUpgradePurchased ? [70, 20, 10] : [90, 9, 1];
                
                tiers.forEach((tierItems, index) => {
                    if (tierItems.length > 0) {
                        tierItems.forEach(item => itemPool.push({ ...item, effectiveWeight: weights[index] / tierItems.length }));
                    }
                });
            });

            if (itemPool.length === 0) return null;

            const totalWeight = itemPool.reduce((sum, item) => sum + (item.effectiveWeight || 0), 0);
            if (totalWeight === 0) return null;

            let randomNumber = Math.random() * totalWeight;
            for (const item of itemPool) {
                if (randomNumber < (item.effectiveWeight || 0)) return item;
                randomNumber -= (item.effectiveWeight || 0);
            }
            return itemPool[itemPool.length - 1];
        }

        function displayRollingPet(pet) {
            if (!currentRollingPetImg) {
                currentRollingPetImg = document.createElement('img');
                rollingPetDisplay.appendChild(currentRollingPetImg);
            }
            currentRollingPetImg.src = pet.imageUrl || 'https://placehold.co/150x150/cccccc/333333?text=Rolling...';
            currentRollingPetImg.alt = pet.name;
            rollingPetDisplay.classList.remove('hidden');
        }

        function updateUpgradeBadge() {
            upgradeCountBadge.textContent = upgradesAvailable;
            upgradeCountBadge.classList.toggle('hidden', upgradesAvailable <= 0);
            currentUpgradesAvailableDisplay.textContent = upgradesAvailable;
        }

        function updateCoinsDisplay() {
            coinsDisplay.textContent = `Coins: ${coins}`;
        }

        function updateUpgradeButtonState() {
            buyUpgrade1Button.textContent = isCoinUpgradePurchased ? 'Purchased' : 'Coins -> Free (Earn coins)';
            buyUpgrade1Button.disabled = isCoinUpgradePurchased;
            buyUpgrade1Button.classList.toggle('opacity-50', isCoinUpgradePurchased);
            buyUpgrade1Button.classList.toggle('cursor-not-allowed', isCoinUpgradePurchased);

            buyRollStreakUpgradeButton.textContent = isRollStreakUpgradePurchased ? 'Purchased' : 'Buy Roll Streak (500 Coins)';
            buyRollStreakUpgradeButton.disabled = isRollStreakUpgradePurchased || coins < 500;
            buyRollStreakUpgradeButton.classList.toggle('opacity-50', isRollStreakUpgradePurchased || coins < 500);
            buyRollStreakUpgradeButton.classList.toggle('cursor-not-allowed', isRollStreakUpgradePurchased || coins < 500);

            buyInventoryUpgradeButton.textContent = isInventoryUpgradePurchased ? 'Purchased' : 'Buy Inventory (700 Coins)';
            buyInventoryUpgradeButton.disabled = isInventoryUpgradePurchased || coins < 700 || !isRollStreakUpgradePurchased;
            buyInventoryUpgradeButton.classList.toggle('opacity-50', isInventoryUpgradePurchased || coins < 700 || !isRollStreakUpgradePurchased);
            buyInventoryUpgradeButton.classList.toggle('cursor-not-allowed', isInventoryUpgradePurchased || coins < 700 || !isRollStreakUpgradePurchased);

            buyAutoRollUpgradeButton.textContent = isAutoRollUpgradePurchased ? 'Purchased' : 'Buy Auto Roll (1000 Coins)';
            buyAutoRollUpgradeButton.disabled = isAutoRollUpgradePurchased || coins < 1000 || !isInventoryUpgradePurchased;
            buyAutoRollUpgradeButton.classList.toggle('opacity-50', isAutoRollUpgradePurchased || coins < 1000 || !isInventoryUpgradePurchased);
            buyAutoRollUpgradeButton.classList.toggle('cursor-not-allowed', isAutoRollUpgradePurchased || coins < 1000 || !isInventoryUpgradePurchased);

            buyHidePopupUpgradeButton.textContent = isHidePopupUpgradePurchased ? 'Purchased' : 'Hide Pet Pop-up (1250 Coins)';
            buyHidePopupUpgradeButton.disabled = isHidePopupUpgradePurchased || coins < 1250 || !isAutoRollUpgradePurchased;
            buyHidePopupUpgradeButton.classList.toggle('opacity-50', isHidePopupUpgradePurchased || coins < 1250 || !isAutoRollUpgradePurchased);
            buyHidePopupUpgradeButton.classList.toggle('cursor-not-allowed', isHidePopupUpgradePurchased || coins < 1250 || !isAutoRollUpgradePurchased);

            buyFasterRollsIUpgradeButton.textContent = isFasterRollsIUpgradePurchased ? 'Purchased' : 'Buy Faster Rolls I (2000 Coins)';
            buyFasterRollsIUpgradeButton.disabled = isFasterRollsIUpgradePurchased || coins < 2000 || !isHidePopupUpgradePurchased;
            buyFasterRollsIUpgradeButton.classList.toggle('opacity-50', isFasterRollsIUpgradePurchased || coins < 2000 || !isHidePopupUpgradePurchased);
            buyFasterRollsIUpgradeButton.classList.toggle('cursor-not-allowed', isFasterRollsIUpgradePurchased || coins < 2000 || !isHidePopupUpgradePurchased);

            buyRollItemsUpgradeButton.textContent = isRollItemsUpgradePurchased ? 'Purchased' : 'Buy Roll Items (2500 Coins)';
            buyRollItemsUpgradeButton.disabled = isRollItemsUpgradePurchased || coins < 2500 || !isFasterRollsIUpgradePurchased;
            buyRollItemsUpgradeButton.classList.toggle('opacity-50', isRollItemsUpgradePurchased || coins < 2500 || !isFasterRollsIUpgradePurchased);
            buyRollItemsUpgradeButton.classList.toggle('cursor-not-allowed', isRollItemsUpgradePurchased || coins < 2500 || !isFasterRollsIUpgradePurchased);

            buyDeletePetsUpgradeButton.textContent = isDeletePetsUpgradePurchased ? 'Purchased' : 'Buy Delete Pets (2500 Coins)';
            buyDeletePetsUpgradeButton.disabled = isDeletePetsUpgradePurchased || coins < 2500 || !isRollItemsUpgradePurchased;
            buyDeletePetsUpgradeButton.classList.toggle('opacity-50', isDeletePetsUpgradePurchased || coins < 2500 || !isRollItemsUpgradePurchased);
            buyDeletePetsUpgradeButton.classList.toggle('cursor-not-allowed', isDeletePetsUpgradePurchased || coins < 2500 || !isRollItemsUpgradePurchased);

            buyBetterDiceIUpgradeButton.textContent = isBetterDiceIUpgradePurchased ? 'Purchased' : 'Buy Better Dice I (5000 Coins)';
            buyBetterDiceIUpgradeButton.disabled = isBetterDiceIUpgradePurchased || coins < 5000 || !isDeletePetsUpgradePurchased;
            buyBetterDiceIUpgradeButton.classList.toggle('opacity-50', isBetterDiceIUpgradePurchased || coins < 5000 || !isDeletePetsUpgradePurchased);
            buyBetterDiceIUpgradeButton.classList.toggle('cursor-not-allowed', isBetterDiceIUpgradePurchased || coins < 5000 || !isDeletePetsUpgradePurchased);

            buyRollBetterItemsUpgradeButton.textContent = isRollBetterItemsUpgradePurchased ? 'Purchased' : 'Buy Roll Better Items (7500 Coins)';
            buyRollBetterItemsUpgradeButton.disabled = isRollBetterItemsUpgradePurchased || coins < 7500 || !isBetterDiceIUpgradePurchased;
            buyRollBetterItemsUpgradeButton.classList.toggle('opacity-50', isRollBetterItemsUpgradePurchased || coins < 7500 || !isBetterDiceIUpgradePurchased);
            buyRollBetterItemsUpgradeButton.classList.toggle('cursor-not-allowed', isRollBetterItemsUpgradePurchased || coins < 7500 || !isBetterDiceIUpgradePurchased);
        
            buyMoreCoinsIUpgradeButton.textContent = isMoreCoinsIUpgradePurchased ? 'Purchased' : 'Buy More Coins I (8000 Coins)';
            buyMoreCoinsIUpgradeButton.disabled = isMoreCoinsIUpgradePurchased || coins < 8000 || !isRollBetterItemsUpgradePurchased;
            buyMoreCoinsIUpgradeButton.classList.toggle('opacity-50', isMoreCoinsIUpgradePurchased || coins < 8000 || !isRollBetterItemsUpgradePurchased);
            buyMoreCoinsIUpgradeButton.classList.toggle('cursor-not-allowed', isMoreCoinsIUpgradePurchased || coins < 8000 || !isRollBetterItemsUpgradePurchased);

            buyLeaderboardsUpgradeButton.textContent = isLeaderboardsUpgradePurchased ? 'Purchased' : 'Buy Leaderboards (10000 Coins)';
            buyLeaderboardsUpgradeButton.disabled = isLeaderboardsUpgradePurchased || coins < 10000 || !isMoreCoinsIUpgradePurchased;
            buyLeaderboardsUpgradeButton.classList.toggle('opacity-50', isLeaderboardsUpgradePurchased || coins < 10000 || !isMoreCoinsIUpgradePurchased);
            buyLeaderboardsUpgradeButton.classList.toggle('cursor-not-allowed', isLeaderboardsUpgradePurchased || coins < 10000 || !isMoreCoinsIUpgradePurchased);

            buyBetterDiceIIUpgradeButton.textContent = isBetterDiceIIUpgradePurchased ? 'Purchased' : 'Buy Better Dice II (11000 Coins)';
            buyBetterDiceIIUpgradeButton.disabled = isBetterDiceIIUpgradePurchased || coins < 11000 || !isLeaderboardsUpgradePurchased;
            buyBetterDiceIIUpgradeButton.classList.toggle('opacity-50', isBetterDiceIIUpgradePurchased || coins < 11000 || !isLeaderboardsUpgradePurchased);
            buyBetterDiceIIUpgradeButton.classList.toggle('cursor-not-allowed', isBetterDiceIIUpgradePurchased || coins < 11000 || !isLeaderboardsUpgradePurchased);

            buyMoreCoinsIIUpgradeButton.textContent = isMoreCoinsIIUpgradePurchased ? 'Purchased' : 'Buy More Coins II (15000 Coins)';
            buyMoreCoinsIIUpgradeButton.disabled = isMoreCoinsIIUpgradePurchased || coins < 15000 || !isBetterDiceIIUpgradePurchased;
            buyMoreCoinsIIUpgradeButton.classList.toggle('opacity-50', isMoreCoinsIIUpgradePurchased || coins < 15000 || !isBetterDiceIIUpgradePurchased);
            buyMoreCoinsIIUpgradeButton.classList.toggle('cursor-not-allowed', isMoreCoinsIIUpgradePurchased || coins < 15000 || !isBetterDiceIIUpgradePurchased);

            buyRollMoreItemsUpgradeButton.textContent = isRollMoreItemsUpgradePurchased ? 'Purchased' : 'Buy Roll More Items (14000 Coins)';
            buyRollMoreItemsUpgradeButton.disabled = isRollMoreItemsUpgradePurchased || coins < 14000 || !isMoreCoinsIIUpgradePurchased;
            buyRollMoreItemsUpgradeButton.classList.toggle('opacity-50', isRollMoreItemsUpgradePurchased || coins < 14000 || !isMoreCoinsIIUpgradePurchased);
            buyRollMoreItemsUpgradeButton.classList.toggle('cursor-not-allowed', isRollMoreItemsUpgradePurchased || coins < 14000 || !isMoreCoinsIIUpgradePurchased);

            buyFusePetsUpgradeButton.textContent = isFusePetsUpgradePurchased ? 'Purchased' : 'Buy Fuse Pets (15000 Coins)';
            buyFusePetsUpgradeButton.disabled = isFusePetsUpgradePurchased || coins < 15000 || !isRollMoreItemsUpgradePurchased;
            buyFusePetsUpgradeButton.classList.toggle('opacity-50', isFusePetsUpgradePurchased || coins < 15000 || !isRollMoreItemsUpgradePurchased);
            buyFusePetsUpgradeButton.classList.toggle('cursor-not-allowed', isFusePetsUpgradePurchased || coins < 15000 || !isRollMoreItemsUpgradePurchased);
        }

        function updateRollStreakUI() {
            rollStreakUpgradeSection.classList.toggle('hidden', !isCoinUpgradePurchased);
            if (isCoinUpgradePurchased) {
                const currentLuckMultiplier = (1 + (rollStreak * 0.001)).toFixed(3);
                currentRollStreakDisplay.innerHTML = `<p>Base Luck: 1.000x</p><p>Current Luck: ${currentLuckMultiplier}x</p><p class="text-xs text-gray-500">(Higher luck makes rarer pets more common)</p>`;
            }
        }

        function updateInventoryUpgradeUI() {
            inventoryUpgradeSection.classList.toggle('hidden', !isRollStreakUpgradePurchased);
            inventoryButton.classList.toggle('hidden', !isInventoryUpgradePurchased || rollCount < 4);
        }

        function updateAutoRollUpgradeUI() {
            autoRollUpgradeSection.classList.toggle('hidden', !isInventoryUpgradePurchased);
        }

        function updateAutoRollButtonVisibility() {
            autoRollButton.classList.toggle('hidden', !isAutoRollUpgradePurchased || rollCount < 4);
        }

        function updateHidePopupUpgradeUI() {
            hidePopupUpgradeSection.classList.toggle('hidden', !isAutoRollUpgradePurchased);
        }

        function updateFasterRollsIUpgradeUI() {
            fasterRollsIUpgradeSection.classList.toggle('hidden', !isHidePopupUpgradePurchased);
        }

        function updateRollItemsUpgradeUI() {
            rollItemsUpgradeSection.classList.toggle('hidden', !isFasterRollsIUpgradePurchased);
        }

        function updateDeletePetsUpgradeUI() {
            deletePetsUpgradeSection.classList.toggle('hidden', !isRollItemsUpgradePurchased);
        }

        function updateBetterDiceIUpgradeUI() {
            betterDiceIUpgradeSection.classList.toggle('hidden', !isDeletePetsUpgradePurchased);
        }

        function updateRollBetterItemsUpgradeUI() {
            rollBetterItemsUpgradeSection.classList.toggle('hidden', !isBetterDiceIUpgradePurchased);
        }

        function updateMoreCoinsIUpgradeUI() {
            moreCoinsIUpgradeSection.classList.toggle('hidden', !isRollBetterItemsUpgradePurchased);
        }

        function updateLeaderboardsUpgradeUI() {
            leaderboardsUpgradeSection.classList.toggle('hidden', !isMoreCoinsIUpgradePurchased);
            leaderboardsButton.classList.toggle('hidden', !isLeaderboardsUpgradePurchased || rollCount < 4);
        }

        function updateBetterDiceIIUpgradeUI() {
            betterDiceIIUpgradeSection.classList.toggle('hidden', !isLeaderboardsUpgradePurchased);
        }

        function updateMoreCoinsIIUpgradeUI() {
            moreCoinsIIUpgradeSection.classList.toggle('hidden', !isBetterDiceIIUpgradePurchased);
        }

        function updateRollMoreItemsUpgradeUI() {
            rollMoreItemsUpgradeSection.classList.toggle('hidden', !isMoreCoinsIIUpgradePurchased);
        }

        function updateFusePetsUpgradeUI() {
            fusePetsUpgradeSection.classList.toggle('hidden', !isRollMoreItemsUpgradePurchased);
            if (inventoryTabButton && fuseMachineTabButton) {
                fuseMachineTabButton.classList.toggle('hidden', !isFusePetsUpgradePurchased);
                inventoryTabButton.classList.toggle('hidden', !isInventoryUpgradePurchased); 
            }
        }


        function handleDiceClick() {
            if (isProcessingRoll) return;
            isProcessingRoll = true;
            disableMainButtons(isAutoRolling);

            rollCount++;
            if (isRollStreakUpgradePurchased) rollStreak++; else rollStreak = 0;

            hideMessage(); hideArrow();
            rollingPetDisplay.classList.remove('hidden');
            if (!currentRollingPetImg) {
                currentRollingPetImg = document.createElement('img');
                rollingPetDisplay.appendChild(currentRollingPetImg);
            }
            currentRollingPetImg.src = 'https://placehold.co/150x150/cccccc/333333?text=Rolling...';

            if (globalPets.length === 0) {
                showMessage("No pets to roll! Admin needs to add some.", 'error', 0);
                rollingPetDisplay.classList.add('hidden');
                if (currentRollingPetImg) currentRollingPetImg.src = '';
                isProcessingRoll = false;
                enableMainButtons();
                if (isAutoRolling) stopAutoRoll();
                return;
            }

            const now = Date.now();
            activeSpeedPotions = activeSpeedPotions.filter(p => p.expiry > now);
            let totalActiveSpeedBoostPercentage = activeSpeedPotions.reduce((sum, p) => sum + p.speedBoost, 0);

            let rollSequenceBaseDuration = isAutoRolling ? 1000 : 2500;
            if (isFasterRollsIUpgradePurchased) rollSequenceBaseDuration *= 0.95;
            currentRollAnimationDuration = rollSequenceBaseDuration * (1 - totalActiveSpeedBoostPercentage);
            if (currentRollAnimationDuration < 200) currentRollAnimationDuration = 200;

            let totalActiveLuckyBoostPercentage = activeLuckPotions.reduce((sum, p) => sum + p.luckBoost, 0);
            let luckFactor = 1 + (rollStreak * 0.001) + totalActiveLuckyBoostPercentage;

            activeLuckPotions = []; 

            const obtainedPet = getRandomPetByWeight(luckFactor, false, false); 
            if (!obtainedPet) {
                showMessage("Could not roll a pet with current dice settings. Add more pets or disable Better Dice I/II.", 'error', 0);
                rollingPetDisplay.classList.add('hidden');
                if (currentRollingPetImg) currentRollingPetImg.src = '';
                isProcessingRoll = false;
                enableMainButtons();
                if (isAutoRolling) stopAutoRoll();
                return;
            }

            userPets.push({ name: obtainedPet.name, rarity: obtainedPet.rarity, imageUrl: obtainedPet.imageUrl, weight: obtainedPet.weight, chanceDenominator: obtainedPet.chanceDenominator, id: crypto.randomUUID() });

            let rolledItem = null;
            let itemRollChance = isRollMoreItemsUpgradePurchased ? 0.25 : 0.15;
            
            if (isRollItemsUpgradePurchased && Math.random() < itemRollChance) {
                rolledItem = getRandomItemByWeight();
                if (rolledItem) userItems.push(rolledItem);
            }


            const initialDelay = 50;
            const finalDelay = isAutoRolling ? 150 : 300;
            const startTime = Date.now();

            const animateRoll = () => {
                const elapsedTime = Date.now() - startTime;
                if (elapsedTime < currentRollAnimationDuration) {
                    const progress = elapsedTime / currentRollAnimationDuration;
                    const currentDelay = initialDelay + (finalDelay - initialDelay) * progress;
                    let tempPet;
                    let tempPetsPool = globalPets;

                    if (isBetterDiceIIUpgradePurchased) {
                        const filtered = globalPets.filter(p => p.chanceDenominator && p.chanceDenominator >= 8);
                        if (filtered.length > 0) tempPetsPool = filtered;
                    } else if (isBetterDiceIUpgradePurchased) {
                        const filtered = globalPets.filter(p => p.chanceDenominator && p.chanceDenominator >= 5);
                        if (filtered.length > 0) tempPetsPool = filtered;
                    }

                    do {
                        tempPet = tempPetsPool[Math.floor(Math.random() * tempPetsPool.length)];
                    } while (tempPetsPool.length > 1 && tempPet.imageUrl === (currentRollingPetImg ? currentRollingPetImg.src : ''));

                    displayRollingPet(tempPet);
                    setTimeout(animateRoll, currentDelay);
                } else {
                    displayRollingPet(obtainedPet);
                    setTimeout(() => {
                        rollingPetDisplay.classList.add('hidden');
                        if (currentRollingPetImg) currentRollingPetImg.src = '';

                        let coinsEarnedThisRoll = (obtainedPet.minCoins || 0);
                        let doubleCoinProc = false;

                        if (isCoinUpgradePurchased) {
                            coinsEarnedThisRoll += 10;
                            let totalCoinBonusPercentage = 0;
                            if (isMoreCoinsIUpgradePurchased) totalCoinBonusPercentage += 0.10;
                            if (isMoreCoinsIIUpgradePurchased) totalCoinBonusPercentage += 0.15;
                            coinsEarnedThisRoll *= (1 + totalCoinBonusPercentage);
                            
                            if (Math.random() < 0.01) {
                                coinsEarnedThisRoll *= 2;
                                doubleCoinProc = true;
                            }
                        }
                        
                        coins += Math.floor(coinsEarnedThisRoll);
                        updateCoinsDisplay(); updateRollStreakUI();

                        if (rollCount === 4 && upgradesAvailable === 0) {
                            upgradesAvailable = 1;
                            showMessage("Unlocked Upgrade Tree! 1 free upgrade!", 'info', 0);
                            updateUpgradeBadge();
                        }
                        debouncedSavePlayerProgress();

                        if (obtainedPet.chanceDenominator && obtainedPet.chanceDenominator >= minChanceDenominatorForAnnouncement) {
                            const displayName = isLeaderboardsUpgradePurchased && userNickname ? userNickname : userId;
                            const cleanPetName = obtainedPet.name.replace(/\s*\(.*?\)\s*/g, '').trim();
                            const announcement = `😮${displayName} JUST HATCHED A ${cleanPetName} with a rarity of 1/${obtainedPet.chanceDenominator}!`;
                            postGlobalAnnouncement(announcement);
                            
                            const recentRollsCollectionRef = collection(db, `artifacts/${appId}/public/data/recentRolls`);
                            addDoc(recentRollsCollectionRef, {
                                petName: obtainedPet.name,
                                rarity: obtainedPet.rarity,
                                chanceDenominator: obtainedPet.chanceDenominator,
                                imageUrl: obtainedPet.imageUrl,
                                rolledBy: displayName,
                                timestamp: Date.now()
                            }).catch(e => console.error("Error adding recent roll:", e));
                        }


                        if (!isHidePopupUpgradePurchased) {
                            populateAndShowSingleRevealModal([obtainedPet], [rolledItem].filter(Boolean), coinsEarnedThisRoll, doubleCoinProc);
                        } else {
                            isProcessingRoll = false;
                            enableMainButtons();
                            let message = `You rolled a ${obtainedPet.name}!`;
                            if (rolledItem) message += ` You also found a ${rolledItem.name}!`;
                            message += ` Earned ${Math.floor(coinsEarnedThisRoll)} coins.`;
                            if (doubleCoinProc) message += ` (DOUBLE COINS!)`;
                            
                            showMessage(message, 'success', 2000);
                            if (isAutoRolling) {
                                clearTimeout(autoRollTimeoutId);
                                const nextRollDelay = currentRollAnimationDuration + 500;
                                autoRollTimeoutId = setTimeout(() => {
                                    if (isAutoRolling) handleDiceClick();
                                }, nextRollDelay);
                            }
                        }
                    }, isAutoRolling ? 50 : 200);
                }
            };
            animateRoll();
        }

        function populateAndShowSingleRevealModal(pets, items, coinsEarned, doubleCoinProc) {
            revealedPetsContainer.innerHTML = '';
            const allWinnings = [...pets, ...items];

            function createAssetCard(asset) {
                const card = document.createElement('div');
                card.className = 'won-pet-card bg-white p-4 md:p-6 rounded-xl shadow-xl flex flex-col items-center text-center relative group transition-all duration-300 transform hover:scale-105';
                const name = asset.name;
                const imageUrl = asset.imageUrl;
                const rarityOrType = asset.rarity || asset.type;
                const rarityClass = asset.rarity ? (rarityColors[normalizeRarity(asset.rarity)] || 'text-gray-700') : 'text-gray-700';
                const chanceText = asset.chanceDenominator ? `1 in ${asset.chanceDenominator}` : (asset.rarity ? 'N/A Odds' : '');
                const quantityText = asset.quantity > 1 ? ` (x${asset.quantity})` : '';

                card.innerHTML = `
                    <img src="${imageUrl || 'https://placehold.co/150x150/cccccc/333333?text=Asset'}" alt="${name}" class="w-28 h-28 md:w-36 md:h-36 object-contain rounded-lg mb-3 shadow-md" onerror="this.onerror=null; this.src='https://placehold.co/150x150/cccccc/333333?text=Failed';">
                    <div class="flex flex-col flex-grow w-full"> <p class="font-bold text-xl md:text-2xl text-gray-800 break-words mb-1">${name}${quantityText}</p>
                        <p class="text-md md:text-lg font-semibold ${rarityClass} break-words mb-1">${rarityOrType}</p>
                        ${asset.rarity ? `<p class="text-xs text-gray-500 break-words">${chanceText}</p>` : ''}
                    </div>
                    <div class="absolute inset-0 bg-black bg-opacity-75 text-white flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-2"><span class="text-md font-bold">${asset.type ? asset.description : (asset.rarity ? 'Pet' : 'Item')}</span></div>
                `;
                return card;
            }

            allWinnings.forEach(asset => {
                if(asset) revealedPetsContainer.appendChild(createAssetCard(asset));
            });

            if (coinsEarned > 0 || doubleCoinProc) {
                let coinMessage = isCoinUpgradePurchased ? `You earned ${Math.floor(coinsEarned)} coins!` : `Unlock 'Coins' upgrade to earn coins!`;
                if (doubleCoinProc) coinMessage += ` (DOUBLE COINS!)`;
                petRevealCoinsMessage.textContent = coinMessage;
                petRevealCoinsMessage.classList.remove('hidden');
            } else {
                 petRevealCoinsMessage.classList.add('hidden');
            }
            
            petRevealModal.querySelector('h2').textContent = allWinnings.length > 1 ? "You Got Stuff!" : "You Got Something!";
            petRevealModal.classList.remove('hidden');
            petRevealModal.querySelector('.pet-reveal-modal-content').classList.add('animate-in');
        }

        function closePetRevealModalHandler() {
            petRevealModal.querySelector('.pet-reveal-modal-content').classList.remove('animate-in');
            petRevealModal.classList.add('hidden');
            isProcessingRoll = false;
            isProcessingShopClaim = false; 
            enableMainButtons();

            if (isAutoRolling) {
                clearTimeout(autoRollTimeoutId);
                const nextRollDelay = currentRollAnimationDuration + 500;
                autoRollTimeoutId = setTimeout(() => {
                    if (isAutoRolling) handleDiceClick();
                }, nextRollDelay);
            }
        }

        function startAutoRoll() {
            if (isAutoRolling || !isAutoRollUpgradePurchased) return;
            isAutoRolling = true;
            autoRollButton.innerHTML = `🔁 <span class="auto-roll-text">Stop Auto</span>`;
            autoRollButton.classList.add('bg-red-500', 'hover:bg-red-700');
            autoRollButton.classList.remove('bg-green-500', 'hover:bg-green-700');
            diceButton.disabled = true;
            diceButton.classList.add('disabled-dice');
            showMessage("Auto Roll Started!", 'info', 2000);
            handleDiceClick();
        }

        function stopAutoRoll() {
            if (!isAutoRolling) return;
            isAutoRolling = false;
            clearTimeout(autoRollTimeoutId);
            autoRollTimeoutId = null;
            autoRollButton.innerHTML = `🔁 <span class="auto-roll-text">Auto Roll</span>`;
            autoRollButton.classList.remove('bg-red-500', 'hover:bg-red-700');
            autoRollButton.classList.add('bg-green-500', 'hover:bg-green-700');
            showMessage("Auto Roll Stopped.", 'info', 2000);
            enableMainButtons();
        }

        function handleAutoRollToggle() { if (isAutoRolling) stopAutoRoll(); else startAutoRoll(); }

        // --- Admin Panel & Pet List Management Handlers ---
        function openAdminPanel() {
            adminPanelModal.classList.remove('hidden');
            if (minAnnouncementRarityInput) minAnnouncementRarityInput.value = minChanceDenominatorForAnnouncement;
        }
        function closeAdminPanel() { adminPanelModal.classList.add('hidden'); populatePetsManagementTable(); enableMainButtons(); }
        function openPetsList() { petsListModal.classList.remove('hidden'); populatePetsManagementTable(); }
        function closePetsList() {
            petNameInput.value = ''; petRarityInput.value = ''; petChanceInput.value = ''; petImageURLInput.value = ''; petMinCoinsInput.value = '';
            submitPetButton.textContent = 'Add Pet'; editingPetId = null;
            petsListModal.classList.add('hidden');
        }
        async function handleSubmitPet() {
            const name = petNameInput.value.trim();
            const rarity = petRarityInput.value.trim();
            const chanceDenominator = parseFloat(petChanceInput.value);
            const imageUrl = petImageURLInput.value.trim();
            const minCoins = parseInt(petMinCoinsInput.value) || 0;

            if (!name || !rarity || isNaN(chanceDenominator) || chanceDenominator <= 0) {
                showMessage("Valid name, rarity, and positive chance (e.g., 3 for 1 in 3) needed.", 'error'); return;
            }
            if (isNaN(minCoins) || minCoins < 0) { showMessage("Min Coins must be non-negative.", 'error'); return; }
            if (!Object.keys(rarityOrder).includes(normalizeRarity(rarity))) {
                showMessage(`Invalid rarity. Choose from: ${Object.keys(rarityOrder).join(', ')}`, 'error'); return;
            }

            const weight = BASE_TOTAL_WEIGHT / chanceDenominator;
            await savePetToFirestore({ name, rarity, weight, chanceDenominator, imageUrl, minCoins }, editingPetId);
        }
        function downloadPetsList() {
            const dataStr = JSON.stringify(globalPets.map(({id, weight, ...rest}) => rest), null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = 'pets_list.json';
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
            showMessage("Pets list downloaded!", 'success');
        }
        async function uploadPetsList(event) {
            const file = event.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const uploadedData = JSON.parse(e.target.result);
                    if (!Array.isArray(uploadedData)) { showMessage("Uploaded file not a valid JSON array.", 'error'); return; }
                    let added = 0, ignored = 0, discordWarnings = 0, invalidRarity = 0, invalidChance = 0;
                    const petsCollectionRef = collection(db, `artifacts/${appId}/public/data/pets`);
                    for (const petData of uploadedData) {
                        const chanceDenominator = parseFloat(petData.chanceDenominator);
                        const normalizedRarity = normalizeRarity(petData.rarity);
                        if (petData.name && normalizedRarity && !isNaN(chanceDenominator) && chanceDenominator > 0) {
                            if (!Object.keys(rarityOrder).includes(normalizedRarity)) { invalidRarity++; continue; }
                            const calculatedWeight = BASE_TOTAL_WEIGHT / chanceDenominator;
                            const petToSave = {
                                name: petData.name, rarity: normalizedRarity, weight: calculatedWeight,
                                chanceDenominator: chanceDenominator, imageUrl: petData.imageUrl || '',
                                minCoins: petData.minCoins !== undefined ? petData.minCoins : 0
                            };
                            if (petToSave.imageUrl.includes('cdn.discordapp.com')) discordWarnings++;
                            if (!globalPets.find(p => p.name.toLowerCase() === petToSave.name.toLowerCase())) {
                                await setDoc(doc(petsCollectionRef), petToSave); added++;
                            } else { ignored++; }
                        } else { invalidChance++; }
                    }
                    let msg = `Uploaded ${added} new pets. Ignored ${ignored} duplicates.`;
                    if (invalidRarity > 0) msg += ` Skipped ${invalidRarity} with invalid rarity.`;
                    if (invalidChance > 0) msg += ` Skipped ${invalidChance} with invalid chance denominator.`;
                    if (discordWarnings > 0) msg += ` Warning: ${discordWarnings} pets use Discord CDN (may expire).`;
                    showMessage(msg, 'success', 5000);
                    uploadPetsInput.value = '';
                } catch (error) { console.error("Error uploading pets list:", error); showMessage("Failed to upload. Invalid JSON or other error.", 'error', 0); }
            };
            reader.readAsText(file);
        }

        async function postGlobalAnnouncement(message) {
            try {
                if (auth.currentUser && auth.currentUser.uid) {
                    const announcementsCollectionRef = collection(db, `artifacts/${appId}/public/data/announcements`);
                    await addDoc(announcementsCollectionRef, { message: message, timestamp: Date.now() });
                } else {
                    console.warn("Not authenticated with Firebase, cannot post global announcement.");
                    showMessage("Can't post global announcement: Not authenticated with Firebase.", 'info', 3000);
                }
            } catch (error) {
                console.error("Error posting global announcement:", error);
                showMessage("Failed to post global announcement.", 'error', 0);
            }
        }

        async function saveMinAnnouncementRarity() {
            if (userId !== ADMIN_USER_ID) { showMessage("You are not authorized to change this setting.", 'error'); return; }
            if (!auth.currentUser || !auth.currentUser.uid) { showMessage("Not authenticated with Firebase, cannot save global settings.", 'error'); return; }

            const newValue = parseInt(minAnnouncementRarityInput.value);
            if (isNaN(newValue) || newValue < 1) { showMessage("Please enter a valid number (minimum 1) for rarity.", 'error'); return; }

            try {
                const gameSettingsRef = doc(db, `artifacts/${appId}/public/data/gameSettings`, 'global');
                await setDoc(gameSettingsRef, { minChanceDenominatorForAnnouncement: newValue }, { merge: true });
                minChanceDenominatorForAnnouncement = newValue;
                showMessage(`Minimum rarity for announcements set to 1/${newValue}!`, 'success');
            } catch (error) {
                console.error("Error saving min announcement rarity:", error);
                showMessage("Failed to save minimum announcement rarity.", 'error', 0);
            }
        }


        // --- Upgrade Tree Logic ---
        function handleBuyUpgrade1() {
            if (upgradesAvailable >= 1 && !isCoinUpgradePurchased) {
                upgradesAvailable--; isCoinUpgradePurchased = true; savePlayerProgress(); updateUIBasedOnGameState();
                showMessage("Bought 'Coins -> Free'! Earn bonus coins!", 'success'); enableMainButtons();
            } else if (isCoinUpgradePurchased) showMessage("Already purchased!", 'info'); else showMessage("Not enough upgrades!", 'error');
        }
        function handleBuyRollStreakUpgrade() {
            const COST = 500; if (!isCoinUpgradePurchased) { showMessage("Buy 'Coins -> Free' first!", 'error'); return; }
            if (isRollStreakUpgradePurchased) { showMessage("Already purchased!", 'info'); return; }
            if (coins >= COST) { coins -= COST; isRollStreakUpgradePurchased = true; rollStreak = 0; savePlayerProgress(); updateUIBasedOnGameState();
            } else showMessage(`Not enough coins! Need ${COST}.`, 'error');
        }
        function handleBuyInventoryUpgrade() {
            const COST = 700; if (!isRollStreakUpgradePurchased) { showMessage("Buy 'Roll Streak' first!", 'error'); return; }
            if (isInventoryUpgradePurchased) { showMessage("Already purchased!", 'info'); return; }
            if (coins >= COST) { coins -= COST; isInventoryUpgradePurchased = true; savePlayerProgress(); updateUIBasedOnGameState();
            } else showMessage(`Not enough coins! Need ${COST}.`, 'error');
        }
        function handleBuyAutoRollUpgrade() {
            const COST = 1000; if (!isInventoryUpgradePurchased) { showMessage("Buy 'Inventory' upgrade first!", 'error'); return; }
            if (isAutoRollUpgradePurchased) { showMessage("Already purchased!", 'info'); return; }
            if (coins >= COST) { coins -= COST; isAutoRollUpgradePurchased = true; savePlayerProgress(); updateUIBasedOnGameState();
            } else showMessage(`Not enough coins! Need ${COST}.`, 'error');
        }
        function handleBuyHidePopupUpgrade() {
            const COST = 1250; if (!isAutoRollUpgradePurchased) { showMessage("Buy 'Auto Roll' upgrade first!", 'error'); return; }
            if (isHidePopupUpgradePurchased) { showMessage("Already purchased!", 'info'); return; }
            if (coins >= COST) {
                coins -= COST; isHidePopupUpgradePurchased = true; savePlayerProgress(); updateUIBasedOnGameState();
                showMessage("Bought 'Hide Pet Pop-up' upgrade! Pet reveal pop-ups will now be hidden.", 'success');
            } else showMessage(`Not enough coins! Need ${COST}.`, 'error');
        }
        function handleBuyFasterRollsIUpgrade() {
            const COST = 2000; if (!isHidePopupUpgradePurchased) { showMessage("Buy 'Hide Pet Pop-up' first!", 'error'); return; }
            if (isFasterRollsIUpgradePurchased) { showMessage("Already purchased!", 'info'); return; }
            if (coins >= COST) { coins -= COST; isFasterRollsIUpgradePurchased = true; savePlayerProgress(); updateUIBasedOnGameState();
            showMessage("Bought 'Faster Rolls I'! Rolling animation is now 5% faster!", 'success');
            } else showMessage(`Not enough coins! Need ${COST}.`, 'error');
        }
        function handleBuyRollItemsUpgrade() {
            const COST = 2500; if (!isFasterRollsIUpgradePurchased) { showMessage("Buy 'Faster Rolls I' first!", 'error'); return; }
            if (isRollItemsUpgradePurchased) { showMessage("Already purchased!", 'info'); return; }
            if (coins >= COST) { coins -= COST; isRollItemsUpgradePurchased = true; savePlayerProgress(); updateUIBasedOnGameState();
            showMessage("Bought 'Roll Items'! You can now roll for items!", 'success');
            } else showMessage(`Not enough coins! Need ${COST}.`, 'error');
        }
        function handleBuyDeletePetsUpgrade() {
            const COST = 2500; if (!isRollItemsUpgradePurchased) { showMessage("Buy 'Roll Items' first!", 'error'); return; }
            if (isDeletePetsUpgradePurchased) { showMessage("Already purchased!", 'info'); return; }
            if (coins >= COST) { coins -= COST; isDeletePetsUpgradePurchased = true; savePlayerProgress(); updateUIBasedOnGameState();
            showMessage("Bought 'Delete Pets' upgrade! You can now delete pets from your inventory.", 'success');
            } else showMessage(`Not enough coins! Need ${COST}.`, 'error');
        }
        function handleBuyBetterDiceIUpgrade() {
            const COST = 5000;
            if (!isDeletePetsUpgradePurchased) { showMessage("Buy 'Delete Pets' first!", 'error'); return; }
            if (isBetterDiceIUpgradePurchased) { showMessage("Already purchased!", 'info'); return; }
            if (coins >= COST) {
                coins -= COST; isBetterDiceIUpgradePurchased = true; savePlayerProgress(); updateUIBasedOnGameState();
                showMessage("Bought 'Better Dice I'! All future rolls will be 1/5 or better!", 'success');
            } else { showMessage(`Not enough coins! Need ${COST}.`, 'error'); }
        }
        function handleBuyRollBetterItemsUpgrade() {
            const COST = 7500;
            if (!isBetterDiceIUpgradePurchased) { showMessage("Buy 'Better Dice I' first!", 'error'); return; }
            if (isRollBetterItemsUpgradePurchased) { showMessage("Already purchased!", 'info'); return; }
            if (coins >= COST) {
                coins -= COST; isRollBetterItemsUpgradePurchased = true; savePlayerProgress(); updateUIBasedOnGameState();
                showMessage("Bought 'Roll Better Items'! You can now roll for better items!", 'success');
            } else { showMessage(`Not enough coins! Need ${COST}.`, 'error'); }
        }

        function handleBuyMoreCoinsIUpgrade() {
            const COST = 8000;
            if (!isRollBetterItemsUpgradePurchased) { showMessage("Buy 'Roll Better Items' first!", 'error'); return; }
            if (isMoreCoinsIUpgradePurchased) { showMessage("Already purchased!", 'info'); return; }
            if (coins >= COST) {
                coins -= COST; isMoreCoinsIUpgradePurchased = true; savePlayerProgress(); updateUIBasedOnGameState();
                showMessage("Bought 'More Coins I'! You now earn 10% more coins per roll!", 'success');
            } else { showMessage(`Not enough coins! Need ${COST}.`, 'error'); }
        }

        async function handleBuyLeaderboardsUpgrade() {
            const COST = 10000;
            if (!isMoreCoinsIUpgradePurchased) { showMessage("Buy 'More Coins I' first!", 'error'); return; }
            if (isLeaderboardsUpgradePurchased) { showMessage("Already purchased!", 'info'); return; }
            if (coins >= COST) {
                coins -= COST; isLeaderboardsUpgradePurchased = true; savePlayerProgress(); updateUIBasedOnGameState();
                showMessage("Bought 'Leaderboards' upgrade! Now choose your nickname!", 'success');
                openNicknameInputModal();
            } else { showMessage(`Not enough coins! Need ${COST}.`, 'error'); }
        }

        function handleBuyBetterDiceIIUpgrade() {
            const COST = 11000;
            if (!isLeaderboardsUpgradePurchased) { showMessage("Buy 'Leaderboards' first!", 'error'); return; }
            if (isBetterDiceIIUpgradePurchased) { showMessage("Already purchased!", 'info'); return; }
            if (coins >= COST) {
                coins -= COST; isBetterDiceIIUpgradePurchased = true; savePlayerProgress(); updateUIBasedOnGameState();
                showMessage("Bought 'Better Dice II'! All future rolls will be 1/8 or better!", 'success');
            } else { showMessage(`Not enough coins! Need ${COST}.`, 'error'); }
        }

        function handleBuyMoreCoinsIIUpgrade() {
            const COST = 15000;
            if (!isBetterDiceIIUpgradePurchased) { showMessage("Buy 'Better Dice II' first!", 'error'); return; }
            if (isMoreCoinsIIUpgradePurchased) { showMessage("Already purchased!", 'info'); return; }
            if (coins >= COST) {
                coins -= COST; isMoreCoinsIIUpgradePurchased = true; savePlayerProgress(); updateUIBasedOnGameState();
                showMessage("Bought 'More Coins II'! You now earn an additional 15% more coins per roll, for a total of +25% with previous coin upgrades!", 'success');
            } else { showMessage(`Not enough coins! Need ${COST}.`, 'error'); }
        }

        function handleBuyRollMoreItemsUpgrade() {
            const COST = 14000;
            if (!isMoreCoinsIIUpgradePurchased) { showMessage("Buy 'More Coins II' first!", 'error'); return; }
            if (isRollMoreItemsUpgradePurchased) { showMessage("Already purchased!", 'info'); return; }
            if (coins >= COST) {
                coins -= COST; isRollMoreItemsUpgradePurchased = true; savePlayerProgress(); updateUIBasedOnGameState();
                showMessage("Bought 'Roll More Items'! Items are now 10% more common!", 'success');
            } else { showMessage(`Not enough coins! Need ${COST}.`, 'error'); }
        }

        function handleBuyFusePetsUpgrade() {
            const COST = 15000;
            if (!isRollMoreItemsUpgradePurchased) { showMessage("Buy 'Roll More Items' first!", 'error'); return; }
            if (isFusePetsUpgradePurchased) { showMessage("Already purchased!", 'info'); return; }
            if (coins >= COST) {
                coins -= COST; isFusePetsUpgradePurchased = true; savePlayerProgress(); updateUIBasedOnGameState();
                showMessage("Bought 'Fuse Pets' upgrade! Check your inventory for the new 'Fuse Machine' tab!", 'success');
            } else { showMessage(`Not enough coins! Need ${COST}.`, 'error'); }
        }


        // --- Inventory Functions ---
        function openInventory(showFuseMachine = false) {
            if (isAutoRolling) stopAutoRoll();
            inventoryModal.classList.remove('hidden');
            inventoryModal.querySelector('.inventory-modal-content').classList.add('animate-in');
            disableMainButtons();
            petsSelectedForDeletion = [];
            petsSelectedForFusion = []; 
            updateConfirmDeleteButtonState(); 
            updateFuseButtonState(); 

            if (showFuseMachine && isFusePetsUpgradePurchased) {
                inventoryContent.classList.add('hidden');
                fuseMachineContent.classList.remove('hidden');
                inventoryTabButton.classList.remove('bg-blue-700');
                fuseMachineTabButton.classList.add('bg-blue-700');
                populateFuseMachine();
            } else {
                inventoryContent.classList.remove('hidden');
                fuseMachineContent.classList.add('hidden');
                inventoryTabButton.classList.add('bg-blue-700');
                fuseMachineTabButton.classList.remove('bg-blue-700');
                populateInventory(); 
            }
        }
        function closeInventory() {
            inventoryModal.querySelector('.inventory-modal-content').classList.remove('animate-in');
            inventoryModal.classList.add('hidden'); enableMainButtons();
            petsSelectedForDeletion = [];
            petsSelectedForFusion = [];
            updateConfirmDeleteButtonState();
            updateFuseButtonState();
        }

        function updateConfirmDeleteButtonState() {
            if (!confirmDeleteSelectedPetsButton) return;
            if (isDeletePetsUpgradePurchased && petsSelectedForDeletion.length > 0) {
                confirmDeleteSelectedPetsButton.classList.remove('hidden');
                confirmDeleteSelectedPetsButton.textContent = `Delete ${petsSelectedForDeletion.length} Selected Pet(s)`;
            } else {
                confirmDeleteSelectedPetsButton.classList.add('hidden');
            }
        }

        function updateFuseButtonState() {
            if (!fusePetsButton) return;
            const minPets = 5;
            const numSelected = petsSelectedForFusion.length;
            const canFuse = numSelected >= minPets;
            fusePetsButton.disabled = !canFuse;
            fusePetsButton.classList.toggle('opacity-50', !canFuse);
            fusePetsButton.classList.toggle('cursor-not-allowed', !canFuse);

            let currentFuseLuck = 1.0;
            if (numSelected >= minPets) {
                currentFuseLuck += (numSelected - minPets) * 0.1;
            }

            const fusionCost = 125 + (Math.max(0, numSelected - 5) * 25);
            fuseSelectedCountDisplay.textContent = `Selected: ${numSelected} pets (Luck: ${currentFuseLuck.toFixed(1)}x, Cost: ${fusionCost} Coins)`;
        }

        function populateInventory() {
            inventoryItemsContainer.innerHTML = ''; inventoryPetsContainer.innerHTML = '';
            if (userItems.length > 0) {
                const itemsTitle = document.createElement('h3'); itemsTitle.className = 'text-xl font-bold text-gray-800 mb-3 mt-4 text-left w-full'; itemsTitle.textContent = 'Items'; inventoryItemsContainer.appendChild(itemsTitle);
                const itemsGrid = document.createElement('div'); itemsGrid.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 w-full'; inventoryItemsContainer.appendChild(itemsGrid);
                userItems.forEach((item, index) => {
                    const itemCard = document.createElement('div'); itemCard.className = 'bg-white p-3 md:p-4 rounded-xl shadow-lg flex flex-col items-center text-center relative group transition-all duration-300 transform hover:scale-105 cursor-pointer h-full';
                    itemCard.setAttribute('data-item-index', index);
                    let activeStatusMessage = '';
                    if (item.type === 'speed') {
                        const activePotion = activeSpeedPotions.find(p => p.name === item.name && p.expiry > Date.now());
                        if (activePotion) {
                            const remainingSeconds = Math.round((activePotion.expiry - Date.now()) / 1000);
                            activeStatusMessage = ` <span class="text-green-500 font-semibold">(Active: ${Math.ceil(remainingSeconds / 60)} min)</span>`;
                        }
                    }
                    const quantityText = item.quantity > 1 ? ` <span class="text-sm font-bold text-gray-600">(x${item.quantity})</span>` : '';
                    const imgHTML = `<img src="${item.imageUrl || 'https://placehold.co/100x100/cccccc/333333?text=Item'}" alt="${item.name}" class="w-24 h-24 md:w-28 md:h-28 object-contain rounded-lg mb-2 mt-1 shadow-sm" onerror="this.onerror=null; this.src='https://placehold.co/100x100/cccccc/333333?text=Failed';">`;
                    const textHTML = `<div class="flex flex-col w-full items-center mt-auto pt-1"><p class="font-bold text-base md:text-lg text-gray-800 break-words leading-tight">${item.name}${quantityText}</p><p class="text-xs text-gray-500 break-words px-1 leading-snug mt-0.5">${item.description}${activeStatusMessage}</p></div>`;
                    const hoverHTML = `<div class="absolute inset-0 bg-black bg-opacity-75 text-white flex items-center justify-center rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-2"><span class="text-sm font-bold">Click to use</span></div>`;
                    itemCard.innerHTML = imgHTML + textHTML + hoverHTML; itemsGrid.appendChild(itemCard);
                });
            } else inventoryItemsContainer.innerHTML = '<p class="text-gray-600 text-center w-full">No items yet! Roll for items or visit the Shop.</p>';

            const petsTitle = document.createElement('h3'); petsTitle.className = 'text-xl font-bold text-gray-800 mb-3 mt-8 text-left w-full'; petsTitle.textContent = 'Pets'; inventoryPetsContainer.appendChild(petsTitle);
            if (userPets.length === 0) inventoryPetsContainer.innerHTML += '<p class="text-gray-600 text-center w-full">Inventory empty! Roll pets to fill it.</p>';
            else {
                const petsGrid = document.createElement('div'); petsGrid.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 w-full'; inventoryPetsContainer.appendChild(petsGrid);
                const sortedPets = [...userPets].sort((a, b) => {
                    const rarityAVal = rarityOrder[normalizeRarity(a.rarity)] ?? -1;
                    const rarityBVal = rarityOrder[normalizeRarity(b.rarity)] ?? -1;
                    if(rarityAVal !== rarityBVal) return rarityBVal - rarityAVal; 

                    const chanceA = a.chanceDenominator !== undefined && a.chanceDenominator > 0 ? a.chanceDenominator : 0;
                    const chanceB = b.chanceDenominator !== undefined && b.chanceDenominator > 0 ? b.chanceDenominator : 0;
                    if (chanceA !== chanceB) return chanceB - chanceA; 
                    
                    return a.name.localeCompare(b.name);
                });
                sortedPets.forEach(pet => {
                    const petCard = document.createElement('div');
                    petCard.className = 'inventory-pet-card-selectable bg-white p-4 rounded-lg shadow-md flex flex-col items-center text-center relative group transition-transform duration-200 hover:shadow-lg hover:-translate-y-1 h-full';
                    petCard.dataset.petId = pet.id;

                    if (isDeletePetsUpgradePurchased) {
                        petCard.classList.add('cursor-pointer');
                        if (petsSelectedForDeletion.includes(pet.id)) {
                            petCard.classList.add('selected-for-deletion');
                        }
                    }

                    const chanceText = pet.chanceDenominator ? `1 in ${pet.chanceDenominator}` : `Weight: ${pet.weight || 'N/A'}`;
                    const rarityClass = rarityColors[normalizeRarity(pet.rarity)] || 'text-gray-700';

                    petCard.innerHTML = `
                        <img src="${pet.imageUrl || 'https://placehold.co/100x100/cccccc/333333?text=Pet'}" alt="${pet.name}" class="w-24 h-24 object-contain rounded-md mb-2 mt-1" onerror="this.onerror=null; this.src='https://placehold.co/100x100/cccccc/333333?text=Failed';">
                        <div class="flex flex-col w-full items-center mt-auto pt-1">
                            <p class="font-semibold text-lg text-gray-800 break-words leading-tight mb-1">${pet.name}</p>
                            <p class="text-sm font-medium ${rarityClass} break-words leading-snug mb-1">${pet.rarity}</p>
                            <p class="text-xs text-gray-500 break-words leading-snug">${chanceText}</p>
                        </div>
                        <div class="absolute inset-0 bg-black bg-opacity-75 text-white flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-2">
                            <span class="text-md font-bold">${pet.name}</span>
                        </div>`;
                    petsGrid.appendChild(petCard);
                });
            }
            updateConfirmDeleteButtonState();
        }

        function populateFuseMachine() {
            fuseablePetsContainer.innerHTML = '';
            if (userPets.length === 0) {
                fuseablePetsContainer.innerHTML = '<p class="text-gray-600 text-center w-full">No pets to fuse! Roll some pets first.</p>';
                fuseSelectedCountDisplay.textContent = 'Selected: 0 pets (Luck: 1.0x)';
                updateFuseButtonState();
                return;
            }

            let rarestPetId = null;
            if (userPets.length > 0) {
                const sortedUserPets = [...userPets].sort((a, b) => {
                    const rarityAVal = rarityOrder[normalizeRarity(a.rarity)] ?? -1;
                    const rarityBVal = rarityOrder[normalizeRarity(b.rarity)] ?? -1;
                    if(rarityAVal !== rarityBVal) return rarityBVal - rarityAVal; 
                    const chanceA = a.chanceDenominator !== undefined && a.chanceDenominator > 0 ? a.chanceDenominator : 0;
                    const chanceB = b.chanceDenominator !== undefined && b.chanceDenominator > 0 ? b.chanceDenominator : 0;
                    return chanceB - chanceA; 
                });
                rarestPetId = sortedUserPets[0].id;
            }

            const sortedPets = [...userPets].sort((a, b) => {
                const chanceA = a.chanceDenominator !== undefined && a.chanceDenominator > 0 ? a.chanceDenominator : Infinity;
                const chanceB = b.chanceDenominator !== undefined && b.chanceDenominator > 0 ? b.chanceDenominator : Infinity;
                if (chanceA !== chanceB) return chanceA - chanceB;
                return a.name.localeCompare(b.name);
            });

            sortedPets.forEach(pet => {
                const petCard = document.createElement('div');
                petCard.className = 'fuse-pet-card-selectable bg-white p-4 rounded-lg shadow-md flex flex-col items-center text-center relative transition-transform duration-200 hover:shadow-lg hover:-translate-y-1 h-full cursor-pointer';
                petCard.dataset.petId = pet.id;

                let isDisabled = false;
                let disabledReason = '';

                if (pet.id === rarestPetId && userPets.length > 0) {
                    isDisabled = true;
                    disabledReason = 'Your rarest pet!';
                }
                if (normalizeRarity(pet.rarity) === 'EXCLUSIVE') {
                    isDisabled = true;
                    disabledReason = disabledReason ? disabledReason + ' & EXCLUSIVE!' : 'EXCLUSIVE Pet!';
                }

                if (isDisabled) {
                    petCard.classList.add('opacity-50', 'cursor-not-allowed');
                    petCard.style.pointerEvents = 'none'; 
                } else {
                    if (petsSelectedForFusion.includes(pet.id)) {
                        petCard.classList.add('selected-for-fusion');
                    }
                }

                const chanceText = pet.chanceDenominator ? `1 in ${pet.chanceDenominator}` : `Weight: ${pet.weight || 'N/A'}`;
                const rarityClass = rarityColors[normalizeRarity(pet.rarity)] || 'text-gray-700';

                petCard.innerHTML = `
                    <img src="${pet.imageUrl || 'https://placehold.co/100x100/cccccc/333333?text=Pet'}" alt="${pet.name}" class="w-24 h-24 object-contain rounded-md mb-2 mt-1" onerror="this.onerror=null; this.src='https://placehold.co/100x100/cccccc/333333?text=Failed';">
                    <div class="flex flex-col w-full items-center mt-auto pt-1">
                        <p class="font-semibold text-lg text-gray-800 break-words leading-tight mb-1">${pet.name}</p>
                        <p class="text-sm font-medium ${rarityClass} break-words leading-snug mb-1">${pet.rarity}</p>
                        <p class="text-xs text-gray-500 break-words leading-snug">${chanceText}</p>
                    </div>
                    ${isDisabled ? `<div class="absolute inset-0 bg-black bg-opacity-75 text-white flex items-center justify-center rounded-lg p-2"><span class="text-sm font-bold text-center">${disabledReason}</span></div>` : ''}
                `;
                fuseablePetsContainer.appendChild(petCard);
            });
            updateFuseButtonState();
        }


        function useFasterRollsPotion(itemIndex) {
            const item = userItems[itemIndex];
            if (!item || item.type !== "speed") return;

            activeSpeedPotions.push({
                name: item.name,
                expiry: Date.now() + (item.durationSeconds * 1000),
                speedBoost: item.speedBoost
            });

            userItems.splice(itemIndex, 1);
            savePlayerProgress();
            populateInventory();
            showMessage(`${item.name} activated! Current total speed boost: ${Math.round(activeSpeedPotions.reduce((sum, p) => sum + p.speedBoost, 0) * 100)}% faster.`, 'success');
        }

        function useLuckyRollPotion(itemIndex) {
            const item = userItems[itemIndex];
            if (!item || item.type !== "luck") return;

            activeLuckPotions.push({
                name: item.name,
                luckBoost: item.luckBoost
            });

            userItems.splice(itemIndex, 1);
            savePlayerProgress();
            populateInventory();
            showMessage(`${item.name} activated! Next roll luck bonus: ${Math.round(activeLuckPotions.reduce((sum, p) => sum + p.luckBoost, 0) * 100)}%`, 'success');
        }

        function handleOpenHugeEgg(itemIndex) {
            if (isProcessingRoll) return;
            const eggItem = userItems[itemIndex];
            if (!eggItem || eggItem.type !== 'huge_egg') return;

            isProcessingRoll = true;
            disableMainButtons();
            if (!inventoryModal.classList.contains('hidden')) closeInventory();
            userItems.splice(itemIndex, 1);

            const hugePets = globalPets.filter(p => normalizeRarity(p.rarity) === 'HUGE');
            if (hugePets.length === 0) {
                showMessage("You opened a HUGE Egg, but no HUGE pets are available! Admin needs to add them.", 'error', 0);
                isProcessingRoll = false;
                enableMainButtons();
                savePlayerProgress(); 
                return;
            }

            rollingPetDisplay.classList.remove('hidden');
            if (!currentRollingPetImg) {
                currentRollingPetImg = document.createElement('img');
                rollingPetDisplay.appendChild(currentRollingPetImg);
            }
            currentRollingPetImg.src = 'https://placehold.co/150x150/cccccc/333333?text=Hatching...';

            const animationDuration = 3000;
            const obtainedPet = hugePets[Math.floor(Math.random() * hugePets.length)];

            const initialDelay = 80;
            const finalDelay = 350;
            const startTime = Date.now();
            const animateHugeRoll = () => {
                const elapsedTime = Date.now() - startTime;
                if (elapsedTime < animationDuration) {
                    const progress = elapsedTime / animationDuration;
                    const currentDelay = initialDelay + (finalDelay - initialDelay) * progress;
                    
                    let tempPet;
                     do {
                        tempPet = hugePets[Math.floor(Math.random() * hugePets.length)];
                    } while (hugePets.length > 1 && tempPet.imageUrl === (currentRollingPetImg ? currentRollingPetImg.src : ''));

                    displayRollingPet(tempPet);
                    setTimeout(animateHugeRoll, currentDelay);
                } else {
                    displayRollingPet(obtainedPet);
                    userPets.push({ name: obtainedPet.name, rarity: obtainedPet.rarity, imageUrl: obtainedPet.imageUrl, chanceDenominator: obtainedPet.chanceDenominator, id: crypto.randomUUID() });
                    savePlayerProgress();
                    
                    setTimeout(() => {
                        rollingPetDisplay.classList.add('hidden');
                        if (currentRollingPetImg) currentRollingPetImg.src = '';
                        populateAndShowSingleRevealModal([obtainedPet], [], 0, false); 
                    }, 500);
                }
            };
            animateHugeRoll();
        }

        // --- Pet Collection Functions ---
        function openPetCollection() {
            if (isAutoRolling) stopAutoRoll();
            petCollectionModal.classList.remove('hidden');
            petCollectionModal.querySelector('.pet-collection-modal-content').classList.add('animate-in');
            disableMainButtons(); populatePetCollection();
        }
        function closePetCollection() {
            petCollectionModal.querySelector('.pet-collection-modal-content').classList.remove('animate-in');
            petCollectionModal.classList.add('hidden'); enableMainButtons();
        }
        function populatePetCollection() {
            petCollectionContainer.innerHTML = ''; itemCollectionContainer.innerHTML = '';

            const petsCollectionTitle = document.createElement('h3');
            petsCollectionTitle.className = 'text-xl font-bold text-gray-800 mb-3 mt-4 text-center w-full';
            petsCollectionTitle.textContent = 'Pets';
            petCollectionContainer.appendChild(petsCollectionTitle);

            if (globalPets.length === 0) petCollectionContainer.innerHTML += '<p class="text-gray-600 text-center">No pets available in the collection.</p>';
            else {
                const petsGrid = document.createElement('div'); petsGrid.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 w-full'; petCollectionContainer.appendChild(petsGrid);
                const currentLuckFactor = 1 + (rollStreak * 0.001);
                collectionLuckFactorDisplay.textContent = `${currentLuckFactor.toFixed(3)}x`;

                globalPets.forEach(pet => {
                    const petCard = document.createElement('div'); petCard.className = 'bg-white p-4 rounded-lg shadow-md flex flex-col items-center text-center relative group transition-transform duration-200 hover:shadow-lg hover:-translate-y-1 pet-collection-card h-full';
                    const rarityClass = rarityColors[normalizeRarity(pet.rarity)] || 'text-gray-700';
                    const isOwned = userPets.some(ownedPet => ownedPet.name === pet.name);
                    const ownershipText = isOwned ? 'Owned' : 'Unowned'; const ownershipColor = isOwned ? 'text-green-600' : 'text-red-600';

                    let baseOddsText = pet.chanceDenominator ? `1 in ${pet.chanceDenominator}` : 'N/A';
                    let yourOddsText = 'N/A';

                    if (pet.chanceDenominator && pet.chanceDenominator > 0 && currentLuckFactor >= 1) {
                        const effectiveChance = 1 / pet.chanceDenominator * currentLuckFactor;
                        if (effectiveChance > 0) yourOddsText = `1 in ${Math.round(1 / effectiveChance)}`;
                        else yourOddsText = 'Impossible';
                    }

                    petCard.innerHTML = `
                        <img src="${pet.imageUrl || 'https://placehold.co/112x112/cccccc/333333?text=Pet'}" alt="${pet.name}" class="w-28 h-28 object-contain rounded-md mb-2 mt-1" onerror="this.onerror=null; this.src='https://placehold.co/112x112/cccccc/333333?text=Failed';">
                        <div class="flex flex-col w-full items-center mt-auto pt-1">
                            <p class="font-semibold text-lg text-gray-800 break-words leading-tight mb-1">${pet.name}</p>
                            <p class="text-sm font-medium ${rarityClass} break-words leading-snug mb-1">${pet.rarity}</p>
                            <p class="text-xs text-gray-500 break-words leading-snug">Base Odds: ${baseOddsText}</p>
                            <p class="text-xs text-blue-700 font-semibold break-words leading-snug">Your Odds: ${yourOddsText}</p>
                        </div>
                        <div class="absolute inset-0 bg-black bg-opacity-75 text-white flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-2">
                            <span class="text-md font-bold text-center ${ownershipColor}">${ownershipText}</span>
                        </div>`;
                    petsGrid.appendChild(petCard);
                });
            }

            const itemsCollectionTitle = document.createElement('h3'); itemsCollectionTitle.className = 'text-xl font-bold text-gray-800 mb-3 mt-8 text-left w-full'; itemsCollectionTitle.textContent = 'Items'; itemCollectionContainer.appendChild(itemsCollectionTitle);
            if (availableItems.length === 0) itemCollectionContainer.innerHTML += '<p class="text-gray-600 text-center w-full">No items defined in the collection.</p>';
            else {
                const itemsGrid = document.createElement('div'); itemsGrid.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 w-full'; itemCollectionContainer.appendChild(itemsGrid);
                availableItems.forEach(item => {
                    const itemCard = document.createElement('div'); itemCard.className = 'bg-white p-3 md:p-4 rounded-xl shadow-lg flex flex-col items-center text-center relative group transition-all duration-300 transform hover:scale-105 h-full';
                    const imgHTML = `<img src="${item.imageUrl || 'https://placehold.co/100x100/cccccc/333333?text=Item'}" alt="${item.name}" class="w-24 h-24 md:w-28 md:h-28 object-contain rounded-lg mb-2 mt-1 shadow-sm" onerror="this.onerror=null; this.src='https://placehold.co/100x100/cccccc/333333?text=Failed';">`;
                    const textHTML = `<div class="flex flex-col w-full items-center mt-auto pt-1"><p class="font-bold text-base md:text-lg text-gray-800 break-words leading-tight">${item.name}</p><p class="text-xs text-gray-500 break-words leading-snug mt-0.5">${item.type}</p></div>`;
                    const hoverHTML = `<div class="absolute inset-0 bg-black bg-opacity-75 text-white flex flex-col items-center justify-center rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-2"><span class="text-xs font-semibold text-center break-words">${item.description}</span></div>`;
                    itemCard.innerHTML = imgHTML + textHTML + hoverHTML; itemsGrid.appendChild(itemCard);
                });
            }
        }

        // --- Manage Currency Functions ---
        function openManageCurrencyModal() { manageCurrencyModal.classList.remove('hidden'); targetUserIdInput.value = ''; amountOfCoinsInput.value = ''; currencyActionAdd.checked = true; }
        function handleCloseManageCurrencyModal() { manageCurrencyModal.classList.add('hidden'); }
        async function handleSubmitCurrencyAction() {
            const targetId = targetUserIdInput.value.trim(); const amount = parseInt(amountOfCoinsInput.value);
            let action = document.querySelector('input[name="currencyAction"]:checked').value;
            if (!targetId) { showMessage("Enter Target User ID.", 'error'); return; }
            if (isNaN(amount) || amount < 0) { showMessage("Enter valid non-negative coin amount.", 'error'); return; }
            if (!auth.currentUser || !auth.currentUser.uid || auth.currentUser.uid !== ADMIN_USER_ID) {
                showMessage("You are not authorized to manage currency.", 'error'); return;
            }

            const targetUserDocRef = doc(db, `artifacts/${appId}/users/${targetId}/gameData`, 'playerProgress');
            try {
                const docSnap = await getDoc(targetUserDocRef);
                let currentCoins = (docSnap.exists() && docSnap.data().coins) ? docSnap.data().coins : 0;
                if (!docSnap.exists() && action !== 'set') { showMessage(`User ID "${targetId}" not found. Cannot ${action}.`, 'error'); return; }
                let newCoins = currentCoins; let message = '';
                switch (action) {
                    case 'add': newCoins += amount; message = `Added ${amount} coins to ${targetId}. New: ${newCoins}.`; break;
                    case 'set': newCoins = amount; message = `Set ${targetId}'s coins to ${amount}.`; break;
                    case 'subtract': if (currentCoins < amount) { showMessage(`${targetId} has ${currentCoins} coins. Cannot subtract ${amount}.`, 'error'); return; } newCoins -= amount; message = `Subtracted ${amount} from ${targetId}. New: ${newCoins}.`; break;
                }
                await setDoc(targetUserDocRef, { coins: newCoins }, { merge: true });
                showMessage(message, 'success'); handleCloseManageCurrencyModal();
            } catch (error) { console.error("Error managing currency:", error); showMessage(`Failed for ${targetId}. Error: ${error.message}`, 'error', 0); }
        }

        // Nickname Functions
        function openNicknameInputModal() {
            nicknameInputField.value = userNickname || '';
            nicknameInputModal.classList.remove('hidden');
            nicknameInputModal.querySelector('.nickname-input-modal-content').classList.add('animate-in');
        }
        function handleCloseNicknameInputModal() {
            nicknameInputModal.querySelector('.nickname-input-modal-content').classList.remove('animate-in');
            nicknameInputModal.classList.add('hidden');
        }
        async function handleSubmitNickname() {
            const newNickname = nicknameInputField.value.trim();
            if (!newNickname || newNickname.length > 20) {
                showMessage(!newNickname ? "Nickname cannot be empty!" : "Nickname too long (max 20 characters)!", 'error');
                return;
            }
            if (!auth.currentUser || !auth.currentUser.uid) { showMessage("Not authenticated with Firebase. Cannot save nickname.", 'error'); return; }

            const nicknamesCollectionRef = collection(db, `artifacts/${appId}/public/data/leaderboardNicknames`);
            const q = query(nicknamesCollectionRef, where("nickname", "==", newNickname));
            const querySnapshot = await getDocs(q);

            let nicknameExists = querySnapshot.docs.some(doc => doc.id !== userId);
            if (nicknameExists) { showMessage("Nickname already taken. Please choose another.", 'error'); return; }

            userNickname = newNickname;
            await savePlayerProgress();
            await setDoc(doc(nicknamesCollectionRef, auth.currentUser.uid), { nickname: newNickname, userId: auth.currentUser.uid }, { merge: true });

            showMessage(`Nickname "${userNickname}" saved!`, 'success');
            handleCloseNicknameInputModal();
            updateLeaderboardScores();
        }

        // Leaderboard Functions
        function openLeaderboard() {
            if (isAutoRolling) stopAutoRoll();
            leaderboardModal.classList.remove('hidden');
            leaderboardModal.querySelector('.leaderboard-modal-content').classList.add('animate-in');
            disableMainButtons();
            updateLeaderboardScores();
        }
        function closeLeaderboard() {
            leaderboardModal.querySelector('.leaderboard-modal-content').classList.remove('animate-in');
            leaderboardModal.classList.add('hidden');
            enableMainButtons();
        }
        async function updateLeaderboardScores() {
            leaderboardTableBody.innerHTML = '<tr><td colspan="3" class="text-center text-gray-500 py-4">Loading Leaderboard...</td></tr>';
            leaderboardYourRank.textContent = `Your Rank: Calculating...`;
            
            if (!auth.currentUser || !auth.currentUser.uid) {
                leaderboardTableBody.innerHTML = '<tr><td colspan="3" class="text-center text-red-500 py-4">Not authenticated with Firebase. Cannot load leaderboards.</td></tr>';
                leaderboardYourRank.textContent = `Your Rank: N/A`;
                showMessage("Leaderboards require Firebase authentication.", 'error', 0);
                return;
            }

            try {
                const leaderboardCollectionRef = collection(db, `artifacts/${appId}/public/data/leaderboardScores`);
                const querySnapshot = await getDocs(leaderboardCollectionRef);
                let scores = querySnapshot.docs.map(doc => doc.data());

                scores.sort((a, b) => b.coins - a.coins);

                leaderboardTableBody.innerHTML = '';
                if (scores.length === 0) {
                    leaderboardTableBody.innerHTML = '<tr><td colspan="3" class="text-center text-gray-500 py-4">No scores yet. Be the first!</td></tr>';
                    leaderboardYourRank.textContent = `Your Rank: N/A`;
                    return;
                }

                let yourRank = 'N/A';
                scores.forEach((entry, index) => {
                    const isCurrentUser = entry.userId === auth.currentUser.uid;
                    if (isCurrentUser) yourRank = index + 1;
                    const row = leaderboardTableBody.insertRow();
                    row.className = `border-b border-gray-200 hover:bg-gray-50 ${isCurrentUser ? 'bg-blue-100 font-bold' : ''}`;
                    row.innerHTML = `
                        <td class="px-4 py-2 text-center">${index + 1}</td>
                        <td class="px-4 py-2">${entry.nickname}</td>
                        <td class="px-4 py-2 text-right">${entry.coins}</td>
                    `;
                });
                leaderboardYourRank.textContent = `Your Rank: ${yourRank}`;
            } catch (error) {
                console.error("Error fetching leaderboard scores:", error);
                leaderboardTableBody.innerHTML = '<tr><td colspan="3" class="text-center text-red-500 py-4">Failed to load leaderboard.</td></tr>';
                leaderboardYourRank.textContent = `Your Rank: Error`;
            }
        }

        // Recent Rolls Functions
        function openRecentRollsModal() {
            if (isAutoRolling) stopAutoRoll();
            recentRollsModal.classList.remove('hidden');
            recentRollsModal.querySelector('.recent-rolls-modal-content').classList.add('animate-in');
            disableMainButtons();
        }

        function closeRecentRollsModal() {
            recentRollsModal.querySelector('.recent-rolls-modal-content').classList.remove('animate-in');
            recentRollsModal.classList.add('hidden');
            enableMainButtons();
        }

        function populateRecentRollsTable(rolls) {
            recentRollsTableBody.innerHTML = '';
            if (rolls.length === 0) {
                recentRollsTableBody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-500 py-4">No rare rolls yet! Be the first to get one.</td></tr>';
                return;
            }

            rolls.forEach((roll, index) => {
                const row = recentRollsTableBody.insertRow();
                row.className = 'border-b border-gray-200 hover:bg-gray-50';
                const rarityClass = rarityColors[normalizeRarity(roll.rarity)] || 'text-gray-700';
                const timeAgo = new Date(roll.timestamp).toLocaleString(); 

                row.innerHTML = `
                    <td class="px-4 py-2">
                        <img src="${roll.imageUrl || 'https://placehold.co/50x50/cccccc/333333?text=Pet'}" alt="${roll.petName}" class="w-12 h-12 object-contain rounded-md" onerror="this.onerror=null; this.src='https://placehold.co/50x50/cccccc/333333?text=Failed';">
                    </td>
                    <td class="px-4 py-2">
                        <p class="font-semibold">${roll.petName}</p>
                        <p class="text-sm ${rarityClass}">${roll.rarity} (1 in ${roll.chanceDenominator})</p>
                    </td>
                    <td class="px-4 py-2">${roll.rolledBy}</td>
                    <td class="px-4 py-2 text-sm text-gray-500">${timeAgo}</td>
                `;
            });
        }

        // --- Admin Upgrade Tree Functions ---
        function openAdminUpgradeTree() {
            adminPanelModal.classList.add('hidden');
            adminUpgradeTreeModal.classList.remove('hidden');
            adminUpgradeTreeModal.querySelector('.admin-upgrade-tree-modal-content').classList.add('animate-in');
            populateAdminUpgradeTree();
        }

        function closeAdminUpgradeTree() {
            adminUpgradeTreeModal.querySelector('.admin-upgrade-tree-modal-content').classList.remove('animate-in');
            adminUpgradeTreeModal.classList.add('hidden');
            adminPanelModal.classList.remove('hidden');
            enableMainButtons();
        }

        function populateAdminUpgradeTree() {
            adminUpgradesList.innerHTML = '';
            const upgrades = [
                { name: "Coins -> Free", flag: "isCoinUpgradePurchased", cost: "Free (1st Upgrade)" },
                { name: "Roll Streak", flag: "isRollStreakUpgradePurchased", cost: "500 Coins" },
                { name: "Inventory", flag: "isInventoryUpgradePurchased", cost: "700 Coins" },
                { name: "Auto Roll", flag: "isAutoRollUpgradePurchased", cost: "1000 Coins" },
                { name: "Hide Pet Pop-up", flag: "isHidePopupUpgradePurchased", cost: "1250 Coins" },
                { name: "Faster Rolls I", flag: "isFasterRollsIUpgradePurchased", cost: "2000 Coins" },
                { name: "Roll Items", flag: "isRollItemsUpgradePurchased", cost: "2500 Coins" },
                { name: "Delete Pets", flag: "isDeletePetsUpgradePurchased", cost: "2500 Coins" },
                { name: "Better Dice I", flag: "isBetterDiceIUpgradePurchased", cost: "5000 Coins" },
                { name: "Roll Better Items", flag: "isRollBetterItemsUpgradePurchased", cost: "7500 Coins" },
                { name: "More Coins I", flag: "isMoreCoinsIUpgradePurchased", cost: "8000 Coins" },
                { name: "Leaderboards", flag: "isLeaderboardsUpgradePurchased", cost: "10000 Coins" },
                { name: "Better Dice II", flag: "isBetterDiceIIUpgradePurchased", cost: "11000 Coins" },
                { name: "More Coins II", flag: "isMoreCoinsIIUpgradePurchased", cost: "15000 Coins" },
                { name: "Roll More Items", flag: "isRollMoreItemsUpgradePurchased", cost: "14000 Coins" },
                { name: "Fuse Pets", flag: "isFusePetsUpgradePurchased", cost: "15000 Coins" } 
            ];

            upgrades.forEach(upgrade => {
                const isPurchased = window[upgrade.flag];
                const upgradeDiv = document.createElement('div');
                upgradeDiv.className = `bg-white p-3 rounded-lg shadow-md flex items-center justify-between transition-colors duration-200 ${isPurchased ? 'border-2 border-green-500 bg-green-50' : 'border border-gray-200 hover:bg-gray-100'}`;
                upgradeDiv.innerHTML = `
                    <div>
                        <p class="font-semibold text-gray-800">${upgrade.name}</p>
                        <p class="text-sm text-gray-500">Cost: ${upgrade.cost}</p>
                    </div>
                    <button class="grant-upgrade-button bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            data-flag="${upgrade.flag}" ${isPurchased ? 'disabled' : ''}>
                        ${isPurchased ? 'Granted' : 'Grant'}
                    </button>
                `;
                adminUpgradesList.appendChild(upgradeDiv);
            });

            adminUpgradesList.querySelectorAll('.grant-upgrade-button').forEach(button => {
                button.addEventListener('click', (e) => grantUpgrade(e.target.dataset.flag));
            });
        }

        async function grantUpgrade(flagName) {
            if (userId !== ADMIN_USER_ID) { showMessage("You are not authorized to use this function.", 'error'); return; }
            if (!auth.currentUser || !auth.currentUser.uid) { showMessage("Not authenticated with Firebase. Cannot grant upgrades.", 'error'); return; }

            if (window[flagName] === true) { showMessage(`Upgrade "${flagName}" already granted.`, 'info'); return; }

            window[flagName] = true;
            await savePlayerProgress();
            showMessage(`Upgrade "${flagName}" granted!`, 'success');
            populateAdminUpgradeTree();
            updateUIBasedOnGameState();
            
            if (flagName === 'isLeaderboardsUpgradePurchased' && !userNickname) openNicknameInputModal();
        }

        function handleFusePets() {
            const minPets = 5;
            if (petsSelectedForFusion.length < minPets) { showMessage(`You need to select at least ${minPets} pets to fuse!`, 'error'); return; }

            const numFused = petsSelectedForFusion.length;
            const fusionCost = 125 + (Math.max(0, numFused - minPets) * 25);
            if (coins < fusionCost) { showMessage(`You need ${fusionCost} coins to fuse ${numFused} pets! You only have ${coins} coins.`, 'error'); return; }

            const selectedPetObjects = petsSelectedForFusion.map(id => userPets.find(p => p.id === id));
            let rarestPetId = null;
            if (userPets.length > 0) {
                const sortedUserPets = [...userPets].sort((a, b) => {
                    const rarityAVal = rarityOrder[normalizeRarity(a.rarity)] ?? -1;
                    const rarityBVal = rarityOrder[normalizeRarity(b.rarity)] ?? -1;
                    if(rarityAVal !== rarityBVal) return rarityBVal - rarityAVal;
                    const chanceA = a.chanceDenominator !== undefined && a.chanceDenominator > 0 ? a.chanceDenominator : 0;
                    const chanceB = b.chanceDenominator !== undefined && b.chanceDenominator > 0 ? b.chanceDenominator : 0;
                    return chanceB - chanceA;
                });
                rarestPetId = sortedUserPets[0].id;
            }

            for (const pet of selectedPetObjects) {
                if (pet.id === rarestPetId) { showMessage(`You cannot fuse your rarest pet (${pet.name})!`, 'error'); return; }
                if (normalizeRarity(pet.rarity) === 'EXCLUSIVE') { showMessage(`You cannot fuse EXCLUSIVE pets! (${pet.name})`, 'error'); return; }
            }

            showConfirmation(`Are you sure you want to fuse ${numFused} pets for ${fusionCost} coins? This will delete them permanently and give you a new pet.`, (confirmed) => {
                hideConfirmation();
                if (confirmed) {
                    isProcessingRoll = true; disableMainButtons();
                    coins -= fusionCost;
                    userPets = userPets.filter(p => !petsSelectedForFusion.includes(p.id));

                    let fusionLuckFactor = 1.0 + (numFused > 5 ? (numFused - 5) * 0.1 : 0);
                    const obtainedPet = getRandomPetByWeight(fusionLuckFactor, true, false); 

                    if (!obtainedPet) {
                        showMessage("Could not fuse a pet with current settings. Try again or check pet list.", 'error', 0);
                        isProcessingRoll = false; enableMainButtons();
                        openInventory(true);
                        return;
                    }

                    userPets.push({ name: obtainedPet.name, rarity: obtainedPet.rarity, imageUrl: obtainedPet.imageUrl, weight: obtainedPet.weight, chanceDenominator: obtainedPet.chanceDenominator, id: crypto.randomUUID() });
                    petsSelectedForFusion = [];
                    populateFuseMachine(); 
                    debouncedSavePlayerProgress();
                    populateAndShowSingleRevealModal([obtainedPet], [], 0, false);
                    showMessage(`You fused ${numFused} pets for ${fusionCost} coins and got a ${obtainedPet.name}!`, 'success', 3000);
                }
            });
        }

        // --- FOREVER PACK SHOP FUNCTIONS ---

        function openShop() {
            if (isAutoRolling) stopAutoRoll();
            shopSessionWinnings = []; 
            shopModal.classList.remove('hidden');
            shopModal.querySelector('#shopModalContent').classList.add('animate-in');
            disableMainButtons();
            checkAndResetShop(); 
            updateShopDisplay();
            startShopTimer();
        }

        function closeShop() {
            shopModal.querySelector('#shopModalContent').classList.remove('animate-in');
            shopModal.classList.add('hidden');
            enableMainButtons();
            stopShopTimer();

            if (shopSessionWinnings.length > 0) {
                populateAndShowSingleRevealModal([], shopSessionWinnings, 0, false);
                shopSessionWinnings = []; 
            }
        }

        function checkAndResetShop() {
            const now = Date.now();
            const timeSinceReset = now - playerShopState.lastResetTimestamp;
            const resetDuration = (24 * 60 * 60 * 1000); 

            if (timeSinceReset >= resetDuration) {
                console.log("Forever Pack is resetting for the new day.");
                playerShopState.claimedCount = 0;
                playerShopState.lastResetTimestamp = now;
                playerShopState.currentLuck = 1.0;
                playerShopState.resetExtensionMinutes = 0;
                playerShopState.shopQueue = []; 
                debouncedSavePlayerProgress();
            }
        }

        function updateShopTimerDisplay() {
            const now = Date.now();
            const totalResetDuration = (24 * 60 * 60 * 1000) + (playerShopState.resetExtensionMinutes * 60 * 1000);
            const timeElapsed = now - playerShopState.lastResetTimestamp;
            const timeRemaining = totalResetDuration - timeElapsed;

            if (timeRemaining <= 0) {
                shopResetTimerDisplay.textContent = "00:00:00";
                checkAndResetShop();
                updateShopDisplay();
                return;
            }

            const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
            const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

            shopResetTimerDisplay.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        function startShopTimer() {
            stopShopTimer();
            updateShopTimerDisplay();
            shopResetIntervalId = setInterval(updateShopTimerDisplay, 1000);
        }

        function stopShopTimer() {
            clearInterval(shopResetIntervalId);
        }
        
        function getShopClaimDetails(claimCount) {
            if (!foreverPackConfig || !foreverPackConfig.tiers || foreverPackConfig.tiers.length === 0) return null;

            if (claimCount === 0) { // First claim is always free
                return { type: 'free', cost: 0, tierIndex: 0, isPaywall: false };
            }

            let claimsProcessed = 1; // Account for the first free claim
            for (let i = 0; i < foreverPackConfig.tiers.length; i++) {
                const tier = foreverPackConfig.tiers[i];
                const freeClaimsInTier = tier.freeClaimsAfterPaywall || 0;
                
                // Check if current claim is this tier's paywall
                if (claimCount === claimsProcessed) {
                    return { type: 'paywall', cost: tier.paywallCost || 0, tierIndex: i, isPaywall: true };
                }
                
                // Check if current claim is a free one within this tier
                const tierStartClaimIndex = claimsProcessed + 1;
                const tierEndClaimIndex = claimsProcessed + freeClaimsInTier;
                if (claimCount >= tierStartClaimIndex && claimCount <= tierEndClaimIndex) {
                    return { type: 'free', cost: 0, tierIndex: i, isPaywall: false };
                }

                claimsProcessed += (1 + freeClaimsInTier); // Add paywall and free claims to processed total
            }

            // If all configured tiers are exhausted, escalate cost using the last tier's settings
            const lastTier = foreverPackConfig.tiers[foreverPackConfig.tiers.length - 1];
            const escalatingCost = (lastTier.paywallCost || 500) + (claimCount - claimsProcessed) * 250;
            return { type: 'paid', cost: escalatingCost, tierIndex: foreverPackConfig.tiers.length - 1, isPaywall: false };
        }
        
        function rollShopItem() {
            if (!foreverPackConfig || !foreverPackConfig.items || foreverPackConfig.items.length === 0) {
                console.error("Shop item pool is not configured or empty.");
                return null;
            }

            const rarityOrder = { 'Common': 0, 'Uncommon': 1, 'Rare': 2, 'Exclusive': 3 };
            const itemPool = [...foreverPackConfig.items].sort((a, b) => {
                return (rarityOrder[a.rarity] || 0) - (rarityOrder[b.rarity] || 0);
            });
            
            const totalWeight = itemPool.reduce((sum, item) => {
                const chance = Math.max(item.chance, 0.0001); // Avoid division by zero
                return sum + (1 / chance);
            }, 0);

            if (totalWeight === 0) return null;

            const luckFactor = playerShopState.currentLuck;
            const skewedRandomVal = 1 - Math.pow(1 - Math.random(), luckFactor);
            let randomNumber = skewedRandomVal * totalWeight;

            let rolledItemConfig = null;
            for (const item of itemPool) {
                const weight = 1 / item.chance;
                if (randomNumber < weight) {
                    rolledItemConfig = item;
                    break;
                }
                randomNumber -= weight;
            }

            if (!rolledItemConfig) {
                rolledItemConfig = itemPool[itemPool.length - 1];
            }
            
            const finalItem = availableItems.find(i => i.name === rolledItemConfig.name);
            if (!finalItem) return null;

            return {
                ...finalItem,
                quantity: rolledItemConfig.quantity || 1
            };
        }

        function populateShopQueue(count = 1) {
            for (let i = 0; i < count; i++) {
                const futureClaimCount = playerShopState.claimedCount + playerShopState.shopQueue.length;
                const claimDetails = getShopClaimDetails(futureClaimCount);
                if (!claimDetails) continue; 
                
                const item = rollShopItem();
                if (item) {
                    playerShopState.shopQueue.push({ item: item, details: claimDetails });
                } else {
                    console.warn("Could not roll a shop item, using fallback.");
                    const fallbackItem = availableItems[0];
                    playerShopState.shopQueue.push({ item: fallbackItem, details: claimDetails });
                }
            }
        }

        function createShopCard(queuedItem, isVisible) {
            const { item, details } = queuedItem;
            const card = document.createElement('div');
            card.className = 'shop-item-card flex-shrink-0';
            
            let title = details.isPaywall ? 'Tier Up!' : item.name;
            let buttonText = details.isPaywall ? 'Buy' : 'Claim';
            let costText = details.cost > 0 ? `${details.cost} Coins` : 'Free!';
            let imageUrl = details.isPaywall ? 'https://placehold.co/100x100/fcd34d/000000?text=%E2%9C%A8' : item.imageUrl;
            const tierConfig = foreverPackConfig.tiers[details.tierIndex];
            const luckBonusText = tierConfig ? `Pay to unlock Tier ${details.tierIndex + 1} and get +${(tierConfig.luckBonus || 0)}x luck!` : 'Pay to unlock next Tier!';
            const quantityText = item.quantity > 1 ? ` (x${item.quantity})` : '';

            card.innerHTML = `
                <p class="font-bold text-xl mb-2 truncate" title="${title}">${title}${quantityText}</p>
                <img src="${imageUrl}" alt="${title}" class="w-24 h-24 rounded-lg my-4 object-contain">
                <p class="text-sm text-gray-600 flex-grow">${details.isPaywall ? luckBonusText : item.description}</p>
                <button class="claim-shop-item-btn mt-4 w-full py-2 px-4 rounded-lg font-bold text-white bg-blue-500 hover:bg-blue-600" ${!isVisible ? 'disabled' : ''}>
                    ${buttonText} (${costText})
                </button>
            `;
            
            if (details.isPaywall) card.classList.add('paywall');

            if (isVisible) {
                card.querySelector('.claim-shop-item-btn').addEventListener('click', () => handleClaimShopItem(card), { once: true });
            } else {
                 card.querySelector('.claim-shop-item-btn').classList.add('bg-gray-400', 'cursor-not-allowed');
            }
            return card;
        }

        function updateShopDisplay() {
            if (!foreverPackConfig || !foreverPackConfig.tiers || !foreverPackConfig.items) {
                shopItemsContainer.innerHTML = `<p class="text-center text-red-500 w-full col-span-full">Shop not configured by admin.</p>`;
                return;
            }
            shopItemsContainer.innerHTML = '';
            shopItemsContainer.style.transform = 'translateX(0)';
            shopLuckDisplay.textContent = `${playerShopState.currentLuck.toFixed(2)}x`;

            const itemsToDisplay = 7;
            while(playerShopState.shopQueue.length < itemsToDisplay) {
                populateShopQueue(1);
            }

            for (let i = 0; i < itemsToDisplay; i++) {
                const card = createShopCard(playerShopState.shopQueue[i], i === 0);
                shopItemsContainer.appendChild(card);
            }
        }
        
        async function handleClaimShopItem(cardElement) {
            if (isProcessingShopClaim) return;
            isProcessingShopClaim = true;
            
            const claimButton = cardElement.querySelector('.claim-shop-item-btn');
            claimButton.disabled = true;
            claimButton.innerHTML = `<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>`;
            
            const claimedItemData = playerShopState.shopQueue.shift();
            if (!claimedItemData) { 
                isProcessingShopClaim = false; updateShopDisplay(); return;
            }

            const { item, details } = claimedItemData;
            
            if (coins < details.cost) {
                showMessage(`Not enough coins! You need ${details.cost}.`, 'error');
                playerShopState.shopQueue.unshift(claimedItemData);
                isProcessingShopClaim = false; updateShopDisplay(); return;
            }

            if (details.cost > 0) coins -= details.cost;
            if (details.isPaywall) {
                const tierConfig = foreverPackConfig.tiers[details.tierIndex];
                if(tierConfig) playerShopState.currentLuck += tierConfig.luckBonus;
                playerShopState.currentLuck = parseFloat(playerShopState.currentLuck.toFixed(2));
                playerShopState.resetExtensionMinutes += 10;
            }
            
            const itemToAdd = JSON.parse(JSON.stringify(item));
            
            const existingItemIndex = userItems.findIndex(ui => ui.name === itemToAdd.name && ui.type === itemToAdd.type);
            if (existingItemIndex > -1 && item.type !== 'huge_egg') {
                userItems[existingItemIndex].quantity = (userItems[existingItemIndex].quantity || 1) + (itemToAdd.quantity || 1);
            } else {
                 userItems.push({ ...itemToAdd, quantity: itemToAdd.quantity || 1 });
            }

            shopSessionWinnings.push(itemToAdd);
            
            playerShopState.claimedCount++;
            populateShopQueue(1);
            
            await savePlayerProgress(true); 
            updateCoinsDisplay();
            shopLuckDisplay.textContent = `${playerShopState.currentLuck.toFixed(2)}x`;
            
            const cardWidth = cardElement.offsetWidth;
            const gap = parseInt(window.getComputedStyle(shopItemsContainer).gap);
            shopItemsContainer.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
            shopItemsContainer.style.transform = `translateX(-${cardWidth + gap}px)`;

            setTimeout(() => {
                const newCardData = playerShopState.shopQueue[6]; 
                if (newCardData) {
                    const newCard = createShopCard(newCardData, false);
                    shopItemsContainer.appendChild(newCard);
                }

                shopItemsContainer.removeChild(cardElement);
                shopItemsContainer.style.transition = 'none';
                shopItemsContainer.style.transform = 'translateX(0)';
                
                requestAnimationFrame(() => {
                    const nextCard = shopItemsContainer.firstElementChild;
                    if(nextCard) {
                        const nextButton = nextCard.querySelector('.claim-shop-item-btn');
                        nextButton.disabled = false;
                        nextButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
                        nextButton.addEventListener('click', () => handleClaimShopItem(nextCard), { once: true });
                    }
                    isProcessingShopClaim = false;
                });
            }, 500);
        }
        
        async function handleGlobalPackReset() {
            showConfirmation("Are you sure you want to reset the Forever Pack for ALL users? This will reset their progress and claimed items in the pack. This action is irreversible.", async (confirmed) => {
                hideConfirmation();
                if (confirmed) {
                    showMessage("Resetting pack for all users... This may take a moment.", 'info', 0);
                    disableMainButtons();

                    try {
                        const resetAllPacks = httpsCallable(functions, 'resetAllForeverPacks');
                        const result = await resetAllPacks();
                        const data = result.data;
                        showMessage(data.message, 'success');
                    } catch (error) {
                        console.error("Error calling resetAllForeverPacks function:", error);
                        showMessage(`Error: ${error.message}`, 'error', 0);
                    } finally {
                        enableMainButtons();
                    }
                }
            });
        }


        // --- ADMIN FOREVER PACK MANAGER FUNCTIONS ---
        function openForeverPackManagerModal() {
            if (!auth.currentUser || userId !== ADMIN_USER_ID) {
                showMessage("You are not authorized to access this.", 'error'); return;
            }
            adminPanelModal.classList.add('hidden');
            foreverPackManagerModal.classList.remove('hidden');
            foreverPackManagerModal.querySelector('.modal-content').classList.add('animate-in');
            populateForeverPackManager();
        }

        function closeForeverPackManagerModal() {
            foreverPackManagerModal.querySelector('.modal-content').classList.remove('animate-in');
            foreverPackManagerModal.classList.add('hidden');
            adminPanelModal.classList.remove('hidden');
        }
        
        function populateForeverPackManager() {
            packTiersContainer.innerHTML = '';
            packItemsContainer.innerHTML = '';
            if (!foreverPackConfig || !foreverPackConfig.tiers || !foreverPackConfig.items) {
                packTiersContainer.innerHTML = '<p>No config loaded.</p>'; return;
            }

            foreverPackConfig.tiers.forEach((tier, tierIndex) => {
                const tierDiv = document.createElement('div');
                tierDiv.className = 'p-4 border rounded-lg bg-gray-50';
                tierDiv.innerHTML = `
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-bold">Tier ${tierIndex + 1} (Progression)</h3>
                        ${tierIndex > 0 ? `<button class="delete-tier-btn bg-red-500 text-white px-2 py-1 rounded text-xs" data-tier-index="${tierIndex}">Delete Tier</button>` : '<span class="text-xs text-gray-500">Tier 1 cannot be deleted</span>'}
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <label class="block text-sm font-medium">Paywall Cost (Coins)</label>
                            <input type="number" value="${tier.paywallCost || 0}" class="paywall-cost-input w-full p-1 border rounded" data-tier-index="${tierIndex}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium">Free Claims After Paywall</label>
                            <input type="number" value="${tier.freeClaimsAfterPaywall || 0}" class="free-claims-input w-full p-1 border rounded" data-tier-index="${tierIndex}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium">Luck Bonus on Tier Up</label>
                            <input type="number" step="0.01" value="${tier.luckBonus}" class="luck-bonus-input w-full p-1 border rounded" data-tier-index="${tierIndex}">
                        </div>
                    </div>
                `;
                packTiersContainer.appendChild(tierDiv);
            });
            
            foreverPackConfig.items.forEach((item, itemIndex) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'flex items-center gap-2 bg-white p-2 rounded border';
                itemDiv.innerHTML = `
                    <select class="item-name-select p-1 border rounded flex-grow">
                        ${availableItems.map(availItem => `<option value="${availItem.name}" ${availItem.name === item.name ? 'selected' : ''}>${availItem.name}</option>`).join('')}
                    </select>
                    <label class="text-sm">Chance (1 in)</label>
                    <input type="number" value="${item.chance}" class="item-chance-input w-24 p-1 border rounded">
                     <label class="text-sm">Qty</label>
                    <input type="number" value="${item.quantity || 1}" class="item-quantity-input w-16 p-1 border rounded">
                    <label class="text-sm">Rarity</label>
                    <select class="item-rarity-select p-1 border rounded">
                        ${shopRarityLevels.map(r => `<option value="${r}" ${r === item.rarity ? 'selected' : ''}>${r}</option>`).join('')}
                    </select>
                    <button class="delete-item-btn bg-red-400 text-white px-2 py-1 rounded text-xs" data-item-index="${itemIndex}">X</button>
                `;
                packItemsContainer.appendChild(itemDiv);
            });

            addForeverPackManagerListeners();
        }

        function addForeverPackManagerListeners() {
            document.querySelectorAll('.delete-tier-btn').forEach(btn => btn.onclick = (e) => e.target.closest('.p-4.border').remove());
            packItemsContainer.querySelectorAll('.delete-item-btn').forEach(btn => btn.onclick = (e) => e.target.parentElement.remove());
        }
        
        function handleAddShopItem() {
            const newItemDiv = document.createElement('div');
            newItemDiv.className = 'flex items-center gap-2 bg-white p-2 rounded border';
            newItemDiv.innerHTML = `
                <select class="item-name-select p-1 border rounded flex-grow">
                    ${availableItems.map(availItem => `<option value="${availItem.name}">${availItem.name}</option>`).join('')}
                </select>
                <label class="text-sm">Chance (1 in)</label>
                <input type="number" value="10" class="item-chance-input w-24 p-1 border rounded">
                 <label class="text-sm">Qty</label>
                <input type="number" value="1" class="item-quantity-input w-16 p-1 border rounded">
                <label class="text-sm">Rarity</label>
                <select class="item-rarity-select p-1 border rounded">
                     ${shopRarityLevels.map(r => `<option value="${r}">${r}</option>`).join('')}
                </select>
                <button class="delete-item-btn bg-red-400 text-white px-2 py-1 rounded text-xs">X</button>
            `;
            packItemsContainer.appendChild(newItemDiv);
            newItemDiv.querySelector('.delete-item-btn').onclick = (e) => e.target.parentElement.remove();
        }

        async function saveForeverPackConfig() {
            if (userId !== ADMIN_USER_ID) return showMessage("Not authorized.", 'error');

            const newConfig = { tiers: [], items: [] };
            const tierDivs = packTiersContainer.querySelectorAll('.p-4.border');

            tierDivs.forEach((tierDiv) => {
                const tierData = {
                    paywallCost: parseInt(tierDiv.querySelector('.paywall-cost-input').value) || 0,
                    freeClaimsAfterPaywall: parseInt(tierDiv.querySelector('.free-claims-input').value) || 0,
                    luckBonus: parseFloat(tierDiv.querySelector('.luck-bonus-input').value) || 0
                };
                newConfig.tiers.push(tierData);
            });
            
            const itemDivs = packItemsContainer.querySelectorAll('.flex.items-center');
            itemDivs.forEach(itemDiv => {
                const itemName = itemDiv.querySelector('.item-name-select').value;
                const itemChance = parseInt(itemDiv.querySelector('.item-chance-input').value);
                const itemQuantity = parseInt(itemDiv.querySelector('.item-quantity-input').value) || 1;
                const itemRarity = itemDiv.querySelector('.item-rarity-select').value;
                if (itemName && itemChance > 0) {
                    newConfig.items.push({ 
                        name: itemName, 
                        chance: itemChance, 
                        quantity: itemQuantity, 
                        rarity: itemRarity 
                    });
                }
            });

            try {
                const foreverPackConfigRef = doc(db, `artifacts/${appId}/public/data/shopConfig`, 'foreverPack');
                await setDoc(foreverPackConfigRef, newConfig);
                foreverPackConfig = newConfig; 
                showMessage("Forever Pack configuration saved successfully!", 'success');
                closeForeverPackManagerModal();
            } catch (error) {
                console.error("Error saving pack config:", error);
                showMessage("Failed to save config. See console for details.", 'error');
            }
        }

        addTierButton.addEventListener('click', () => {
             const newTier = {
                paywallCost: 3000,
                freeClaimsAfterPaywall: 2,
                luckBonus: 0.1,
            };
            foreverPackConfig.tiers.push(newTier);
            populateForeverPackManager();
        });

        downloadPackConfigButton.addEventListener('click', () => {
            const dataStr = JSON.stringify(foreverPackConfig, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'forever_pack_config.json';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        });

        uploadPackConfigInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const uploadedConfig = JSON.parse(e.target.result);
                    if (uploadedConfig.tiers && uploadedConfig.items) {
                        foreverPackConfig = uploadedConfig;
                        populateForeverPackManager();
                        showMessage("Config loaded. Review and click 'Save All Changes'.", 'info');
                    } else {
                        showMessage("Invalid config structure.", 'error');
                    }
                } catch (error) {
                    showMessage("Failed to upload. Invalid JSON.", 'error');
                }
            };
            reader.readAsText(file);
            event.target.value = '';
        });

        // --- Event Listeners ---
        diceButton.addEventListener('click', handleDiceClick);
        autoRollButton.addEventListener('click', handleAutoRollToggle);
        adminPanelButton.addEventListener('click', openAdminPanel);
        closeAdminPanelModal.addEventListener('click', closeAdminPanel);
        wipeGlobalPetsButton.addEventListener('click', wipeGlobalPets);
        resetForeverPackButton.addEventListener('click', handleGlobalPackReset);
        openPetsListButton.addEventListener('click', openPetsList);
        manageCurrencyButton.addEventListener('click', openManageCurrencyModal);
        openAdminUpgradeTreeButton.addEventListener('click', openAdminUpgradeTree);
        openForeverPackManagerButton.addEventListener('click', openForeverPackManagerModal); 
        closePetsListModal.addEventListener('click', closePetsList);
        submitPetButton.addEventListener('click', handleSubmitPet);
        downloadPetsButton.addEventListener('click', downloadPetsList);
        uploadPetsInput.addEventListener('change', uploadPetsList);
        saveMinAnnouncementRarityButton.addEventListener('click', saveMinAnnouncementRarity);

        confirmYesButton.addEventListener('click', () => { if (confirmationCallback) confirmationCallback(true); });
        confirmNoButton.addEventListener('click', () => { if (confirmationCallback) confirmationCallback(false); });
        upgradeButton.addEventListener('click', () => {
            if (isAutoRolling) stopAutoRoll(); upgradeTreeContainer.classList.remove('hidden');
            updateUIBasedOnGameState();
        });
        closeUpgradeTreeModal.addEventListener('click', () => upgradeTreeContainer.classList.add('hidden'));
        buyUpgrade1Button.addEventListener('click', handleBuyUpgrade1);
        buyRollStreakUpgradeButton.addEventListener('click', handleBuyRollStreakUpgrade);
        buyInventoryUpgradeButton.addEventListener('click', handleBuyInventoryUpgrade);
        buyAutoRollUpgradeButton.addEventListener('click', handleBuyAutoRollUpgrade);
        buyHidePopupUpgradeButton.addEventListener('click', handleBuyHidePopupUpgrade);
        buyFasterRollsIUpgradeButton.addEventListener('click', handleBuyFasterRollsIUpgrade);
        buyRollItemsUpgradeButton.addEventListener('click', handleBuyRollItemsUpgrade);
        buyDeletePetsUpgradeButton.addEventListener('click', handleBuyDeletePetsUpgrade);
        buyBetterDiceIUpgradeButton.addEventListener('click', handleBuyBetterDiceIUpgrade);
        buyRollBetterItemsUpgradeButton.addEventListener('click', handleBuyRollBetterItemsUpgrade);
        buyMoreCoinsIUpgradeButton.addEventListener('click', handleBuyMoreCoinsIUpgrade);
        buyLeaderboardsUpgradeButton.addEventListener('click', handleBuyLeaderboardsUpgrade);
        buyBetterDiceIIUpgradeButton.addEventListener('click', handleBuyBetterDiceIIUpgrade);
        buyMoreCoinsIIUpgradeButton.addEventListener('click', handleBuyMoreCoinsIIUpgrade);
        buyRollMoreItemsUpgradeButton.addEventListener('click', handleBuyRollMoreItemsUpgrade);
        buyFusePetsUpgradeButton.addEventListener('click', handleBuyFusePetsUpgrade); 

        closeAdminUpgradeTreeModal.addEventListener('click', closeAdminUpgradeTree);

        inventoryButton.addEventListener('click', () => openInventory(false));
        closeInventoryModal.addEventListener('click', closeInventory);

        if (inventoryTabButton) {
            inventoryTabButton.addEventListener('click', () => {
                inventoryContent.classList.remove('hidden');
                fuseMachineContent.classList.add('hidden');
                inventoryTabButton.classList.add('bg-blue-700');
                fuseMachineTabButton.classList.remove('bg-blue-700');
                populateInventory();
            });
        }
        if (fuseMachineTabButton) {
            fuseMachineTabButton.addEventListener('click', () => {
                inventoryContent.classList.add('hidden');
                fuseMachineContent.classList.remove('hidden');
                inventoryTabButton.classList.remove('bg-blue-700');
                fuseMachineTabButton.classList.add('bg-blue-700');
                populateFuseMachine();
            });
        }

        inventoryItemsContainer.addEventListener('click', (e) => {
            const itemCard = e.target.closest('[data-item-index]');
            if (itemCard) {
                const itemIndex = parseInt(itemCard.dataset.itemIndex);
                const item = userItems[itemIndex];
                if (item) {
                    if (item.type === "speed") useFasterRollsPotion(itemIndex);
                    else if (item.type === "luck") useLuckyRollPotion(itemIndex);
                    else if (item.type === "huge_egg") handleOpenHugeEgg(itemIndex);
                }
            }
        });

        inventoryPetsContainer.addEventListener('click', (e) => {
            if (!isDeletePetsUpgradePurchased) return;
            const petCard = e.target.closest('.inventory-pet-card-selectable');
            if (petCard && petCard.dataset.petId) {
                const petId = petCard.dataset.petId;
                const indexInSelection = petsSelectedForDeletion.indexOf(petId);
                if (indexInSelection > -1) {
                    petsSelectedForDeletion.splice(indexInSelection, 1);
                    petCard.classList.remove('selected-for-deletion');
                } else {
                    petsSelectedForDeletion.push(petId);
                    petCard.classList.add('selected-for-deletion');
                }
                updateConfirmDeleteButtonState();
            }
        });

        fuseablePetsContainer.addEventListener('click', (e) => {
            const petCard = e.target.closest('.fuse-pet-card-selectable');
            if (petCard && petCard.dataset.petId) {
                const petId = petCard.dataset.petId;
                const indexInSelection = petsSelectedForFusion.indexOf(petId);
                if (indexInSelection > -1) {
                    petsSelectedForFusion.splice(indexInSelection, 1);
                    petCard.classList.remove('selected-for-fusion');
                } else {
                    const pet = userPets.find(p => p.id === petId);
                    if (!pet) return;

                    let rarestPetId = null;
                    if (userPets.length > 0) {
                        const sortedUserPets = [...userPets].sort((a, b) => {
                            const rarityAVal = rarityOrder[normalizeRarity(a.rarity)] ?? -1;
                            const rarityBVal = rarityOrder[normalizeRarity(b.rarity)] ?? -1;
                            if(rarityAVal !== rarityBVal) return rarityBVal - rarityAVal;
                            const chanceA = a.chanceDenominator !== undefined && a.chanceDenominator > 0 ? a.chanceDenominator : 0;
                            const chanceB = b.chanceDenominator !== undefined && b.chanceDenominator > 0 ? b.chanceDenominator : 0;
                            return chanceB - chanceA;
                        });
                        rarestPetId = sortedUserPets[0].id;
                    }

                    if (pet.id === rarestPetId) {
                        showMessage(`You cannot fuse your rarest pet (${pet.name})!`, 'error');
                        return;
                    }
                    if (normalizeRarity(pet.rarity) === 'EXCLUSIVE') {
                        showMessage(`You cannot fuse EXCLUSIVE pets! (${pet.name})`, 'error');
                        return;
                    }

                    petsSelectedForFusion.push(petId);
                    petCard.classList.add('selected-for-fusion');
                }
                updateFuseButtonState();
            }
        });

        if (confirmDeleteSelectedPetsButton) {
            confirmDeleteSelectedPetsButton.addEventListener('click', () => {
                if (petsSelectedForDeletion.length === 0) return;
                const petNamesToDelete = userPets
                    .filter(p => petsSelectedForDeletion.includes(p.id))
                    .map(p => p.name)
                    .join(', ');
                const numToDelete = petsSelectedForDeletion.length;

                showConfirmation(`Are you sure you want to delete ${numToDelete} pet(s): ${petNamesToDelete || 'the selected pets'}? This is permanent.`, (confirmed) => {
                    hideConfirmation();
                    if (confirmed) {
                        userPets = userPets.filter(p => !petsSelectedForDeletion.includes(p.id));
                        petsSelectedForDeletion = [];
                        savePlayerProgress();
                        populateInventory();
                        showMessage(`${numToDelete} pet(s) deleted. How cruel of you!`, 'success');
                    }
                });
            });
        }

        if (fusePetsButton) {
            fusePetsButton.addEventListener('click', handleFusePets);
        }

        closeManageCurrencyModalBtn.addEventListener('click', handleCloseManageCurrencyModal);
        submitCurrencyActionButton.addEventListener('click', handleSubmitCurrencyAction);
        closePetRevealModalButton.addEventListener('click', closePetRevealModalHandler);
        dismissPetRevealModalButton.addEventListener('click', closePetRevealModalHandler);
        petCollectionButton.addEventListener('click', openPetCollection);
        closePetCollectionModal.addEventListener('click', closePetCollection);

        submitNicknameButton.addEventListener('click', handleSubmitNickname);
        closeNicknameInputModalElement.addEventListener('click', handleCloseNicknameInputModal);

        leaderboardsButton.addEventListener('click', openLeaderboard);
        closeLeaderboardModal.addEventListener('click', closeLeaderboard);

        recentRollsButton.addEventListener('click', openRecentRollsModal);
        closeRecentRollsModalBtn.addEventListener('click', closeRecentRollsModal);

        shopButton.addEventListener('click', openShop);
        closeShopModal.addEventListener('click', closeShop);
        
        closeForeverPackManagerModalBtn.addEventListener('click', closeForeverPackManagerModal);
        savePackConfigButton.addEventListener('click', saveForeverPackConfig);
        addShopItemButton.addEventListener('click', handleAddShopItem);


        window.onload = () => { setupFirebase(); };
    </script>
    <style>
        body { font-family: "Inter", sans-serif; background-color: #f0f4f8; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 1rem; box-sizing: border-box; overflow: hidden; }
        .game-wrapper { display: flex; flex-direction: column; justify-content: space-between; align-items: center; width: 100%; height: 100vh; position: relative; }
        .header-container { position: absolute; top: 1rem; left: 1rem; right: 1rem; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; z-index: 20; flex-wrap: wrap; }
        .header-left-group { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .game-title { margin-top: 5rem; color: #1a202c; text-align: center; z-index: 5; }
        .coins-display { font-size: 1.2rem; font-weight: bold; color: #4a5568; background-color: rgba(255, 255, 255, 0.7); padding: 0.5rem 1rem; border-radius: 0.5rem; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .game-container { display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; flex-grow: 1; position: relative; }
        .upgrade-tree-container, .modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 100; padding: 1rem; box-sizing: border-box;}
        #confirmationModal, #nicknameInputModal, #adminUpgradeTreeModal, #recentRollsModal, #foreverPackManagerModal { z-index: 200; }
        .upgrade-tree-content, .modal-content { background-color: #e6f7ff; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2); max-width: 90%; width: 400px; text-align: center; position: relative; max-height: 90vh; overflow-y: auto; }
        .modal-content { background-color: #ffffff; width: 500px; }
        .action-buttons-container { position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%); display: flex; gap: 1rem; z-index: 10; justify-content: center; }
        .action-button { border-radius: 18px; width: 120px; height: 120px; display: flex; flex-direction: column; justify-content: center; align-items: center; cursor: pointer; transition: transform 0.2s ease, opacity 0.3s ease, background-color 0.2s ease; position: relative; z-index: 10; box-shadow: 0 8px 15px rgba(0,0,0,0.2); padding: 0; font-size: 1.2rem; font-weight: bold; color: white; border: 2px solid; }
        .action-button:hover { transform: scale(1.1); } .action-button:active { transform: scale(1.05); }
        .action-button.disabled-dice, .action-button:disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
        .dice-button { background-color: transparent; border: none; width: 140px; height: 140px; }
        .dice-cube { width: 90px; height: 90px; background-color: #f8f8f8; border-radius: 18px; position: relative; box-shadow: inset 0 0 15px rgba(0,0,0,0.15), 0 8px 20px rgba(0,0,0,0.3); transform: rotateX(15deg) rotateY(-15deg); display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); padding: 10px; box-sizing: border-box; border: 2px solid #333; }
        .dot { width: 15px; height: 15px; background-color: #333; border-radius: 50%; align-self: center; justify-self: center; }
        .dot:nth-child(1) { grid-area: 1 / 1; } .dot:nth-child(2) { grid-area: 1 / 3; } .dot:nth-child(3) { grid-area: 2 / 2; } .dot:nth-child(4) { grid-area: 3 / 1; } .dot:nth-child(5) { grid-area: 3 / 3; }
        .roll-text { font-size: 1.5rem; font-weight: bold; color: #1a202c; margin-top: 10px; text-shadow: 1px 1px 2px rgba(0,0,0,0.1); }
        .upgrade-button { background-color: #ffc107; border-color: #e0a800; } .upgrade-button:hover { background-color: #ffca28; } .upgrade-button:active { background-color: #e0a800; }
        .upgrade-count-badge { position: absolute; top: -10px; right: -10px; background-color: #ef4444; color: white; border-radius: 50%; padding: 0.25rem 0.6rem; font-size: 0.9rem; font-weight: bold; min-width: 28px; height: 28px; display: flex; justify-content: center; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.2); border: 2px solid white; }
        .upgrade-arrow, .upgrade-text { color: #333; }
        .inventory-button { background-color: #6d28d9; border-color: #5b21b6; } .inventory-button:hover { background-color: #7c3aed; } .inventory-button:active { background-color: #5b21b6; }
        .inventory-button .backpack-icon { width: 50px; height: 50px; fill: white; filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.3)); } .inventory-text { font-size: 1.2rem; margin-top: 5px; }
        .auto-roll-button { background-color: #10b981; border-color: #059669; } .auto-roll-button:hover { background-color: #34d399; } .auto-roll-button:active { background-color: #059669; }
        .auto-roll-button.bg-red-500 { background-color: #ef4444; border-color: #dc2626; } .auto-roll-button.bg-red-500:hover { background-color: #f87171; }
        .auto-roll-text { font-size: 1.2rem; margin-top: 5px; } .auto-roll-button .repeat-icon { font-size: 2.5rem; line-height: 1; }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(20px); } }
        .arrow-indicator { position: fixed; font-size: 3rem; color: #FFD700; animation: bounce 1s infinite; text-shadow: 0 0 10px rgba(255, 215, 0, 0.5); z-index: 5; bottom: 180px; left: 50%; transform: translateX(calc(-82px)); }
        .arrow-indicator.pointing-to-upgrades { transform: translateX(calc(82px)); }
        .message-box { background-color: #e0f2fe; color: #1e40af; padding: 1rem; border-radius: 0.5rem; font-weight: 500; width: 80%; max-width: 300px; text-align: center; box-shadow: 0 2px 5px rgba(0,0,0,0.1); border: 1px solid; position: fixed; top: 2rem; left: 50%; transform: translateX(-50%); z-index: 150; }
        #globalAnnouncementBox { position: fixed; top: 1rem; left: 50%; transform: translateX(-50%); background-color: #fffbeb; color: #b45309; padding: 0.75rem 1.5rem; border-radius: 0.75rem; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); font-size: 1.1rem; font-weight: 600; text-align: center; max-width: 90%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; z-index: 160; border: 2px solid #fcd34d; animation-duration: 0.5s; animation-fill-mode: forwards; }
        @keyframes slideIn { from { top: -50px; opacity: 0; } to { top: 1rem; opacity: 1; } }
        @keyframes slideOut { from { top: 1rem; opacity: 1; } to { top: -50px; opacity: 0; } }
        .animate-slide-in { animation-name: slideIn; } .animate-slide-out { animation-name: slideOut; }
        .loading-spinner { border: 4px solid rgba(0, 0, 0, 0.1); border-left-color: #3b82f6; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; } @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .user-id-display { font-size: 0.8rem; color: #6b7280; background-color: rgba(255, 255, 255, 0.7); padding: 0.5rem 0.75rem; border-radius: 0.5rem; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .modal-close-button { position: absolute; top: 1rem; right: 1rem; background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #6b7280; z-index: 10; } .modal-close-button:hover { color: #1a202c; }
        .modal input[type="text"], .modal input[type="number"], .modal input[type="file"], .modal select { width: 100%; padding: 0.75rem; margin-bottom: 1rem; border: 1px solid #cbd5e0; border-radius: 0.5rem; box-sizing: border-box; }
        .modal button { padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; transition: background-color 0.2s ease-in-out; margin-right: 0.5rem; }
        .pets-management-table table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
        .pets-management-table th, .pets-management-table td { padding: 0.75rem 1rem; border: 1px solid #e2e8f0; font-size: 0.85rem; text-align: left; }
        .pets-management-table th { background-color: #f7fafc; font-weight: 600; color: #4a5568; } .pets-management-table img { display: block; margin: 0 auto; }
        .rolling-pet-display { position: absolute; top: 25%; left: 50%; transform: translate(-50%, -50%); width: 150px; height: 150px; display: flex; justify-content: center; align-items: center; overflow: hidden; background-color: rgba(255, 255, 255, 0.7); border-radius: 15px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); z-index: 10; border: 2px dashed #a0aec0; }
        .rolling-pet-display img { width: 100%; height: 100%; object-fit: contain; }
        @keyframes popInAnimation { 0% { opacity: 0; transform: translateY(50px) scale(0.8); } 80% { opacity: 1; transform: translateY(-10px) scale(1.05); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        .inventory-modal-content, .pet-reveal-modal-content, .pet-collection-modal-content, .leaderboard-modal-content, .nickname-input-modal-content, .admin-upgrade-tree-modal-content, .recent-rolls-modal-content, #shopModalContent, #foreverPackManagerModal .modal-content { background-color: #e6f7ff; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2); max-width: 90%; width: 800px; text-align: center; position: relative; max-height: 80vh; overflow-y: auto; opacity: 0; transform: translateY(50px) scale(0.8); transition: opacity 0.3s ease, transform 0.3s ease; }
        .inventory-modal-content.animate-in, .pet-reveal-modal-content.animate-in, .pet-collection-modal-content.animate-in, .leaderboard-modal-content.animate-in, .nickname-input-modal-content.animate-in, .admin-upgrade-tree-modal-content.animate-in, .recent-rolls-modal-content.animate-in, #shopModalContent.animate-in, #foreverPackManagerModal .modal-content.animate-in { animation: popInAnimation 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards; }
        .inventory-pets-grid, .pet-collection-grid, .inventory-items-grid, .item-collection-grid, .fuseable-pets-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.5rem; margin-top: 1.5rem; justify-content: center; }
        .manage-currency-modal-content { background-color: #f8f8f8; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2); max-width: 90%; width: 450px; text-align: center; position: relative; max-height: 80vh; overflow-y: auto; }
        .manage-currency-modal-content label { display: block; margin-bottom: 0.5rem; font-weight: 600; color: #333; text-align: left; }
        .manage-currency-modal-content .radio-group { display: flex; justify-content: space-around; margin-bottom: 1.5rem; } .manage-currency-modal-content .radio-group div { display: flex; align-items: center; gap: 0.5rem; }
        .pet-reveal-modal-content { background-color: #dcfce7; width: auto; min-width: 300px; max-width: 700px; }
        #revealedPetsContainer { display: flex; flex-wrap: wrap; justify-content: center; align-items: flex-start; gap: 1.5rem; margin-bottom: 1rem; }
        .won-pet-card { background-color: #ffffff; border: 2px solid #a7f3d0; }
        #petRevealCoinsMessage { font-size: 1.25rem; font-weight: 600; color: #059669; }
        #petCollectionButton, #recentRollsButton, #shopButton { color: white; padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.1); transition: background-color 0.2s ease, transform 0.2s ease; }
        #petCollectionButton { background-color: #3b82f6; } #petCollectionButton:hover { background-color: #2563eb; transform: translateY(-2px); }
        #recentRollsButton { background-color: #6366f1; } #recentRollsButton:hover { background-color: #4f46e5; transform: translateY(-2px); }
        #shopButton { background-color: #f59e0b; } #shopButton:hover { background-color: #d97706; transform: translateY(-2px); }
        .pet-collection-card .group-hover\:opacity-100 { opacity: 0; } .pet-collection-card:hover .group-hover\:opacity-100 { opacity: 1; }
        .admin-panel-button-container { position: absolute; top: 8rem; left: 50%; transform: translateX(-50%); z-index: 15; }
        .selected-for-deletion { border: 4px solid #ef4444 !important; box-shadow: 0 0 15px rgba(239, 68, 68, 0.7) !important; transform: scale(1.03); }
        .fuse-pet-card-selectable { border: 2px solid transparent; }
        .fuse-pet-card-selectable.selected-for-fusion { border: 4px solid #3b82f6 !important; box-shadow: 0 0 15px rgba(59, 130, 246, 0.7) !important; transform: scale(1.03); }
        .leaderboard-modal-content { background-color: #f0f9ff; }
        .leaderboard-table-container { max-height: 400px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 0.5rem; }
        .leaderboard-table th, .leaderboard-table td { padding: 0.75rem 1rem; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; }
        .leaderboard-table th { background-color: #e0f2fe; color: #2a69b6; font-weight: 700; text-align: center; }
        .leaderboard-table td { background-color: #ffffff; }
        .leaderboard-table tr:last-child td { border-bottom: none; }
        .leaderboard-table tbody tr.bg-blue-100 { background-color: #dbeafe !important; }
        .recent-rolls-modal-content { background-color: #f8f8e0; max-width: 600px; }
        .recent-rolls-table-container { max-height: 400px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 0.5rem; }
        .recent-rolls-table th, .recent-rolls-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #e2e8f0; font-size: 0.85rem; text-align: left; vertical-align: middle; }
        .recent-rolls-table th { background-color: #e0e0b0; color: #5a5a00; font-weight: 700; }
        .recent-rolls-table td img { border-radius: 4px; border: 1px solid #ddd; }
        .recent-rolls-table tbody tr:last-child td { border-bottom: none; }
        .nickname-input-modal-content { background-color: #fff; max-width: 450px; }
        .nickname-input-modal-content input { margin-bottom: 1rem; }
        #leaderboardsButton { background-color: #0d9488; border-color: #0f766e; } #leaderboardsButton:hover { background-color: #14b8a6; } #leaderboardsButton:active { background-color: #0f766e; }
        .inventory-tabs { display: flex; justify-content: center; margin-bottom: 1.5rem; }
        .inventory-tabs button { padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; transition: background-color 0.2s ease-in-out; margin: 0 0.25rem; background-color: #e2e8f0; color: #4a5568; }
        .inventory-tabs button.bg-blue-700 { background-color: #2563eb; color: white; }

        /* SHOP STYLES */
        #shopModalContent { background-color: #fefce8; }
        .shop-items-outer-container { overflow: hidden; padding: 1rem 0; }
        #shopItemsContainer { display: flex; gap: 1.5rem; padding: 0 1rem; min-width: min-content; transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
        .shop-item-card { width: 220px; height: 320px; background-color: #fff; border-radius: 1rem; padding: 1.5rem; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 2px solid #e2e8f0; flex-shrink: 0; }
        .shop-item-card.paywall { border-color: #f59e0b; background-color: #fffbeb; }
        #foreverPackManagerModal .modal-content { background-color: #f9fafb; max-width: 56rem; }
    </style>
</head>
<body>
    <div class="header-container">
        <div class="header-left-group">
            <div class="user-id-display" id="userIdDisplay">User ID: Loading...</div>
            <button id="shopButton">Shop</button>
            <button id="petCollectionButton">Pet Collection</button>
            <button id="recentRollsButton">Recent Rolls</button> 
        </div>
        <div class="coins-display" id="coinsDisplay">Coins: 0</div>
    </div>
    <div id="globalAnnouncementBox" class="hidden"></div>

    <div class="game-wrapper">
        <h1 class="text-4xl font-bold game-title">Pets GO!</h1>
        <div class="admin-panel-button-container">
            <button id="adminPanelButton" class="hidden bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg shadow-md">Admin Panel</button>
        </div>
        <div id="loadingSpinner" class="loading-spinner"></div>
        <div id="gameContainer" class="game-container hidden">
            <div id="rollingPetDisplay" class="rolling-pet-display hidden"></div>
            <div id="messageBox" class="message-box hidden"></div>
        </div>

        <div class="action-buttons-container">
            <button id="autoRollButton" class="action-button auto-roll-button hidden"> <span class="repeat-icon">🔁</span> <span class="auto-roll-text">Stop Auto</span> </button>
            <button id="inventoryButton" class="action-button inventory-button hidden"> <svg class="backpack-icon" viewBox="0 0 24 24"><path d="M20 6h-3V4c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM9 4h6v2H9V4zm11 15H4V8h3v2h2V8h6v2h2V8h3v11z"/></svg> <span class="inventory-text">Inventory</span> </button>
            <button id="diceButton" class="dice-button action-button"> <div class="dice-cube"> <span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="dot"></span> </div> <span class="roll-text">Roll!</span> </button>
            <button id="upgradeButton" class="action-button upgrade-button hidden"> <span class="upgrade-count-badge" id="upgradeCountBadge">0</span> <span class="upgrade-arrow text-2xl">⬆️</span> <span class="upgrade-text">Upgrades</span> </button>
            <button id="leaderboardsButton" class="action-button hidden"> <span class="text-2xl">🏆</span> <span class="text-sm mt-1">Leaderboards</span> </button>
        </div>
        <div id="arrowIndicator" class="arrow-indicator hidden">&#x2193;</div>
    </div>

    <div id="adminPanelModal" class="modal hidden">
        <div class="modal-content">
            <button class="modal-close-button" id="closeAdminPanelModal">&times;</button>
            <h2 class="text-2xl font-bold mb-4">Admin Panel</h2>
            <div class="flex flex-wrap justify-center gap-4 mb-4">
                <button id="wipeGlobalPetsButton" class="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">Wipe Global Pets</button>
                <button id="resetForeverPackButton" class="bg-orange-500 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg">Reset Forever Pack</button>
                <button id="manageCurrencyButton" class="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded-lg">Manage Currency</button>
                <button id="openPetsListButton" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Pets List Mngmt</button>
                <button id="openAdminUpgradeTreeButton" class="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">Upgrades Tree</button>
                <button id="openForeverPackManagerButton" class="bg-teal-500 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg">Forever Pack Manager</button>
            </div>
            <div class="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <h3 class="text-xl font-semibold mb-3">Global Announcement Settings</h3>
                <label for="minAnnouncementRarityInput">Min Rarity for Global Announcement (e.g., 100 for 1/100):</label>
                <input type="number" id="minAnnouncementRarityInput" placeholder="e.g., 100" min="1">
                <button id="saveMinAnnouncementRarityButton" class="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg mt-2">Save Min Rarity Setting</button>
                <p class="text-xs text-gray-500 mt-2">Only pets with chance 1/X where X is this value or higher will trigger an announcement.</p>
            </div>
            <p class="text-sm text-gray-600 mt-4">"Wipe Global Pets" clears shared pet data. Use with caution.</p>
        </div>
    </div>
    <div id="confirmationModal" class="modal hidden"><div class="modal-content text-center"><p id="confirmationMessage" class="text-lg mb-6"></p><button id="confirmYesButton" class="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">Yes</button><button id="confirmNoButton" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg">No</button></div></div>
    <div id="petsListModal" class="modal hidden"><div class="modal-content max-w-2xl w-full"><button class="modal-close-button" id="closePetsListModal">&times;</button><h2 class="text-2xl font-bold mb-4">Pets List Management</h2><div class="mb-6 p-4 border border-gray-200 rounded-lg"><h3 class="text-xl font-semibold mb-3">Add/Edit Pet</h3><input type="text" id="petNameInput" placeholder="Pet Name" class="mb-2"><select id="petRarityInput" class="w-full p-2 mb-2 border border-gray-300 rounded-md"><option value="Common">Common</option><option value="Uncommon">Uncommon</option><option value="Rare">Rare</option><option value="Epic">Epic</option><option value="Legendary">Legendary</option><option value="Mythic">Mythic</option><option value="EXCLUSIVE">EXCLUSIVE</option><option value="HUGE">HUGE</option></select><input type="number" id="petChanceInput" placeholder="Chance (e.g., 3 for 1 in 3)" step="0.01" min="0.01" class="mb-2"><input type="text" id="petImageURLInput" placeholder="Pet Image URL (optional)" class="mb-2"><input type="number" id="petMinCoinsInput" placeholder="Min Coins (default 0)" step="1" min="0" class="mb-2"><button id="submitPetButton" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg w-full">Add Pet</button></div><div class="mb-6 p-4 border border-gray-200 rounded-lg"><h3 class="text-xl font-semibold mb-3">Import/Export Pets</h3><button id="downloadPetsButton" class="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg mr-2">Download Pets</button><label for="uploadPetsInput" class="inline-block bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg cursor-pointer">Upload Pets</label><input type="file" id="uploadPetsInput" accept=".json" class="hidden"><p class="text-sm text-gray-600 mt-2">Uploads ignore duplicate pet names. Ensure rarity matches predefined values.</p></div><div class="pets-management-table"><h3 class="text-xl font-semibold mb-3">Current Pets</h3><table class="w-full text-left table-auto rounded-lg overflow-hidden"><thead class="bg-gray-200"><tr><th class="px-4 py-2">Name</th><th class="px-4 py-2">Rarity</th><th class="px-4 py-2">Chance</th> <th class="px-4 py-2">Min Coins</th><th class="px-4 py-2">Image</th><th class="px-4 py-2">Actions</th></tr></thead><tbody id="petsManagementTableBody"></tbody></table></div></div></div>
    <div id="upgradeTreeContainer" class="modal hidden"><div class="upgrade-tree-content"><button class="modal-close-button" id="closeUpgradeTreeModal">&times;</button><h2 class="text-2xl font-bold text-gray-800 mb-4">Upgrade Tree</h2><p class="text-gray-600">Upgrades available: <span id="currentUpgradesAvailable" class="font-bold text-blue-600">0</span></p><div class="upgrade-item p-3 border border-gray-300 rounded-lg mb-3"><button id="buyUpgrade1Button" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg w-full text-sm">Coins -> Free (Earn coins)</button></div><div id="rollStreakUpgradeSection" class="upgrade-item p-3 border border-gray-300 rounded-lg mb-3 hidden"><h3 class="text-lg font-semibold mb-1">Roll Streak</h3><p id="currentRollStreakDisplay" class="text-gray-700 text-xs"></p><button id="buyRollStreakUpgradeButton" class="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-lg mt-2 w-full text-sm">Buy Roll Streak (500 Coins)</button></div><div id="inventoryUpgradeSection" class="upgrade-item p-3 border border-gray-300 rounded-lg mb-3 hidden"><h3 class="text-lg font-semibold mb-1">Inventory</h3><p class="text-gray-600 text-xs">Unlock your pet collection!</p><button id="buyInventoryUpgradeButton" class="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-3 rounded-lg mt-2 w-full text-sm">Buy Inventory (700 Coins)</button></div><div id="autoRollUpgradeSection" class="upgrade-item p-3 border border-gray-300 rounded-lg mb-3 hidden"><h3 class="text-lg font-semibold mb-1">Auto Roll</h3><p class="text-gray-600 text-xs">Automatically roll for pets!</p><button id="buyAutoRollUpgradeButton" class="bg-teal-500 hover:bg-teal-700 text-white font-bold py-2 px-3 rounded-lg mt-2 w-full text-sm">Buy Auto Roll (1000 Coins)</button></div><div id="hidePopupUpgradeSection" class="upgrade-item p-3 border border-gray-300 rounded-lg mb-3 hidden"> <h3 class="text-lg font-semibold mb-1">Hide Pet Pop-up</h3><p class="text-gray-600 text-xs">No more pop-ups after rolling!</p><button id="buyHidePopupUpgradeButton" class="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-lg mt-2 w-full text-sm">Buy Hide Pet Pop-up (1250 Coins)</button></div><div id="fasterRollsIUpgradeSection" class="upgrade-item p-3 border border-gray-300 rounded-lg mb-3 hidden"><h3 class="text-lg font-semibold mb-1">Faster Rolls I</h3><p class="text-gray-600 text-xs">Tired of the rolling animation taking FOREVER? Roll 5% faster.</p><button id="buyFasterRollsIUpgradeButton" class="bg-orange-500 hover:bg-orange-700 text-white font-bold py-2 px-3 rounded-lg mt-2 w-full text-sm">Buy Faster Rolls I (2000 Coins)</button></div><div id="rollItemsUpgradeSection" class="upgrade-item p-3 border border-gray-300 rounded-lg mb-3 hidden"><h3 class="text-lg font-semibold mb-1">Roll Items</h3><p class="text-gray-600 text-xs">Allows you to roll items as well. Items such as Faster Rolls Potion, Lucky Potion V, etc.</p><button id="buyRollItemsUpgradeButton" class="bg-pink-500 hover:bg-pink-700 text-white font-bold py-2 px-3 rounded-lg mt-2 w-full text-sm">Buy Roll Items (2500 Coins)</button></div><div id="deletePetsUpgradeSection" class="upgrade-item p-3 border border-gray-300 rounded-lg mb-3 hidden"><h3 class="text-lg font-semibold mb-1">Delete Pets</h3><p class="text-gray-600 text-xs">Inventory too heavy? How cruel of you to delete pets.</p><button id="buyDeletePetsUpgradeButton" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg mt-2 w-full text-sm">Buy Delete Pets (2500 Coins)</button></div><div id="betterDiceIUpgradeSection" class="upgrade-item p-3 border border-gray-300 rounded-lg mb-3 hidden"> <h3 class="text-lg font-semibold mb-1">Better Dice I</h3><p class="text-gray-600 text-xs">All pets rolled with these dice are 1/5 or better.</p><button id="buyBetterDiceIUpgradeButton" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg mt-2 w-full text-sm">Buy Better Dice I (5000 Coins)</button></div><div id="rollBetterItemsUpgradeSection" class="upgrade-item p-3 border border-gray-300 rounded-lg mb-3 hidden"> <h3 class="text-lg font-semibold mb-1">Roll Better Items</h3><p class="text-gray-600 text-xs">Allows you to roll better items. Items such as Faster Rolls II, Lucky Potion II, etc. You can still get Lucky Potion and Faster Rolls I, but it's less likely.</p><button id="buyRollBetterItemsUpgradeButton" class="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-3 rounded-lg mt-2 w-full text-sm">Buy Roll Better Items (7500 Coins)</button></div><div id="moreCoinsIUpgradeSection" class="upgrade-item p-3 border border-gray-300 rounded-lg mb-3 hidden"> <h3 class="text-lg font-semibold mb-1">More Coins I</h3><p class="text-gray-600 text-xs">Earn 10% more coins when rolling.</p><button id="buyMoreCoinsIUpgradeButton" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-lg mt-2 w-full text-sm">Buy More Coins I (8000 Coins)</button></div><div id="leaderboardsUpgradeSection" class="upgrade-item p-3 border border-gray-300 rounded-lg mb-3 hidden"> <h3 class="text-lg font-semibold mb-1">Leaderboards</h3><p class="text-gray-600 text-xs">Rank up on the leaderboards and choose your nickname!</p><button id="buyLeaderboardsUpgradeButton" class="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-3 rounded-lg mt-2 w-full text-sm">Buy Leaderboards (10000 Coins)</button></div><div id="betterDiceIIUpgradeSection" class="upgrade-item p-3 border border-gray-300 rounded-lg mb-3 hidden"> <h3 class="text-lg font-semibold mb-1">Better Dice II</h3><p class="text-gray-600 text-xs">All pets rolled with these dice are 1/8 or better.</p><button id="buyBetterDiceIIUpgradeButton" class="bg-pink-700 hover:bg-pink-800 text-white font-bold py-2 px-3 rounded-lg mt-2 w-full text-sm">Buy Better Dice II (11000 Coins)</button></div><div id="moreCoinsIIUpgradeSection" class="upgrade-item p-3 border border-gray-300 rounded-lg mb-3 hidden"> <h3 class="text-lg font-semibold mb-1">More Coins II</h3><p class="text-gray-600 text-xs">Earn 15% more coins when rolling. Stacks with previous upgrade. Giving a total of +25% coins when rolling.</p><button id="buyMoreCoinsIIUpgradeButton" class="bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold py-2 px-3 rounded-lg mt-2 w-full text-sm">Buy More Coins II (15000 Coins)</button></div><div id="rollMoreItemsUpgradeSection" class="upgrade-item p-3 border border-gray-300 rounded-lg mb-3 hidden"> <h3 class="text-lg font-semibold mb-1">Roll More Items</h3><p class="text-gray-600 text-xs">Roll items more frequently. Items are 10% more common.</p><button id="buyRollMoreItemsUpgradeButton" class="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-3 rounded-lg mt-2 w-full text-sm">Buy Roll More Items (14000 Coins)</button></div><div id="fusePetsUpgradeSection" class="upgrade-item p-3 border border-gray-300 rounded-lg mb-3 hidden"> <h3 class="text-lg font-semibold mb-1">Fuse Pets</h3><p class="text-gray-600 text-xs">Combine multiple pets into one rarer pet!</p><button id="buyFusePetsUpgradeButton" class="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg mt-2 w-full text-sm">Buy Fuse Pets (15000 Coins)</button></div></div></div>
    <div id="adminUpgradeTreeModal" class="modal hidden"> <div class="modal-content admin-upgrade-tree-modal-content"> <button class="modal-close-button" id="closeAdminUpgradeTreeModal">&times;</button> <h2 class="text-2xl font-bold mb-4">Admin Upgrade Tree</h2> <p class="text-gray-600 mb-4">Click an upgrade to grant it to yourself for testing.</p> <div id="adminUpgradesList" class="grid grid-cols-1 gap-3"></div> </div> </div>
    <div id="inventoryModal" class="modal hidden"> <div class="inventory-modal-content"> <button class="modal-close-button" id="closeInventoryModal">&times;</button> <h2 class="text-2xl font-bold text-gray-800 mb-4">Your Inventory</h2> <div class="inventory-tabs"> <button id="inventoryTabButton" class="bg-blue-700">Inventory</button> <button id="fuseMachineTabButton" class="hidden">Fuse Machine</button> </div> <div id="inventoryContent"> <div id="inventoryItemsContainer" class="inventory-items-grid"></div> <div id="inventoryPetsContainer" class="inventory-pets-grid"></div> <button id="confirmDeleteSelectedPetsButton" class="hidden bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg mt-6 mx-auto block">Delete Selected Pets</button> </div> <div id="fuseMachineContent" class="hidden"> <p class="text-gray-600 mb-4">Select at least 5 pets to fuse them into a new, potentially rarer pet!</p> <p id="fuseSelectedCountDisplay" class="text-lg font-semibold text-blue-600 mb-4">Selected: 0 pets (Luck: 1.0x)</p> <div id="fuseablePetsContainer" class="fuseable-pets-grid"></div> <button id="fusePetsButton" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg mt-6 mx-auto block disabled:opacity-50 disabled:cursor-not-allowed">Fuse Pets!</button> </div> </div> </div>
    <div id="petCollectionModal" class="modal hidden"><div class="pet-collection-modal-content"><button class="modal-close-button" id="closePetCollectionModal">&times;</button><h2 class="text-2xl font-bold text-gray-800 mb-2">Available Pet Collection</h2><p class="text-sm text-gray-600 mb-4">Your current luck factor: <span id="collectionLuckFactorDisplay" class="font-bold text-blue-600">1.000x</span></p><div id="petCollectionContainer" class="pet-collection-grid"></div><div id="itemCollectionContainer" class="item-collection-grid"></div></div></div>
    <div id="manageCurrencyModal" class="modal hidden"><div class="manage-currency-modal-content"><button class="modal-close-button" id="closeManageCurrencyModal">&times;</button><h2 class="text-2xl font-bold text-gray-800 mb-4">Manage User Currency</h2><label for="targetUserIdInput">Target User ID:</label><input type="text" id="targetUserIdInput" placeholder="Enter User ID" class="mb-4"><label for="amountOfCoinsInput">Amount of Coins:</label><input type="number" id="amountOfCoinsInput" placeholder="Enter amount" min="0" class="mb-4"><div class="radio-group"><div><input type="radio" id="currencyActionAdd" name="currencyAction" value="add" checked><label for="currencyActionAdd">Add</label></div><div><input type="radio" id="currencyActionSet" name="currencyAction" value="set"><label for="currencyActionSet">Set</label></div><div><input type="radio" id="currencyActionSubtract" name="currencyAction" value="subtract"><label for="currencyActionSubtract">Subtract</label></div></div><button id="submitCurrencyActionButton" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg w-full">Submit</button></div></div>
    <div id="petRevealModal" class="modal hidden"><div class="pet-reveal-modal-content"> <button id="closePetRevealModalButton" class="modal-close-button">&times;</button><h2 class="text-3xl font-bold text-green-700 mb-6">You Got Stuff!</h2><div id="revealedPetsContainer" class="flex flex-col sm:flex-row justify-around items-center gap-4 mb-6"></div><p id="petRevealCoinsMessage" class="text-xl font-semibold text-yellow-600 mb-6 hidden"></p><button id="dismissPetRevealModal" class="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg text-lg shadow-md hover:shadow-lg transition-all">Awesome!</button></div></div>
    <div id="nicknameInputModal" class="modal hidden"> <div class="nickname-input-modal-content"> <button class="modal-close-button" id="closeNicknameInputModal">&times;</button> <h2 class="text-2xl font-bold text-gray-800 mb-4">Choose Your Nickname</h2> <p class="text-gray-600 mb-4">Enter a nickname for the leaderboards (max 20 characters).</p> <input type="text" id="nicknameInputField" placeholder="Your Nickname" maxlength="20"> <button id="submitNicknameButton" class="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg w-full">Set Nickname</button> </div> </div>
    <div id="leaderboardModal" class="modal hidden"> <div class="leaderboard-modal-content max-w-lg w-full"> <button class="modal-close-button" id="closeLeaderboardModal">&times;</button> <h2 class="text-2xl font-bold text-gray-800 mb-4">Top Coin Holders! 🏆</h2> <p id="leaderboardYourRank" class="text-md text-gray-700 mb-4">Your Rank: Calculating...</p> <div class="leaderboard-table-container"> <table class="leaderboard-table w-full text-left rounded-lg overflow-hidden"> <thead> <tr> <th class="px-4 py-2">Rank</th> <th class="px-4 py-2">Nickname</th> <th class="px-4 py-2 text-right">Coins</th> </tr> </thead> <tbody id="leaderboardTableBody"> </tbody> </table> </div> </div> </div>
    <div id="recentRollsModal" class="modal hidden"> <div class="modal-content recent-rolls-modal-content"> <button class="modal-close-button" id="closeRecentRollsModal">&times;</button> <h2 class="text-2xl font-bold text-gray-800 mb-4">Recent Rare Rolls! ✨</h2> <p class="text-gray-600 mb-4">See the rarest pets hatched by players recently.</p> <div class="recent-rolls-table-container"> <table class="recent-rolls-table w-full text-left rounded-lg overflow-hidden"> <thead> <tr> <th class="px-4 py-2">Pet</th> <th class="px-4 py-2">Details</th> <th class="px-4 py-2">Rolled By</th> <th class="px-4 py-2">When</th> </tr> </thead> <tbody id="recentRollsTableBody"> </tbody> </table> </div> </div> </div>

    <!-- Shop Modal -->
    <div id="shopModal" class="modal hidden">
        <div id="shopModalContent" class="modal-content max-w-4xl w-full">
            <button class="modal-close-button" id="closeShopModal">&times;</button>
            <h2 class="text-3xl font-bold text-gray-800 mb-2">Forever Pack</h2>
            <div class="flex justify-between items-center mb-4 text-gray-600 px-2">
                <p>Resets in: <span id="shopResetTimerDisplay" class="font-bold text-blue-600">--:--:--</span></p>
                <p>Current Luck: <span id="shopLuckDisplay" class="font-bold text-green-600">1.00x</span></p>
            </div>
            <div class="shop-items-outer-container">
                <div id="shopItemsContainer" class="shop-items-inner-container">
                    <!-- Shop items will be dynamically loaded here -->
                </div>
            </div>
        </div>
    </div>

    <!-- Forever Pack Manager Modal -->
    <div id="foreverPackManagerModal" class="modal hidden">
        <div class="modal-content max-w-4xl w-full">
            <button class="modal-close-button" id="closeForeverPackManagerModal">&times;</button>
            <h2 class="text-2xl font-bold mb-4">Forever Pack Manager</h2>
            <div class="mb-6 p-4 border border-gray-200 rounded-lg">
                <h3 class="text-xl font-semibold mb-3">Import/Export Config</h3>
                <button id="downloadPackConfigButton" class="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg mr-2">Download Config</button>
                <label for="uploadPackConfigInput" class="inline-block bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg cursor-pointer">Upload Config</label>
                <input type="file" id="uploadPackConfigInput" accept=".json" class="hidden">
            </div>
            
            <h3 class="text-2xl font-bold mt-6 mb-2">Tier Progression</h3>
            <p class="text-sm text-gray-600 mb-4">Define the cost and luck bonuses for progressing through the shop each day.</p>
            <div id="packTiersContainer" class="space-y-6">
                <!-- Tiers will be dynamically added here -->
            </div>
             <button id="addTierButton" class="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Add Tier</button>

            <h3 class="text-2xl font-bold mt-8 mb-2">Global Item Pool</h3>
            <p class="text-sm text-gray-600 mb-4">This is the single pool of items that can be claimed from the shop.</p>
            <div id="packItemsContainer" class="space-y-2">
                <!-- Items will be dynamically added here -->
            </div>
            <button id="addShopItemButton" class="mt-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">+ Add Item to Pool</button>
            
            <div class="mt-8 flex justify-end">
                <button id="savePackConfigButton" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg">Save All Changes</button>
            </div>
        </div>
    </div>
</body>
</html>
