import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBHbxnh1O84iQ3NuUjWb4yP33O-b1cSjBY",
    authDomain: "votazione-siti.firebaseapp.com",
    projectId: "votazione-siti",
    storageBucket: "votazione-siti.firebasestorage.app",
    messagingSenderId: "909617632597",
    appId: "1:909617632597:web:947a40f0d2c7fda95e8bdc"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app, "https://votazione-siti-default-rtdb.europe-west1.firebasedatabase.app");

export const groups = ['3AAF','3AFS','3BFS','4AAF','4AFS','4BFS'];
let currentGroup = null;
let userId = null;
let allLinks = {};
let userVotes = {};
let linksUnsub = null;
let votesUnsub = null;
const MAX_VOTES = 3;

function generateUserId() {
    let id = localStorage.getItem('user_id');
    if (!id) {
        id = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('user_id', id);
    }
    return id;
}

function normalizeUrl(url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    return url;
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function showMessage(text, type) {
    const msgEl = document.getElementById('message');
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = 'message ' + type;
    setTimeout(() => {
        msgEl.className = 'message';
    }, 4000);
}

export async function addLink() {
    const input = document.getElementById('linkInput');
    let url = input.value.trim();

    if (!url) {
        showMessage('Per favore, incolla un link', 'error');
        return;
    }

    url = normalizeUrl(url);

    if (!isValidUrl(url)) {
        showMessage('Link non valido', 'error');
        return;
    }

    // Check if user already has a link (per group)
    const userLinkRef = ref(db, 'user_links/' + currentGroup + '/' + userId);
    const snapshot = await get(userLinkRef);
    if (snapshot.exists()) {
        showMessage('Hai già incollato un link. Puoi votare o aspettare il reset dei dati.', 'info');
        return;
    }

    const linkId = 'link_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // Save link (under group)
    await set(ref(db, 'links/' + currentGroup + '/' + linkId), {
        id: linkId,
        url: url,
        addedBy: userId,
        addedAt: new Date().toISOString(),
        votes: 0
    });

    // Save user link (under group)
    await set(ref(db, 'user_links/' + currentGroup + '/' + userId), linkId);

    input.value = '';
    input.disabled = true;
    document.getElementById('addBtn').disabled = true;

    showMessage('✓ Link aggiunto con successo!', 'success');
}

export async function voteLink(linkId) {
    const link = allLinks[linkId];
    if (!link) return;

    if (link.addedBy === userId) {
        showMessage('Non puoi votare il tuo link', 'info');
        return;
    }

    const userVoted = !!userVotes[linkId];

    if (userVoted) {
        // Remove vote
        const newVotes = Math.max((link.votes || 1) - 1, 0);
        await update(ref(db, 'links/' + currentGroup + '/' + linkId), {
            votes: newVotes
        });

        // Remove user's vote record
        await set(ref(db, 'votes/' + currentGroup + '/' + userId + '/' + linkId), null);

        showMessage('✓ Voto rimosso', 'info');
    } else {
        // Enforce max votes
        const votesCount = Object.keys(userVotes || {}).length;
        if (votesCount >= MAX_VOTES) {
            showMessage(`Hai raggiunto il limite di ${MAX_VOTES} voti`, 'info');
            return;
        }

        // Add vote
        await update(ref(db, 'links/' + currentGroup + '/' + linkId), {
            votes: (link.votes || 0) + 1
        });

        await set(ref(db, 'votes/' + currentGroup + '/' + userId + '/' + linkId), true);

        showMessage('✓ Voto registrato!', 'success');
    }
}

function updateRanking() {
    const rankingList = document.getElementById('rankingList');
    if (!rankingList) return;

    const sortedLinks = Object.values(allLinks).sort((a, b) => (b.votes || 0) - (a.votes || 0));

    if (sortedLinks.length === 0) {
        rankingList.innerHTML = '<div class="empty-message">Nessun link ancora. Sii il primo ad aggiungerne uno!</div>';
        return;
    }

    rankingList.innerHTML = sortedLinks.map((link, index) => {
        const userVoted = userVotes[link.id] || false;
        const isUserLink = link.addedBy === userId;

        return `
            <div class="ranking-item">
                <div class="ranking-position">#${index + 1}</div>
                <div class="ranking-link">
                    <a href="${link.url}" target="_blank" rel="noopener noreferrer">
                        ${link.url}
                    </a>
                </div>
                <div class="ranking-votes">
                    <div class="vote-count">${link.votes || 0} ${ (link.votes || 0) === 1 ? 'voto' : 'voti'}</div>
                    <button 
                        class="vote-btn" 
                        onclick="window.voteLink('${link.id}')"
                        ${isUserLink ? 'disabled' : ''}
                    >
                        ${isUserLink ? 'Il tuo link' : (userVoted ? 'Rimuovi voto' : 'Vota')}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function updateUserStatus() {
    const statusEl = document.getElementById('userStatus');
    if (!statusEl) return;

    const userLinkRef = ref(db, 'user_links/' + currentGroup + '/' + userId);
    const snapshot = await get(userLinkRef);

    if (snapshot.exists()) {
        const linkId = snapshot.val();
        const userLink = allLinks[linkId];
        if (userLink) {
            statusEl.innerHTML = `✓ Hai incollato un link: <strong>${userLink.url}</strong><br>Non puoi aggiungere altri link in questo gruppo. Puoi votare gli altri link.`;
            document.getElementById('linkInput').disabled = true;
            document.getElementById('addBtn').disabled = true;
        }
    } else {
        statusEl.innerHTML = 'Puoi aggiungere 1 link';
        document.getElementById('linkInput').disabled = false;
        document.getElementById('addBtn').disabled = false;
    }
}

function renderTabs() {
    const container = document.getElementById('groupTabs');
    if (!container) return;
    container.innerHTML = '';
    groups.forEach(g => {
        const btn = document.createElement('button');
        btn.className = 'tab-btn' + (g === currentGroup ? ' active' : '');
        btn.textContent = g;
        btn.addEventListener('click', () => {
            if (g === currentGroup) return;
            switchGroup(g);
        });
        container.appendChild(btn);
    });
}

function detachListeners() {
    if (typeof linksUnsub === 'function') {
        linksUnsub();
        linksUnsub = null;
    }
    if (typeof votesUnsub === 'function') {
        votesUnsub();
        votesUnsub = null;
    }
}

function setupListenersForGroup(group) {
    detachListeners();
    currentGroup = group;
    renderTabs();

    // Listener per i link del gruppo
    linksUnsub = onValue(ref(db, 'links/' + currentGroup), (snapshot) => {
        allLinks = snapshot.val() || {};
        updateRanking();
    });

    // Listener per i voti dell'utente nel gruppo
    votesUnsub = onValue(ref(db, 'votes/' + currentGroup + '/' + userId), (snapshot) => {
        userVotes = snapshot.val() || {};
        updateRanking();
        updateUserStatus();
    });

    // Check if user has a link in this group
    (async () => {
        const userLinkRef = ref(db, 'user_links/' + currentGroup + '/' + userId);
        const snapshot = await get(userLinkRef);
        if (snapshot.exists()) {
            document.getElementById('linkInput').disabled = true;
            document.getElementById('addBtn').disabled = true;
        } else {
            document.getElementById('linkInput').disabled = false;
            document.getElementById('addBtn').disabled = false;
        }
        updateUserStatus();
    })();
}

export function initialize() {
    userId = generateUserId();

    // If a group is provided via global variable, use it. Otherwise default to first group.
    const provided = window.GROUP_NAME || document.body.dataset.group;
    const initialGroup = provided || groups[0];

    setupListenersForGroup(initialGroup);

    // Attach UI handlers
    window.voteLink = voteLink;
    document.getElementById('addBtn')?.addEventListener('click', addLink);
    document.getElementById('linkInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addLink();
    });
}

// Auto-initialize when script loaded in page
window.addEventListener('DOMContentLoaded', () => {
    try { initialize(); } catch (e) { console.error(e); }
});
