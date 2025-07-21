// firebase-service.js
// This module handles all Firebase initialization, authentication, and player data persistence.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let app;
let auth;
let db;
let _currentUserId = 'Loading...'; // Internal state for user ID
let _playerData = {}; // Internal state for player data
let _isAuthReady = false; // Flag to indicate if authentication state has been determined

// Access Firebase configuration and app ID from the window object (provided by Canvas environment)
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Publicly accessible variables and functions ---

/**
 * Returns the current authenticated user's ID.
 * @returns {string} The user ID or 'Loading...' / 'Not authenticated'.
 */
export function getUserId() {
    return _currentUserId;
}

/**
 * Returns the current player data.
 * @returns {Object} The player data object.
 */
export function getPlayerData() {
    return _playerData;
}

/**
 * Checks if Firebase authentication is ready.
 * @returns {boolean} True if authentication state has been determined.
 */
export function isAuthInitialized() {
    return _isAuthReady;
}

/**
 * Loads player data from Firestore for the current user.
 * If no data exists, it creates a new entry.
 * This function should only be called once authentication is confirmed.
 */
export async function loadPlayerData() {
    if (!db || !auth || !auth.currentUser || !auth.currentUser.uid) {
        console.warn("loadPlayerData: Firestore, Auth, or User ID is not ready. Skipping data load.");
        _playerData = {}; // Reset data if not ready
        return;
    }

    _currentUserId = auth.currentUser.uid; // Ensure internal userId is up-to-date
    console.log("loadPlayerData: Attempting to load data for user:", _currentUserId);

    try {
        const playerDocRef = doc(db, `artifacts/${appId}/users/${_currentUserId}/playerData`, "data");
        const playerDocSnap = await getDoc(playerDocRef);

        if (playerDocSnap.exists()) {
            _playerData = playerDocSnap.data();
            console.log("loadPlayerData: Player data loaded:", _playerData);
        } else {
            _playerData = { createdAt: new Date().toISOString() };
            await setDoc(playerDocRef, _playerData);
            console.log("loadPlayerData: New player data created:", _playerData);
        }
    } catch (error) {
        console.error("loadPlayerData: Error loading or creating player data:", error);
    }
}

/**
 * Saves player data to Firestore for the current user.
 * @param {Object} data The data object to save.
 */
export async function savePlayerData(data) {
    if (!db || !auth || !auth.currentUser || !auth.currentUser.uid) {
        console.warn("savePlayerData: Firestore, Auth, or User ID is not ready. Skipping data save.");
        return;
    }

    _currentUserId = auth.currentUser.uid; // Ensure internal userId is up-to-date
    console.log("savePlayerData: Attempting to save data for user:", _currentUserId, data);

    try {
        const playerDocRef = doc(db, `artifacts/${appId}/users/${_currentUserId}/playerData`, "data");
        await setDoc(playerDocRef, data, { merge: true }); // Use merge to only update specified fields
        _playerData = { ..._playerData, ...data }; // Update internal state
        console.log("savePlayerData: Player data updated in Firestore:", _playerData);
    } catch (error) {
        console.error("savePlayerData: Error updating player data:", error);
    }
}

/**
 * Initializes Firebase and authenticates the user.
 * This function should be called once when the application starts.
 * @param {Function} onAuthChangeCallback - A callback function to run when auth state changes.
 */
export async function initializeFirebaseAndAuth(onAuthChangeCallback) {
    console.log("initializeFirebaseAndAuth: Starting Firebase initialization and authentication process...");
    console.log("initializeFirebaseAndAuth: Firebase Config:", firebaseConfig);
    console.log("initializeFirebaseAndAuth: App ID:", appId);
    console.log("initializeFirebaseAndAuth: Initial Auth Token:", initialAuthToken ? "Present" : "Not Present");


    if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
        console.error("initializeFirebaseAndAuth: Firebase configuration is missing or empty.");
        _currentUserId = 'Config Error';
        _isAuthReady = true;
        if (onAuthChangeCallback) onAuthChangeCallback(_currentUserId, _isAuthReady);
        return;
    }

    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        console.log("initializeFirebaseAndAuth: Firebase app, auth, and firestore instances created successfully.");

        onAuthStateChanged(auth, async (user) => {
            console.log("onAuthStateChanged: Callback fired. User object received:", user ? user.uid : "null");
            if (user) {
                _currentUserId = user.uid;
                console.log("onAuthStateChanged: User is signed in. Setting _currentUserId to:", _currentUserId);
            } else {
                _currentUserId = 'Not authenticated';
                console.log("onAuthStateChanged: User is not authenticated. Setting _currentUserId to:", _currentUserId);
            }
            _isAuthReady = true; // Auth state has been determined
            console.log("onAuthStateChanged: _isAuthReady set to true.");

            if (onAuthChangeCallback) {
                console.log("onAuthStateChanged: Invoking onAuthChangeCallback with _currentUserId:", _currentUserId, "and _isAuthReady:", _isAuthReady);
                onAuthChangeCallback(_currentUserId, _isAuthReady);
            } else {
                console.log("onAuthStateChanged: No onAuthChangeCallback provided.");
            }

            // Load player data immediately after auth state is determined and user is signed in
            if (user) {
                console.log("onAuthStateChanged: User exists, attempting to load player data.");
                await loadPlayerData();
            } else {
                console.log("onAuthStateChanged: No user, skipping player data load.");
            }
        });

        if (initialAuthToken) {
            console.log("initializeFirebaseAndAuth: Attempting to sign in with custom token...");
            await signInWithCustomToken(auth, initialAuthToken);
            console.log("initializeFirebaseAndAuth: signInWithCustomToken call completed.");
        } else {
            console.log("initializeFirebaseAndAuth: Attempting to sign in anonymously...");
            await signInAnonymously(auth);
            console.log("initializeFirebaseAndAuth: signInAnonymously call completed.");
        }

    } catch (error) {
        console.error("initializeFirebaseAndAuth: Error during Firebase initialization or authentication:", error);
        _currentUserId = 'Auth Error';
        _isAuthReady = true;
        if (onAuthChangeCallback) onAuthChangeCallback(_currentUserId, _isAuthReady);
    }
}
